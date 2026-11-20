/**
 * Metro POS Main Application Controller
 */

window.POS_STATE = {
    currentUser: { id: 1, username: 'admin', full_name: 'Store Manager', role: 'admin' },
    settings: {},
    activeShift: null,
    categories: [],
    products: [],
    activeCategory: 'all',
    heldOrders: []
};

const App = {
    async init() {
        console.log("Initializing Metro POS System...");
        await this.loadSettings();
        await this.loadCategories();
        await this.loadProducts();
        await ShiftManager.checkActiveShift();
        await this.loadHeldOrdersCount();
        
        POS.init();
        this.setupNavigation();
        this.setupEventListeners();
    },

    // 1. Settings
    async loadSettings() {
        try {
            const res = await fetch('/api/settings');
            window.POS_STATE.settings = await res.json();
            POS.taxRate = parseFloat(window.POS_STATE.settings.default_tax_rate || 0);

            // Update DOM headers
            const storeNameEl = document.getElementById('header-store-name');
            if (storeNameEl) storeNameEl.innerText = window.POS_STATE.settings.store_name || "Metro Retail Mart";
        } catch (e) {
            console.error("Settings load error:", e);
        }
    },

    // 2. Categories
    async loadCategories() {
        try {
            const res = await fetch('/api/categories');
            window.POS_STATE.categories = await res.json();
            this.renderCategorySlider();
        } catch (e) {
            console.error("Categories load error:", e);
        }
    },

    renderCategorySlider() {
        const slider = document.getElementById('category-slider');
        if (!slider) return;

        let html = `<div class="cat-pill active" data-cat="all" onclick="App.filterCategory('all', this)">⚡ All Items</div>`;
        window.POS_STATE.categories.forEach(cat => {
            html += `<div class="cat-pill" data-cat="${cat.id}" onclick="App.filterCategory(${cat.id}, this)">${cat.name} (${cat.product_count})</div>`;
        });
        slider.innerHTML = html;
    },

    filterCategory(catId, element) {
        window.POS_STATE.activeCategory = catId;
        document.querySelectorAll('.cat-pill').forEach(el => el.classList.remove('active'));
        if (element) element.classList.add('active');
        this.loadProducts();
    },

    // 3. Products
    async loadProducts() {
        const cat = window.POS_STATE.activeCategory;
        const searchInput = document.getElementById('barcode-search-input');
        const term = searchInput ? searchInput.value.trim() : '';

        let url = `/api/products?category_id=${cat}`;
        if (term) url += `&search=${encodeURIComponent(term)}`;

        try {
            const res = await fetch(url);
            window.POS_STATE.products = await res.json();
            this.renderProductGrid(window.POS_STATE.products);
        } catch (e) {
            console.error("Products load error:", e);
        }
    },

    renderProductGrid(products) {
        const grid = document.getElementById('product-grid');
        if (!grid) return;

        if (products.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #94a3b8;">No matching products found.</div>`;
            return;
        }

        let html = '';
        products.forEach(p => {
            const isLow = Number(p.stock_quantity) <= Number(p.min_stock_level);
            html += `
                <div class="product-card" onclick="POS.addToCart(${JSON.stringify(p).replace(/"/g, '&quot;')})">
                    <div class="product-top">
                        <span class="product-category-tag">${p.category_name || 'Item'}</span>
                        <span class="stock-tag ${isLow ? 'low' : ''}">${p.stock_quantity} ${p.unit}</span>
                    </div>
                    <div class="product-title" title="${p.name}">${p.name}</div>
                    <div class="product-bottom">
                        <div class="product-price">${ReceiptManager.formatCurrency(p.selling_price)}</div>
                        <div class="product-barcode-code">${p.barcode}</div>
                    </div>
                </div>
            `;
        });
        grid.innerHTML = html;
    },

    // 4. Navigation & Views
    setupNavigation() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                this.switchView(view);
            });
        });
    },

    switchView(viewName) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === viewName);
        });

        document.querySelectorAll('.page-view').forEach(view => {
            view.classList.toggle('active', view.id === `view-${viewName}`);
        });

        // Trigger view-specific data reloads
        if (viewName === 'inventory') {
            InventoryManager.loadInventory();
        } else if (viewName === 'held') {
            this.loadHeldOrders();
        } else if (viewName === 'orders') {
            this.loadOrdersHistory();
        } else if (viewName === 'customers') {
            this.loadCustomersList();
        } else if (viewName === 'reports') {
            ReportsManager.loadDashboard();
        } else if (viewName === 'pos') {
            // Refocus barcode input
            setTimeout(() => {
                const input = document.getElementById('barcode-search-input');
                if (input) input.focus();
            }, 100);
        }
    },

    // 5. Held Orders
    async loadHeldOrdersCount() {
        try {
            const res = await fetch('/api/orders/held');
            const orders = await res.json();
            const badge = document.getElementById('held-orders-badge');
            if (badge) {
                badge.innerText = orders.length;
                badge.style.display = orders.length > 0 ? 'inline' : 'none';
            }
        } catch (e) {
            console.error(e);
        }
    },

    async loadHeldOrders() {
        const container = document.getElementById('held-orders-list');
        if (!container) return;

        try {
            const res = await fetch('/api/orders/held');
            const orders = await res.json();
            this.loadHeldOrdersCount();

            if (orders.length === 0) {
                container.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8;">No currently parked or held orders.</div>`;
                return;
            }

            let html = '';
            orders.forEach(o => {
                html += `
                    <div style="background: white; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; box-shadow: var(--shadow-sm);">
                        <div>
                            <div style="font-weight: 800; font-size: 15px; color: var(--primary);">${o.held_label || o.invoice_number}</div>
                            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
                                Parked: ${o.created_at} • Cashier: ${o.cashier_name} • ${o.items.length} items
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 16px; font-weight: 800;">${ReceiptManager.formatCurrency(o.grand_total)}</div>
                            <button class="btn btn-primary" style="padding: 6px 14px; font-size: 12px; margin-top: 6px; display: inline-flex;" onclick="App.resumeHeldOrder(${o.id})">Resume to Cart (F8)</button>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        } catch (e) {
            console.error(e);
        }
    },

    async resumeHeldOrder(heldId) {
        try {
            const res = await fetch(`/api/orders/held/resume/${heldId}`);
            const data = await res.json();
            if (res.ok && data.success) {
                const resumed = data.resumed_order;
                POS.cart = resumed.items.map(it => ({
                    product_id: it.product_id,
                    name: it.product_name,
                    barcode: it.barcode,
                    unit_price: it.unit_price,
                    quantity: it.quantity,
                    discount_amount: it.discount_amount || 0,
                    line_total: it.line_total,
                    unit: 'pcs'
                }));
                POS.renderCart();
                this.switchView('pos');
                this.loadHeldOrdersCount();
            }
        } catch (e) {
            console.error(e);
        }
    },

    // 6. Sales History Invoices
    async loadOrdersHistory() {
        const tbody = document.getElementById('orders-table-body');
        if (!tbody) return;

        try {
            const res = await fetch('/api/orders');
            const orders = await res.json();
            if (orders.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 30px; color: #94a3b8;">No invoices found</td></tr>`;
                return;
            }

            let html = '';
            orders.forEach(o => {
                html += `
                    <tr>
                        <td style="font-family: monospace; font-weight: bold; color: var(--primary);">${o.invoice_number}</td>
                        <td>${o.created_at}</td>
                        <td>${o.customer_name || 'Walk-in'}</td>
                        <td>${o.cashier_name}</td>
                        <td><span class="stock-tag" style="text-transform: uppercase;">${o.payment_method}</span></td>
                        <td class="text-right" style="font-weight: bold;">${ReceiptManager.formatCurrency(o.grand_total)}</td>
                        <td class="text-right">
                            <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 11px; display: inline-flex;" onclick="App.viewInvoice('${o.invoice_number}')">View / Print</button>
                        </td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        } catch (e) {
            console.error(e);
        }
    },

    async viewInvoice(invoiceNumber) {
        try {
            const res = await fetch(`/api/orders/invoice/${invoiceNumber}`);
            const order = await res.json();
            if (res.ok) {
                ReceiptManager.showReceiptModal(order);
            }
        } catch (e) {
            console.error(e);
        }
    },

    // 7. Customers & Toast Notification
    toast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icon = type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ');
        toast.innerHTML = `<span style="font-weight: 900; font-size: 16px;">${icon}</span> <span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 250);
        }, 3200);
    },

    async loadCustomersList() {
        const tbody = document.getElementById('customers-table-body');
        if (!tbody) return;

        try {
            const res = await fetch('/api/customers');
            const customers = await res.json();
            let html = '';
            customers.forEach(c => {
                html += `
                    <tr>
                        <td style="font-weight: bold;">${c.name}</td>
                        <td style="font-family: monospace;">${c.phone || '-'}</td>
                        <td>${c.email || '-'}</td>
                        <td>${c.address || '-'}</td>
                        <td class="text-center"><span class="badge">${c.loyalty_points} pts</span></td>
                        <td class="text-right" style="font-weight: bold; color: ${c.credit_balance > 0 ? 'var(--danger)' : 'var(--success)'};">${ReceiptManager.formatCurrency(c.credit_balance)}</td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        } catch (e) {
            console.error(e);
        }
    },

    selectCustomerModal() {
        const modal = document.getElementById('customer-modal');
        if (!modal) return;
        this.setCustomerTab('search');
        this.liveCustomerSearch('');
        modal.classList.add('active');
        const searchInput = document.getElementById('cust-search-input');
        if (searchInput) {
            searchInput.value = '';
            setTimeout(() => searchInput.focus(), 100);
        }
    },

    closeCustomerModal() {
        const modal = document.getElementById('customer-modal');
        if (modal) modal.classList.remove('active');
    },

    setCustomerTab(tab) {
        const isSearch = tab === 'search';
        document.getElementById('cust-tab-search').classList.toggle('active', isSearch);
        document.getElementById('cust-tab-new').classList.toggle('active', !isSearch);
        document.getElementById('cust-panel-search').style.display = isSearch ? 'block' : 'none';
        document.getElementById('cust-panel-new').style.display = isSearch ? 'none' : 'block';
    },

    async liveCustomerSearch(query) {
        const list = document.getElementById('cust-search-results');
        if (!list) return;

        try {
            const res = await fetch(`/api/customers?search=${encodeURIComponent(query.trim())}`);
            const custs = await res.json();
            if (custs.length === 0) {
                list.innerHTML = `
                    <div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 13px;">
                        No customer found matching "${query}". 
                        <br><a href="javascript:void(0)" onclick="App.setCustomerTab('new')" style="color: var(--primary); font-weight: bold; display: inline-block; margin-top: 6px;">+ Register as New Customer</a>
                    </div>
                `;
                return;
            }

            let html = '';
            custs.forEach(c => {
                html += `
                    <div class="customer-list-item" onclick="App.selectCustomer(${JSON.stringify(c).replace(/"/g, '&quot;')})">
                        <div>
                            <div style="font-weight: 700; font-size: 14px;">${c.name}</div>
                            <div style="font-size: 11px; color: var(--text-secondary); font-family: monospace;">${c.phone || 'No phone'} ${c.address ? '• ' + c.address : ''}</div>
                        </div>
                        <div style="text-align: right;">
                            <span class="badge" style="background:#e0e7ff; color:#3730a3; margin-bottom: 2px;">${c.loyalty_points} Loyalty pts</span>
                            ${c.credit_balance > 0 ? `<div style="font-size: 11px; color: var(--danger); font-weight: bold;">Due: ${ReceiptManager.formatCurrency(c.credit_balance)}</div>` : ''}
                        </div>
                    </div>
                `;
            });
            list.innerHTML = html;
        } catch (e) {
            console.error(e);
        }
    },

    selectCustomer(customer) {
        POS.selectedCustomer = customer;
        const nameEl = document.getElementById('cart-selected-customer-name');
        if (nameEl) nameEl.innerText = `${customer.name} (${customer.loyalty_points} pts)`;
        this.closeCustomerModal();
        this.toast(`Customer "${customer.name}" linked to sale!`);
    },

    async submitNewCustomer() {
        const name = document.getElementById('new-cust-name').value.trim();
        const phone = document.getElementById('new-cust-phone').value.trim();
        const address = document.getElementById('new-cust-address').value.trim();

        if (!name || !phone) {
            this.toast("Please enter both Customer Name and Phone Number", "error");
            return;
        }

        try {
            const res = await fetch('/api/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, phone, address })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                const newCustomer = { id: data.customer_id, name, phone, address, loyalty_points: 0, credit_balance: 0 };
                this.selectCustomer(newCustomer);
                this.loadCustomersList();
                this.toast(`Customer "${name}" created successfully!`);
            } else {
                this.toast(data.message || "Failed to add customer", "error");
            }
        } catch (e) {
            console.error(e);
            this.toast("Server communication error", "error");
        }
    },

    openAddCustomerModal() {
        this.selectCustomerModal();
        this.setCustomerTab('new');
    },

    // 8. Event Listeners
    setupEventListeners() {
        const searchInput = document.getElementById('barcode-search-input');
        if (searchInput) {
            let debounceTimer;
            searchInput.addEventListener('input', () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    this.loadProducts();
                }, 200);
            });

            // Enter key on manual barcode search
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const val = searchInput.value.trim();
                    if (val) {
                        POS.handleBarcodeScanned(val);
                    }
                }
            });
        }
    }
};

window.App = App;

// Run on page load
window.addEventListener('DOMContentLoaded', () => {
    App.init();
});
