 
Action: file_editor create /app/backend/server.py --file-text "from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / \".env\")

import asyncio
import base64
import io
import logging
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import httpx
import jwt as pyjwt
import qrcode
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Form
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from starlette.middleware.cors import CORSMiddleware


# ===== Config =====
MONGO_URL = os.environ[\"MONGO_URL\"]
DB_NAME = os.environ[\"DB_NAME\"]
JWT_SECRET = os.environ[\"JWT_SECRET\"]
JWT_ALG = \"HS256\"

ADMIN_EMAIL = os.environ.get(\"ADMIN_EMAIL\", \"admin@bnnc.com\")
ADMIN_PASSWORD = os.environ.get(\"ADMIN_PASSWORD\", \"Admin@12345\")

WALLETS = {
    \"USDT\": os.environ.get(\"USDT_WALLET\", \"\"),
    \"BTC\": os.environ.get(\"BTC_WALLET\", \"\"),
    \"ETH\": os.environ.get(\"ETH_WALLET\", \"\"),
    \"TRX\": os.environ.get(\"TRX_WALLET\", \"\"),
    \"BNB\": os.environ.get(\"BNB_WALLET\", \"\"),
}
NETWORKS = {
    \"USDT\": \"TRC20\",
    \"BTC\": \"Bitcoin\",
    \"ETH\": \"ERC20\",
    \"TRX\": \"TRON\",
    \"BNB\": \"BSC (BEP20)\",
}
WITHDRAW_FEES = {
    \"USDT\": float(os.environ.get(\"WITHDRAW_FEE_USDT\", \"1\")),
    \"BTC\": float(os.environ.get(\"WITHDRAW_FEE_BTC\", \"0.0005\")),
    \"ETH\": float(os.environ.get(\"WITHDRAW_FEE_ETH\", \"0.005\")),
    \"TRX\": float(os.environ.get(\"WITHDRAW_FEE_TRX\", \"2\")),
    \"BNB\": float(os.environ.get(\"WITHDRAW_FEE_BNB\", \"0.0008\")),
}
TELEGRAM_BOT_TOKEN = os.environ.get(\"TELEGRAM_BOT_TOKEN\", \"\").strip()
TELEGRAM_ADMIN_CHAT_ID = os.environ.get(\"TELEGRAM_ADMIN_CHAT_ID\", \"\").strip()
LIVE_CHAT_URL = os.environ.get(\"LIVE_CHAT_URL\", \"\")

CURRENCIES = [\"USDT\", \"BTC\", \"ETH\", \"TRX\", \"BNB\"]

# ===== Logging =====
logging.basicConfig(level=logging.INFO, format=\"%(asctime)s [%(levelname)s] %(message)s\")
logger = logging.getLogger(\"bnnc\")

# ===== DB =====
mongo_client = AsyncIOMotorClient(MONGO_URL)
db = mongo_client[DB_NAME]

# ===== App =====
app = FastAPI(title=\"BNNC Exchange API\")
api = APIRouter(prefix=\"/api\")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[\"*\"],
    allow_credentials=False,
    allow_methods=[\"*\"],
    allow_headers=[\"*\"],
)


# ===== Helpers =====
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(\"utf-8\"), bcrypt.gensalt()).decode(\"utf-8\")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(\"utf-8\"), hashed.encode(\"utf-8\"))
    except Exception:
        return False


def create_token(user_id: str, role: str, expires_minutes: int = 60 * 24 * 7) -> str:
    payload = {
        \"sub\": user_id,
        \"role\": role,
        \"exp\": datetime.now(timezone.utc) + timedelta(minutes=expires_minutes),
        \"iat\": datetime.now(timezone.utc),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> dict:
    return pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get(\"Authorization\", \"\")
    if not auth.startswith(\"Bearer \"):
        raise HTTPException(status_code=401, detail=\"Not authenticated\")
    token = auth[7:]
    try:
        payload = decode_token(token)
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail=\"Token expired\")
    except Exception:
        raise HTTPException(status_code=401, detail=\"Invalid token\")
    user = await db.users.find_one({\"id\": payload[\"sub\"]}, {\"_id\": 0, \"password_hash\": 0})
    if not user:
        raise HTTPException(status_code=401, detail=\"User not found\")
    if user.get(\"banned\"):
        raise HTTPException(status_code=403, detail=\"User is banned\")
    return user


async def get_current_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get(\"role\") != \"admin\":
        raise HTTPException(status_code=403, detail=\"Admin only\")
    return user


STRONG_PW_RE = re.compile(r\"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$\")


def validate_password(pw: str):
    if not STRONG_PW_RE.match(pw):
        raise HTTPException(status_code=400, detail=\"Şifrə minimum 8 simvol, böyük və kiçik hərf, rəqəm olmalıdır\")


# ===== Models =====
class RegisterIn(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=30)
    password: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class DepositRequestIn(BaseModel):
    currency: Literal[\"USDT\", \"BTC\", \"ETH\", \"TRX\", \"BNB\"]
    amount: float = Field(gt=0)


class WithdrawRequestIn(BaseModel):
    currency: Literal[\"USDT\", \"BTC\", \"ETH\", \"TRX\", \"BNB\"]
    amount: float = Field(gt=0)
    address: str = Field(min_length=10)


class TradeIn(BaseModel):
    symbol: Literal[\"BTC\", \"ETH\", \"BNB\", \"XRP\", \"SOL\"]
    side: Literal[\"buy\", \"sell\"]
    quote_amount: Optional[float] = None  # USDT amount for buy
    base_amount: Optional[float] = None   # coin amount for sell


class AdjustBalanceIn(BaseModel):
    user_id: str
    currency: str
    amount: float  # may be negative
    note: Optional[str] = \"\"


class BanIn(BaseModel):
    user_id: str
    banned: bool


class CreateAdminIn(BaseModel):
    email: EmailStr
    username: str
    password: str


class QrUploadIn(BaseModel):
    currency: str
    image_base64: str  # data URL or raw base64


# ===== Telegram =====
async def tg_send(chat_id: str, text: str, reply_markup: Optional[dict] = None) -> Optional[dict]:
    if not TELEGRAM_BOT_TOKEN or not chat_id:
        logger.info(\"[TG MOCK] %s -> %s\", chat_id or \"<no_chat>\", text)
        return None
    url = f\"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage\"
    payload = {\"chat_id\": chat_id, \"text\": text, \"parse_mode\": \"HTML\"}
    if reply_markup:
        payload[\"reply_markup\"] = reply_markup
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(url, json=payload)
            return r.json()
    except Exception as e:
        logger.error(\"Telegram send failed: %s\", e)
        return None


async def tg_answer_callback(callback_id: str, text: str = \"OK\"):
    if not TELEGRAM_BOT_TOKEN:
        return
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            await c.post(
                f\"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/answerCallbackQuery\",
                json={\"callback_query_id\": callback_id, \"text\": text},
            )
    except Exception as e:
        logger.error(\"Telegram answerCallback failed: %s\", e)


async def tg_edit_message(chat_id: str, message_id: int, text: str):
    if not TELEGRAM_BOT_TOKEN:
        return
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            await c.post(
                f\"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/editMessageText\",
                json={\"chat_id\": chat_id, \"message_id\": message_id, \"text\": text, \"parse_mode\": \"HTML\"},
            )
    except Exception as e:
        logger.error(\"Telegram edit failed: %s\", e)


async def notify_admin_deposit(tx: dict, user: dict):
    text = (
        f\"<b>🟢 New Deposit Request</b>\n\"
        f\"<b>User ID:</b> {user['id']}\n\"
        f\"<b>Username:</b> {user.get('username','')}\n\"
        f\"<b>Email:</b> {user.get('email','')}\n\"
        f\"<b>Amount:</b> {tx['amount']} {tx['currency']}\n\"
        f\"<b>Network:</b> {tx.get('network','')}\n\"
        f\"<b>Time:</b> {tx['created_at']}\n\"
        f\"<b>TX ID:</b> {tx['id']}\"
    )
    reply = {
        \"inline_keyboard\": [[
            {\"text\": \"✅ Approve\", \"callback_data\": f\"approve_dep:{tx['id']}\"},
            {\"text\": \"❌ Reject\", \"callback_data\": f\"reject_dep:{tx['id']}\"},
        ]]
    }
    await tg_send(TELEGRAM_ADMIN_CHAT_ID, text, reply)


async def notify_admin_withdraw(tx: dict, user: dict):
    text = (
        f\"<b>🔴 New Withdraw Request</b>\n\"
        f\"<b>User ID:</b> {user['id']}\n\"
        f\"<b>Username:</b> {user.get('username','')}\n\"
        f\"<b>Email:</b> {user.get('email','')}\n\"
        f\"<b>Amount:</b> {tx['amount']} {tx['currency']}\n\"
        f\"<b>Fee:</b> {tx['fee']} {tx['currency']}\n\"
        f\"<b>Net:</b> {tx['net_amount']} {tx['currency']}\n\"
        f\"<b>Address:</b> <code>{tx['address']}</code>\n\"
        f\"<b>Time:</b> {tx['created_at']}\n\"
        f\"<b>TX ID:</b> {tx['id']}\"
    )
    reply = {
        \"inline_keyboard\": [[
            {\"text\": \"✅ Approve\", \"callback_data\": f\"approve_wd:{tx['id']}\"},
            {\"text\": \"❌ Reject\", \"callback_data\": f\"reject_wd:{tx['id']}\"},
        ]]
    }
    await tg_send(TELEGRAM_ADMIN_CHAT_ID, text, reply)


# ===== Market data (CoinGecko) =====
COINGECKO_IDS = {
    \"BTC\": \"bitcoin\",
    \"ETH\": \"ethereum\",
    \"BNB\": \"binancecoin\",
    \"XRP\": \"ripple\",
    \"SOL\": \"solana\",
    \"USDT\": \"tether\",
    \"TRX\": \"tron\",
}

_MARKET_CACHE: dict = {\"data\": [], \"ts\": None}


async def fetch_market():
    ids = \",\".join(COINGECKO_IDS.values())
    url = \"https://api.coingecko.com/api/v3/coins/markets\"
    params = {
        \"vs_currency\": \"usd\",
        \"ids\": ids,
        \"order\": \"market_cap_desc\",
        \"per_page\": 50,
        \"page\": 1,
        \"sparkline\": \"true\",
        \"price_change_percentage\": \"24h\",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(url, params=params)
            if r.status_code == 200:
                data = r.json()
                result = []
                for d in data:
                    sym = d.get(\"symbol\", \"\").upper()
                    result.append({
                        \"id\": d.get(\"id\"),
                        \"symbol\": sym,
                        \"name\": d.get(\"name\"),
                        \"image\": d.get(\"image\"),
                        \"price\": d.get(\"current_price\"),
                        \"change_24h\": d.get(\"price_change_percentage_24h\"),
                        \"market_cap\": d.get(\"market_cap\"),
                        \"volume_24h\": d.get(\"total_volume\"),
                        \"high_24h\": d.get(\"high_24h\"),
                        \"low_24h\": d.get(\"low_24h\"),
                        \"sparkline\": (d.get(\"sparkline_in_7d\") or {}).get(\"price\", [])[-48:],
                    })
                _MARKET_CACHE[\"data\"] = result
                _MARKET_CACHE[\"ts\"] = datetime.now(timezone.utc).isoformat()
    except Exception as e:
        logger.error(\"CoinGecko fetch error: %s\", e)


async def market_loop():
    while True:
        await fetch_market()
        await asyncio.sleep(30)


def get_price(symbol: str) -> Optional[float]:
    sym = symbol.upper()
    for c in _MARKET_CACHE[\"data\"]:
        if c[\"symbol\"] == sym:
            return c[\"price\"]
    return None


# ===== Auth Endpoints =====
@api.post(\"/auth/register\")
async def register(payload: RegisterIn):
    validate_password(payload.password)
    email = payload.email.lower()
    if await db.users.find_one({\"email\": email}):
        raise HTTPException(status_code=400, detail=\"Bu email artıq qeydiyyatdadır\")
    if await db.users.find_one({\"username\": payload.username}):
        raise HTTPException(status_code=400, detail=\"Bu istifadəçi adı artıq mövcuddur\")
    user_id = str(uuid.uuid4())
    doc = {
        \"id\": user_id,
        \"email\": email,
        \"username\": payload.username,
        \"password_hash\": hash_password(payload.password),
        \"role\": \"user\",
        \"banned\": False,
        \"balances\": {c: 0.0 for c in CURRENCIES},
        \"created_at\": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    token = create_token(user_id, \"user\")
    return {
        \"token\": token,
        \"user\": {
            \"id\": user_id, \"email\": email, \"username\": payload.username,
            \"role\": \"user\", \"balances\": doc[\"balances\"]
        }
    }


@api.post(\"/auth/login\")
async def login(payload: LoginIn):
    email = payload.email.lower()
    user = await db.users.find_one({\"email\": email})
    if not user or not verify_password(payload.password, user[\"password_hash\"]):
        raise HTTPException(status_code=401, detail=\"Email və ya şifrə yanlışdır\")
    if user.get(\"banned\"):
        raise HTTPException(status_code=403, detail=\"Hesabınız bloklanıb\")
    if user.get(\"role\") == \"admin\":
        raise HTTPException(status_code=403, detail=\"Admin hesabı /api/auth/admin-login üzərindən daxil olmalıdır\")
    token = create_token(user[\"id\"], user.get(\"role\", \"user\"))
    return {
        \"token\": token,
        \"user\": {
            \"id\": user[\"id\"], \"email\": user[\"email\"], \"username\": user.get(\"username\"),
            \"role\": user.get(\"role\"), \"balances\": user.get(\"balances\", {})
        }
    }


@api.post(\"/auth/admin-login\")
async def admin_login(payload: LoginIn):
    email = payload.email.lower()
    user = await db.users.find_one({\"email\": email})
    if not user or not verify_password(payload.password, user[\"password_hash\"]):
        raise HTTPException(status_code=401, detail=\"Email və ya şifrə yanlışdır\")
    if user.get(\"role\") != \"admin\":
        raise HTTPException(status_code=403, detail=\"Admin icazəsi yoxdur\")
    token = create_token(user[\"id\"], \"admin\")
    return {
        \"token\": token,
        \"user\": {
            \"id\": user[\"id\"], \"email\": user[\"email\"], \"username\": user.get(\"username\"),
            \"role\": \"admin\", \"balances\": user.get(\"balances\", {})
        }
    }


@api.get(\"/auth/me\")
async def me(user: dict = Depends(get_current_user)):
    return {\"user\": user}


# ===== Market =====
@api.get(\"/market\")
async def market():
    if not _MARKET_CACHE[\"data\"]:
        await fetch_market()
    return {\"data\": _MARKET_CACHE[\"data\"], \"ts\": _MARKET_CACHE[\"ts\"]}


@api.get(\"/market/{symbol}\")
async def market_one(symbol: str):
    if not _MARKET_CACHE[\"data\"]:
        await fetch_market()
    sym = symbol.upper()
    for c in _MARKET_CACHE[\"data\"]:
        if c[\"symbol\"] == sym:
            return c
    raise HTTPException(404, \"Symbol not found\")


# ===== Deposit =====
@api.get(\"/deposit/info/{currency}\")
async def deposit_info(currency: str, user: dict = Depends(get_current_user)):
    cur = currency.upper()
    if cur not in CURRENCIES:
        raise HTTPException(400, \"Invalid currency\")
    address = WALLETS.get(cur, \"\")
    # Get admin QR or generate one
    qr_doc = await db.qr_codes.find_one({\"currency\": cur}, {\"_id\": 0})
    qr_image = qr_doc.get(\"image_base64\") if qr_doc else None
    if not qr_image and address:
        img = qrcode.make(address)
        buf = io.BytesIO()
        img.save(buf, format=\"PNG\")
        qr_image = \"data:image/png;base64,\" + base64.b64encode(buf.getvalue()).decode()
    return {
        \"currency\": cur,
        \"address\": address,
        \"network\": NETWORKS.get(cur, \"\"),
        \"qr\": qr_image,
    }


@api.post(\"/deposit/request\")
async def deposit_request(payload: DepositRequestIn, user: dict = Depends(get_current_user)):
    cur = payload.currency
    tx = {
        \"id\": str(uuid.uuid4()),
        \"user_id\": user[\"id\"],
        \"type\": \"deposit\",
        \"currency\": cur,
        \"amount\": payload.amount,
        \"address\": WALLETS.get(cur, \"\"),
        \"network\": NETWORKS.get(cur, \"\"),
        \"status\": \"pending\",
        \"created_at\": datetime.now(timezone.utc).isoformat(),
    }
    await db.transactions.insert_one(dict(tx))
    await notify_admin_deposit(tx, user)
    return {\"transaction\": {k: v for k, v in tx.items() if k != \"_id\"}}


# ===== Withdraw =====
@api.get(\"/withdraw/fee/{currency}\")
async def withdraw_fee(currency: str, user: dict = Depends(get_current_user)):
    cur = currency.upper()
    if cur not in CURRENCIES:
        raise HTTPException(400, \"Invalid currency\")
    return {\"currency\": cur, \"fee\": WITHDRAW_FEES.get(cur, 0), \"network\": NETWORKS.get(cur, \"\")}


@api.post(\"/withdraw/request\")
async def withdraw_request(payload: WithdrawRequestIn, user: dict = Depends(get_current_user)):
    cur = payload.currency
    fee = WITHDRAW_FEES.get(cur, 0)
    total = payload.amount + fee
    bal = (user.get(\"balances\") or {}).get(cur, 0.0)
    if bal < total:
        raise HTTPException(400, f\"Kifayət qədər balans yoxdur. Tələb: {total} {cur}, balansınız: {bal} {cur}\")
    # lock funds
    await db.users.update_one(
        {\"id\": user[\"id\"]},
        {\"$inc\": {f\"balances.{cur}\": -total}}
    )
    tx = {
        \"id\": str(uuid.uuid4()),
        \"user_id\": user[\"id\"],
        \"type\": \"withdraw\",
        \"currency\": cur,
        \"amount\": payload.amount,
        \"fee\": fee,
        \"net_amount\": payload.amount,
        \"address\": payload.address,
        \"network\": NETWORKS.get(cur, \"\"),
        \"status\": \"pending\",
        \"created_at\": datetime.now(timezone.utc).isoformat(),
    }
    await db.transactions.insert_one(dict(tx))
    await notify_admin_withdraw(tx, user)
    return {\"transaction\": {k: v for k, v in tx.items() if k != \"_id\"}}


# ===== Trading =====
@api.post(\"/trade\")
async def trade(payload: TradeIn, user: dict = Depends(get_current_user)):
    price = get_price(payload.symbol)
    if price is None or price <= 0:
        await fetch_market()
        price = get_price(payload.symbol)
    if price is None or price <= 0:
        raise HTTPException(503, \"Market data unavailable\")

    sym = payload.symbol
    bal = user.get(\"balances\", {})
    if payload.side == \"buy\":
        if not payload.quote_amount or payload.quote_amount <= 0:
            raise HTTPException(400, \"quote_amount tələb olunur\")
        usdt_needed = payload.quote_amount
        if bal.get(\"USDT\", 0) < usdt_needed:
            raise HTTPException(400, \"Kifayət qədər USDT yoxdur\")
        coin_received = usdt_needed / price
        await db.users.update_one(
            {\"id\": user[\"id\"]},
            {\"$inc\": {\"balances.USDT\": -usdt_needed, f\"balances.{sym}\": coin_received}}
        )
        tx_amount = coin_received
        tx_quote = usdt_needed
    else:
        if not payload.base_amount or payload.base_amount <= 0:
            raise HTTPException(400, \"base_amount tələb olunur\")
        if bal.get(sym, 0) < payload.base_amount:
            raise HTTPException(400, f\"Kifayət qədər {sym} yoxdur\")
        usdt_received = payload.base_amount * price
        await db.users.update_one(
            {\"id\": user[\"id\"]},
            {\"$inc\": {f\"balances.{sym}\": -payload.base_amount, \"balances.USDT\": usdt_received}}
        )
        tx_amount = payload.base_amount
        tx_quote = usdt_received

    tx = {
        \"id\": str(uuid.uuid4()),
        \"user_id\": user[\"id\"],
        \"type\": \"trade\",
        \"side\": payload.side,
        \"symbol\": sym,
        \"price\": price,
        \"amount\": tx_amount,
        \"quote_amount\": tx_quote,
        \"status\": \"filled\",
        \"created_at\": datetime.now(timezone.utc).isoformat(),
    }
    await db.transactions.insert_one(dict(tx))
    fresh = await db.users.find_one({\"id\": user[\"id\"]}, {\"_id\": 0, \"password_hash\": 0})
    return {\"trade\": {k: v for k, v in tx.items() if k != \"_id\"}, \"balances\": fresh.get(\"balances\", {})}


# ===== User Transactions =====
@api.get(\"/transactions\")
async def my_transactions(user: dict = Depends(get_current_user)):
    cur = db.transactions.find({\"user_id\": user[\"id\"]}, {\"_id\": 0}).sort(\"created_at\", -1).limit(200)
    items = [t async for t in cur]
    return {\"transactions\": items}


# ===== Live Chat =====
@api.get(\"/live-chat\")
async def live_chat():
    return {\"url\": LIVE_CHAT_URL}


# ===== Wallet info for currencies (public, used to display network etc) =====
@api.get(\"/currencies\")
async def currencies():
    return {
        \"currencies\": [
            {\"symbol\": c, \"network\": NETWORKS.get(c), \"fee\": WITHDRAW_FEES.get(c, 0)}
            for c in CURRENCIES
        ]
    }


# ===== Admin =====
@api.get(\"/admin/stats\")
async def admin_stats(admin: dict = Depends(get_current_admin)):
    total_users = await db.users.count_documents({\"role\": \"user\"})
    banned = await db.users.count_documents({\"banned\": True})
    active = total_users - banned
    pending_dep = await db.transactions.count_documents({\"type\": \"deposit\", \"status\": \"pending\"})
    pending_wd = await db.transactions.count_documents({\"type\": \"withdraw\", \"status\": \"pending\"})
    # \"live\" = users active in last 5 minutes (we approximate via last_seen)
    five_min_ago = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    live_users = await db.users.count_documents({\"last_seen\": {\"$gte\": five_min_ago}})
    return {
        \"total_users\": total_users,
        \"active_users\": active,
        \"banned_users\": banned,
        \"live_users\": live_users,
        \"pending_deposits\": pending_dep,
        \"pending_withdrawals\": pending_wd,
    }


@api.get(\"/admin/users\")
async def admin_users(admin: dict = Depends(get_current_admin), q: str = \"\"):
    query = {}
    if q:
        query = {\"$or\": [{\"email\": {\"$regex\": q, \"$options\": \"i\"}}, {\"username\": {\"$regex\": q, \"$options\": \"i\"}}]}
    cur = db.users.find(query, {\"_id\": 0, \"password_hash\": 0}).sort(\"created_at\", -1).limit(500)
    items = [u async for u in cur]
    return {\"users\": items}


@api.post(\"/admin/ban\")
async def admin_ban(payload: BanIn, admin: dict = Depends(get_current_admin)):
    res = await db.users.update_one({\"id\": payload.user_id}, {\"$set\": {\"banned\": payload.banned}})
    if res.matched_count == 0:
        raise HTTPException(404, \"User not found\")
    await db.admin_logs.insert_one({
        \"id\": str(uuid.uuid4()),
        \"admin_id\": admin[\"id\"],
        \"action\": \"ban\" if payload.banned else \"unban\",
        \"target_user\": payload.user_id,
        \"ts\": datetime.now(timezone.utc).isoformat(),
    })
    return {\"ok\": True}


@api.post(\"/admin/adjust-balance\")
async def admin_adjust(payload: AdjustBalanceIn, admin: dict = Depends(get_current_admin)):
    cur = payload.currency.upper()
    if cur not in CURRENCIES:
        raise HTTPException(400, \"Invalid currency\")
    res = await db.users.update_one({\"id\": payload.user_id}, {\"$inc\": {f\"balances.{cur}\": payload.amount}})
    if res.matched_count == 0:
        raise HTTPException(404, \"User not found\")
    await db.admin_logs.insert_one({
        \"id\": str(uuid.uuid4()),
        \"admin_id\": admin[\"id\"],
        \"action\": \"adjust\",
        \"target_user\": payload.user_id,
        \"currency\": cur,
        \"amount\": payload.amount,
        \"note\": payload.note,
        \"ts\": datetime.now(timezone.utc).isoformat(),
    })
    return {\"ok\": True}


@api.post(\"/admin/create-admin\")
async def admin_create_admin(payload: CreateAdminIn, admin: dict = Depends(get_current_admin)):
    validate_password(payload.password)
    email = payload.email.lower()
    if await db.users.find_one({\"email\": email}):
        raise HTTPException(400, \"Email artıq mövcuddur\")
    user_id = str(uuid.uuid4())
    await db.users.insert_one({
        \"id\": user_id,
        \"email\": email,
        \"username\": payload.username,
        \"password_hash\": hash_password(payload.password),
        \"role\": \"admin\",
        \"banned\": False,
        \"balances\": {c: 0.0 for c in CURRENCIES},
        \"created_at\": datetime.now(timezone.utc).isoformat(),
    })
    return {\"ok\": True, \"id\": user_id}


@api.get(\"/admin/transactions\")
async def admin_transactions(admin: dict = Depends(get_current_admin), type: Optional[str] = None, status: Optional[str] = None):
    query = {}
    if type:
        query[\"type\"] = type
    if status:
        query[\"status\"] = status
    cur = db.transactions.find(query, {\"_id\": 0}).sort(\"created_at\", -1).limit(500)
    items = [t async for t in cur]
    # enrich with user info
    user_ids = list({t.get(\"user_id\") for t in items if t.get(\"user_id\")})
    users = {}
    if user_ids:
        async for u in db.users.find({\"id\": {\"$in\": user_ids}}, {\"_id\": 0, \"id\": 1, \"email\": 1, \"username\": 1}):
            users[u[\"id\"]] = u
    for t in items:
        t[\"user\"] = users.get(t.get(\"user_id\"))
    return {\"transactions\": items}


async def _approve_deposit(tx_id: str) -> str:
    tx = await db.transactions.find_one({\"id\": tx_id, \"type\": \"deposit\"})
    if not tx:
        return \"Transaction tapılmadı\"
    if tx[\"status\"] != \"pending\":
        return f\"Artıq {tx['status']}\"
    await db.users.update_one({\"id\": tx[\"user_id\"]}, {\"$inc\": {f\"balances.{tx['currency']}\": tx[\"amount\"]}})
    await db.transactions.update_one({\"id\": tx_id}, {\"$set\": {\"status\": \"approved\", \"approved_at\": datetime.now(timezone.utc).isoformat()}})
    return f\"Deposit təsdiqləndi: {tx['amount']} {tx['currency']}\"


async def _reject_deposit(tx_id: str) -> str:
    tx = await db.transactions.find_one({\"id\": tx_id, \"type\": \"deposit\"})
    if not tx:
        return \"Transaction tapılmadı\"
    if tx[\"status\"] != \"pending\":
        return f\"Artıq {tx['status']}\"
    await db.transactions.update_one({\"id\": tx_id}, {\"$set\": {\"status\": \"rejected\", \"approved_at\": datetime.now(timezone.utc).isoformat()}})
    return \"Deposit rədd edildi\"


async def _approve_withdraw(tx_id: str) -> str:
    tx = await db.transactions.find_one({\"id\": tx_id, \"type\": \"withdraw\"})
    if not tx:
        return \"Transaction tapılmadı\"
    if tx[\"status\"] != \"pending\":
        return f\"Artıq {tx['status']}\"
    # funds already deducted on request
    await db.transactions.update_one({\"id\": tx_id}, {\"$set\": {\"status\": \"approved\", \"approved_at\": datetime.now(timezone.utc).isoformat()}})
    return f\"Withdraw təsdiqləndi: {tx['amount']} {tx['currency']}\"


async def _reject_withdraw(tx_id: str) -> str:
    tx = await db.transactions.find_one({\"id\": tx_id, \"type\": \"withdraw\"})
    if not tx:
        return \"Transaction tapılmadı\"
    if tx[\"status\"] != \"pending\":
        return f\"Artıq {tx['status']}\"
    # refund
    total = tx[\"amount\"] + tx.get(\"fee\", 0)
    await db.users.update_one({\"id\": tx[\"user_id\"]}, {\"$inc\": {f\"balances.{tx['currency']}\": total}})
    await db.transactions.update_one({\"id\": tx_id}, {\"$set\": {\"status\": \"rejected\", \"approved_at\": datetime.now(timezone.utc).isoformat()}})
    return \"Withdraw rədd edildi və balans qaytarıldı\"


@api.post(\"/admin/approve-deposit/{tx_id}\")
async def admin_approve_deposit(tx_id: str, admin: dict = Depends(get_current_admin)):
    msg = await _approve_deposit(tx_id)
    return {\"message\": msg}


@api.post(\"/admin/reject-deposit/{tx_id}\")
async def admin_reject_deposit(tx_id: str, admin: dict = Depends(get_current_admin)):
    msg = await _reject_deposit(tx_id)
    return {\"message\": msg}


@api.post(\"/admin/approve-withdraw/{tx_id}\")
async def admin_approve_withdraw(tx_id: str, admin: dict = Depends(get_current_admin)):
    msg = await _approve_withdraw(tx_id)
    return {\"message\": msg}


@api.post(\"/admin/reject-withdraw/{tx_id}\")
async def admin_reject_withdraw(tx_id: str, admin: dict = Depends(get_current_admin)):
    msg = await _reject_withdraw(tx_id)
    return {\"message\": msg}


@api.post(\"/admin/qr/upload\")
async def admin_qr_upload(payload: QrUploadIn, admin: dict = Depends(get_current_admin)):
    cur = payload.currency.upper()
    if cur not in CURRENCIES:
        raise HTTPException(400, \"Invalid currency\")
    img_data = payload.image_base64
    if not img_data.startswith(\"data:\"):
        img_data = \"data:image/png;base64,\" + img_data
    await db.qr_codes.update_one(
        {\"currency\": cur},
        {\"$set\": {\"currency\": cur, \"image_base64\": img_data, \"updated_at\": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {\"ok\": True}


@api.get(\"/admin/qr\")
async def admin_qr_list(admin: dict = Depends(get_current_admin)):
    items = []
    async for q in db.qr_codes.find({}, {\"_id\": 0}):
        items.append(q)
    return {\"qr_codes\": items}


# ===== Telegram polling for callback approval =====
async def telegram_poll_loop():
    if not TELEGRAM_BOT_TOKEN:
        logger.info(\"Telegram polling disabled (no token)\")
        return
    offset = 0
    while True:
        try:
            async with httpx.AsyncClient(timeout=35) as c:
                r = await c.get(
                    f\"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getUpdates\",
                    params={\"timeout\": 30, \"offset\": offset},
                )
                data = r.json()
                for upd in data.get(\"result\", []):
                    offset = max(offset, upd[\"update_id\"] + 1)
                    cq = upd.get(\"callback_query\")
                    if cq:
                        cb_id = cq[\"id\"]
                        cb_data = cq.get(\"data\", \"\")
                        chat_id = str(cq[\"message\"][\"chat\"][\"id\"])
                        message_id = cq[\"message\"][\"message_id\"]
                        original_text = cq[\"message\"].get(\"text\", \"\")
                        # Only allow configured admin chat
                        if TELEGRAM_ADMIN_CHAT_ID and chat_id != str(TELEGRAM_ADMIN_CHAT_ID):
                            await tg_answer_callback(cb_id, \"Unauthorized\")
                            continue
                        action, _, tx_id = cb_data.partition(\":\")
                        msg = \"Bilinməyən əməliyyat\"
                        if action == \"approve_dep\":
                            msg = await _approve_deposit(tx_id)
                        elif action == \"reject_dep\":
                            msg = await _reject_deposit(tx_id)
                        elif action == \"approve_wd\":
                            msg = await _approve_withdraw(tx_id)
                        elif action == \"reject_wd\":
                            msg = await _reject_withdraw(tx_id)
                        await tg_answer_callback(cb_id, msg[:180])
                        await tg_edit_message(chat_id, message_id, original_text + f\"\n\n<b>STATUS:</b> {msg}\")
        except Exception as e:
            logger.error(\"Telegram poll loop error: %s\", e)
            await asyncio.sleep(5)


# ===== Startup =====
async def seed_admin():
    existing = await db.users.find_one({\"email\": ADMIN_EMAIL.lower()})
    if not existing:
        await db.users.insert_one({
            \"id\": str(uuid.uuid4()),
            \"email\": ADMIN_EMAIL.lower(),
            \"username\": \"admin\",
            \"password_hash\": hash_password(ADMIN_PASSWORD),
            \"role\": \"admin\",
            \"banned\": False,
            \"balances\": {c: 0.0 for c in CURRENCIES},
            \"created_at\": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(\"Seeded admin: %s\", ADMIN_EMAIL)
    else:
        # ensure password matches and role is admin
        updates = {}
        if existing.get(\"role\") != \"admin\":
            updates[\"role\"] = \"admin\"
        if not verify_password(ADMIN_PASSWORD, existing[\"password_hash\"]):
            updates[\"password_hash\"] = hash_password(ADMIN_PASSWORD)
        if updates:
            await db.users.update_one({\"id\": existing[\"id\"]}, {\"$set\": updates})


@app.on_event(\"startup\")
async def on_startup():
    await db.users.create_index(\"email\", unique=True)
    await db.users.create_index(\"username\")
    await db.transactions.create_index(\"user_id\")
    await db.transactions.create_index(\"created_at\")
    await db.qr_codes.create_index(\"currency\", unique=True)
    await seed_admin()
    asyncio.create_task(market_loop())
    asyncio.create_task(telegram_poll_loop())
    logger.info(\"BNNC backend started.\")


@app.on_event(\"shutdown\")
async def on_shutdown():
    mongo_client.close()


@api.get(\"/health\")
async def health():
    return {\"ok\": True}


app.include_router(api)
"
Observation: Overwrite successful: /app/backend/server.py
