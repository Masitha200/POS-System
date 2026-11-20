"""
High-Performance Retail POS REST API & Static Server
Built with Python 3 Standard Library - zero third-party dependencies required.
Implements ACID Transactions for billing, stock adjustments, and shift reconciliation.
"""

import http.server
import socketserver
import json
import os
import urllib.parse
from datetime import datetime, date
import sqlite3
import mimetypes

from database import get_db, init_db, hash_pin

try:
    from config import PORT, HOST
except ImportError:
    from backend.config import PORT, HOST

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

class POSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FRONTEND_DIR, **kwargs)

    def end_headers(self):
        # Enable CORS and caching headers for standard POS operation
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data, default=str).encode('utf-8'))

    def send_error_json(self, message, status=400):
        self.send_json({"error": True, "message": message}, status=status)

    def get_post_data(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length == 0:
            return {}
        raw_body = self.wfile if False else self.rfile.read(content_length).decode('utf-8')
        try:
            return json.loads(raw_body)
        except Exception:
            return {}

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        # API Routes
        if path.startswith('/api/'):
            try:
                self.handle_api_get(path, query)
            except Exception as e:
                self.send_error_json(f"Internal server error: {str(e)}", 500)
            return

        # Frontend SPA Routing: default to index.html for root
        if path == '/' or not os.path.exists(os.path.join(FRONTEND_DIR, path.lstrip('/'))):
            self.path = '/index.html'

        return super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path.startswith('/api/'):
            try:
                data = self.get_post_data()
                self.handle_api_post(path, data)
            except Exception as e:
                self.send_error_json(f"Server error: {str(e)}", 500)
            return

        self.send_error_json("Invalid POST endpoint", 404)

    # ------------------ API ROUTERS ------------------

    def handle_api_get(self, path, query):
        conn = get_db()
        cursor = conn.cursor()

        # 1. System Status & Settings
        if path == '/api/status':
            self.send_json({"status": "running", "timestamp": datetime.now().isoformat()})
            conn.close()
            return

        if path == '/api/settings':
            cursor.execute("SELECT key, value FROM settings")
            settings = {row['key']: row['value'] for row in cursor.fetchall()}
            self.send_json(settings)
            conn.close()
            return

        # 2. Categories
        if path == '/api/categories':
            cursor.execute("""
            SELECT c.*, COUNT(p.id) as product_count 
            FROM categories c 
            LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1
            GROUP BY c.id
            ORDER BY c.name ASC
            """)
            rows = [dict(row) for row in cursor.fetchall()]
            self.send_json(rows)
            conn.close()
            return

        # 3. Products
        if path == '/api/products':
            cat_id = query.get('category_id', [None])[0]
            search = query.get('search', [None])[0]
            low_stock_only = query.get('low_stock', [None])[0]

            sql = """
            SELECT p.*, c.name as category_name 
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.is_active = 1
            """
            params = []

            if cat_id and cat_id != 'all':
                sql += " AND p.category_id = ?"
                params.append(cat_id)

            if search:
                sql += " AND (p.name LIKE ? OR p.barcode LIKE ? OR p.sku LIKE ?)"
                term = f"%{search}%"
                params.extend([term, term, term])

            if low_stock_only == 'true':
                sql += " AND p.stock_quantity <= p.min_stock_level"

            sql += " ORDER BY p.name ASC"
            cursor.execute(sql, params)
            rows = [dict(row) for row in cursor.fetchall()]
            self.send_json(rows)
            conn.close()
            return

        # 4. Barcode / SKU direct lookup
        if path.startswith('/api/products/lookup/'):
            code = urllib.parse.unquote(path.replace('/api/products/lookup/', '').strip())
            cursor.execute("""
            SELECT p.*, c.name as category_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE (p.barcode = ? OR p.sku = ?) AND p.is_active = 1
            LIMIT 1
            """, (code, code))
            row = cursor.fetchone()
            if row:
                self.send_json(dict(row))
            else:
                self.send_error_json("Product not found with barcode/SKU: " + code, 404)
            conn.close()
            return

        # 5. Customers
        if path == '/api/customers':
            search = query.get('search', [None])[0]
            if search:
                cursor.execute("""
                SELECT * FROM customers 
                WHERE name LIKE ? OR phone LIKE ? 
                ORDER BY name ASC LIMIT 20
                """, (f"%{search}%", f"%{search}%"))
            else:
                cursor.execute("SELECT * FROM customers ORDER BY name ASC")
            rows = [dict(row) for row in cursor.fetchall()]
            self.send_json(rows)
            conn.close()
            return

        # 6. Shift Status & Current Shift
        if path == '/api/shifts/current':
            user_id = query.get('user_id', [None])[0]
            if not user_id:
                cursor.execute("SELECT * FROM shifts WHERE status = 'open' ORDER BY id DESC LIMIT 1")
            else:
                cursor.execute("SELECT * FROM shifts WHERE user_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1", (user_id,))
            row = cursor.fetchone()
            if row:
                shift_data = dict(row)
                # Fetch shift petty transactions
                cursor.execute("SELECT * FROM shift_transactions WHERE shift_id = ? ORDER BY id ASC", (shift_data['id'],))
                shift_data['transactions'] = [dict(t) for t in cursor.fetchall()]
                self.send_json(shift_data)
            else:
                self.send_json({"has_active_shift": False})
            conn.close()
            return

        # 7. X-Report (Mid-Shift Audit Report)
        if path == '/api/shifts/x-report':
            shift_id = query.get('shift_id', [None])[0]
            if not shift_id:
                cursor.execute("SELECT id FROM shifts WHERE status = 'open' ORDER BY id DESC LIMIT 1")
                res = cursor.fetchone()
                if not res:
                    self.send_error_json("No active open shift found for X-Report", 400)
                    conn.close()
                    return
                shift_id = res['id']

            cursor.execute("""
            SELECT s.*, u.full_name as cashier_name 
            FROM shifts s 
            JOIN users u ON s.user_id = u.id 
            WHERE s.id = ?
            """, (shift_id,))
            shift = cursor.fetchone()
            if not shift:
                self.send_error_json("Shift not found", 404)
                conn.close()
                return

            shift_dict = dict(shift)
            cursor.execute("SELECT COUNT(*) as total_orders, COALESCE(SUM(grand_total), 0) as total_sales FROM orders WHERE shift_id = ? AND status = 'completed'", (shift_id,))
            sales_stat = cursor.fetchone()
            shift_dict['total_orders'] = sales_stat['total_orders']
            shift_dict['total_sales'] = sales_stat['total_sales']
            shift_dict['current_expected_cash'] = (shift_dict['opening_float'] + shift_dict['cash_sales'] + shift_dict['cash_in_total'] - shift_dict['cash_out_total'])

            self.send_json(shift_dict)
            conn.close()
            return

        # 8. Orders History / Details
        if path == '/api/orders':
            date_filter = query.get('date', [None])[0]
            sql = """
            SELECT o.*, u.full_name as cashier_name, c.name as customer_name
            FROM orders o
            JOIN users u ON o.user_id = u.id
            LEFT JOIN customers c ON o.customer_id = c.id
            WHERE o.status = 'completed'
            """
            params = []
            if date_filter:
                sql += " AND date(o.created_at) = ?"
                params.append(date_filter)
            sql += " ORDER BY o.id DESC LIMIT 50"
            cursor.execute(sql, params)
            rows = [dict(row) for row in cursor.fetchall()]
            self.send_json(rows)
            conn.close()
            return

        if path.startswith('/api/orders/invoice/'):
            inv_no = path.replace('/api/orders/invoice/', '').strip()
            cursor.execute("""
            SELECT o.*, u.full_name as cashier_name, c.name as customer_name, c.phone as customer_phone
            FROM orders o
            JOIN users u ON o.user_id = u.id
            LEFT JOIN customers c ON o.customer_id = c.id
            WHERE o.invoice_number = ?
            """, (inv_no,))
            order = cursor.fetchone()
            if not order:
                self.send_error_json("Invoice not found", 404)
                conn.close()
                return
            order_dict = dict(order)
            cursor.execute("SELECT * FROM order_items WHERE order_id = ?", (order_dict['id'],))
            order_dict['items'] = [dict(item) for item in cursor.fetchall()]
            self.send_json(order_dict)
            conn.close()
            return

        # 9. Held (Parked) Orders
        if path == '/api/orders/held':
            cursor.execute("""
            SELECT o.*, u.full_name as cashier_name, c.name as customer_name
            FROM orders o
            JOIN users u ON o.user_id = u.id
            LEFT JOIN customers c ON o.customer_id = c.id
            WHERE o.status = 'held'
            ORDER BY o.id DESC
            """)
            orders = [dict(row) for row in cursor.fetchall()]
            for o in orders:
                cursor.execute("SELECT * FROM order_items WHERE order_id = ?", (o['id'],))
                o['items'] = [dict(item) for item in cursor.fetchall()]
            self.send_json(orders)
            conn.close()
            return

        # 10. Dashboard Analytics & Reports
        if path == '/api/reports/dashboard':
            today = date.today().isoformat()
            
            # Today's Sales
            cursor.execute("""
            SELECT 
                COUNT(*) as count,
                COALESCE(SUM(grand_total), 0) as total_revenue,
                COALESCE(SUM(discount_amount), 0) as total_discounts
            FROM orders 
            WHERE status = 'completed' AND date(created_at) = ?
            """, (today,))
            today_stats = dict(cursor.fetchone())

            # Today's Cost and Profit
            cursor.execute("""
            SELECT COALESCE(SUM(oi.cost_price * oi.quantity), 0) as total_cogs
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE o.status = 'completed' AND date(o.created_at) = ?
            """, (today,))
            cogs = cursor.fetchone()['total_cogs']
            today_stats['total_cogs'] = cogs
            today_stats['net_profit'] = today_stats['total_revenue'] - cogs

            # Payment Breakdown Today
            cursor.execute("""
            SELECT payment_method, COUNT(*) as count, SUM(grand_total) as total
            FROM orders
            WHERE status = 'completed' AND date(created_at) = ?
            GROUP BY payment_method
            """, (today,))
            payment_methods = [dict(r) for r in cursor.fetchall()]

            # Top 5 Selling Products (All time / 30 days)
            cursor.execute("""
            SELECT oi.product_name, SUM(oi.quantity) as total_sold, SUM(oi.line_total) as total_revenue
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE o.status = 'completed'
            GROUP BY oi.product_id
            ORDER BY total_sold DESC
            LIMIT 5
            """)
            top_products = [dict(r) for r in cursor.fetchall()]

            # Low Stock Items Count and List
            cursor.execute("""
            SELECT id, barcode, name, stock_quantity, min_stock_level, unit
            FROM products
            WHERE is_active = 1 AND stock_quantity <= min_stock_level
            ORDER BY stock_quantity ASC
            LIMIT 10
            """)
            low_stock_items = [dict(r) for r in cursor.fetchall()]

            self.send_json({
                "today": today_stats,
                "payments": payment_methods,
                "top_products": top_products,
                "low_stock_items": low_stock_items
            })
            conn.close()
            return

        self.send_error_json(f"Unknown GET endpoint: {path}", 404)
        conn.close()

    def handle_api_post(self, path, data):
        conn = get_db()
        cursor = conn.cursor()

        # 1. User Authentication (Login by PIN or Username/PIN)
        if path == '/api/auth/login':
            username = data.get('username')
            pin = data.get('pin', '')
            pin_hashed = hash_pin(str(pin))

            if username:
                cursor.execute("SELECT * FROM users WHERE username = ? AND pin_hash = ? AND is_active = 1", (username, pin_hashed))
            else:
                cursor.execute("SELECT * FROM users WHERE pin_hash = ? AND is_active = 1", (pin_hashed,))
            
            user = cursor.fetchone()
            if user:
                user_dict = dict(user)
                del user_dict['pin_hash']
                self.send_json({"success": True, "user": user_dict})
            else:
                self.send_error_json("Invalid credentials or PIN", 401)
            conn.close()
            return

        # 2. Update Settings
        if path == '/api/settings':
            for k, v in data.items():
                cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, str(v)))
            conn.commit()
            self.send_json({"success": True, "message": "Settings updated"})
            conn.close()
            return

        # 3. Add or Update Product
        if path == '/api/products/save':
            prod_id = data.get('id')
            barcode = data.get('barcode', '').strip()
            name = data.get('name', '').strip()
            category_id = data.get('category_id')
            cost_price = float(data.get('cost_price', 0))
            selling_price = float(data.get('selling_price', 0))
            stock_quantity = float(data.get('stock_quantity', 0))
            min_stock = float(data.get('min_stock_level', 5))
            unit = data.get('unit', 'pcs')
            sku = data.get('sku', barcode)

            if not barcode or not name:
                self.send_error_json("Barcode and Name are required", 400)
                conn.close()
                return

            if prod_id:
                cursor.execute("""
                UPDATE products SET barcode=?, sku=?, name=?, category_id=?, cost_price=?, selling_price=?, 
                stock_quantity=?, min_stock_level=?, unit=? WHERE id=?
                """, (barcode, sku, name, category_id, cost_price, selling_price, stock_quantity, min_stock, unit, prod_id))
            else:
                cursor.execute("""
                INSERT INTO products (barcode, sku, name, category_id, cost_price, selling_price, stock_quantity, min_stock_level, unit)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (barcode, sku, name, category_id, cost_price, selling_price, stock_quantity, min_stock, unit))
            
            conn.commit()
            self.send_json({"success": True, "message": "Product saved successfully"})
            conn.close()
            return

        # 3.1. Delete / Deactivate Product from Stock
        if path == '/api/products/delete':
            prod_id = data.get('id')
            if not prod_id:
                self.send_error_json("Product ID is required", 400)
                conn.close()
                return

            cursor.execute("UPDATE products SET is_active = 0 WHERE id = ?", (prod_id,))
            conn.commit()
            self.send_json({"success": True, "message": "Product removed from inventory successfully"})
            conn.close()
            return

        # 4. Stock Adjustment (Restock, Damage, Audit)
        if path == '/api/inventory/adjust':
            product_id = data.get('product_id')
            adjustment_qty = float(data.get('quantity', 0))
            reason = data.get('reason', 'adjustment') # 'restock', 'damage', 'adjustment'
            user_id = data.get('user_id', 1)
            notes = data.get('notes', '')

            cursor.execute("SELECT stock_quantity FROM products WHERE id = ?", (product_id,))
            prod = cursor.fetchone()
            if not prod:
                self.send_error_json("Product not found", 404)
                conn.close()
                return

            new_qty = prod['stock_quantity'] + adjustment_qty
            cursor.execute("UPDATE products SET stock_quantity = ? WHERE id = ?", (new_qty, product_id))
            cursor.execute("""
            INSERT INTO stock_movements (product_id, change_quantity, balance_after, movement_type, user_id, notes)
            VALUES (?, ?, ?, ?, ?, ?)
            """, (product_id, adjustment_qty, new_qty, reason, user_id, notes))
            conn.commit()
            self.send_json({"success": True, "new_stock": new_qty})
            conn.close()
            return

        # 5. Open Shift (Cash Drawer Float)
        if path == '/api/shifts/open':
            user_id = data.get('user_id')
            opening_float = float(data.get('opening_float', 0.0))
            notes = data.get('notes', '')

            # Check if user already has an open shift
            cursor.execute("SELECT id FROM shifts WHERE user_id = ? AND status = 'open'", (user_id,))
            if cursor.fetchone():
                self.send_error_json("User already has an active open shift", 400)
                conn.close()
                return

            cursor.execute("""
            INSERT INTO shifts (user_id, opening_float, notes)
            VALUES (?, ?, ?)
            """, (user_id, opening_float, notes))
            shift_id = cursor.lastrowid
            conn.commit()
            self.send_json({"success": True, "shift_id": shift_id})
            conn.close()
            return

        # 6. Shift Petty Cash In / Out
        if path == '/api/shifts/transaction':
            shift_id = data.get('shift_id')
            tx_type = data.get('type') # 'cash_in' or 'cash_out'
            amount = float(data.get('amount', 0))
            reason = data.get('reason', '')

            if tx_type not in ('cash_in', 'cash_out') or amount <= 0:
                self.send_error_json("Invalid cash transaction parameters", 400)
                conn.close()
                return

            cursor.execute("""
            INSERT INTO shift_transactions (shift_id, type, amount, reason)
            VALUES (?, ?, ?, ?)
            """, (shift_id, tx_type, amount, reason))

            if tx_type == 'cash_in':
                cursor.execute("UPDATE shifts SET cash_in_total = cash_in_total + ? WHERE id = ?", (amount, shift_id))
            else:
                cursor.execute("UPDATE shifts SET cash_out_total = cash_out_total + ? WHERE id = ?", (amount, shift_id))

            conn.commit()
            self.send_json({"success": True, "message": f"{tx_type} recorded successfully"})
            conn.close()
            return

        # 7. Close Shift & Generate Z-Report
        if path == '/api/shifts/close':
            shift_id = data.get('shift_id')
            actual_cash = float(data.get('closing_actual_cash', 0.0))
            notes = data.get('notes', '')

            cursor.execute("SELECT * FROM shifts WHERE id = ? AND status = 'open'", (shift_id,))
            shift = cursor.fetchone()
            if not shift:
                self.send_error_json("Open shift not found", 404)
                conn.close()
                return

            expected_cash = shift['opening_float'] + shift['cash_sales'] + shift['cash_in_total'] - shift['cash_out_total']
            variance = actual_cash - expected_cash

            cursor.execute("""
            UPDATE shifts SET 
                closing_time = datetime('now', 'localtime'),
                closing_actual_cash = ?,
                expected_cash = ?,
                variance = ?,
                status = 'closed',
                notes = ?
            WHERE id = ?
            """, (actual_cash, expected_cash, variance, notes, shift_id))
            
            conn.commit()

            # Return Z-Report summary
            cursor.execute("""
            SELECT s.*, u.full_name as cashier_name
            FROM shifts s JOIN users u ON s.user_id = u.id WHERE s.id = ?
            """, (shift_id,))
            z_report = dict(cursor.fetchone())
            self.send_json({"success": True, "z_report": z_report})
            conn.close()
            return

        # 8. Create Order / Checkout (ACID Transaction)
        if path == '/api/orders':
            try:
                shift_id = data.get('shift_id')
                user_id = data.get('user_id')
                customer_id = data.get('customer_id')
                items = data.get('items', [])
                payment_method = data.get('payment_method', 'cash')
                cash_tendered = float(data.get('cash_tendered', 0.0))
                discount_amount = float(data.get('discount_amount', 0.0))
                tax_amount = float(data.get('tax_amount', 0.0))

                if not items:
                    self.send_error_json("Cannot process empty order", 400)
                    conn.close()
                    return

                # Calculate totals
                subtotal = sum(float(i['unit_price']) * float(i['quantity']) for i in items)
                grand_total = subtotal - discount_amount + tax_amount
                change_due = max(0.0, cash_tendered - grand_total) if payment_method == 'cash' else 0.0

                # Generate professional invoice number (INV-YYYYMMDD-XXXX)
                today_prefix = datetime.now().strftime("%Y%m%d")
                cursor.execute("SELECT COUNT(*) FROM orders WHERE invoice_number LIKE ?", (f"INV-{today_prefix}-%",))
                daily_count = cursor.fetchone()[0] + 1
                invoice_number = f"INV-{today_prefix}-{daily_count:04d}"

                # 1. Insert Order
                cursor.execute("""
                INSERT INTO orders (
                    invoice_number, shift_id, user_id, customer_id, subtotal, discount_amount, 
                    tax_amount, grand_total, payment_method, cash_tendered, change_due, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
                """, (invoice_number, shift_id, user_id, customer_id, subtotal, discount_amount, 
                      tax_amount, grand_total, payment_method, cash_tendered, change_due))
                order_id = cursor.lastrowid

                # 2. Insert Line Items and Deduct Inventory atomically
                for itm in items:
                    prod_id = itm['product_id']
                    qty = float(itm['quantity'])
                    price = float(itm['unit_price'])
                    item_discount = float(itm.get('discount_amount', 0.0))
                    line_total = (qty * price) - item_discount

                    # Fetch current cost and stock
                    cursor.execute("SELECT cost_price, stock_quantity, name, barcode FROM products WHERE id = ?", (prod_id,))
                    prod = cursor.fetchone()
                    cost = prod['cost_price'] if prod else 0.0
                    cur_stock = prod['stock_quantity'] if prod else 0.0
                    p_name = itm.get('product_name', prod['name'] if prod else 'Unknown')
                    barcode = itm.get('barcode', prod['barcode'] if prod else '')

                    cursor.execute("""
                    INSERT INTO order_items (order_id, product_id, product_name, barcode, unit_price, cost_price, quantity, discount_amount, line_total)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (order_id, prod_id, p_name, barcode, price, cost, qty, item_discount, line_total))

                    # Deduct stock
                    new_stock = cur_stock - qty
                    cursor.execute("UPDATE products SET stock_quantity = ? WHERE id = ?", (new_stock, prod_id))

                    # Record movement
                    cursor.execute("""
                    INSERT INTO stock_movements (product_id, change_quantity, balance_after, movement_type, reference_id, user_id)
                    VALUES (?, ?, ?, 'sale', ?, ?)
                    """, (prod_id, -qty, new_stock, invoice_number, user_id))

                # 3. Update Shift Sales Totals
                if shift_id:
                    if payment_method == 'cash':
                        cursor.execute("UPDATE shifts SET cash_sales = cash_sales + ? WHERE id = ?", (grand_total, shift_id))
                    elif payment_method == 'card':
                        cursor.execute("UPDATE shifts SET card_sales = card_sales + ? WHERE id = ?", (grand_total, shift_id))
                    elif payment_method == 'credit':
                        cursor.execute("UPDATE shifts SET credit_sales = credit_sales + ? WHERE id = ?", (grand_total, shift_id))

                # 4. Update Customer Loyalty & Credit
                if customer_id:
                    # 1 point per 100 currency units
                    earned_points = int(grand_total // 100)
                    if payment_method == 'credit':
                        cursor.execute("UPDATE customers SET credit_balance = credit_balance + ?, loyalty_points = loyalty_points + ? WHERE id = ?", (grand_total, earned_points, customer_id))
                    else:
                        cursor.execute("UPDATE customers SET loyalty_points = loyalty_points + ? WHERE id = ?", (earned_points, customer_id))

                conn.commit()

                # Fetch completed order for receipt
                cursor.execute("""
                SELECT o.*, u.full_name as cashier_name, c.name as customer_name, c.phone as customer_phone
                FROM orders o
                JOIN users u ON o.user_id = u.id
                LEFT JOIN customers c ON o.customer_id = c.id
                WHERE o.id = ?
                """, (order_id,))
                completed_order = dict(cursor.fetchone())
                cursor.execute("SELECT * FROM order_items WHERE order_id = ?", (order_id,))
                completed_order['items'] = [dict(it) for it in cursor.fetchall()]

                self.send_json({
                    "success": True,
                    "order": completed_order
                })
            except Exception as e:
                conn.rollback()
                self.send_error_json(f"Checkout transaction failed: {str(e)}", 500)
            finally:
                conn.close()
            return

        # 9. Hold (Park) Bill
        if path == '/api/orders/hold':
            items = data.get('items', [])
            if not items:
                self.send_error_json("Cannot hold empty cart", 400)
                conn.close()
                return

            label = data.get('label', f"Queue #{datetime.now().strftime('%H:%M:%S')}")
            user_id = data.get('user_id', 1)
            customer_id = data.get('customer_id')
            subtotal = sum(float(i['unit_price']) * float(i['quantity']) for i in items)
            today_prefix = datetime.now().strftime("%Y%m%d")
            inv_no = f"HOLD-{today_prefix}-{datetime.now().strftime('%H%M%S')}"

            cursor.execute("""
            INSERT INTO orders (invoice_number, user_id, customer_id, subtotal, grand_total, status, held_label)
            VALUES (?, ?, ?, ?, ?, 'held', ?)
            """, (inv_no, user_id, customer_id, subtotal, subtotal, label))
            order_id = cursor.lastrowid

            for itm in items:
                cursor.execute("""
                INSERT INTO order_items (order_id, product_id, product_name, barcode, unit_price, cost_price, quantity, line_total)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (order_id, itm['product_id'], itm['product_name'], itm.get('barcode', ''), itm['unit_price'], 0, itm['quantity'], itm['unit_price'] * itm['quantity']))

            conn.commit()
            self.send_json({"success": True, "held_order_id": order_id, "label": label})
            conn.close()
            return

        # 10. Resume or Delete Held Bill
        if path.startswith('/api/orders/held/resume/'):
            held_id = int(path.replace('/api/orders/held/resume/', ''))
            cursor.execute("SELECT * FROM orders WHERE id = ? AND status = 'held'", (held_id,))
            held_order = cursor.fetchone()
            if not held_order:
                self.send_error_json("Held order not found", 404)
                conn.close()
                return

            cursor.execute("SELECT * FROM order_items WHERE order_id = ?", (held_id,))
            items = [dict(r) for r in cursor.fetchall()]
            
            # Delete held order so it can be re-worked in cart
            cursor.execute("DELETE FROM order_items WHERE order_id = ?", (held_id,))
            cursor.execute("DELETE FROM orders WHERE id = ?", (held_id,))
            conn.commit()

            order_data = dict(held_order)
            order_data['items'] = items
            self.send_json({"success": True, "resumed_order": order_data})
            conn.close()
            return

        # 11. Add Customer
        if path == '/api/customers':
            name = data.get('name', '').strip()
            phone = data.get('phone', '').strip()
            email = data.get('email', '').strip()
            address = data.get('address', '').strip()

            if not name:
                self.send_error_json("Customer name is required", 400)
                conn.close()
                return

            try:
                cursor.execute("""
                INSERT INTO customers (name, phone, email, address)
                VALUES (?, ?, ?, ?)
                """, (name, phone, email, address))
                cust_id = cursor.lastrowid
                conn.commit()
                self.send_json({"success": True, "customer_id": cust_id})
            except sqlite3.IntegrityError:
                self.send_error_json("Customer with this phone already exists", 400)
            conn.close()
            return

        self.send_error_json(f"Unknown POST endpoint: {path}", 404)
        conn.close()

def run_server(port=PORT):
    init_db()
    # Check if seed data exists
    from seed_data import seed_retail_data
    seed_retail_data()

    server_address = ('', port)
    httpd = socketserver.TCPServer(server_address, POSRequestHandler)
    print(f"==================================================")
    print(f"  Metro Retail POS Server running on port {port}")
    print(f"  Access URL: http://localhost:{port}")
    print(f"==================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping POS server...")
        httpd.server_close()

if __name__ == '__main__':
    run_server()
