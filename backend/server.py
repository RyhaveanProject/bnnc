
Action: file_editor create /app/backend/server.py --file-text "from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import asyncio
import uuid
import time
import bcrypt
import jwt
import httpx
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, status
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

# ---------- DB ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ---------- App ----------
app = FastAPI(title=\"Pro Crypto Exchange API\")
api = APIRouter(prefix=\"/api\")

JWT_ALGO = \"HS256\"
JWT_SECRET = os.environ[\"JWT_SECRET\"]

logger = logging.getLogger(\"crypto\")
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# ---------- Models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: Optional[str] = None

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class DepositIn(BaseModel):
    currency: str  # USDT, BTC, ETH, TRX, BNB
    amount: float
    network: Optional[str] = None
    tx_hash: Optional[str] = None

class BalanceAdjustIn(BaseModel):
    amount: float
    note: Optional[str] = \"\"

class AdminCreateIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: Optional[str] = \"Admin\"

# ---------- Helpers ----------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def create_token(user_id: str, email: str, role: str, days: int = 7) -> str:
    payload = {
        \"sub\": user_id,
        \"email\": email,
        \"role\": role,
        \"exp\": datetime.now(timezone.utc) + timedelta(days=days),
        \"iat\": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key=\"access_token\", value=token, httponly=True, secure=False,
        samesite=\"lax\", max_age=7*24*3600, path=\"/\"
    )

def serialize_user(u: dict) -> dict:
    return {
        \"id\": u[\"id\"],
        \"email\": u[\"email\"],
        \"name\": u.get(\"name\", \"\"),
        \"role\": u.get(\"role\", \"user\"),
        \"balance_usd\": u.get(\"balance_usd\", 0.0),
        \"banned\": u.get(\"banned\", False),
        \"created_at\": u.get(\"created_at\"),
    }

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get(\"access_token\")
    if not token:
        auth = request.headers.get(\"Authorization\", \"\")
        if auth.startswith(\"Bearer \"):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail=\"Not authenticated\")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail=\"Token expired\")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail=\"Invalid token\")
    user = await db.users.find_one({\"id\": payload[\"sub\"]}, {\"_id\": 0})
    if not user:
        raise HTTPException(status_code=401, detail=\"User not found\")
    if user.get(\"banned\"):
        raise HTTPException(status_code=403, detail=\"Account banned\")
    return user

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get(\"role\") != \"admin\":
        raise HTTPException(status_code=403, detail=\"Admin access required\")
    return user

# ---------- Telegram ----------
async def send_telegram(text: str):
    token = os.environ.get(\"TELEGRAM_BOT_TOKEN\", \"\").strip()
    chat_id = os.environ.get(\"TELEGRAM_ADMIN_CHAT_ID\", \"\").strip()
    if not token or not chat_id:
        logger.info(\"Telegram not configured, skipping notification\")
        return
    url = f\"https://api.telegram.org/bot{token}/sendMessage\"
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            await c.post(url, json={\"chat_id\": chat_id, \"text\": text, \"parse_mode\": \"HTML\"})
    except Exception as e:
        logger.error(f\"Telegram send failed: {e}\")

# ---------- Market Cache (CoinGecko) ----------
_MARKET_CACHE = {\"data\": None, \"ts\": 0}
COINS = \"bitcoin,ethereum,binancecoin,ripple,solana\"

async def fetch_markets():
    now = time.time()
    if _MARKET_CACHE[\"data\"] and (now - _MARKET_CACHE[\"ts\"]) < 25:
        return _MARKET_CACHE[\"data\"]
    url = \"https://api.coingecko.com/api/v3/coins/markets\"
    params = {
        \"vs_currency\": \"usd\",
        \"ids\": COINS,
        \"order\": \"market_cap_desc\",
        \"sparkline\": \"true\",
        \"price_change_percentage\": \"1h,24h,7d\",
    }
    try:
        async with httpx.AsyncClient(timeout=12) as c:
            r = await c.get(url, params=params)
            r.raise_for_status()
            data = r.json()
        _MARKET_CACHE[\"data\"] = data
        _MARKET_CACHE[\"ts\"] = now
        return data
    except Exception as e:
        logger.error(f\"CoinGecko fetch failed: {e}\")
        if _MARKET_CACHE[\"data\"]:
            return _MARKET_CACHE[\"data\"]
        # Fallback minimal payload
        return [
            {\"id\": \"bitcoin\", \"symbol\": \"btc\", \"name\": \"Bitcoin\", \"current_price\": 0,
             \"price_change_percentage_24h\": 0, \"market_cap\": 0, \"total_volume\": 0,
             \"image\": \"\", \"sparkline_in_7d\": {\"price\": []}}
        ]

# ---------- Routes ----------
@api.get(\"/\")
async def root():
    return {\"service\": \"Pro Crypto Exchange API\", \"status\": \"ok\"}

# AUTH
@api.post(\"/auth/register\")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower().strip()
    existing = await db.users.find_one({\"email\": email})
    if existing:
        raise HTTPException(status_code=400, detail=\"Email already registered\")
    user = {
        \"id\": str(uuid.uuid4()),
        \"email\": email,
        \"name\": body.name or email.split(\"@\")[0],
        \"password_hash\": hash_password(body.password),
        \"role\": \"user\",
        \"balance_usd\": 0.0,
        \"banned\": False,
        \"created_at\": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    token = create_token(user[\"id\"], user[\"email\"], user[\"role\"])
    set_auth_cookie(response, token)
    return {\"user\": serialize_user(user), \"token\": token}

@api.post(\"/auth/login\")
async def login(body: LoginIn, response: Response):
    email = body.email.lower().strip()
    user = await db.users.find_one({\"email\": email}, {\"_id\": 0})
    if not user or not verify_password(body.password, user[\"password_hash\"]):
        raise HTTPException(status_code=401, detail=\"Invalid credentials\")
    if user.get(\"banned\"):
        raise HTTPException(status_code=403, detail=\"Account banned\")
    if user.get(\"role\") == \"admin\":
        raise HTTPException(status_code=403, detail=\"Use admin login\")
    token = create_token(user[\"id\"], user[\"email\"], user[\"role\"])
    set_auth_cookie(response, token)
    return {\"user\": serialize_user(user), \"token\": token}

@api.post(\"/auth/admin-login\")
async def admin_login(body: LoginIn, response: Response):
    email = body.email.lower().strip()
    user = await db.users.find_one({\"email\": email}, {\"_id\": 0})
    if not user or not verify_password(body.password, user[\"password_hash\"]):
        raise HTTPException(status_code=401, detail=\"Invalid credentials\")
    if user.get(\"role\") != \"admin\":
        raise HTTPException(status_code=403, detail=\"Not an admin\")
    token = create_token(user[\"id\"], user[\"email\"], user[\"role\"])
    set_auth_cookie(response, token)
    return {\"user\": serialize_user(user), \"token\": token}

@api.post(\"/auth/logout\")
async def logout(response: Response):
    response.delete_cookie(\"access_token\", path=\"/\")
    return {\"ok\": True}

@api.get(\"/auth/me\")
async def me(user: dict = Depends(get_current_user)):
    return serialize_user(user)

# MARKETS
@api.get(\"/markets\")
async def markets():
    data = await fetch_markets()
    out = []
    for c in data:
        out.append({
            \"id\": c.get(\"id\"),
            \"symbol\": (c.get(\"symbol\") or \"\").upper(),
            \"name\": c.get(\"name\"),
            \"image\": c.get(\"image\"),
            \"price\": c.get(\"current_price\") or 0,
            \"change_1h\": c.get(\"price_change_percentage_1h_in_currency\") or 0,
            \"change_24h\": c.get(\"price_change_percentage_24h\") or 0,
            \"change_7d\": c.get(\"price_change_percentage_7d_in_currency\") or 0,
            \"market_cap\": c.get(\"market_cap\") or 0,
            \"volume_24h\": c.get(\"total_volume\") or 0,
            \"sparkline\": (c.get(\"sparkline_in_7d\") or {}).get(\"price\", [])[-48:],
        })
    # Order by predefined sequence
    order = [\"bitcoin\", \"ethereum\", \"binancecoin\", \"ripple\", \"solana\"]
    out.sort(key=lambda x: order.index(x[\"id\"]) if x[\"id\"] in order else 99)
    return {\"markets\": out, \"updated_at\": datetime.now(timezone.utc).isoformat()}

# DEPOSITS
WALLETS = {
    \"USDT\": {\"address\": os.environ.get(\"USDT_WALLET\", \"\"), \"network\": \"TRC20\"},
    \"BTC\":  {\"address\": os.environ.get(\"BTC_WALLET\", \"\"),  \"network\": \"Bitcoin\"},
    \"ETH\":  {\"address\": os.environ.get(\"ETH_WALLET\", \"\"),  \"network\": \"ERC20\"},
    \"TRX\":  {\"address\": os.environ.get(\"TRX_WALLET\", \"\"),  \"network\": \"TRC20\"},
    \"BNB\":  {\"address\": os.environ.get(\"BNB_WALLET\", \"\"),  \"network\": \"BEP20\"},
}

@api.get(\"/deposit/wallet/{currency}\")
async def deposit_wallet(currency: str, user: dict = Depends(get_current_user)):
    cur = currency.upper()
    if cur not in WALLETS:
        raise HTTPException(404, \"Unsupported currency\")
    return {\"currency\": cur, **WALLETS[cur]}

@api.post(\"/deposit\")
async def create_deposit(body: DepositIn, user: dict = Depends(get_current_user)):
    cur = body.currency.upper()
    if cur not in WALLETS:
        raise HTTPException(400, \"Unsupported currency\")
    if body.amount <= 0:
        raise HTTPException(400, \"Invalid amount\")
    dep = {
        \"id\": str(uuid.uuid4()),
        \"user_id\": user[\"id\"],
        \"user_email\": user[\"email\"],
        \"currency\": cur,
        \"amount\": body.amount,
        \"network\": body.network or WALLETS[cur][\"network\"],
        \"tx_hash\": body.tx_hash or \"\",
        \"wallet\": WALLETS[cur][\"address\"],
        \"status\": \"pending\",
        \"created_at\": datetime.now(timezone.utc).isoformat(),
    }
    await db.deposits.insert_one(dep)
    # Telegram notify
    msg = (
        f\"<b>New Deposit Request</b>\n\"
        f\"User: {user['email']} ({user['id']})\n\"
        f\"Amount: {body.amount} {cur}\n\"
        f\"Network: {dep['network']}\n\"
        f\"Tx: {dep['tx_hash'] or '—'}\n\"
        f\"Time: {dep['created_at']}\"
    )
    asyncio.create_task(send_telegram(msg))
    return {k: v for k, v in dep.items() if k != \"_id\"}

@api.get(\"/deposit/history\")
async def deposit_history(user: dict = Depends(get_current_user)):
    items = await db.deposits.find({\"user_id\": user[\"id\"]}, {\"_id\": 0}).sort(\"created_at\", -1).to_list(200)
    return {\"items\": items}

# CONFIG
@api.get(\"/config/live-chat\")
async def live_chat():
    return {\"url\": os.environ.get(\"LIVE_CHAT_URL\", \"\")}

# SESSION TRACKING - live user count
@api.post(\"/session/ping\")
async def session_ping(user: dict = Depends(get_current_user)):
    await db.sessions.update_one(
        {\"user_id\": user[\"id\"]},
        {\"$set\": {\"user_id\": user[\"id\"], \"email\": user[\"email\"], \"last_seen\": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    return {\"ok\": True}

# ADMIN
@api.get(\"/admin/stats\")
async def admin_stats(admin: dict = Depends(require_admin)):
    total_users = await db.users.count_documents({\"role\": \"user\"})
    banned_users = await db.users.count_documents({\"role\": \"user\", \"banned\": True})
    total_deposits = await db.deposits.count_documents({})
    pending_deposits = await db.deposits.count_documents({\"status\": \"pending\"})
    # Live users: seen in last 2 minutes
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat()
    live_users = await db.sessions.count_documents({\"last_seen\": {\"$gte\": cutoff}})
    # Sum deposit volume (approved + pending)
    pipeline = [{\"$group\": {\"_id\": \"$currency\", \"total\": {\"$sum\": \"$amount\"}}}]
    by_currency = [{\"currency\": d[\"_id\"], \"total\": d[\"total\"]} async for d in db.deposits.aggregate(pipeline)]
    return {
        \"total_users\": total_users,
        \"banned_users\": banned_users,
        \"live_users\": live_users,
        \"total_deposits\": total_deposits,
        \"pending_deposits\": pending_deposits,
        \"volume_by_currency\": by_currency,
    }

@api.get(\"/admin/users\")
async def admin_users(admin: dict = Depends(require_admin)):
    users = await db.users.find({}, {\"_id\": 0, \"password_hash\": 0}).sort(\"created_at\", -1).to_list(1000)
    return {\"users\": users}

@api.post(\"/admin/users/{user_id}/ban\")
async def admin_ban(user_id: str, admin: dict = Depends(require_admin)):
    res = await db.users.update_one({\"id\": user_id}, {\"$set\": {\"banned\": True}})
    if res.matched_count == 0:
        raise HTTPException(404, \"User not found\")
    return {\"ok\": True}

@api.post(\"/admin/users/{user_id}/unban\")
async def admin_unban(user_id: str, admin: dict = Depends(require_admin)):
    res = await db.users.update_one({\"id\": user_id}, {\"$set\": {\"banned\": False}})
    if res.matched_count == 0:
        raise HTTPException(404, \"User not found\")
    return {\"ok\": True}

@api.post(\"/admin/users/{user_id}/balance\")
async def admin_balance(user_id: str, body: BalanceAdjustIn, admin: dict = Depends(require_admin)):
    u = await db.users.find_one({\"id\": user_id})
    if not u:
        raise HTTPException(404, \"User not found\")
    new_balance = float(u.get(\"balance_usd\", 0)) + float(body.amount)
    await db.users.update_one({\"id\": user_id}, {\"$set\": {\"balance_usd\": new_balance}})
    await db.logs.insert_one({
        \"id\": str(uuid.uuid4()),
        \"type\": \"balance_adjust\",
        \"by\": admin[\"email\"],
        \"user_id\": user_id,
        \"delta\": body.amount,
        \"note\": body.note,
        \"at\": datetime.now(timezone.utc).isoformat(),
    })
    return {\"ok\": True, \"balance_usd\": new_balance}

@api.get(\"/admin/deposits\")
async def admin_deposits(admin: dict = Depends(require_admin)):
    items = await db.deposits.find({}, {\"_id\": 0}).sort(\"created_at\", -1).to_list(500)
    return {\"items\": items}

@api.post(\"/admin/deposits/{deposit_id}/approve\")
async def admin_approve_deposit(deposit_id: str, admin: dict = Depends(require_admin)):
    dep = await db.deposits.find_one({\"id\": deposit_id})
    if not dep:
        raise HTTPException(404, \"Not found\")
    if dep[\"status\"] != \"pending\":
        raise HTTPException(400, \"Already processed\")
    # For USDT credit dollar amount; for others use coingecko price
    credit = float(dep[\"amount\"])
    if dep[\"currency\"] != \"USDT\":
        data = await fetch_markets()
        cur_id_map = {\"BTC\": \"bitcoin\", \"ETH\": \"ethereum\", \"BNB\": \"binancecoin\", \"TRX\": \"tron\", \"XRP\": \"ripple\", \"SOL\": \"solana\"}
        cid = cur_id_map.get(dep[\"currency\"])
        price = next((c.get(\"current_price\", 0) for c in data if c.get(\"id\") == cid), 0)
        credit = float(dep[\"amount\"]) * float(price or 0)
    await db.deposits.update_one({\"id\": deposit_id}, {\"$set\": {\"status\": \"approved\", \"approved_at\": datetime.now(timezone.utc).isoformat(), \"credited_usd\": credit}})
    await db.users.update_one({\"id\": dep[\"user_id\"]}, {\"$inc\": {\"balance_usd\": credit}})
    return {\"ok\": True, \"credited_usd\": credit}

@api.post(\"/admin/deposits/{deposit_id}/reject\")
async def admin_reject_deposit(deposit_id: str, admin: dict = Depends(require_admin)):
    res = await db.deposits.update_one({\"id\": deposit_id, \"status\": \"pending\"}, {\"$set\": {\"status\": \"rejected\"}})
    if res.matched_count == 0:
        raise HTTPException(404, \"Not found or already processed\")
    return {\"ok\": True}

@api.post(\"/admin/create\")
async def admin_create(body: AdminCreateIn, admin: dict = Depends(require_admin)):
    email = body.email.lower().strip()
    existing = await db.users.find_one({\"email\": email})
    if existing:
        raise HTTPException(400, \"Email exists\")
    u = {
        \"id\": str(uuid.uuid4()),
        \"email\": email,
        \"name\": body.name or \"Admin\",
        \"password_hash\": hash_password(body.password),
        \"role\": \"admin\",
        \"balance_usd\": 0.0,
        \"banned\": False,
        \"created_at\": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(u)
    return serialize_user(u)

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=[\"*\"],
    allow_headers=[\"*\"],
)

# ---------- Startup ----------
@app.on_event(\"startup\")
async def startup():
    await db.users.create_index(\"email\", unique=True)
    await db.deposits.create_index(\"user_id\")
    await db.sessions.create_index(\"user_id\", unique=True)
    # Seed admin
    admin_email = os.environ.get(\"ADMIN_EMAIL\", \"admin@procrypto.io\").lower()
    admin_pw = os.environ.get(\"ADMIN_PASSWORD\", \"Admin@12345\")
    existing = await db.users.find_one({\"email\": admin_email})
    if not existing:
        await db.users.insert_one({
            \"id\": str(uuid.uuid4()),
            \"email\": admin_email,
            \"name\": \"Administrator\",
            \"password_hash\": hash_password(admin_pw),
            \"role\": \"admin\",
            \"balance_usd\": 0.0,
            \"banned\": False,
            \"created_at\": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f\"Seeded admin: {admin_email}\")
    elif not verify_password(admin_pw, existing[\"password_hash\"]):
        await db.users.update_one({\"email\": admin_email}, {\"$set\": {\"password_hash\": hash_password(admin_pw), \"role\": \"admin\"}})
        logger.info(\"Admin password updated from env\")

@app.on_event(\"shutdown\")
async def shutdown():
    client.close()
"
Observation: Overwrite successful: /app/backend/server.py
