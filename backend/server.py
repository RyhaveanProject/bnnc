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
import json
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Literal

import bcrypt
import jwt
import httpx
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Form
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from pydantic import BaseModel, EmailStr, Field, ConfigDict

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("adx")

# --- DB ---
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
# GridFS bucket for storing deposit receipt screenshots
gridfs_bucket = AsyncIOMotorGridFSBucket(db, bucket_name="deposit_receipts")

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

# Deposit receipt upload window (in minutes). If receipt isn't uploaded within
# this window, the deposit is auto-rejected on next lazy-check.
DEPOSIT_RECEIPT_TIMEOUT_MIN = 5
# Max receipt file size (8 MB)
MAX_RECEIPT_SIZE = 8 * 1024 * 1024
ALLOWED_RECEIPT_MIME = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}


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


def parse_iso(s: str) -> datetime:
    """Parse ISO datetime, falling back gracefully."""
    try:
        return datetime.fromisoformat(s)
    except Exception:
        return datetime.now(timezone.utc)


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


class BalanceSetIn(BaseModel):
    user_id: str
    currency: str
    amount: float = Field(ge=0)


class WalletConfigIn(BaseModel):
    currency: str
    address: str
    network: Optional[str] = None
    qr_image_b64: Optional[str] = None


class DepositCreateIn(BaseModel):
    currency: str
    network: Optional[str] = None
    amount: float = Field(gt=0)


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


def _build_cors_origins() -> List[str]:
    """Build CORS origins list from env. Supports comma-separated CORS_ORIGINS or single FRONTEND_URL."""
    origins = []
    raw = os.environ.get("CORS_ORIGINS", "").strip()
    if raw:
        origins.extend([o.strip() for o in raw.split(",") if o.strip()])
    fe = os.environ.get("FRONTEND_URL", "").strip()
    if fe and fe not in origins:
        origins.append(fe)
    if not origins:
        return ["*"]
    return origins


_CORS_ORIGINS = _build_cors_origins()
# If we have explicit origins, allow credentials. With "*" we cannot.
app.add_middleware(
    CORSMiddleware,
    allow_credentials=_CORS_ORIGINS != ["*"],
    allow_origins=_CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)
logger.info("CORS origins: %s", _CORS_ORIGINS)


# --- Auth dependency ---
async def get_token_from_request(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return request.cookies.get("access_token")


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
    # SameSite=None + Secure is required for cross-domain cookie (Cloudflare front → Render back)
    # We still return the token in JSON for localStorage usage (Bearer header), this cookie is best-effort.
    resp.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=43200,
        path="/",
    )


# --- Startup ---
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.deposits.create_index("id", unique=True)
    await db.deposits.create_index([("user_id", 1), ("status", 1)])
    await db.withdrawals.create_index("id", unique=True)
    await db.trades.create_index("id", unique=True)
    await db.wallet_configs.create_index("currency", unique=True)
    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "").lower()
    admin_pwd = os.environ.get("ADMIN_PASSWORD", "")
    if admin_email and admin_pwd:
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
    # Try to register webhook (best-effort; ignored if not configured)
    asyncio.create_task(_register_telegram_webhook())


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
_MARKET_TTL = 15.0


async def _kucoin_all_tickers(cli: httpx.AsyncClient) -> dict:
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
        return [float(d[2]) for d in reversed(data)][-30:]
    except Exception:
        return []


async def _build_market_data() -> List[dict]:
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
                "symbol": "USDT", "name": COIN_NAMES["USDT"], "price": 1.0,
                "change24h": 0.0, "marketCap": 0, "volume24h": 0,
                "sparkline": [1.0, 1.0, 1.0, 1.0], "image": None,
            })
            continue
        sym = f"{coin}-USDT"
        t = tickers.get(sym, {})
        try: price = float(t.get("last") or 0)
        except (TypeError, ValueError): price = 0.0
        try: change_rate = float(t.get("changeRate") or 0) * 100
        except (TypeError, ValueError): change_rate = 0.0
        try: volume = float(t.get("volValue") or 0)
        except (TypeError, ValueError): volume = 0.0
        out.append({
            "symbol": coin, "name": COIN_NAMES.get(coin, coin), "price": price,
            "change24h": change_rate, "marketCap": 0, "volume24h": volume,
            "sparkline": spark_map.get(coin, []), "image": None,
        })
    return out


def _static_fallback_data() -> List[dict]:
    out = []
    for coin in TRADING_PAIRS:
        price = STATIC_FALLBACK.get(coin, 0.0)
        out.append({
            "symbol": coin, "name": COIN_NAMES.get(coin, coin), "price": price,
            "change24h": 0.0, "marketCap": 0, "volume24h": 0,
            "sparkline": [price, price, price, price], "image": None,
        })
    return out


async def _refresh_market_cache():
    if _MARKET_CACHE["lock"].locked():
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
            return _static_fallback_data()


@api.get("/market/prices")
async def market_prices():
    now = time.time()
    if _MARKET_CACHE["data"] and now - _MARKET_CACHE["ts"] < _MARKET_TTL:
        return _MARKET_CACHE["data"]
    return await _refresh_market_cache()


async def _live_price(symbol: str) -> float:
    """Return real-time USD price for a supported currency.
    USDT = 1.0. For BTC/ETH/TRX/BNB uses KuCoin cached prices.
    Falls back to STATIC_FALLBACK if everything fails.
    """
    symbol = symbol.upper()
    if symbol == "USDT":
        return 1.0
    try:
        prices = await market_prices()
        for p in prices:
            if p["symbol"] == symbol:
                price = float(p.get("price") or 0)
                if price > 0:
                    return price
    except Exception as e:
        logger.warning("live price lookup failed for %s: %s", symbol, e)
    return float(STATIC_FALLBACK.get(symbol, 0.0))


async def _deposit_usd_value(currency: str, amount: float) -> float:
    """Convert a deposit amount in `currency` to its USD (USDT) value at live rates."""
    price = await _live_price(currency)
    return float(amount) * price


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
                # When sending files, payload must be in `data`, not json
                data = {}
                for k, v in payload.items():
                    data[k] = v if isinstance(v, str) else json.dumps(v)
                r = await cli.post(url, data=data, files=files)
            else:
                r = await cli.post(url, json=payload)
            return r.json()
    except Exception as e:
        logger.error("Telegram send error: %s", e)
        return {"ok": False, "error": str(e)}


async def _register_telegram_webhook():
    """Auto-register Telegram webhook on startup if FRONTEND_URL/BACKEND_URL set."""
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        return
    base = os.environ.get("BACKEND_URL", "").strip() or os.environ.get("FRONTEND_URL", "").strip()
    if not base:
        return
    base = base.rstrip("/")
    webhook_url = f"{base}/api/telegram/webhook"
    try:
        async with httpx.AsyncClient(timeout=15) as cli:
            r = await cli.post(
                f"https://api.telegram.org/bot{token}/setWebhook",
                json={"url": webhook_url, "allowed_updates": ["callback_query", "message"]},
            )
            logger.info("Telegram setWebhook %s -> %s", webhook_url, r.status_code)
    except Exception as e:
        logger.warning("Telegram setWebhook failed: %s", e)


async def notify_deposit(deposit: dict, user: dict, receipt_bytes: Optional[bytes], receipt_mime: str = "image/jpeg"):
    chat_id = os.environ.get("TELEGRAM_ADMIN_CHAT_ID", "")
    if not chat_id:
        return
    # Compute live USD value at notification time so admin sees what will be
    # credited if confirmed. Final crediting also re-evaluates the price.
    usd_value = await _deposit_usd_value(deposit["currency"], float(deposit["amount"]))
    caption = (
        f"💰 *New Deposit Request*\n"
        f"👤 User: `{user['username']}`\n"
        f"📧 Email: `{user['email']}`\n"
        f"💎 Token: *{deposit['currency']}*\n"
        f"💵 Amount: *{deposit['amount']} {deposit['currency']}*\n"
        f"💲 USD value: *≈ ${usd_value:,.2f}*\n"
        f"🏦 Wallet: `{deposit.get('wallet_address','-')}`\n"
        f"🌐 Network: {deposit.get('network','-')}\n"
        f"📅 Date: {deposit['created_at']}\n"
        f"🆔 Deposit: `{deposit['id']}`"
    )
    kb = {"inline_keyboard": [[
        {"text": "✅ Confirm", "callback_data": f"adep:{deposit['id']}"},
        {"text": "❌ Cancel", "callback_data": f"rdep:{deposit['id']}"},
    ]]}
    if receipt_bytes:
        ext = "jpg" if "jpeg" in receipt_mime or "jpg" in receipt_mime else (
            "png" if "png" in receipt_mime else "webp" if "webp" in receipt_mime else "jpg"
        )
        files = {"photo": (f"receipt.{ext}", receipt_bytes, receipt_mime)}
        data = {"chat_id": chat_id, "caption": caption, "parse_mode": "Markdown", "reply_markup": kb}
        await tg_send("sendPhoto", data, files=files)
        return
    await tg_send("sendMessage", {"chat_id": chat_id, "text": caption, "parse_mode": "Markdown", "reply_markup": kb})


async def notify_withdraw(w: dict, user: dict):
    chat_id = os.environ.get("TELEGRAM_ADMIN_CHAT_ID", "")
    if not chat_id:
        return
    text = (
        f"🏧 *Withdraw Request*\n"
        f"👤 User: `{user['username']}`\n"
        f"📧 Email: `{user['email']}`\n"
        f"💎 Token: *{w['currency']}*\n"
        f"💵 Amount: *{w['amount']} {w['currency']}*\n"
        f"💸 Fee: {w.get('fee',0)} {w['currency']}\n"
        f"💰 Net: {w.get('net',0)} {w['currency']}\n"
        f"🏦 Address: `{w['address']}`\n"
        f"🌐 Network: {w.get('network','-')}\n"
        f"📅 Date: {w['created_at']}\n"
        f"🆔 Withdraw: `{w['id']}`"
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
        if dep["status"] in ("approved", "completed"):
            await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Already confirmed"})
            return {"ok": True}
        if dep["status"] == "rejected":
            await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Already rejected"})
            return {"ok": True}
        # Convert deposit amount to USD (USDT) at live market rate.
        # ALL approved deposits credit the user's USDT balance.
        usd_value = await _deposit_usd_value(dep["currency"], float(dep["amount"]))
        # Atomic status flip prevents double-credit on rapid double-clicks.
        flip = await db.deposits.update_one(
            {"id": target_id, "status": {"$in": ["pending", "awaiting_review"]}},
            {"$set": {
                "status": "completed",
                "approved_at": now_iso(),
                "credited_usd": usd_value,
                "credited_currency": "USDT",
                "price_at_approval": usd_value / float(dep["amount"]) if float(dep["amount"]) else 0,
            }},
        )
        if flip.modified_count == 0:
            await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Already processed"})
            return {"ok": True}
        await db.users.update_one(
            {"id": dep["user_id"]},
            {"$inc": {"balances.USDT": float(usd_value)}},
        )
        await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": f"Confirmed: +${usd_value:,.2f} USDT ✅"})
        if msg_id:
            await tg_send("editMessageReplyMarkup", {
                "chat_id": msg_chat_id, "message_id": msg_id,
                "reply_markup": {"inline_keyboard": [[{"text": f"✅ CONFIRMED  +${usd_value:,.2f}", "callback_data": "noop"}]]},
            })
    elif op == "rdep":
        flip = await db.deposits.update_one(
            {"id": target_id, "status": {"$in": ["pending", "awaiting_review"]}},
            {"$set": {"status": "rejected", "approved_at": now_iso(), "rejected_reason": "admin_cancelled"}},
        )
        if flip.modified_count == 0:
            await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Already processed"})
            return {"ok": True}
        await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Deposit cancelled ❌"})
        if msg_id:
            await tg_send("editMessageReplyMarkup", {
                "chat_id": msg_chat_id, "message_id": msg_id,
                "reply_markup": {"inline_keyboard": [[{"text": "❌ CANCELLED", "callback_data": "noop"}]]},
            })
    elif op == "awd":
        w = await db.withdrawals.find_one({"id": target_id}, {"_id": 0})
        if not w:
            await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Not found"})
            return {"ok": True}
        await db.withdrawals.update_one({"id": target_id}, {"$set": {"status": "paid", "paid_at": now_iso()}})
        await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Withdraw marked paid"})
        if msg_id:
            await tg_send("editMessageReplyMarkup", {
                "chat_id": msg_chat_id, "message_id": msg_id,
                "reply_markup": {"inline_keyboard": [[{"text": "✅ PAID", "callback_data": "noop"}]]},
            })
    elif op == "rwd":
        w = await db.withdrawals.find_one({"id": target_id}, {"_id": 0})
        if w and w["status"] == "pending":
            await db.users.update_one({"id": w["user_id"]}, {"$inc": {f"balances.{w['currency']}": w["amount"]}})
        await db.withdrawals.update_one({"id": target_id}, {"$set": {"status": "rejected", "approved_at": now_iso()}})
        await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Withdraw rejected"})
        if msg_id:
            await tg_send("editMessageReplyMarkup", {
                "chat_id": msg_chat_id, "message_id": msg_id,
                "reply_markup": {"inline_keyboard": [[{"text": "❌ REJECTED", "callback_data": "noop"}]]},
            })
    return {"ok": True}


# ============ DEPOSITS ============
async def _expire_stale_deposits(user_id: Optional[str] = None):
    """Lazy timeout check: auto-reject any deposit that didn't receive a receipt within 5 min."""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=DEPOSIT_RECEIPT_TIMEOUT_MIN)).isoformat()
    q = {
        "status": "pending",
        "receipt_uploaded": {"$ne": True},
        "created_at": {"$lt": cutoff},
    }
    if user_id:
        q["user_id"] = user_id
    res = await db.deposits.update_many(q, {"$set": {"status": "rejected", "rejected_reason": "receipt_timeout", "approved_at": now_iso()}})
    if res.modified_count:
        logger.info("Auto-rejected %d stale deposits (no receipt within %dm)", res.modified_count, DEPOSIT_RECEIPT_TIMEOUT_MIN)


def _dep_view(d: dict) -> dict:
    """Strip internal fields from a deposit doc returned to client."""
    out = {k: v for k, v in d.items() if k not in ("_id", "receipt_file_id")}
    return out


@api.post("/deposits/create")
async def deposit_create(data: DepositCreateIn, user: dict = Depends(get_current_user)):
    if data.currency not in SUPPORTED_CRYPTOS:
        raise HTTPException(status_code=400, detail="Unsupported currency")
    wallet = await db.wallet_configs.find_one({"currency": data.currency}, {"_id": 0})
    if not wallet or not wallet.get("address"):
        raise HTTPException(status_code=400, detail="Wallet not configured for this currency")

    # Duplicate-request protection: prevent more than one open pending deposit with same currency+amount within 1 min
    one_min_ago = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    existing = await db.deposits.find_one({
        "user_id": user["id"],
        "currency": data.currency,
        "amount": data.amount,
        "status": "pending",
        "created_at": {"$gte": one_min_ago},
    }, {"_id": 0})
    if existing:
        return {"deposit": _dep_view(existing), "wallet": wallet, "duplicate": True}

    now = datetime.now(timezone.utc)
    dep = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "currency": data.currency,
        "network": data.network or wallet.get("network") or data.currency,
        "amount": float(data.amount),
        "wallet_address": wallet["address"],
        "status": "pending",
        "receipt_uploaded": False,
        "confirmed_by_user": False,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(minutes=DEPOSIT_RECEIPT_TIMEOUT_MIN)).isoformat(),
    }
    await db.deposits.insert_one(dep)
    return {"deposit": _dep_view(dep), "wallet": wallet}


@api.post("/deposits/{deposit_id}/upload-receipt")
async def deposit_upload_receipt(
    deposit_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Upload a deposit receipt screenshot as multipart/form-data.
    Image is stored in MongoDB GridFS for safety. 5-minute window enforced.
    """
    # Validate file type
    mime = (file.content_type or "").lower()
    if mime not in ALLOWED_RECEIPT_MIME:
        raise HTTPException(status_code=400, detail="Only JPEG/PNG/WEBP/GIF images are allowed")

    # Find deposit
    dep = await db.deposits.find_one({"id": deposit_id, "user_id": user["id"]}, {"_id": 0})
    if not dep:
        raise HTTPException(status_code=404, detail="Deposit not found")
    if dep["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Deposit is already {dep['status']}")

    # Timeout check
    created = parse_iso(dep["created_at"])
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - created > timedelta(minutes=DEPOSIT_RECEIPT_TIMEOUT_MIN):
        await db.deposits.update_one(
            {"id": deposit_id},
            {"$set": {"status": "rejected", "rejected_reason": "receipt_timeout", "approved_at": now_iso()}},
        )
        raise HTTPException(status_code=400, detail="Upload window expired (5 minutes). Please create a new deposit.")

    # Read file with size cap
    body = await file.read(MAX_RECEIPT_SIZE + 1)
    if len(body) > MAX_RECEIPT_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 8 MB)")
    if len(body) < 100:
        raise HTTPException(status_code=400, detail="File appears empty/corrupt")

    # Save to GridFS
    file_id = await gridfs_bucket.upload_from_stream(
        f"receipt_{deposit_id}",
        body,
        metadata={"deposit_id": deposit_id, "user_id": user["id"], "content_type": mime, "uploaded_at": now_iso()},
    )

    await db.deposits.update_one(
        {"id": deposit_id},
        {"$set": {
            "receipt_uploaded": True,
            "receipt_file_id": str(file_id),
            "receipt_mime": mime,
            "confirmed_by_user": True,
            "confirmed_at": now_iso(),
            "status": "pending",  # remain pending until admin confirms
        }},
    )

    # Telegram notification (with attached image)
    dep_updated = await db.deposits.find_one({"id": deposit_id}, {"_id": 0})
    asyncio.create_task(notify_deposit(dep_updated, user, body, mime))

    return {"ok": True, "deposit": _dep_view(dep_updated)}


@api.get("/deposits/me")
async def deposits_me(user: dict = Depends(get_current_user)):
    await _expire_stale_deposits(user["id"])
    rows = await db.deposits.find(
        {"user_id": user["id"]},
        {"_id": 0, "receipt_file_id": 0},
    ).sort("created_at", -1).to_list(200)
    return rows


@api.get("/deposits/{deposit_id}/receipt")
async def get_receipt(deposit_id: str, admin: dict = Depends(require_admin)):
    """Stream a deposit receipt image from GridFS (admin only)."""
    dep = await db.deposits.find_one({"id": deposit_id})
    if not dep or not dep.get("receipt_file_id"):
        raise HTTPException(status_code=404, detail="Receipt not found")
    try:
        stream = await gridfs_bucket.open_download_stream(ObjectId(dep["receipt_file_id"]))
    except Exception:
        raise HTTPException(status_code=404, detail="Receipt file missing")
    content = await stream.read()
    mime = dep.get("receipt_mime", "image/jpeg")
    return Response(content=content, media_type=mime)


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
    w_view = {k: v for k, v in w.items() if k != "_id"}
    asyncio.create_task(notify_withdraw(w_view, user))
    return {"withdrawal": w_view}


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
        "symbol": sym, "side": data.side, "price": price,
        "amount": data.amount, "executed": executed, "created_at": now_iso(),
    }
    await db.trades.insert_one(trade)
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    trade_view = {k: v for k, v in trade.items() if k != "_id"}
    return {"trade": trade_view, "user": updated}


@api.get("/trade/history")
async def trade_history(user: dict = Depends(get_current_user)):
    rows = await db.trades.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return rows


# ============ CONFIG / MISC ============
@api.get("/config/live-chat")
async def live_chat_url():
    return {"url": os.environ.get("LIVE_CHAT_URL", "")}


@api.get("/health")
async def health():
    return {"status": "ok", "time": now_iso()}


# ============ ADMIN ============
@api.get("/admin/stats")
async def admin_stats(admin: dict = Depends(require_admin)):
    await _expire_stale_deposits()
    total_users = await db.users.count_documents({"role": "user"})
    banned = await db.users.count_documents({"role": "user", "banned": True})
    pending_deps = await db.deposits.count_documents({"status": "pending"})
    pending_wds = await db.withdrawals.count_documents({"status": "pending"})
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    live = await db.sessions.count_documents({"created_at": {"$gte": cutoff}})
    return {
        "total_users": total_users, "banned_users": banned,
        "pending_deposits": pending_deps, "pending_withdrawals": pending_wds,
        "live_users": live,
    }


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
async def admin_balance_adjust(data: BalanceAdjustIn, admin: dict = Depends(require_admin)):
    """Increment/decrement user's balance by `amount` (signed)."""
    if data.currency not in SUPPORTED_CRYPTOS:
        raise HTTPException(status_code=400, detail="Unsupported currency")
    user = await db.users.find_one({"id": data.user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    cur_bal = float(user.get("balances", {}).get(data.currency, 0) or 0)
    new_bal = cur_bal + float(data.amount)
    if new_bal < 0:
        raise HTTPException(status_code=400, detail="Resulting balance would be negative")
    await db.users.update_one(
        {"id": data.user_id},
        {"$set": {f"balances.{data.currency}": new_bal}},
    )
    updated = await db.users.find_one({"id": data.user_id}, {"_id": 0, "password_hash": 0})
    return {"ok": True, "user": updated, "new_balance": new_bal}


@api.post("/admin/users/balance/set")
async def admin_balance_set(data: BalanceSetIn, admin: dict = Depends(require_admin)):
    """Overwrite the user's balance for a currency to exactly `amount`."""
    if data.currency not in SUPPORTED_CRYPTOS:
        raise HTTPException(status_code=400, detail="Unsupported currency")
    user = await db.users.find_one({"id": data.user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if data.amount < 0:
        raise HTTPException(status_code=400, detail="Balance cannot be negative")
    await db.users.update_one(
        {"id": data.user_id},
        {"$set": {f"balances.{data.currency}": float(data.amount)}},
    )
    updated = await db.users.find_one({"id": data.user_id}, {"_id": 0, "password_hash": 0})
    return {"ok": True, "user": updated, "new_balance": float(data.amount)}


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
    await _expire_stale_deposits()
    rows = await db.deposits.find({}, {"_id": 0, "receipt_file_id": 0}).sort("created_at", -1).to_list(500)
    return rows


@api.post("/admin/deposits/{dep_id}/approve")
async def admin_approve_deposit(dep_id: str, admin: dict = Depends(require_admin)):
    dep = await db.deposits.find_one({"id": dep_id}, {"_id": 0})
    if not dep:
        raise HTTPException(status_code=404, detail="Not found")
    if dep["status"] in ("approved", "completed"):
        return {"ok": True, "status": dep["status"]}
    usd_value = await _deposit_usd_value(dep["currency"], float(dep["amount"]))
    flip = await db.deposits.update_one(
        {"id": dep_id, "status": {"$in": ["pending", "awaiting_review"]}},
        {"$set": {
            "status": "completed", "approved_at": now_iso(),
            "credited_usd": usd_value, "credited_currency": "USDT",
            "price_at_approval": usd_value / float(dep["amount"]) if float(dep["amount"]) else 0,
        }},
    )
    if flip.modified_count == 0:
        return {"ok": True, "status": "already_processed"}
    await db.users.update_one(
        {"id": dep["user_id"]},
        {"$inc": {"balances.USDT": float(usd_value)}},
    )
    return {"ok": True, "status": "completed", "credited_usd": usd_value}


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
