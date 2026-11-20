"""
Retail POS Database Layer
ACID-compliant SQLite database with WAL mode for concurrent reads/writes.
Standard retail database schema covering Products, Inventory, Sales, Shifts, and Customers.
"""

import sqlite3
import os
import json
import hashlib
from datetime import datetime

try:
    from config import (
        DB_PATH, STORE_NAME, STORE_TAGLINE, STORE_ADDRESS, STORE_PHONE, 
        STORE_EMAIL, CURRENCY_SYMBOL, CURRENCY_CODE, DEFAULT_TAX_RATE,
        ADMIN_DEFAULT_PIN, CASHIER_DEFAULT_PIN
    )
except ImportError:
    from backend.config import (
        DB_PATH, STORE_NAME, STORE_TAGLINE, STORE_ADDRESS, STORE_PHONE, 
        STORE_EMAIL, CURRENCY_SYMBOL, CURRENCY_CODE, DEFAULT_TAX_RATE,
        ADMIN_DEFAULT_PIN, CASHIER_DEFAULT_PIN
    )

def get_db():
    conn = sqlite3.connect(str(DB_PATH), timeout=20.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn

def hash_pin(pin: str) -> str:
    return hashlib.sha256(pin.encode('utf-8')).hexdigest()

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # 1. System Settings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """)

    # 2. Users (Cashiers, Managers, Admins)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        pin_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'cashier', -- 'admin', 'manager', 'cashier'
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    """)

    # 3. Product Categories
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        icon TEXT DEFAULT 'tag',
        color TEXT DEFAULT '#4f46e5'
    );
    """)

    # 4. Products / Inventory
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barcode TEXT UNIQUE NOT NULL,
        sku TEXT UNIQUE,
        name TEXT NOT NULL,
        category_id INTEGER,
        cost_price REAL NOT NULL DEFAULT 0.0,
        selling_price REAL NOT NULL DEFAULT 0.0,
        tax_rate REAL NOT NULL DEFAULT 0.0,
        stock_quantity REAL NOT NULL DEFAULT 0.0,
        min_stock_level REAL NOT NULL DEFAULT 5.0,
        unit TEXT NOT NULL DEFAULT 'pcs',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );
    """)

    # 5. Customers & Loyalty / Credit
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT UNIQUE,
        email TEXT,
        address TEXT,
        loyalty_points INTEGER NOT NULL DEFAULT 0,
        credit_balance REAL NOT NULL DEFAULT 0.0,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    """)

    # 6. Shifts & Cash Drawer Management (X-Report and Z-Report support)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS shifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        opening_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        closing_time TEXT,
        opening_float REAL NOT NULL DEFAULT 0.0,
        closing_actual_cash REAL,
        expected_cash REAL,
        cash_sales REAL NOT NULL DEFAULT 0.0,
        card_sales REAL NOT NULL DEFAULT 0.0,
        credit_sales REAL NOT NULL DEFAULT 0.0,
        cash_in_total REAL NOT NULL DEFAULT 0.0,
        cash_out_total REAL NOT NULL DEFAULT 0.0,
        variance REAL,
        status TEXT NOT NULL DEFAULT 'open', -- 'open', 'closed'
        notes TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
    """)

    # 7. Cash Drawer Petty Transactions (Cash In / Cash Out)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS shift_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shift_id INTEGER NOT NULL,
        type TEXT NOT NULL, -- 'cash_in', 'cash_out'
        amount REAL NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE
    );
    """)

    # 8. Sales Orders (Invoices)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT UNIQUE NOT NULL,
        shift_id INTEGER,
        user_id INTEGER NOT NULL,
        customer_id INTEGER,
        subtotal REAL NOT NULL,
        discount_amount REAL NOT NULL DEFAULT 0.0,
        tax_amount REAL NOT NULL DEFAULT 0.0,
        grand_total REAL NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'cash', -- 'cash', 'card', 'credit', 'split'
        cash_tendered REAL DEFAULT 0.0,
        change_due REAL DEFAULT 0.0,
        status TEXT NOT NULL DEFAULT 'completed', -- 'completed', 'held', 'cancelled', 'refunded'
        held_label TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (shift_id) REFERENCES shifts(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
    """)

    # 9. Order Line Items
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        product_name TEXT NOT NULL,
        barcode TEXT NOT NULL,
        unit_price REAL NOT NULL,
        cost_price REAL NOT NULL DEFAULT 0.0,
        quantity REAL NOT NULL,
        discount_amount REAL NOT NULL DEFAULT 0.0,
        line_total REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
    );
    """)

    # 10. Inventory Audit Ledger (Stock Movement Tracking)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS stock_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        change_quantity REAL NOT NULL,
        balance_after REAL NOT NULL,
        movement_type TEXT NOT NULL, -- 'sale', 'restock', 'adjustment', 'return'
        reference_id TEXT,
        user_id INTEGER,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
    """)

    # Default Settings (Loaded from .env / config)
    default_settings = {
        "store_name": STORE_NAME,
        "store_tagline": STORE_TAGLINE,
        "address": STORE_ADDRESS,
        "phone": STORE_PHONE,
        "email": STORE_EMAIL,
        "currency_symbol": CURRENCY_SYMBOL,
        "currency_code": CURRENCY_CODE,
        "tax_name": "VAT",
        "default_tax_rate": DEFAULT_TAX_RATE,
        "receipt_header": "TAX INVOICE / CASH SALE",
        "receipt_footer": "Thank you for shopping with us! Please come again.",
        "enable_sound": "true",
        "barcode_scanner_mode": "auto"
    }

    for k, v in default_settings.items():
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))

    # Default Users
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
        INSERT INTO users (username, pin_hash, full_name, role) VALUES 
        ('admin', ?, 'Store Manager', 'admin'),
        ('cashier1', ?, 'Kasun Perera', 'cashier'),
        ('cashier2', ?, 'Nimali Silva', 'cashier')
        """, (hash_pin(ADMIN_DEFAULT_PIN), hash_pin(CASHIER_DEFAULT_PIN), hash_pin(CASHIER_DEFAULT_PIN)))

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("POS Database initialized successfully.")
