/**
 * Inventory & Product Management
 * Graphical Modals for Adding, Editing, Restocking, and Deleting Products
 */

const InventoryManager = {
    products: [],
    currentAdjustType: 'restock',

    async loadInventory() {
        const tableBody = document.getElementById('inventory-table-body');
        if (!tableBody) return;

        try {
            const res = await fetch('/api/products');
            this.products = await res.json();
            this.renderInventoryTable(this.products);
        } catch (e) {
            console.error("Failed to load inventory:", e);
        }
    },

    filterTable(searchTerm) {
        if (!searchTerm) {
            this.renderInventoryTable(this.products);
            return;
        }
        const term = searchTerm.toLowerCase();
        const filtered = this.products.filter(p => 
            p.name.toLowerCase().includes(term) ||
            p.barcode.toLowerCase().includes(term) ||
            (p.sku && p.sku.toLowerCase().includes(term))
        );
        this.renderInventoryTable(filtered);
    },

    renderInventoryTable(items) {
        const tableBody = document.getElementById('inventory-table-body');
        if (!tableBody) return;

        if (items.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 30px; color: #94a3b8;">No products found in inventory</td></tr>`;
            return;
        }

        let html = '';
        items.forEach(p => {
            const isLow = Number(p.stock_quantity) <= Number(p.min_stock_level);
            html += `
                <tr>
                    <td style="font-family: monospace; font-weight: bold; color: #1e293b;">${p.barcode}</td>
                    <td style="font-weight: 700;">${p.name}</td>
                    <td><span class="stock-tag" style="background:#e0e7ff; color:#3730a3;">${p.category_name || 'General'}</span></td>
                    <td class="text-right">${ReceiptManager.formatCurrency(p.cost_price)}</td>
                    <td class="text-right" style="font-weight: bold; color: var(--primary);">${ReceiptManager.formatCurrency(p.selling_price)}</td>
                    <td class="text-center">
                        <span class="stock-tag ${isLow ? 'low' : ''}">
                            ${p.stock_quantity} ${p.unit} ${isLow ? '⚠️ LOW' : ''}
                        </span>
                    </td>
                    <td class="text-right" style="white-space: nowrap;">
                        <button class="btn btn-secondary" style="padding: 5px 10px; font-size: 11px; display: inline-flex;" onclick="InventoryManager.openStockAdjustModal(${p.id})">Restock</button>
                        <button class="btn btn-primary" style="padding: 5px 10px; font-size: 11px; display: inline-flex; margin-left: 4px;" onclick="InventoryManager.openEditModal(${p.id})">Edit</button>
                        <button class="btn btn-danger" style="padding: 5px 8px; font-size: 11px; display: inline-flex; margin-left: 4px;" onclick="InventoryManager.openDeleteModal(${p.id})" title="Remove item from inventory">🗑️</button>
                    </td>
                </tr>
            `;
        });
        tableBody.innerHTML = html;
    },

    // 1. Graphical Add / Edit Product Modal
    openAddProductModal() {
        this.openEditModal(null);
    },

    openEditModal(productId) {
        const modal = document.getElementById('product-modal');
        if (!modal) return;

        // Populate Category Dropdown
        const catSelect = document.getElementById('prod-modal-category');
        if (catSelect && window.POS_STATE?.categories) {
            catSelect.innerHTML = window.POS_STATE.categories.map(c => 
                `<option value="${c.id}">${c.name}</option>`
            ).join('');
        }

        const titleEl = document.getElementById('product-modal-title');
        const idInput = document.getElementById('prod-modal-id');
        const barcodeInput = document.getElementById('prod-modal-barcode');
        const skuInput = document.getElementById('prod-modal-sku');
        const nameInput = document.getElementById('prod-modal-name');
        const costInput = document.getElementById('prod-modal-cost');
        const priceInput = document.getElementById('prod-modal-price');
        const stockInput = document.getElementById('prod-modal-stock');
        const minStockInput = document.getElementById('prod-modal-min-stock');
        const unitSelect = document.getElementById('prod-modal-unit');

        if (productId) {
            const prod = this.products.find(p => p.id === productId);
            if (!prod) return;
            titleEl.innerText = `✏️ Edit Product: ${prod.name}`;
            idInput.value = prod.id;
            barcodeInput.value = prod.barcode;
            skuInput.value = prod.sku || prod.barcode;
            nameInput.value = prod.name;
            if (catSelect) catSelect.value = prod.category_id || 1;
            costInput.value = prod.cost_price;
            priceInput.value = prod.selling_price;
            stockInput.value = prod.stock_quantity;
            minStockInput.value = prod.min_stock_level;
            if (unitSelect) unitSelect.value = prod.unit || 'pcs';
        } else {
            titleEl.innerText = `📦 Add New Product`;
            idInput.value = '';
            barcodeInput.value = '';
            skuInput.value = '';
            nameInput.value = '';
            costInput.value = '0.00';
            priceInput.value = '0.00';
            stockInput.value = '10';
            minStockInput.value = '5';
            if (unitSelect) unitSelect.value = 'pcs';
        }

        modal.classList.add('active');
        setTimeout(() => {
            if (!productId) barcodeInput.focus();
            else nameInput.focus();
        }, 100);
    },

    closeProductModal() {
        const modal = document.getElementById('product-modal');
        if (modal) modal.classList.remove('active');
    },

    async saveProductModal() {
        const prodId = document.getElementById('prod-modal-id').value;
        const barcode = document.getElementById('prod-modal-barcode').value.trim();
        const sku = document.getElementById('prod-modal-sku').value.trim() || barcode;
        const name = document.getElementById('prod-modal-name').value.trim();
        const categoryId = document.getElementById('prod-modal-category').value;
        const cost = parseFloat(document.getElementById('prod-modal-cost').value) || 0;
        const price = parseFloat(document.getElementById('prod-modal-price').value) || 0;
        const stock = parseFloat(document.getElementById('prod-modal-stock').value) || 0;
        const minStock = parseFloat(document.getElementById('prod-modal-min-stock').value) || 5;
        const unit = document.getElementById('prod-modal-unit').value || 'pcs';

        if (!barcode || !name) {
            App.toast("Barcode and Product Name are required!", "error");
            return;
        }

        try {
            const res = await fetch('/api/products/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: prodId || undefined,
                    barcode, sku, name,
                    category_id: categoryId,
                    cost_price: cost,
                    selling_price: price,
                    stock_quantity: stock,
                    min_stock_level: minStock,
                    unit
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                this.closeProductModal();
                App.toast(`Product "${name}" saved successfully!`);
                this.loadInventory();
                if (window.App && window.App.loadProducts) {
                    window.App.loadProducts();
                }
            } else {
                App.toast(data.message || "Failed to save product", "error");
            }
        } catch (e) {
            console.error(e);
            App.toast("Error saving product to server", "error");
        }
    },

    // 2. Graphical Delete Product Modal
    openDeleteModal(productId) {
        const prod = this.products.find(p => p.id === productId);
        if (!prod) return;

        const modal = document.getElementById('delete-product-modal');
        if (!modal) return;

        document.getElementById('delete-modal-prod-id').value = prod.id;
        document.getElementById('delete-modal-prod-name').innerText = `"${prod.name}" (Barcode: ${prod.barcode})`;
        modal.classList.add('active');
    },

    closeDeleteModal() {
        const modal = document.getElementById('delete-product-modal');
        if (modal) modal.classList.remove('active');
    },

    async confirmDeleteProduct() {
        const prodId = document.getElementById('delete-modal-prod-id').value;
        if (!prodId) return;

        try {
            const res = await fetch('/api/products/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: prodId })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                this.closeDeleteModal();
                App.toast("Product removed from inventory successfully!", "info");
                this.loadInventory();
                if (window.App && window.App.loadProducts) {
                    window.App.loadProducts();
                }
            } else {
                App.toast(data.message || "Failed to delete product", "error");
            }
        } catch (e) {
            console.error(e);
            App.toast("Error removing product", "error");
        }
    },

    // 3. Graphical Stock Adjustment / Restock Modal
    openStockAdjustModal(productId) {
        const prod = this.products.find(p => p.id === productId);
        if (!prod) return;

        const modal = document.getElementById('stock-adjust-modal');
        if (!modal) return;

        document.getElementById('adjust-prod-id').value = prod.id;
        document.getElementById('adjust-prod-name').innerText = prod.name;
        document.getElementById('adjust-prod-current-stock').innerText = `${prod.stock_quantity} ${prod.unit}`;
        document.getElementById('adjust-modal-qty').value = "10";
        document.getElementById('adjust-modal-notes').value = "";
        
        this.setAdjustType('restock', document.querySelector('.type-selector-pill[data-type="restock"]'));
        modal.classList.add('active');

        setTimeout(() => {
            const qtyInput = document.getElementById('adjust-modal-qty');
            if (qtyInput) {
                qtyInput.focus();
                qtyInput.select();
            }
        }, 100);
    },

    closeStockAdjustModal() {
        const modal = document.getElementById('stock-adjust-modal');
        if (modal) modal.classList.remove('active');
    },

    setAdjustType(type, element) {
        this.currentAdjustType = type;
        document.querySelectorAll('.type-selector-pill').forEach(el => el.classList.remove('active'));
        if (element) element.classList.add('active');

        const label = document.getElementById('adjust-qty-label');
        if (type === 'restock') {
            label.innerText = "Quantity to ADD (+)";
        } else if (type === 'damage') {
            label.innerText = "Quantity DAMAGED / RETURNED (Deducts -)";
        } else if (type === 'audit') {
            label.innerText = "Adjustment Difference (+/-)";
        }
    },

    async submitStockAdjustment() {
        const prodId = document.getElementById('adjust-prod-id').value;
        const qtyVal = parseFloat(document.getElementById('adjust-modal-qty').value) || 0;
        let notes = document.getElementById('adjust-modal-notes').value.trim();

        if (qtyVal === 0) {
            App.toast("Please enter a valid quantity", "error");
            return;
        }

        let finalQty = qtyVal;
        let reason = "Supplier Restock";

        if (this.currentAdjustType === 'damage') {
            finalQty = -Math.abs(qtyVal);
            reason = "Damaged / Expired Goods";
            notes = notes || "Damaged stock removal";
        } else if (this.currentAdjustType === 'audit') {
            reason = "Inventory Audit Adjustment";
            notes = notes || "Physical stock count adjustment";
        } else {
            notes = notes || "Supplier Purchase / GRN";
        }

        try {
            const res = await fetch('/api/inventory/adjust', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    product_id: prodId,
                    quantity: finalQty,
                    reason: reason,
                    notes: notes,
                    user_id: window.POS_STATE?.currentUser?.id || 1
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                this.closeStockAdjustModal();
                App.toast(`Stock updated! New balance: ${data.new_stock}`);
                this.loadInventory();
                if (window.App && window.App.loadProducts) {
                    window.App.loadProducts();
                }
            } else {
                App.toast(data.message || "Failed to adjust stock", "error");
            }
        } catch (e) {
            console.error(e);
            App.toast("Server error updating stock", "error");
        }
    }
};

window.InventoryManager = InventoryManager;
