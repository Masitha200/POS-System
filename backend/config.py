"""
Configuration & Environment Variable Loader
Loads settings from .env file with zero external dependencies.
"""

import os
from pathlib import Path

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"

def load_env_file(filepath: Path = ENV_FILE):
    """
    Parses key-value pairs from .env and sets them into os.environ
    if they are not already set.
    """
    if not filepath.exists():
        return

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                # Skip comments and empty lines
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip()
                    # Remove surrounding quotes if present
                    if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                        val = val[1:-1]
                    # Set into environment if not already present
                    if key not in os.environ:
                        os.environ[key] = val
    except Exception as e:
        print(f"Warning: Could not parse .env file: {e}")

# Load .env upon module import
load_env_file()

# Helper Accessors
def get_str(key: str, default: str = "") -> str:
    return os.environ.get(key, default)

def get_int(key: str, default: int = 0) -> int:
    val = os.environ.get(key)
    if val is not None:
        try:
            return int(val)
        except ValueError:
            pass
    return default

def get_float(key: str, default: float = 0.0) -> float:
    val = os.environ.get(key)
    if val is not None:
        try:
            return float(val)
        except ValueError:
            pass
    return default

def get_bool(key: str, default: bool = False) -> bool:
    val = os.environ.get(key)
    if val is not None:
        return val.strip().lower() in ("1", "true", "yes", "on")
    return default

# Common Configuration Values
PORT = get_int("PORT", 8080)
HOST = get_str("HOST", "0.0.0.0")
DB_NAME = get_str("DB_NAME", "pos_retail.db")
DB_PATH = BASE_DIR / DB_NAME
SECRET_KEY = get_str("SECRET_KEY", "super-secret-pos-key-change-in-production")
DEBUG = get_bool("DEBUG", True)

# Store Defaults
STORE_NAME = get_str("STORE_NAME", "Metro Retail Mart")
STORE_TAGLINE = get_str("STORE_TAGLINE", "Quality & Convenience Everyday")
STORE_ADDRESS = get_str("STORE_ADDRESS", "No. 45, High Level Road, Colombo, Sri Lanka")
STORE_PHONE = get_str("STORE_PHONE", "+94 11 234 5678")
STORE_EMAIL = get_str("STORE_EMAIL", "info@metroretail.lk")
CURRENCY_SYMBOL = get_str("CURRENCY_SYMBOL", "Rs.")
CURRENCY_CODE = get_str("CURRENCY_CODE", "LKR")
DEFAULT_TAX_RATE = get_str("DEFAULT_TAX_RATE", "0.0")
ADMIN_DEFAULT_PIN = get_str("ADMIN_DEFAULT_PIN", "1234")
CASHIER_DEFAULT_PIN = get_str("CASHIER_DEFAULT_PIN", "0000")
