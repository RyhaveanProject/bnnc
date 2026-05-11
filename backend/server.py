from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import asyncio
import logging
import base64
import time
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Literal

import bcrypt
import jwt
import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Form
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, ConfigDict

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("adx")

# --- DB ---
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# --- Constants ---
JWT_ALGORITHM = "HS256"
SUPPORTED_CRYPTOS = ["USDT", "BTC", "ETH", "TRX", "BNB"]
TRADING_PAIRS = ["BTC", "ETH", "BNB", "XRP", "SOL", "TRX", "USDT"]
COIN_NAMES = {
    "BTC": "Bitcoin", "ETH": "Ethereum", "BNB": "BNB",
    "XRP": "XRP", "SOL": "Solana", "TRX": "TRON", "USDT": "Tether",
}
# Static fallback prices (used only when ALL external APIs fail and no cache exists)
STATIC_FALLBACK = {
    "BTC": 95000.0, "ETH": 3400.0, "BNB": 690.0, "XRP": 2.20,
    "SOL": 195.0, "TRX": 0.24, "USDT": 1.0,
}
KUCOIN_BASE = "https://api.kucoin.com"


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(pwd: str) -> str:
    return bcrypt.hashpw(pwd.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {"sub": user_id, "email": email, "role": role,
               "exp": datetime.now(timezone.utc) + timedelta(hours=12), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# --- Models ---
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    username: str = Field(min_length=3, max_length=32)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class AdminCreateIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    username: str = Field(min_length=3)


class BalanceAdjustIn(BaseModel):
    user_id: str
    currency: str
    amount: float


class WalletConfigIn(BaseModel):
    currency: str
    address: str
    network: Optional[str] = None
    qr_image_b64: Optional[str] = None


class DepositCreateIn(BaseModel):
    currency: str
    network: Optional[str] = None
    amount: float


class DepositConfirmIn(BaseModel):
    deposit_id: str
    receipt_b64: str


class WithdrawIn(BaseModel):
    currency: str
    amount: float
    address: str
    network: Optional[str] = None


class TradeIn(BaseModel):
    symbol: str
    side: Literal["buy", "sell"]
    amount: float


# --- App ---
app = FastAPI(title="ADX America")
api = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"] if os.environ.get("FRONTEND_URL", "*") == "*" else [os.environ["FRONTEND_URL"]],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Auth dependency ---
async def get_token_from_request(request: Request) -> Optional[str]:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    return token


async def get_current_user(request: Request) -> dict:
    token = await get_token_from_request(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("banned"):
        raise HTTPException(status_code=403, detail="Account banned")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


# --- Helpers ---
def empty_balances() -> dict:
    return {c: 0.0 for c in SUPPORTED_CRYPTOS}


def set_auth_cookie(resp: Response, token: str):
    resp.set_cookie(
        key="access_token", value=token, httponly=True, secure=False,
        samesite="lax", max_age=43200, path="/",
    )


# --- Startup ---
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.deposits.create_index("id", unique=True)
    await db.withdrawals.create_index("id", unique=True)
    await db.trades.create_index("id", unique=True)
    await db.wallet_configs.create_index("currency", unique=True)
    # Seed admin
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_pwd = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "username": "admin",
            "password_hash": hash_password(admin_pwd),
            "role": "admin",
            "balances": empty_balances(),
            "banned": False,
            "created_at": now_iso(),
        })
        logger.info("Seeded admin: %s", admin_email)
    else:
        if not verify_password(admin_pwd, existing["password_hash"]):
            await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_pwd)}})
    for cur in SUPPORTED_CRYPTOS:
        env_key = f"{cur}_WALLET"
        addr = os.environ.get(env_key, "")
        if addr:
            await db.wallet_configs.update_one(
                {"currency": cur},
                {"$setOnInsert": {"currency": cur, "address": addr, "network": cur, "qr_image_b64": "", "updated_at": now_iso()}},
                upsert=True,
            )
    # Warm up market cache so first page load is instant
    try:
        asyncio.create_task(_refresh_market_cache())
    except Exception as e:
        logger.warning("Market warmup failed: %s", e)


@app.on_event("shutdown")
async def shutdown():
    client.close()


# ============ AUTH ============
@api.post("/auth/register")
async def register(data: RegisterIn, response: Response):
    email = data.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    pwd = data.password
    if len(pwd) < 8 or not any(c.isdigit() for c in pwd) or not any(c.isalpha() for c in pwd):
        raise HTTPException(status_code=400, detail="Password must be 8+ chars and contain letters and numbers")
    await asyncio.sleep(5)
    uid = str(uuid.uuid4())
    user_doc = {
        "id": uid,
        "email": email,
        "username": data.username,
        "password_hash": hash_password(pwd),
        "role": "user",
        "balances": empty_balances(),
        "banned": False,
        "created_at": now_iso(),
    }
    await db.users.insert_one(user_doc)
    token = create_access_token(uid, email, "user")
    set_auth_cookie(response, token)
    return {"token": token, "user": {"id": uid, "email": email, "username": data.username, "role": "user", "balances": user_doc["balances"]}}


@api.post("/auth/login")
async def login(data: LoginIn, response: Response):
    """Unified login. If credentials match ADMIN_EMAIL/ADMIN_PASSWORD (or any user with admin role),
    an admin token is returned. Otherwise a regular user token is returned.
    Admin login is intentionally hidden — no separate UI is required.
    """
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user.get("banned"):
        raise HTTPException(status_code=403, detail="Account banned")
    role = user.get("role", "user")
    token = create_access_token(user["id"], email, role)
    set_auth_cookie(response, token)
    await db.sessions.insert_one({
        "user_id": user["id"],
        "created_at": now_iso(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=12)).isoformat(),
    })
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": email,
            "username": user["username"],
            "role": role,
            "balances": user.get("balances", empty_balances()),
        },
    }


@api.post("/admin/login")
async def admin_login(data: LoginIn, response: Response):
    """Backward-compatible admin login endpoint. Internally identical to /auth/login
    but enforces that the resolved user is an admin."""
    email = data.email.lower()
    user = await db.users.find_one({"email": email, "role": "admin"})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    token = create_access_token(user["id"], email, "admin")
    set_auth_cookie(response, token)
    return {"token": token, "user": {"id": user["id"], "email": email, "username": user["username"], "role": "admin"}}


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ============ MARKET (KuCoin) ============
_MARKET_CACHE = {"data": [], "ts": 0.0, "lock": asyncio.Lock()}
_MARKET_TTL = 15.0  # seconds


async def _kucoin_all_tickers(cli: httpx.AsyncClient) -> dict:
    """Fetch all tickers from KuCoin with simple retry."""
    last_err = None
    for attempt in range(3):
        try:
            r = await cli.get(f"{KUCOIN_BASE}/api/v1/market/allTickers", timeout=8.0)
            r.raise_for_status()
            j = r.json()
            if j.get("code") != "200000":
                raise RuntimeError(f"KuCoin error code: {j.get('code')}")
            return {t["symbol"]: t for t in j["data"]["ticker"]}
        except Exception as e:
            last_err = e
            await asyncio.sleep(0.4 * (attempt + 1))
    raise last_err or RuntimeError("KuCoin allTickers failed")


async def _kucoin_sparkline(cli: httpx.AsyncClient, symbol: str) -> List[float]:
    """Fetch 1-hour candles for the last ~24h. Returns list of close prices (oldest→newest)."""
    end = int(time.time())
    start = end - 24 * 3600
    try:
        r = await cli.get(
            f"{KUCOIN_BASE}/api/v1/market/candles",
            params={"type": "1hour", "symbol": symbol, "startAt": start, "endAt": end},
            timeout=6.0,
        )
        r.raise_for_status()
        j = r.json()
        data = j.get("data") or []
        # KuCoin returns newest first: [time, open, close, high, low, volume, turnover]
        return [float(d[2]) for d in reversed(data)][-30:]
    except Exception:
        return []


async def _build_market_data() -> List[dict]:
    """Build market data list from KuCoin (single allTickers call + parallel sparklines)."""
    async with httpx.AsyncClient(timeout=10.0, headers={"User-Agent": "ADX-America/1.0"}) as cli:
        tickers = await _kucoin_all_tickers(cli)

        coins_for_candles = [c for c in TRADING_PAIRS if c != "USDT"]
        spark_results = await asyncio.gather(
            *[_kucoin_sparkline(cli, f"{c}-USDT") for c in coins_for_candles],
            return_exceptions=True,
        )
        spark_map = {}
        for coin, res in zip(coins_for_candles, spark_results):
            spark_map[coin] = res if isinstance(res, list) else []

    out = []
    for coin in TRADING_PAIRS:
        if coin == "USDT":
            out.append({
                "symbol": "USDT",
                "name": COIN_NAMES["USDT"],
                "price": 1.0,
                "change24h": 0.0,
                "marketCap": 0,
                "volume24h": 0,
                "sparkline": [1.0, 1.0, 1.0, 1.0],
                "image": None,
            })
            continue
        sym = f"{coin}-USDT"
        t = tickers.get(sym, {})
        try:
            price = float(t.get("last") or 0)
        except (TypeError, ValueError):
            price = 0.0
        try:
            # KuCoin changeRate is a ratio (e.g. 0.0234 = 2.34%)
            change_rate = float(t.get("changeRate") or 0) * 100
        except (TypeError, ValueError):
            change_rate = 0.0
        try:
            volume = float(t.get("volValue") or 0)
        except (TypeError, ValueError):
            volume = 0.0
        out.append({
            "symbol": coin,
            "name": COIN_NAMES.get(coin, coin),
            "price": price,
            "change24h": change_rate,
            "marketCap": 0,
            "volume24h": volume,
            "sparkline": spark_map.get(coin, []),
            "image": None,
        })
    return out


def _static_fallback_data() -> List[dict]:
    """Last-resort fallback so the UI is never empty."""
    out = []
    for coin in TRADING_PAIRS:
        price = STATIC_FALLBACK.get(coin, 0.0)
        out.append({
            "symbol": coin,
            "name": COIN_NAMES.get(coin, coin),
            "price": price,
            "change24h": 0.0,
            "marketCap": 0,
            "volume24h": 0,
            "sparkline": [price, price, price, price],
            "image": None,
        })
    return out


async def _refresh_market_cache():
    """Refresh cache. Safe to call concurrently — uses lock to dedupe."""
    if _MARKET_CACHE["lock"].locked():
        # Another refresh in progress; wait for it
        async with _MARKET_CACHE["lock"]:
            return _MARKET_CACHE["data"]
    async with _MARKET_CACHE["lock"]:
        try:
            data = await _build_market_data()
            _MARKET_CACHE["data"] = data
            _MARKET_CACHE["ts"] = time.time()
            return data
        except Exception as e:
            logger.error("KuCoin market fetch failed: %s", e)
            if _MARKET_CACHE["data"]:
                return _MARKET_CACHE["data"]
            # First-ever request and KuCoin failed → return static fallback (don't cache it)
            return _static_fallback_data()


@api.get("/market/prices")
async def market_prices():
    """Live crypto prices via KuCoin (cached ~15s, parallel sparklines, retry + fallback)."""
    now = time.time()
    if _MARKET_CACHE["data"] and now - _MARKET_CACHE["ts"] < _MARKET_TTL:
        return _MARKET_CACHE["data"]
    return await _refresh_market_cache()


# ============ WALLETS ============
@api.get("/wallets")
async def get_wallets():
    configs = await db.wallet_configs.find({}, {"_id": 0}).to_list(100)
    return configs


@api.put("/admin/wallets")
async def update_wallet(data: WalletConfigIn, admin: dict = Depends(require_admin)):
    if data.currency not in SUPPORTED_CRYPTOS:
        raise HTTPException(status_code=400, detail="Unsupported currency")
    update = {"address": data.address, "updated_at": now_iso()}
    if data.network is not None:
        update["network"] = data.network
    if data.qr_image_b64 is not None:
        update["qr_image_b64"] = data.qr_image_b64
    await db.wallet_configs.update_one(
        {"currency": data.currency},
        {"$set": update, "$setOnInsert": {"currency": data.currency}},
        upsert=True,
    )
    cfg = await db.wallet_configs.find_one({"currency": data.currency}, {"_id": 0})
    return cfg


# ============ TELEGRAM ============
async def tg_send(method: str, payload: dict, files: dict = None) -> dict:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        logger.info("Telegram not configured; would send: %s", method)
        return {"ok": False, "skipped": True}
    url = f"https://api.telegram.org/bot{token}/{method}"
    try:
        async with httpx.AsyncClient(timeout=20) as cli:
            if files:
                r = await cli.post(url, data=payload, files=files)
            else:
                r = await cli.post(url, json=payload)
            return r.json()
    except Exception as e:
        logger.error("Telegram send error: %s", e)
        return {"ok": False, "error": str(e)}


async def notify_deposit(deposit: dict, user: dict, receipt_b64: Optional[str]):
    chat_id = os.environ.get("TELEGRAM_ADMIN_CHAT_ID", "")
    if not chat_id:
        return
    caption = (
        f"💰 *New Deposit Request*\n"
        f"User ID: `{user['id']}`\n"
        f"Username: `{user['username']}`\n"
        f"Email: `{user['email']}`\n"
        f"Amount: *{deposit['amount']} {deposit['currency']}*\n"
        f"Network: {deposit.get('network','-')}\n"
        f"Time: {deposit['created_at']}\n"
        f"Deposit ID: `{deposit['id']}`"
    )
    kb = {"inline_keyboard": [[
        {"text": "✅ Approve", "callback_data": f"adep:{deposit['id']}"},
        {"text": "❌ Reject", "callback_data": f"rdep:{deposit['id']}"},
    ]]}
    if receipt_b64:
        b64 = receipt_b64.split(",", 1)[-1]
        try:
            img_bytes = base64.b64decode(b64)
        except Exception:
            img_bytes = None
        if img_bytes:
            files = {"photo": ("receipt.jpg", img_bytes, "image/jpeg")}
            data = {"chat_id": chat_id, "caption": caption, "parse_mode": "Markdown",
                    "reply_markup": __import__("json").dumps(kb)}
            await tg_send("sendPhoto", data, files=files)
            return
    await tg_send("sendMessage", {"chat_id": chat_id, "text": caption, "parse_mode": "Markdown", "reply_markup": kb})


async def notify_withdraw(w: dict, user: dict):
    chat_id = os.environ.get("TELEGRAM_ADMIN_CHAT_ID", "")
    if not chat_id:
        return
    text = (
        f"🏧 *Withdraw Request*\n"
        f"User ID: `{user['id']}`\n"
        f"Username: `{user['username']}`\n"
        f"Email: `{user['email']}`\n"
        f"Amount: *{w['amount']} {w['currency']}*\n"
        f"Fee: {w.get('fee',0)} {w['currency']}\n"
        f"Net: {w.get('net',0)} {w['currency']}\n"
        f"Address: `{w['address']}`\n"
        f"Network: {w.get('network','-')}\n"
        f"Time: {w['created_at']}\n"
        f"Withdraw ID: `{w['id']}`"
    )
    kb = {"inline_keyboard": [[
        {"text": "✅ Mark Paid", "callback_data": f"awd:{w['id']}"},
        {"text": "❌ Reject", "callback_data": f"rwd:{w['id']}"},
    ]]}
    await tg_send("sendMessage", {"chat_id": chat_id, "text": text, "parse_mode": "Markdown", "reply_markup": kb})


@api.post("/telegram/webhook")
async def telegram_webhook(request: Request):
    body = await request.json()
    cb = body.get("callback_query")
    if not cb:
        return {"ok": True}
    data = cb.get("data", "")
    chat_id_admin = os.environ.get("TELEGRAM_ADMIN_CHAT_ID", "")
    cb_id = cb["id"]
    msg = cb.get("message", {})
    msg_chat_id = str(msg.get("chat", {}).get("id", ""))
    msg_id = msg.get("message_id")
    if chat_id_admin and msg_chat_id != str(chat_id_admin):
        await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Unauthorized"})
        return {"ok": True}

    op, _, target_id = data.partition(":")
    if op == "adep":
        dep = await db.deposits.find_one({"id": target_id}, {"_id": 0})
        if not dep:
            await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Deposit not found"})
            return {"ok": True}
        if dep["status"] == "approved":
            await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Already approved"})
            return {"ok": True}
        await db.deposits.update_one({"id": target_id}, {"$set": {"status": "approved", "approved_at": now_iso()}})
        await db.users.update_one({"id": dep["user_id"]}, {"$inc": {f"balances.{dep['currency']}": dep["amount"]}})
        await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Deposit approved ✅"})
        if msg_id:
            await tg_send("editMessageReplyMarkup", {"chat_id": msg_chat_id, "message_id": msg_id, "reply_markup": {"inline_keyboard": [[{"text": "✅ APPROVED", "callback_data": "noop"}]]}})
    elif op == "rdep":
        await db.deposits.update_one({"id": target_id}, {"$set": {"status": "rejected", "approved_at": now_iso()}})
        await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Deposit rejected ❌"})
        if msg_id:
            await tg_send("editMessageReplyMarkup", {"chat_id": msg_chat_id, "message_id": msg_id, "reply_markup": {"inline_keyboard": [[{"text": "❌ REJECTED", "callback_data": "noop"}]]}})
    elif op == "awd":
        w = await db.withdrawals.find_one({"id": target_id}, {"_id": 0})
        if not w:
            await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Not found"})
            return {"ok": True}
        await db.withdrawals.update_one({"id": target_id}, {"$set": {"status": "paid", "paid_at": now_iso()}})
        await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Withdraw marked paid"})
        if msg_id:
            await tg_send("editMessageReplyMarkup", {"chat_id": msg_chat_id, "message_id": msg_id, "reply_markup": {"inline_keyboard": [[{"text": "✅ PAID", "callback_data": "noop"}]]}})
    elif op == "rwd":
        w = await db.withdrawals.find_one({"id": target_id}, {"_id": 0})
        if w and w["status"] == "pending":
            await db.users.update_one({"id": w["user_id"]}, {"$inc": {f"balances.{w['currency']}": w["amount"]}})
        await db.withdrawals.update_one({"id": target_id}, {"$set": {"status": "rejected", "approved_at": now_iso()}})
        await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Withdraw rejected"})
        if msg_id:
            await tg_send("editMessageReplyMarkup", {"chat_id": msg_chat_id, "message_id": msg_id, "reply_markup": {"inline_keyboard": [[{"text": "❌ REJECTED", "callback_data": "noop"}]]}})
    return {"ok": True}


# ============ DEPOSITS ============
@api.post("/deposits/create")
async def deposit_create(data: DepositCreateIn, user: dict = Depends(get_current_user)):
    if data.currency not in SUPPORTED_CRYPTOS:
        raise HTTPException(status_code=400, detail="Unsupported currency")
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be > 0")
    wallet = await db.wallet_configs.find_one({"currency": data.currency}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=400, detail="Wallet not configured")
    dep = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "currency": data.currency,
        "network": data.network or wallet.get("network") or data.currency,
        "amount": data.amount,
        "wallet_address": wallet["address"],
        "status": "pending",
        "receipt_b64": "",
        "confirmed_by_user": False,
        "created_at": now_iso(),
    }
    await db.deposits.insert_one(dep)
    return {"deposit": {k: v for k, v in dep.items() if k != "receipt_b64"}, "wallet": wallet}


@api.post("/deposits/confirm")
async def deposit_confirm(data: DepositConfirmIn, user: dict = Depends(get_current_user)):
    dep = await db.deposits.find_one({"id": data.deposit_id, "user_id": user["id"]}, {"_id": 0})
    if not dep:
        raise HTTPException(status_code=404, detail="Deposit not found")
    if dep["status"] != "pending":
        raise HTTPException(status_code=400, detail="Deposit already processed")
    await db.deposits.update_one({"id": dep["id"]}, {"$set": {"receipt_b64": data.receipt_b64, "confirmed_by_user": True, "confirmed_at": now_iso()}})
    dep["receipt_b64"] = data.receipt_b64
    asyncio.create_task(notify_deposit(dep, user, data.receipt_b64))
    return {"ok": True}


@api.get("/deposits/me")
async def deposits_me(user: dict = Depends(get_current_user)):
    rows = await db.deposits.find({"user_id": user["id"]}, {"_id": 0, "receipt_b64": 0}).sort("created_at", -1).to_list(200)
    return rows


# ============ WITHDRAWALS ============
FEE_RATE = {"USDT": 1.0, "BTC": 0.0005, "ETH": 0.005, "TRX": 1.0, "BNB": 0.001}


@api.post("/withdrawals/create")
async def withdraw_create(data: WithdrawIn, user: dict = Depends(get_current_user)):
    if data.currency not in SUPPORTED_CRYPTOS:
        raise HTTPException(status_code=400, detail="Unsupported currency")
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount")
    fee = FEE_RATE.get(data.currency, 0)
    if data.amount <= fee:
        raise HTTPException(status_code=400, detail=f"Amount must exceed fee {fee} {data.currency}")
    bal = user.get("balances", {}).get(data.currency, 0)
    if bal < data.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    net = data.amount - fee
    w = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "currency": data.currency,
        "network": data.network or data.currency,
        "amount": data.amount,
        "fee": fee,
        "net": net,
        "address": data.address,
        "status": "pending",
        "created_at": now_iso(),
    }
    res = await db.users.update_one(
        {"id": user["id"], f"balances.{data.currency}": {"$gte": data.amount}},
        {"$inc": {f"balances.{data.currency}": -data.amount}},
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    await db.withdrawals.insert_one(w)
    asyncio.create_task(notify_withdraw(w, user))
    return {"withdrawal": w}


@api.get("/withdrawals/me")
async def withdrawals_me(user: dict = Depends(get_current_user)):
    rows = await db.withdrawals.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return rows


# ============ TRADING ============
async def _price(symbol: str) -> float:
    prices = await market_prices()
    for p in prices:
        if p["symbol"] == symbol:
            return float(p["price"])
    raise HTTPException(status_code=400, detail="Symbol not found")


@api.post("/trade/execute")
async def trade_execute(data: TradeIn, user: dict = Depends(get_current_user)):
    sym = data.symbol.upper()
    if sym == "USDT" or sym not in TRADING_PAIRS:
        raise HTTPException(status_code=400, detail="Invalid symbol")
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount")
    price = await _price(sym)
    bal = user.get("balances", {})
    if data.side == "buy":
        cost = data.amount
        if bal.get("USDT", 0) < cost:
            raise HTTPException(status_code=400, detail="Insufficient USDT balance")
        coin_qty = cost / price
        res = await db.users.update_one(
            {"id": user["id"], "balances.USDT": {"$gte": cost}},
            {"$inc": {"balances.USDT": -cost, f"balances.{sym}": coin_qty}},
        )
        if res.modified_count == 0:
            raise HTTPException(status_code=400, detail="Insufficient USDT balance")
        executed = {"qty": coin_qty, "spent": cost}
    else:
        qty = data.amount
        if bal.get(sym, 0) < qty:
            raise HTTPException(status_code=400, detail=f"Insufficient {sym} balance")
        proceeds = qty * price
        res = await db.users.update_one(
            {"id": user["id"], f"balances.{sym}": {"$gte": qty}},
            {"$inc": {f"balances.{sym}": -qty, "balances.USDT": proceeds}},
        )
        if res.modified_count == 0:
            raise HTTPException(status_code=400, detail=f"Insufficient {sym} balance")
        executed = {"qty": qty, "received": proceeds}
    trade = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "symbol": sym,
        "side": data.side,
        "price": price,
        "amount": data.amount,
        "executed": executed,
        "created_at": now_iso(),
    }
    await db.trades.insert_one(trade)
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return {"trade": trade, "user": updated}


@api.get("/trade/history")
async def trade_history(user: dict = Depends(get_current_user)):
    rows = await db.trades.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return rows


# ============ CONFIG / MISC ============
@api.get("/config/live-chat")
async def live_chat_url():
    return {"url": os.environ.get("LIVE_CHAT_URL", "")}


# ============ ADMIN ============
@api.get("/admin/stats")
async def admin_stats(admin: dict = Depends(require_admin)):
    total_users = await db.users.count_documents({"role": "user"})
    banned = await db.users.count_documents({"role": "user", "banned": True})
    pending_deps = await db.deposits.count_documents({"status": "pending"})
    pending_wds = await db.withdrawals.count_documents({"status": "pending"})
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    live = await db.sessions.count_documents({"created_at": {"$gte": cutoff}})
    return {"total_users": total_users, "banned_users": banned, "pending_deposits": pending_deps, "pending_withdrawals": pending_wds, "live_users": live}


@api.get("/admin/users")
async def admin_users(admin: dict = Depends(require_admin)):
    rows = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)
    return rows


@api.post("/admin/users/{user_id}/ban")
async def admin_ban(user_id: str, admin: dict = Depends(require_admin)):
    await db.users.update_one({"id": user_id}, {"$set": {"banned": True}})
    return {"ok": True}


@api.post("/admin/users/{user_id}/unban")
async def admin_unban(user_id: str, admin: dict = Depends(require_admin)):
    await db.users.update_one({"id": user_id}, {"$set": {"banned": False}})
    return {"ok": True}


@api.post("/admin/users/balance")
async def admin_balance(data: BalanceAdjustIn, admin: dict = Depends(require_admin)):
    if data.currency not in SUPPORTED_CRYPTOS:
        raise HTTPException(status_code=400, detail="Unsupported currency")
    user = await db.users.find_one({"id": data.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    new_bal = (user.get("balances", {}).get(data.currency, 0)) + data.amount
    if new_bal < 0:
        raise HTTPException(status_code=400, detail="Resulting balance negative")
    await db.users.update_one({"id": data.user_id}, {"$inc": {f"balances.{data.currency}": data.amount}})
    return {"ok": True, "new_balance": new_bal}


@api.post("/admin/create")
async def admin_create(data: AdminCreateIn, admin: dict = Depends(require_admin)):
    email = data.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already exists")
    await db.users.insert_one({
        "id": str(uuid.uuid4()),
        "email": email,
        "username": data.username,
        "password_hash": hash_password(data.password),
        "role": "admin",
        "balances": empty_balances(),
        "banned": False,
        "created_at": now_iso(),
    })
    return {"ok": True}


@api.get("/admin/deposits")
async def admin_deposits(admin: dict = Depends(require_admin)):
    rows = await db.deposits.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


@api.post("/admin/deposits/{dep_id}/approve")
async def admin_approve_deposit(dep_id: str, admin: dict = Depends(require_admin)):
    dep = await db.deposits.find_one({"id": dep_id}, {"_id": 0})
    if not dep:
        raise HTTPException(status_code=404, detail="Not found")
    if dep["status"] == "approved":
        return {"ok": True}
    await db.deposits.update_one({"id": dep_id}, {"$set": {"status": "approved", "approved_at": now_iso()}})
    await db.users.update_one({"id": dep["user_id"]}, {"$inc": {f"balances.{dep['currency']}": dep["amount"]}})
    return {"ok": True}


@api.post("/admin/deposits/{dep_id}/reject")
async def admin_reject_deposit(dep_id: str, admin: dict = Depends(require_admin)):
    await db.deposits.update_one({"id": dep_id}, {"$set": {"status": "rejected", "approved_at": now_iso()}})
    return {"ok": True}


@api.get("/admin/withdrawals")
async def admin_withdrawals(admin: dict = Depends(require_admin)):
    rows = await db.withdrawals.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


# ---
@api.get("/")
async def root():
    return {"name": "ADX America API", "status": "ok"}


app.include_router(api)
