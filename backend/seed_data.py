"""
Seed realistic retail product catalog, categories, and test customers.
"""

from database import get_db, init_db

def seed_retail_data():
    init_db()
    conn = get_db()
    cursor = conn.cursor()

    # Check if products already exist
    cursor.execute("SELECT COUNT(*) FROM products")
    if cursor.fetchone()[0] > 0:
        print("Database already contains product data.")
        conn.close()
        return

    # 1. Categories
    categories = [
        ("Groceries & Food", "shopping-bag", "#3b82f6"),
        ("Beverages & Drinks", "coffee", "#10b981"),
        ("Snacks & Confectionery", "cookie", "#f59e0b"),
        ("Personal Care", "heart", "#ec4899"),
        ("Household Cleaning", "home", "#8b5cf6"),
        ("Dairy & Bakery", "cake", "#ef4444")
    ]
    cursor.executemany("INSERT INTO categories (name, icon, color) VALUES (?, ?, ?)", categories)
    
    # Map category names to IDs
    cursor.execute("SELECT id, name FROM categories")
    cat_map = {row["name"]: row["id"] for row in cursor.fetchall()}

    # 2. Products (Retail Items with Barcodes)
    # Both realistic 13-digit retail barcodes AND quick 3-4 digit demo codes for fast cashier testing
    products = [
        # Groceries
        ("4792001001", "GRO-001", "Keeri Samba Rice 5kg", cat_map["Groceries & Food"], 1250.00, 1450.00, 45, 10, "bag"),
        ("4792001002", "GRO-002", "Nadu Rice 5kg", cat_map["Groceries & Food"], 950.00, 1150.00, 60, 15, "bag"),
        ("4792001003", "GRO-003", "White Sugar 1kg", cat_map["Groceries & Food"], 240.00, 275.00, 120, 25, "kg"),
        ("4792001004", "GRO-004", "Red Dhal (Mysore) 1kg", cat_map["Groceries & Food"], 310.00, 360.00, 85, 20, "kg"),
        ("4792001005", "GRO-005", "Anchor Milk Powder 400g", cat_map["Groceries & Food"], 980.00, 1090.00, 35, 8, "pack"),
        ("4792001006", "GRO-006", "Dilmah Ceylon Tea 200g", cat_map["Groceries & Food"], 380.00, 460.00, 50, 10, "pack"),
        ("4792001007", "GRO-007", "Flora Sunflower Oil 1L", cat_map["Groceries & Food"], 820.00, 980.00, 4, 10, "bottle"), # Low Stock!
        
        # Beverages
        ("4792002001", "BEV-001", "Coca-Cola 1.5L PET", cat_map["Beverages & Drinks"], 340.00, 420.00, 40, 10, "bottle"),
        ("4792002002", "BEV-002", "Elephant House Cream Soda 1.5L", cat_map["Beverages & Drinks"], 320.00, 400.00, 55, 12, "bottle"),
        ("4792002003", "BEV-003", "Sprite 400ml", cat_map["Beverages & Drinks"], 140.00, 180.00, 80, 15, "bottle"),
        ("4792002004", "BEV-004", "Highland Fresh Milk 1L", cat_map["Beverages & Drinks"], 410.00, 480.00, 3, 10, "carton"), # Low Stock!
        ("4792002005", "BEV-005", "Mineral Drinking Water 1L", cat_map["Beverages & Drinks"], 80.00, 120.00, 150, 30, "bottle"),
        
        # Snacks & Confectionery
        ("4792003001", "SNK-001", "Munchee Super Cream Cracker 500g", cat_map["Snacks & Confectionery"], 360.00, 440.00, 95, 20, "pack"),
        ("4792003002", "SNK-002", "Maliban Lemon Puff 200g", cat_map["Snacks & Confectionery"], 190.00, 240.00, 110, 25, "pack"),
        ("4792003003", "SNK-003", "Kist Chilly Garlic Sauce 375g", cat_map["Snacks & Confectionery"], 380.00, 470.00, 25, 5, "bottle"),
        ("4792003004", "SNK-004", "Kandos Hazelnut Chocolate 100g", cat_map["Snacks & Confectionery"], 280.00, 370.00, 30, 8, "bar"),
        ("4792003005", "SNK-005", "Ritzbury Dark Chocolate 50g", cat_map["Snacks & Confectionery"], 160.00, 220.00, 60, 15, "bar"),

        # Personal Care
        ("4792004001", "PER-001", "Lifebuoy Total Soap 100g", cat_map["Personal Care"], 120.00, 160.00, 140, 25, "bar"),
        ("4792004002", "PER-002", "Dettol Original Soap 100g", cat_map["Personal Care"], 140.00, 185.00, 85, 20, "bar"),
        ("4792004003", "PER-003", "Sunsilk Black Shine Shampoo 180ml", cat_map["Personal Care"], 390.00, 490.00, 2, 8, "bottle"), # Low Stock!
        ("4792004004", "PER-004", "Signal Triple Protection Toothpaste 160g", cat_map["Personal Care"], 210.00, 270.00, 75, 15, "tube"),

        # Household Cleaning
        ("4792005001", "HOU-001", "Sunlight Washing Powder 1kg", cat_map["Household Cleaning"], 380.00, 460.00, 65, 15, "pack"),
        ("4792005002", "HOU-002", "Vim Dishwash Liquid 500ml", cat_map["Household Cleaning"], 290.00, 370.00, 40, 10, "bottle"),
        ("4792005003", "HOU-003", "Harpic Power Plus 500ml", cat_map["Household Cleaning"], 320.00, 410.00, 30, 8, "bottle"),

        # Bakery & Dairy
        ("4792006001", "BAK-001", "Prima Special Sandwich Bread 450g", cat_map["Dairy & Bakery"], 140.00, 170.00, 40, 10, "loaf"),
        ("4792006002", "BAK-002", "Farm Fresh Brown Eggs (Pack of 10)", cat_map["Dairy & Bakery"], 480.00, 560.00, 35, 10, "pack"),
        ("4792006003", "BAK-003", "Astra Fat Spread Butter 250g", cat_map["Dairy & Bakery"], 330.00, 420.00, 50, 12, "tub")
    ]

    for p in products:
        cursor.execute("""
        INSERT INTO products (barcode, sku, name, category_id, cost_price, selling_price, stock_quantity, min_stock_level, unit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, p)

    # 3. Seed Customers
    customers = [
        ("General Walk-in Customer", "0000000000", "", "Retail Store", 0, 0.0),
        ("Sunil Shantha", "0771234567", "sunil@gmail.com", "Colombo 05", 150, 0.0),
        ("Niroshan Dickwella", "0719876543", "niro@yahoo.com", "Nugegoda", 320, 1250.00),
        ("Priyani Jayawardena", "0765554321", "priyani@gmail.com", "Maharagama", 85, 0.0),
        ("Kamal Gunaratne", "0751122334", "kamal@office.lk", "Rajagiriya", 210, 0.0)
    ]
    cursor.executemany("""
    INSERT INTO customers (name, phone, email, address, loyalty_points, credit_balance)
    VALUES (?, ?, ?, ?, ?, ?)
    """, customers)

    conn.commit()
    conn.close()
    print("Seed retail data inserted successfully.")

if __name__ == "__main__":
    seed_retail_data()
