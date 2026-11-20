# Metro Retail POS System (Enterprise Edition)

A production-standard Point of Sale (POS) & Inventory Management System specifically designed for supermarkets, retail grocery stores, pharmacies, and fashion outlets.

Built according to international retail industry standards with **Python 3, SQLite (ACID with WAL Mode), and a Modern Responsive Web POS Terminal UI**.

---

## Why this Architecture? (Language & Tech Stack Justification)

In modern retail software engineering, the industry relies on two primary paradigms:
1. **Desktop/Enterprise Traditional (C# / .NET / WPF)**: Known for deep hardware OPOS/UPOS drivers in legacy supermarkets.
2. **Modern Hybrid & Cloud (TypeScript / React + Python / Node.js + SQLite/PostgreSQL)**: Adopted by international giants like **Odoo POS, Shopify POS, and Square**.

### Key Advantages of this POS System:
- **Zero-Dependency & 100% Offline**: Runs on pure Python standard library and vanilla modern web technologies. Works flawlessly even if the store loses internet connection.
- **ACID Transaction Guarantee**: Inventory deductions, cash drawer shift records, and order line items are committed atomically. No phantom sales or stock mismatches.
- **Universal Hardware Compatibility**:
  - **Barcode Scanners**: Supports any standard USB or wireless HID barcode scanner with automatic keystroke interception.
  - **Thermal Receipt Printers**: Pixel-perfect 80mm / 58mm ESC/POS compatible thermal receipt formatting with print dialog integration.
  - **Cash Drawers**: Integrated shift drawer management with opening floats, petty cash in/out, and physical cash count reconciliation.

---

##  Key Features & Industry Standards

### 1. High-Speed Cashier Terminal (`pos.html`)
- **Universal Barcode Scanner Listener**: Rapid keystroke detection (<50ms) adds scanned products directly to the cart and plays an audible scanner chirp without requiring cashier mouse clicks.
- **Retail Keyboard Shortcuts**:
  - `F2`: Focus Barcode / Search Box
  - `F4`: Apply Bill Discount (% or fixed amount)
  - `F8`: Park / Hold Current Bill (recall anytime)
  - `F9`: Pay / Checkout Modal
  - `F12`: Clear / Cancel Cart
  - `Esc`: Close Modals
  - `Enter`: Complete Payment and Print Receipt
- **Park / Hold Bills**: If a customer in queue forgets their wallet or an item, cashier can park the cart with one keystroke (`F8`) and serve the next customer.
- **Multi-Payment Options**: Cash (with instant change calculation), Card, Bank Transfer, and Customer Store Credit.
- **Audio Feedback**: Synthesized web audio beeps for barcode scans, successful checkouts, and error alerts.

### 2. Shift & Cash Drawer Balancing (X-Report & Z-Report)
- **Opening Float**: Set initial cash drawer float when opening the register.
- **Petty Cash Transactions**: Record `Cash In` (adding change) and `Cash Out` (paying milk delivery, tea, utility expenses).
- **X-Report (Interim Audit)**: Non-resetting mid-day financial summary of cash on hand, card sales, and bill count.
- **Z-Report (End-of-Day Closing)**: Cashier physical count entry, automatic variance calculation (Surplus / Shortage), and permanent shift closing.

### 3. Inventory & Stock Management
- Real-time stock decrement on each sale.
- Minimum safety stock alerts (`⚠️ LOW STOCK` badges).
- 1-click Restock / Goods Received Note (GRN) / Damage adjustment.
- Product Master: Barcode, SKU, Selling Price, Cost Price, Profit Margin, Unit (pcs, kg, pack, bottle).

### 4. Financial & Analytics Dashboard
- Today's Gross Turnover & Net Profit (Revenue minus Cost of Goods Sold).
- Total customer discount value.
- Payment method breakdown (Cash vs Card vs Credit).
- Top 5 best selling retail products.
- Low-stock reorder warning list.

### 5. Customer & Loyalty Ledger
- Customer phone lookup at checkout.
- Automatic loyalty points accrual (1 point per Rs. 100 spent).
- Customer credit / pay-later accounts with real-time balance tracking.

---

##  How to Run

### Method 1: Double-Click (Windows)
Double-click `run_pos.bat`. The script automatically detects Python and starts the POS server, opening your browser to `http://localhost:8080`.

### Method 2: Command Line (PowerShell / Terminal)
```powershell
python run_pos.py
```
Open your browser and navigate to:
```
http://localhost:8080
```

---

## ⚙️ Environment Configuration (.env)

The system automatically loads all configuration settings from the `.env` file at the root of the project using a built-in pure Python environment parser (zero external dependencies).

```env
# Server Settings
PORT=8080
HOST=0.0.0.0
DEBUG=True
SECRET_KEY=change_this_to_a_random_secure_secret_key_in_production

# Database Configuration (SQLite)
DB_NAME=pos_retail.db

# Store Identity & Details
STORE_NAME=Metro Retail Mart
STORE_TAGLINE=Quality & Convenience Everyday
STORE_ADDRESS=No. 45, High Level Road, Colombo, Sri Lanka
STORE_PHONE=+94 11 234 5678
STORE_EMAIL=info@metroretail.lk

# Currency & Tax Configuration
CURRENCY_SYMBOL=Rs.
CURRENCY_CODE=LKR
DEFAULT_TAX_RATE=0.0

# Initial Default Credentials
ADMIN_DEFAULT_PIN=1234
CASHIER_DEFAULT_PIN=0000
```

> **Security Note**: The `.env` file and live database `pos_retail.db` are automatically ignored by Git (via `.gitignore`) so your passwords, secret keys, and customer transaction records are never accidentally published to GitHub. A clean template `.env.example` is provided for repository users.

---

## 🐙 Pushing to GitHub (Step-by-Step Guide)

If you are using **Git CLI** in your terminal:
```bash
# 1. Initialize git repository
git init

# 2. Add all project files (safe files will be added, .env and .db are ignored)
git add .

# 3. Create initial commit
git commit -m "feat: complete retail POS system with modern UI, barcode scanning, and shift management"

# 4. Set main branch and link to your GitHub repo
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPOSITORY_NAME>.git

# 5. Push to GitHub
git push -u origin main
```

If you are using **GitHub Desktop** or **VS Code**:
1. Open the project folder in VS Code or GitHub Desktop.
2. Publish Repository to GitHub. The included `.gitignore` will automatically prevent `.env` and `*.db` files from being published.

---

## 📦 Project Structure

```
POS System/
├── .env                  # Local secret configuration (ignored by Git)
├── .env.example          # Public configuration template for GitHub
├── .gitignore            # Git ignore rules for Python, SQLite, and .env
├── backend/
│   ├── config.py         # Pure-Python environment variable loader
│   ├── database.py       # SQLite connection, ACID transactions, WAL mode, schema
│   ├── seed_data.py      # Realistic supermarket product catalog with barcodes
│   └── server.py         # REST API server & static file host (port 8080)
├── frontend/
│   ├── index.html        # Main Single Page Application interface
│   ├── css/
│   │   └── style.css     # Modern responsive styling & thermal 80mm print CSS
│   └── js/
│       ├── app.js        # Navigation router & state orchestration
│       ├── pos.js        # Cashier checkout, barcode scanner listener, shortcuts
│       ├── receipt.js    # ESC/POS 80mm thermal receipt generator
│       ├── shifts.js     # Cash drawer float, X-Report, and Z-Report
│       ├── inventory.js  # Product master, restock & delete modals
│       └── reports.js    # Daily financial analytics & profit reports
├── run_pos.py            # Python launcher
├── run_pos.bat           # 1-Click Windows batch launcher
├── run_pos.ps1           # 1-Click PowerShell launcher
└── README.md             # Complete documentation
```

---


