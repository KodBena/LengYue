import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional
from core.config import config

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30  # 30 days

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against the bcrypt hash from the DB."""
    # Bcrypt expects bytes
    if isinstance(hashed_password, str):
        hashed_password = hashed_password.encode('utf-8')
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password)

def get_password_hash(password: str) -> str:
    """Hashes a password for storing in the DB."""
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Creates a mathematically signed JWT containing user data."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    # Sign the token using the secret key from config
    encoded_jwt = jwt.encode(to_encode, config.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
