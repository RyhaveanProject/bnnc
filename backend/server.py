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
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Literal

import bcrypt
import jwt
import httpx
import resend
import yfinance as yf
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Form
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
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
TRADING_PAIRS = ["NASDAQ", "ABD_INDEX", "PETROL", "ALTIN", "SP500", "US30", "XAUUSD", "BTCUSD"]
COIN_NAMES = {
    "NASDAQ": "NASDAQ Composite",
    "ABD_INDEX": "US Index",
    "PETROL": "Crude Oil",
    "ALTIN": "Gold",
    "SP500": "S&P 500",
    "US30": "Dow Jones Industrial",
    "XAUUSD": "Gold (XAU/USD)",
    "BTCUSD": "Bitcoin (BTC/USD)",
}
# Yahoo Finance ticker mapping
YFINANCE_SYMBOLS = {
    "NASDAQ": "^IXIC",
    "ABD_INDEX": "^GSPC",
    "PETROL": "CL=F",
    "ALTIN": "GC=F",
    "SP500": "^GSPC",
    "US30": "^DJI",
    "XAUUSD": "GC=F",
    "BTCUSD": "BTC-USD",
}
# Static fallback prices (used only when ALL external APIs fail and no cache exists)
STATIC_FALLBACK = {
    "NASDAQ": 19500.0, "ABD_INDEX": 5900.0, "PETROL": 72.0,
    "ALTIN": 2650.0, "SP500": 5900.0, "US30": 43000.0,
    "XAUUSD": 2650.0, "BTCUSD": 95000.0,
}
KUCOIN_BASE = "https://api.kucoin.com"

# Deposit receipt upload window (in minutes). If receipt isn't uploaded within
# this window, the deposit is auto-rejected on next lazy-check.
DEPOSIT_RECEIPT_TIMEOUT_MIN = 5
# Max receipt file size (8 MB)
MAX_RECEIPT_SIZE = 8 * 1024 * 1024
ALLOWED_RECEIPT_MIME = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}

# --- Email verification (signup OTP via Resend) ---
OTP_CODE_LENGTH = 6
OTP_TTL_MIN = 10            # code is valid for 10 minutes
OTP_RESEND_COOLDOWN_SEC = 60  # min seconds between resend requests
OTP_MAX_ATTEMPTS = 5        # max wrong attempts before code is invalidated


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


class RegisterVerifyIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class RegisterResendIn(BaseModel):
    email: EmailStr


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
app = FastAPI(title="ADX DUBAI")
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
    # SameSite=None + Secure is required for cross-domain cookie (Cloudflare front â Render back)
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
    # Pending signups (email verification). Auto-expire docs via TTL on `expires_at`.
    await db.pending_signups.create_index("email", unique=True)
    try:
        await db.pending_signups.create_index("expires_at", expireAfterSeconds=0)
    except Exception as _e:
        # In Mongo, changing TTL options requires drop & recreate. Best-effort.
        logger.warning("pending_signups TTL index setup: %s", _e)
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
    # Background sweeper that auto-settles expired binary trades even if the
    # user closed their browser. Guarantees the offline-aware auto-credit
    # behaviour requested in the spec.
    asyncio.create_task(_binary_trade_sweeper())


@app.on_event("shutdown")
async def shutdown():
    client.close()


# ============ AUTH ============

# ---- Resend email helpers ----
def _resend_configured() -> bool:
    return bool(os.environ.get("RESEND_API_KEY", "").strip())


def _resend_from() -> str:
    addr = os.environ.get("RESEND_FROM_EMAIL", "onboarding@resend.dev").strip() or "onboarding@resend.dev"
    name = os.environ.get("RESEND_FROM_NAME", "").strip()
    if name:
        return f"{name} <{addr}>"
    return addr


def _otp_email_html(username: str, code: str) -> str:
    # Inline CSS only; safe for email clients. English-only copy.
    return f"""
<!doctype html>
<html><body style="margin:0;padding:0;background:#0b0e11;font-family:Arial,Helvetica,sans-serif;color:#eaecef;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0e11;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#161a1e;border:1px solid #2b3139;border-radius:12px;overflow:hidden;">
      <tr><td style="padding:28px 28px 8px;text-align:center;">
        <div style="font-size:22px;font-weight:800;letter-spacing:1px;">
          <span style="color:#f0b90b;">ADX</span>
          <span style="color:#ffffff;font-weight:600;margin-left:4px;">DUBAI</span>
        </div>
      </td></tr>
      <tr><td style="padding:8px 28px 0;text-align:center;">
        <h1 style="margin:18px 0 6px;font-size:20px;color:#ffffff;">Email verification code</h1>
        <p style="margin:0;color:#b7bdc6;font-size:14px;">Hi <strong style="color:#eaecef;">{username}</strong>, please use the code below to finish creating your ADX DUBAI account.</p>
      </td></tr>
      <tr><td style="padding:22px 28px 6px;text-align:center;">
        <div style="display:inline-block;padding:14px 22px;background:#0b0e11;border:1px solid #2b3139;border-radius:10px;
                    font-size:32px;letter-spacing:10px;font-weight:800;color:#f0b90b;">{code}</div>
      </td></tr>
      <tr><td style="padding:8px 28px 22px;text-align:center;">
        <p style="margin:14px 0 0;color:#848e9c;font-size:12px;line-height:1.55;">
          This code is valid for <strong style="color:#eaecef;">{OTP_TTL_MIN} minutes</strong>.<br>
          If you didn't request this, you can safely ignore this email.<br>
          <span style="color:#5e6673;">Tip: if you don't see this message in your inbox, please check your spam / junk folder.</span>
        </p>
      </td></tr>
      <tr><td style="background:#0b0e11;padding:16px 28px;text-align:center;border-top:1px solid #2b3139;">
        <span style="color:#5e6673;font-size:11px;">Â© ADX DUBAI &middot; adx-dubai.com</span>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>
"""


async def _send_verification_email(to_email: str, username: str, code: str) -> None:
    """Send OTP via Resend HTTP API.

    Uses httpx directly (instead of the blocking `resend` SDK) so we can apply
    a strict timeout and run fully on the event loop. Raises HTTPException on
    hard failure so callers can decide whether to surface the error.
    """
    if not _resend_configured():
        logger.error("RESEND_API_KEY not configured; cannot send verification email")
        raise HTTPException(status_code=500, detail="Email service not configured")
    api_key = os.environ["RESEND_API_KEY"].strip()
    payload = {
        "from": _resend_from(),
        "to": [to_email],
        "subject": f"ADX DUBAI â Verification code: {code}",
        "html": _otp_email_html(username, code),
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as cli:
            r = await cli.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        if r.status_code >= 400:
            body = r.text
            logger.error("Resend send failed for %s: %s %s", to_email, r.status_code, body)
            low = body.lower()
            if "domain is not verified" in low or "not verified" in low:
                raise HTTPException(status_code=500, detail="Email sender domain not verified yet. Please try again later.")
            raise HTTPException(status_code=500, detail="Failed to send verification email")
        try:
            data = r.json()
        except Exception:
            data = {}
        logger.info("Resend email sent to %s id=%s", to_email, data.get("id"))
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Resend send error for %s: %s", to_email, e)
        raise HTTPException(status_code=500, detail="Failed to send verification email")


async def _send_verification_email_bg(to_email: str, username: str, code: str) -> None:
    """Background variant: never raises. Logs failures so 'Resend' button can recover."""
    try:
        await _send_verification_email(to_email, username, code)
    except Exception as e:
        logger.error("Background verification email failed for %s: %s", to_email, e)


def _generate_otp() -> str:
    # 6-digit numeric, zero-padded, cryptographically random
    return f"{secrets.randbelow(10**OTP_CODE_LENGTH):0{OTP_CODE_LENGTH}d}"


@api.post("/auth/register/start")
async def register_start(data: RegisterIn):
    """Step 1 of signup: validate, hash password, generate OTP, store pending
    record, email the code via Resend. The actual user document is NOT created
    until /auth/register/verify succeeds.
    """
    email = data.email.lower()
    pwd = data.password
    if len(pwd) < 8 or not any(c.isdigit() for c in pwd) or not any(c.isalpha() for c in pwd):
        raise HTTPException(status_code=400, detail="Password must be 8+ chars and contain letters and numbers")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")

    # Cooldown: if a recent pending request exists, throttle to avoid email spam
    existing = await db.pending_signups.find_one({"email": email}, {"_id": 0})
    if existing:
        last = parse_iso(existing.get("last_sent_at", existing.get("created_at", now_iso())))
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        remaining = OTP_RESEND_COOLDOWN_SEC - int((datetime.now(timezone.utc) - last).total_seconds())
        if remaining > 0:
            raise HTTPException(status_code=429, detail=f"Please wait {remaining}s before requesting another code")

    code = _generate_otp()
    now = datetime.now(timezone.utc)
    doc = {
        "email": email,
        "username": data.username,
        "password_hash": hash_password(pwd),
        "code_hash": hash_password(code),
        "attempts": 0,
        "created_at": now.isoformat(),
        "last_sent_at": now.isoformat(),
        # `expires_at` is a real datetime so the TTL index can purge it
        "expires_at": now + timedelta(minutes=OTP_TTL_MIN),
    }
    await db.pending_signups.update_one({"email": email}, {"$set": doc}, upsert=True)
    # Fire-and-forget the email so the API responds immediately and the
    # frontend can show the 6-digit code input form. On slow infra (cold start
    # + Resend roundtrip) the previous blocking await could exceed the
    # frontend axios timeout of 30s, leaving the UI stuck on "Loadingâ¦".
    asyncio.create_task(_send_verification_email_bg(email, data.username, code))
    return {"ok": True, "email": email, "ttl_minutes": OTP_TTL_MIN, "resend_cooldown_sec": OTP_RESEND_COOLDOWN_SEC}


@api.post("/auth/register/resend")
async def register_resend(data: RegisterResendIn):
    email = data.email.lower()
    pending = await db.pending_signups.find_one({"email": email}, {"_id": 0})
    if not pending:
        raise HTTPException(status_code=404, detail="No pending registration for this email")

    last = parse_iso(pending.get("last_sent_at", pending.get("created_at", now_iso())))
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    remaining = OTP_RESEND_COOLDOWN_SEC - int((datetime.now(timezone.utc) - last).total_seconds())
    if remaining > 0:
        raise HTTPException(status_code=429, detail=f"Please wait {remaining}s before requesting another code")

    code = _generate_otp()
    now = datetime.now(timezone.utc)
    await db.pending_signups.update_one(
        {"email": email},
        {"$set": {
            "code_hash": hash_password(code),
            "attempts": 0,
            "last_sent_at": now.isoformat(),
            "expires_at": now + timedelta(minutes=OTP_TTL_MIN),
        }},
    )
    # Fire-and-forget so the UI doesn't get stuck on "Loadingâ¦" while the
    # email is being delivered through Resend.
    asyncio.create_task(_send_verification_email_bg(email, pending.get("username", ""), code))
    return {"ok": True, "ttl_minutes": OTP_TTL_MIN, "resend_cooldown_sec": OTP_RESEND_COOLDOWN_SEC}


@api.post("/auth/register/verify")
async def register_verify(data: RegisterVerifyIn, response: Response):
    """Step 2 of signup: validate OTP, create the real user, return JWT."""
    email = data.email.lower()
    pending = await db.pending_signups.find_one({"email": email}, {"_id": 0})
    if not pending:
        raise HTTPException(status_code=404, detail="No pending registration. Please start over.")

    # Expiry check (defensive; TTL index already purges)
    exp = pending.get("expires_at")
    if isinstance(exp, str):
        exp_dt = parse_iso(exp)
    elif isinstance(exp, datetime):
        exp_dt = exp
    else:
        exp_dt = datetime.now(timezone.utc) - timedelta(seconds=1)
    if exp_dt.tzinfo is None:
        exp_dt = exp_dt.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > exp_dt:
        await db.pending_signups.delete_one({"email": email})
        raise HTTPException(status_code=400, detail="Code expired. Please request a new one.")

    if int(pending.get("attempts", 0)) >= OTP_MAX_ATTEMPTS:
        await db.pending_signups.delete_one({"email": email})
        raise HTTPException(status_code=400, detail="Too many wrong attempts. Please request a new code.")

    code = (data.code or "").strip()
    if not code.isdigit() or len(code) != OTP_CODE_LENGTH or not verify_password(code, pending["code_hash"]):
        await db.pending_signups.update_one({"email": email}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Invalid verification code")

    # Race condition guard: ensure email still free
    if await db.users.find_one({"email": email}):
        await db.pending_signups.delete_one({"email": email})
        raise HTTPException(status_code=400, detail="Email already registered")

    uid = str(uuid.uuid4())
    user_doc = {
        "id": uid,
        "email": email,
        "username": pending["username"],
        "password_hash": pending["password_hash"],
        "role": "user",
        "balances": empty_balances(),
        "banned": False,
        "email_verified": True,
        "created_at": now_iso(),
    }
    await db.users.insert_one(user_doc)
    await db.pending_signups.delete_one({"email": email})

    token = create_access_token(uid, email, "user")
    set_auth_cookie(response, token)
    return {
        "token": token,
        "user": {
            "id": uid, "email": email, "username": pending["username"],
            "role": "user", "balances": user_doc["balances"],
        },
    }


@api.post("/auth/register")
async def register(data: RegisterIn):
    """Legacy endpoint kept for backwards compatibility.

    The signup flow now requires email verification. Clients should call
    `/auth/register/start` followed by `/auth/register/verify`. We forward
    here so older clients don't break (still triggers email + returns the
    'pending' shape).
    """
    return await register_start(data)


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
    # Lazy-settle any of this user's expired binary trades so the freshly
    # loaded balance reflects offline auto-credits.
    try:
        await _auto_complete_expired_for_user(user["id"])
    except Exception:
        pass
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return fresh or user


# ============ TOTAL BALANCE (USDT equivalent) ============
_BALANCE_CACHE = {"user_id": None, "total": 0.0, "ts": 0.0}
_BALANCE_TTL = 10.0


@api.get("/balance/total")
async def get_total_balance(user: dict = Depends(get_current_user)):
    """Return total balance in USDT equivalent, updated every 10 seconds."""
    now = time.time()
    if (_BALANCE_CACHE["user_id"] == user["id"] and 
        _BALANCE_CACHE["total"] > 0 and 
        now - _BALANCE_CACHE["ts"] < _BALANCE_TTL):
        return {"total_usdt": _BALANCE_CACHE["total"]}
    
    # Get user's current balances
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "balances": 1})
    if not u:
        return {"total_usdt": 0.0}
    
    balances = u.get("balances", {})
    total_usdt = 0.0
    
    # Convert each currency to USDT
    for currency, amount in balances.items():
        if amount <= 0:
            continue
        if currency == "USDT":
            total_usdt += float(amount)
        else:
            try:
                price = await _live_price(currency)
                total_usdt += float(amount) * price
            except Exception as e:
                logger.warning(f"Failed to get price for {currency}: {e}")
                continue
    
    # Update cache
    _BALANCE_CACHE["user_id"] = user["id"]
    _BALANCE_CACHE["total"] = total_usdt
    _BALANCE_CACHE["ts"] = now
    
    return {"total_usdt": round(total_usdt, 2)}


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
    """Fetch market data using yfinance (Yahoo Finance API)"""
    loop = asyncio.get_event_loop()
    out = []
    
    for coin in TRADING_PAIRS:
        yf_symbol = YFINANCE_SYMBOLS.get(coin, coin)
        try:
            # Fetch ticker data in thread executor (yfinance is sync)
            ticker = await loop.run_in_executor(None, yf.Ticker, yf_symbol)
            
            # Get fast_info for quick price data
            def get_info():
                try:
                    return ticker.fast_info
                except:
                    return {}
            
            info = await loop.run_in_executor(None, get_info)
            
            # Get price
            price = info.get("lastPrice", 0) or info.get("regularMarketPrice", 0)
            if not price:
                price = STATIC_FALLBACK.get(coin, 0.0)
            
            # Get historical data for sparkline and change%
            def get_history():
                try:
                    return ticker.history(period="1d", interval="15m")
                except:
                    return None
            
            hist = await loop.run_in_executor(None, get_history)
            
            sparkline = []
            change24h = 0.0
            
            if hist is not None and not hist.empty and 'Close' in hist.columns:
                sparkline = hist['Close'].tail(30).tolist()
                if len(sparkline) >= 2:
                    change24h = ((sparkline[-1] - sparkline[0]) / sparkline[0]) * 100
            
            # Fallback sparkline
            if not sparkline:
                sparkline = [float(price)] * 4
            
            out.append({
                "symbol": coin,
                "name": COIN_NAMES.get(coin, coin),
                "price": float(price) if price else 0.0,
                "change24h": float(change24h),
                "marketCap": 0,
                "volume24h": 0,
                "sparkline": sparkline,
                "image": None,
            })
        except Exception as e:
            logger.warning(f"yfinance fetch failed for {coin}: {e}")
            # Fallback data
            fallback_price = STATIC_FALLBACK.get(coin, 0.0)
            out.append({
                "symbol": coin,
                "name": COIN_NAMES.get(coin, coin),
                "price": fallback_price,
                "change24h": 0.0,
                "marketCap": 0,
                "volume24h": 0,
                "sparkline": [fallback_price] * 4,
                "image": None,
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
    """Auto-register Telegram webhook on startup.

    IMPORTANT: must use the BACKEND public URL (where this FastAPI app is reachable),
    NEVER the frontend URL. On platforms like Render the public URL is exposed via
    the RENDER_EXTERNAL_URL env var; we also support a manual BACKEND_URL.
    FRONTEND_URL is intentionally NOT used as a fallback because the frontend
    (e.g. Cloudflare Worker static site) does not host the /api/telegram/webhook
    endpoint and returns 404, which leaves the Telegram inline button stuck on
    "Loading..." forever.
    """
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        return
    base = (
        os.environ.get("BACKEND_URL", "").strip()
        or os.environ.get("RENDER_EXTERNAL_URL", "").strip()
    )
    if not base:
        logger.warning(
            "Telegram webhook NOT registered: set BACKEND_URL (or RENDER_EXTERNAL_URL) "
            "to the public API origin, e.g. https://your-app.onrender.com"
        )
        return
    base = base.rstrip("/")
    webhook_url = f"{base}/api/telegram/webhook"
    secret = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "").strip()
    try:
        async with httpx.AsyncClient(timeout=15) as cli:
            payload = {
                "url": webhook_url,
                "allowed_updates": ["callback_query", "message"],
                "drop_pending_updates": False,
            }
            if secret:
                payload["secret_token"] = secret
            r = await cli.post(
                f"https://api.telegram.org/bot{token}/setWebhook",
                json=payload,
            )
            try:
                body = r.json()
            except Exception:
                body = {"status": r.status_code}
            logger.info("Telegram setWebhook %s -> %s", webhook_url, body)
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
        f"ð° *New Deposit Request*\n"
        f"ð¤ User: `{user['username']}`\n"
        f"ð§ Email: `{user['email']}`\n"
        f"ð Token: *{deposit['currency']}*\n"
        f"ðµ Amount: *{deposit['amount']} {deposit['currency']}*\n"
        f"ð² USD value: *â ${usd_value:,.2f}*\n"
        f"ð¦ Wallet: `{deposit.get('wallet_address','-')}`\n"
        f"ð Network: {deposit.get('network','-')}\n"
        f"ð Date: {deposit['created_at']}\n"
        f"ð Deposit: `{deposit['id']}`"
    )
    kb = {"inline_keyboard": [[
        {"text": "â Confirm", "callback_data": f"adep:{deposit['id']}"},
        {"text": "â Cancel", "callback_data": f"rdep:{deposit['id']}"},
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
        f"ð§ *Withdraw Request*\n"
        f"ð¤ User: `{user['username']}`\n"
        f"ð§ Email: `{user['email']}`\n"
        f"ð Token: *{w['currency']}*\n"
        f"ðµ Amount: *{w['amount']} {w['currency']}*\n"
        f"ð¸ Fee: {w.get('fee',0)} {w['currency']}\n"
        f"ð° Net: {w.get('net',0)} {w['currency']}\n"
        f"ð¦ Address: `{w['address']}`\n"
        f"ð Network: {w.get('network','-')}\n"
        f"ð Date: {w['created_at']}\n"
        f"ð Withdraw: `{w['id']}`"
    )
    kb = {"inline_keyboard": [[
        {"text": "â Mark Paid", "callback_data": f"awd:{w['id']}"},
        {"text": "â Reject", "callback_data": f"rwd:{w['id']}"},
    ]]}
    await tg_send("sendMessage", {"chat_id": chat_id, "text": text, "parse_mode": "Markdown", "reply_markup": kb})


@api.post("/telegram/webhook")
async def telegram_webhook(request: Request):
    # Verify Telegram secret token header if configured (defense in depth)
    expected_secret = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "").strip()
    if expected_secret:
        got = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
        if got != expected_secret:
            raise HTTPException(status_code=403, detail="Forbidden")
    try:
        body = await request.json()
    except Exception:
        return {"ok": True}
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

    # Safety wrapper: no matter what happens below, Telegram MUST get an
    # answerCallbackQuery, otherwise the inline button shows "Loading..." forever.
    try:
        await _handle_callback(cb_id, data, msg_chat_id, msg_id)
    except Exception as e:
        logger.exception("Telegram callback handler crashed: %s", e)
        try:
            await tg_send("answerCallbackQuery", {
                "callback_query_id": cb_id,
                "text": "Server error, please try again",
                "show_alert": False,
            })
        except Exception:
            pass
    return {"ok": True}


async def _handle_callback(cb_id: str, data: str, msg_chat_id: str, msg_id):
    op, _, target_id = data.partition(":")
    if op == "noop":
        await tg_send("answerCallbackQuery", {"callback_query_id": cb_id})
        return
    if op == "adep":
        dep = await db.deposits.find_one({"id": target_id}, {"_id": 0})
        if not dep:
            await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Deposit not found"})
            return
        if dep["status"] in ("approved", "completed"):
            await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Already confirmed"})
            return
        if dep["status"] == "rejected":
            await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Already rejected"})
            return
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
            return
        await db.users.update_one(
            {"id": dep["user_id"]},
            {"$inc": {"balances.USDT": float(usd_value)}},
        )
        await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": f"Confirmed: +${usd_value:,.2f} USDT â"})
        if msg_id:
            await tg_send("editMessageReplyMarkup", {
                "chat_id": msg_chat_id, "message_id": msg_id,
                "reply_markup": {"inline_keyboard": [[{"text": f"â CONFIRMED  +${usd_value:,.2f}", "callback_data": "noop"}]]},
            })
    elif op == "rdep":
        flip = await db.deposits.update_one(
            {"id": target_id, "status": {"$in": ["pending", "awaiting_review"]}},
            {"$set": {"status": "rejected", "approved_at": now_iso(), "rejected_reason": "admin_cancelled"}},
        )
        if flip.modified_count == 0:
            await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Already processed"})
            return
        await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Deposit cancelled â"})
        if msg_id:
            await tg_send("editMessageReplyMarkup", {
                "chat_id": msg_chat_id, "message_id": msg_id,
                "reply_markup": {"inline_keyboard": [[{"text": "â CANCELLED", "callback_data": "noop"}]]},
            })
    elif op == "awd":
        w = await db.withdrawals.find_one({"id": target_id}, {"_id": 0})
        if not w:
            await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Not found"})
            return
        await db.withdrawals.update_one({"id": target_id}, {"$set": {"status": "paid", "paid_at": now_iso()}})
        await tg_send("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Withdraw marked paid"})
        if msg_id:
            await tg_send("editMessageReplyMarkup", {
                "chat_id": msg_chat_id, "message_id": msg_id,
                "reply_markup": {"inline_keyboard": [[{"text": "â PAID", "callback_data": "noop"}]]},
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
                "reply_markup": {"inline_keyboard": [[{"text": "â REJECTED", "callback_data": "noop"}]]},
            })
    else:
        # Unknown callback data â still answer so the loader disappears.
        await tg_send("answerCallbackQuery", {"callback_query_id": cb_id})


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


@api.get("/admin/online-trading")
async def admin_online_trading(admin: dict = Depends(require_admin)):
    """Get list of users currently in active binary trades."""
    active_trades = await db.binary_trades.find({"status": "active"}, {"_id": 0}).to_list(500)
    result = []
    for trade in active_trades:
        user = await db.users.find_one({"id": trade["user_id"]}, {"_id": 0, "password_hash": 0})
        if user:
            result.append({
                "trade_id": trade["id"],
                "user_id": user["id"],
                "username": user["username"],
                "email": user["email"],
                "symbol": trade["symbol"],
                "direction": trade["direction"],
                "amount_usd": trade["amount_usd"],
                "entry_price": trade["entry_price"],
                "expires_at": trade["expires_at"],
                "force_win": trade.get("force_win", False),
                "force_lose": trade.get("force_lose", False),
            })
    return result


@api.post("/admin/users/{user_id}/force-win")
async def admin_force_win(user_id: str, admin: dict = Depends(require_admin)):
    """Admin opens profit - user will win 100% when trade expires."""
    # Find active trades for this user
    result = await db.binary_trades.update_many(
        {"user_id": user_id, "status": "active"},
        {"$set": {"force_win": True, "force_lose": False}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="No active trades found for this user")
    return {"ok": True, "modified": result.modified_count, "message": "Profit opened - user will win when trade expires"}


@api.post("/admin/users/{user_id}/force-lose")
async def admin_force_lose(user_id: str, admin: dict = Depends(require_admin)):
    """Admin closes profit - user will lose 100% when trade expires."""
    # Find active trades for this user
    result = await db.binary_trades.update_many(
        {"user_id": user_id, "status": "active"},
        {"$set": {"force_win": False, "force_lose": True}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="No active trades found for this user")
    return {"ok": True, "modified": result.modified_count, "message": "Profit closed - user will lose when trade expires"}


# ---
@api.get("/")
async def root():
    return {"name": "ADX DUBAI API", "status": "ok"}


@api.get("/download/backend_fix.zip")
async def download_backend_fix():
    """Download the fixed backend server.py file."""
    file_path = ROOT_DIR / "static" / "backend_fix.zip"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        path=str(file_path),
        filename="backend_fix.zip",
        media_type="application/zip",
    )




# ============ BINARY TRADING ============
BINARY_TRADE_PROFIT_RATES = {60: 0.02, 120: 0.04, 180: 0.06, 240: 0.08}
# No fixed allowed amount list â users may enter any positive USDT amount up to
# their balance. Keep a soft upper bound to avoid absurd values.
BINARY_TRADE_MIN_AMOUNT = 1.0
BINARY_TRADE_MAX_AMOUNT = 1_000_000.0


class BinaryTradePlaceIn(BaseModel):
    symbol: str
    amount_usd: float = Field(gt=0)
    duration: int  # 300 / 600 / 900 / 1200 seconds
    direction: Literal["rise", "fall"]


@api.post("/binary-trade/place")
async def binary_trade_place(data: BinaryTradePlaceIn, user: dict = Depends(get_current_user)):
    sym = data.symbol.upper()
    if sym not in TRADING_PAIRS:
        raise HTTPException(status_code=400, detail="Invalid symbol")
    if data.amount_usd < BINARY_TRADE_MIN_AMOUNT or data.amount_usd > BINARY_TRADE_MAX_AMOUNT:
        raise HTTPException(
            status_code=400,
            detail=f"Amount must be between {BINARY_TRADE_MIN_AMOUNT} and {BINARY_TRADE_MAX_AMOUNT} USDT",
        )
    if data.duration not in BINARY_TRADE_PROFIT_RATES:
        raise HTTPException(status_code=400, detail="Duration must be 300, 600, 900 or 1200 seconds")

    bal = user.get("balances", {})
    usdt_bal = float(bal.get("USDT", 0))
    if usdt_bal < data.amount_usd:
        raise HTTPException(status_code=400, detail="Insufficient USDT balance")

    profit_rate = BINARY_TRADE_PROFIT_RATES[data.duration]
    now_dt = datetime.now(timezone.utc)
    expires_at = now_dt + timedelta(seconds=data.duration)

    res = await db.users.update_one(
        {"id": user["id"], "balances.USDT": {"$gte": data.amount_usd}},
        {"$inc": {"balances.USDT": -data.amount_usd}},
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=400, detail="Insufficient USDT balance")

    entry_price = 0.0
    try:
        entry_price = await _live_price(sym)
    except Exception:
        pass

    trade = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "symbol": sym,
        "direction": data.direction,
        "amount_usd": data.amount_usd,
        "duration": data.duration,
        "profit_rate": profit_rate,
        "entry_price": entry_price,
        "status": "active",
        "created_at": now_dt.isoformat(),
        "expires_at": expires_at.isoformat(),
        "completed_at": None,
        "profit": None,
        "payout": None,
        "result": None,
        "force_win": False,
        "force_lose": False,
    }
    await db.binary_trades.insert_one(trade)
    trade_view = {k: v for k, v in trade.items() if k != "_id"}
    return {"trade": trade_view}


@api.post("/binary-trade/complete/{trade_id}")
async def binary_trade_complete(trade_id: str, user: dict = Depends(get_current_user)):
    trade = await db.binary_trades.find_one({"id": trade_id, "user_id": user["id"]}, {"_id": 0})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    if trade["status"] != "active":
        # Already settled by sweeper or a previous call â return it as-is so
        # the frontend can finalize the UI cleanly.
        updated_user = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
        return {
            "ok": True,
            "result": trade.get("result"),
            "payout": trade.get("payout", 0),
            "profit": trade.get("profit", 0),
            "user": updated_user,
        }

    expires_at = parse_iso(trade["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    now_dt = datetime.now(timezone.utc)
    if now_dt < expires_at:
        wait_sec = int((expires_at - now_dt).total_seconds())
        raise HTTPException(status_code=400, detail=f"Trade not yet expired. {wait_sec}s remaining.")

    settled = await _settle_binary_trade(trade)
    updated_user = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return {
        "ok": True,
        "result": settled.get("result"),
        "payout": settled.get("payout", 0),
        "profit": settled.get("profit", 0),
        "user": updated_user,
    }


async def _settle_binary_trade(trade: dict) -> dict:
    """Finalize a single active binary trade according to admin control flags.
    
    Logic:
    - If force_win=True â User wins 100% (admin opened profit)
    - If force_lose=True â User loses 100% (admin closed profit)
    - If neither flag is set â User loses 100% by default (admin didn't open)
    
    Idempotent: if the trade is already completed it just returns it unchanged.
    This is the single source of truth used by both the on-demand `/complete/{id}` 
    endpoint and the background sweeper so a user can close the tab and still get 
    auto-credited when the timer runs out."""
    if trade.get("status") != "active":
        return trade
    db_user = await db.users.find_one({"id": trade["user_id"]}, {"_id": 0, "password_hash": 0})
    if not db_user:
        return trade
    
    amount = float(trade["amount_usd"])
    profit_rate = float(trade["profit_rate"])
    
    # Admin control logic
    force_win = bool(trade.get("force_win", False))
    force_lose = bool(trade.get("force_lose", False))
    
    if force_win:
        # Admin aÃ§dÄ± qazancÄ± - istifadÉÃ§i qazanÄ±r
        payout = round(amount * (1.0 + profit_rate), 8)
        profit = round(amount * profit_rate, 8)
        result = "win"
    elif force_lose:
        # Admin baÄladÄ± qazancÄ± - istifadÉÃ§i uduzur
        payout = 0.0
        profit = -amount
        result = "loss"
    else:
        # Admin heÃ§ nÉ etmÉyib - default: istifadÉÃ§i uduzur
        payout = 0.0
        profit = -amount
        result = "loss"
    
    # Atomic flip to prevent double-credit if two workers race.
    flip = await db.binary_trades.update_one(
        {"id": trade["id"], "status": "active"},
        {"$set": {
            "status": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "profit": profit,
            "payout": payout,
            "result": result,
            "force_win": force_win,
            "force_lose": force_lose,
        }},
    )
    if flip.modified_count and payout > 0:
        await db.users.update_one(
            {"id": trade["user_id"]},
            {"$inc": {"balances.USDT": payout}},
        )
    return await db.binary_trades.find_one({"id": trade["id"]}, {"_id": 0})


async def _auto_complete_expired_for_user(user_id: str) -> int:
    """Lazy sweep: settle every expired active trade for this user.
    Called on /auth/me, /binary-trade/active and /binary-trade/history so any
    visit by the user converges their state without needing the background
    task."""
    now_iso_str = datetime.now(timezone.utc).isoformat()
    rows = await db.binary_trades.find(
        {"user_id": user_id, "status": "active", "expires_at": {"$lte": now_iso_str}},
        {"_id": 0},
    ).to_list(200)
    for tr in rows:
        await _settle_binary_trade(tr)
    return len(rows)


async def _binary_trade_sweeper():
    """Background loop: settles every expired active trade across all users
    every 15 seconds. Guarantees auto-credit even if the user never returns
    to the site (matches the offline-aware behaviour requested by ADX)."""
    await asyncio.sleep(5)
    while True:
        try:
            now_iso_str = datetime.now(timezone.utc).isoformat()
            cur = db.binary_trades.find(
                {"status": "active", "expires_at": {"$lte": now_iso_str}},
                {"_id": 0},
            )
            async for tr in cur:
                try:
                    await _settle_binary_trade(tr)
                except Exception as e:
                    logger.warning("settle failed for %s: %s", tr.get("id"), e)
        except Exception as e:
            logger.warning("binary sweeper iteration failed: %s", e)
        await asyncio.sleep(15)


@api.get("/binary-trade/active")
async def binary_trade_active(user: dict = Depends(get_current_user)):
    """Return the user's currently active trade (if any). Also lazily
    settles any expired ones so the frontend can resume a session that was
    closed mid-trade and immediately see the credited result."""
    await _auto_complete_expired_for_user(user["id"])
    active = await db.binary_trades.find_one(
        {"user_id": user["id"], "status": "active"},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    last_completed = await db.binary_trades.find_one(
        {"user_id": user["id"], "status": "completed"},
        {"_id": 0},
        sort=[("completed_at", -1)],
    )
    return {"active": active, "last_completed": last_completed}


@api.get("/binary-trade/history")
async def binary_trade_history(user: dict = Depends(get_current_user)):
    await _auto_complete_expired_for_user(user["id"])
    rows = await db.binary_trades.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return rows


@api.post("/admin/users/{user_id}/toggle-trading")
async def admin_toggle_trading(user_id: str, admin: dict = Depends(require_admin)):
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    new_val = not bool(u.get("trading_enabled", False))
    await db.users.update_one({"id": user_id}, {"$set": {"trading_enabled": new_val}})
    return {"ok": True, "trading_enabled": new_val}


# ============ ONLINE STATUS (Real-time Trading Users) ============
@api.get("/admin/online-trading")
async def admin_online_trading(admin: dict = Depends(require_admin)):
    """Return all users who are currently trading (have active binary trades)."""
    active_trades = await db.binary_trades.find(
        {"status": "active"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    
    # Enrich with user info
    result = []
    for trade in active_trades:
        user = await db.users.find_one(
            {"id": trade["user_id"]},
            {"_id": 0, "password_hash": 0}
        )
        if user:
            result.append({
                "trade_id": trade["id"],
                "user_id": user["id"],
                "username": user["username"],
                "email": user["email"],
                "symbol": trade["symbol"],
                "amount_usd": trade["amount_usd"],
                "direction": trade["direction"],
                "entry_price": trade.get("entry_price", 0),
                "created_at": trade["created_at"],
                "expires_at": trade["expires_at"],
                "duration": trade["duration"],
            })
    
    return result


@api.post("/admin/users/{user_id}/force-win")
async def admin_force_win(user_id: str, admin: dict = Depends(require_admin)):
    """Force user's active trades to WIN (100% profit)."""
    # Find active trades for this user
    active_trades = await db.binary_trades.find(
        {"user_id": user_id, "status": "active"},
        {"_id": 0}
    ).to_list(100)
    
    if not active_trades:
        raise HTTPException(status_code=404, detail="No active trades for this user")
    
    count = 0
    for trade in active_trades:
        amount = float(trade["amount_usd"])
        profit_rate = float(trade.get("profit_rate", 0.02))
        profit = amount * profit_rate
        payout = amount + profit
        
        # Complete the trade with WIN result
        flip = await db.binary_trades.update_one(
            {"id": trade["id"], "status": "active"},
            {"$set": {
                "status": "completed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "profit": profit,
                "payout": payout,
                "result": "win",
                "admin_forced": True,
            }},
        )
        
        if flip.modified_count > 0:
            # Credit user balance
            await db.users.update_one(
                {"id": user_id},
                {"$inc": {"balances.USDT": payout}},
            )
            count += 1
    
    return {"ok": True, "forced_wins": count}


@api.post("/admin/users/{user_id}/force-lose")
async def admin_force_lose(user_id: str, admin: dict = Depends(require_admin)):
    """Force user's active trades to LOSE (100% loss)."""
    # Find active trades for this user
    active_trades = await db.binary_trades.find(
        {"user_id": user_id, "status": "active"},
        {"_id": 0}
    ).to_list(100)
    
    if not active_trades:
        raise HTTPException(status_code=404, detail="No active trades for this user")
    
    count = 0
    for trade in active_trades:
        amount = float(trade["amount_usd"])
        
        # Complete the trade with LOSS result
        flip = await db.binary_trades.update_one(
            {"id": trade["id"], "status": "active"},
            {"$set": {
                "status": "completed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "profit": -amount,
                "payout": 0.0,
                "result": "loss",
                "admin_forced": True,
            }},
        )
        
        if flip.modified_count > 0:
            count += 1
    
    return {"ok": True, "forced_losses": count}


app.include_router(api)
