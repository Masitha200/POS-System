/**
 * POS Cashier Terminal Engine
 * Supports Barcode Scanners (HID), Keyboard Shortcuts, Touch Cart, Multi-payment, and Audio Feedback
 */

const POS = {
    cart: [],
    selectedCustomer: null,
    billDiscount: 0,
    billDiscountType: 'fixed', // 'fixed' or 'percent'
    taxRate: 0,
    currentPaymentMethod: 'cash',
    cashTendered: 0,

    // Web Audio Sound Synthesizer (No external audio files needed)
    audioCtx: null,

    initAudio() {
        if (!this.audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.audioCtx = new AudioContext();
            }
        }
    },

    playBeep(freq = 1200, duration = 0.08, type = 'sine') {
        try {
            this.initAudio();
            if (!this.audioCtx) return;
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.audioCtx.destination);
            osc.start();
            osc.stop(this.audioCtx.currentTime + duration);
        } catch (e) {
            // Audio policy might require user click
        }
    },

    playSuccessChime() {
        this.playBeep(987.77, 0.1); // B5
        setTimeout(() => this.playBeep(1318.51, 0.2), 100); // E6
    },

    playErrorBeep() {
        this.playBeep(300, 0.2, 'sawtooth');
    },

    init() {
        this.setupBarcodeScannerListener();
        this.setupKeyboardShortcuts();
        this.renderCart();
    },

    // 1. Universal Barcode Scanner Keystroke Listener
    setupBarcodeScannerListener() {
        let barcodeBuffer = '';
        let lastKeyTime = Date.now();

        window.addEventListener('keydown', (e) => {
            const currentTime = Date.now();
            const timeDiff = currentTime - lastKeyTime;
            lastKeyTime = currentTime;

            // Target elements where typing shouldn't be hijacked unless rapid
            const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            const isTypingInField = (activeTag === 'input' || activeTag === 'textarea') && 
                                    document.activeElement.id !== 'barcode-search-input';

            if (isTypingInField && timeDiff > 60) {
                // User is manually typing in another form field (e.g. customer name or notes)
                return;
            }

            // Enter key usually marks end of barcode scanner transmission
            if (e.key === 'Enter') {
                if (barcodeBuffer.length >= 3 && timeDiff < 80) {
                    // Barcode scanned via hardware scanner!
                    e.preventDefault();
                    this.handleBarcodeScanned(barcodeBuffer.trim());
                    barcodeBuffer = '';
                    return;
                }
                barcodeBuffer = '';
            } else if (e.key.length === 1) {
                // Hardware scanners send characters rapidly (< 50ms)
                if (timeDiff > 100 && barcodeBuffer.length > 0) {
                    barcodeBuffer = '';
                }
                barcodeBuffer += e.key;
            }
        });
    },

    // 2. Keyboard Shortcuts (F-keys standard in retail POS)
    setupKeyboardShortcuts() {
        window.addEventListener('keydown', (e) => {
            // F2: Focus Barcode / Search
            if (e.key === 'F2') {
                e.preventDefault();
                const input = document.getElementById('barcode-search-input');
                if (input) {
                    input.focus();
                    input.select();
                }
            }
            // F4: Bill Discount Modal
            else if (e.key === 'F4') {
                e.preventDefault();
                this.openDiscountModal();
            }
            // F8: Hold / Park Cart
            else if (e.key === 'F8') {
                e.preventDefault();
                this.holdCurrentOrder();
            }
            // F9: Pay / Checkout
            else if (e.key === 'F9') {
                e.preventDefault();
                this.openPaymentModal();
            }
            // F12: Clear Cart
            else if (e.key === 'F12') {
                e.preventDefault();
                this.clearCart();
            }
            // Esc: Close any active modal
            else if (e.key === 'Escape') {
                const activeModal = document.querySelector('.modal-overlay.active');
                if (activeModal) {
                    activeModal.classList.remove('active');
                }
            }
        });
    },

    // Handle Scanned Barcode
    async handleBarcodeScanned(barcode) {
        try {
            const res = await fetch(`/api/products/lookup/${encodeURIComponent(barcode)}`);
            if (res.ok) {
                const product = await res.json();
                this.addToCart(product);
                this.playBeep(1400, 0.08); // Good scan chirp
                // Clear search input if focused
                const searchInput = document.getElementById('barcode-search-input');
                if (searchInput) searchInput.value = '';
            } else {
                this.playErrorBeep();
                App.toast(`Barcode not found: ${barcode}`, 'error');
            }
        } catch (e) {
            this.playErrorBeep();
            console.error("Barcode lookup error:", e);
        }
    },

    // Add Product to Cart
    addToCart(product, quantity = 1) {
        const existingIndex = this.cart.findIndex(i => i.product_id === product.id);

        if (existingIndex > -1) {
            this.cart[existingIndex].quantity += quantity;
            this.cart[existingIndex].line_total = (this.cart[existingIndex].quantity * this.cart[existingIndex].unit_price) - this.cart[existingIndex].discount_amount;
        } else {
            this.cart.push({
                product_id: product.id,
                name: product.name,
                barcode: product.barcode,
                unit_price: Number(product.selling_price),
                quantity: quantity,
                discount_amount: 0,
                line_total: Number(product.selling_price) * quantity,
                stock_quantity: product.stock_quantity,
                unit: product.unit || 'pcs'
            });
        }

        this.playBeep(1200, 0.05);
        this.renderCart();
    },

    // Change Item Quantity
    updateQty(index, change) {
        if (!this.cart[index]) return;
        const newQty = this.cart[index].quantity + change;
        if (newQty <= 0) {
            this.removeFromCart(index);
        } else {
            this.cart[index].quantity = newQty;
            this.cart[index].line_total = (newQty * this.cart[index].unit_price) - this.cart[index].discount_amount;
            this.renderCart();
        }
    },

    setQtyDirect(index, value) {
        const qty = parseFloat(value);
        if (isNaN(qty) || qty <= 0) {
            this.removeFromCart(index);
        } else {
            this.cart[index].quantity = qty;
            this.cart[index].line_total = (qty * this.cart[index].unit_price) - this.cart[index].discount_amount;
            this.renderCart();
        }
    },

    // Remove from Cart
    removeFromCart(index) {
        this.cart.splice(index, 1);
        this.renderCart();
    },

    // Clear Cart
    clearCart() {
        if (this.cart.length === 0) return;
        if (confirm("Are you sure you want to clear the current cart?")) {
            this.cart = [];
            this.billDiscount = 0;
            this.selectedCustomer = null;
            this.renderCart();
        }
    },

    // Calculate Cart Totals
    getTotals() {
        const subtotal = this.cart.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
        let discount = 0;
        if (this.billDiscountType === 'percent') {
            discount = (subtotal * this.billDiscount) / 100;
        } else {
            discount = this.billDiscount;
        }
        discount = Math.min(subtotal, Math.max(0, discount));

        const taxableAmount = subtotal - discount;
        const taxAmount = (taxableAmount * (this.taxRate || 0)) / 100;
        const grandTotal = Math.max(0, taxableAmount + taxAmount);

        return {
            subtotal,
            discount,
            taxAmount,
            grandTotal,
            itemCount: this.cart.reduce((sum, item) => sum + item.quantity, 0)
        };
    },

    // Render Cart DOM
    renderCart() {
        const container = document.getElementById('cart-items-container');
        const emptyState = document.getElementById('cart-empty-state');
        const countBadge = document.getElementById('cart-count-badge');
        const subtotalEl = document.getElementById('cart-subtotal');
        const discountEl = document.getElementById('cart-discount');
        const taxEl = document.getElementById('cart-tax');
        const grandTotalEl = document.getElementById('cart-grand-total');

        if (!container) return;

        const totals = this.getTotals();
        if (countBadge) countBadge.innerText = `${totals.itemCount} items`;
        if (subtotalEl) subtotalEl.innerText = ReceiptManager.formatCurrency(totals.subtotal);
        if (discountEl) discountEl.innerText = `-${ReceiptManager.formatCurrency(totals.discount)}`;
        if (taxEl) taxEl.innerText = ReceiptManager.formatCurrency(totals.taxAmount);
        if (grandTotalEl) grandTotalEl.innerText = ReceiptManager.formatCurrency(totals.grandTotal);

        if (this.cart.length === 0) {
            container.innerHTML = '';
            if (emptyState) emptyState.style.display = 'flex';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        let html = '';
        this.cart.forEach((item, index) => {
            html += `
                <div class="cart-item-row">
                    <div class="cart-item-info">
                        <div class="cart-item-name">${item.name}</div>
                        <div class="cart-item-sub">
                            <span>${ReceiptManager.formatCurrency(item.unit_price)} / ${item.unit}</span>
                            <span>•</span>
                            <span style="font-family: monospace;">${item.barcode}</span>
                        </div>
                    </div>
                    <div class="cart-item-qty-controls">
                        <button class="qty-btn" onclick="POS.updateQty(${index}, -1)">-</button>
                        <input type="number" class="qty-input" value="${item.quantity}" min="1" step="any" onchange="POS.setQtyDirect(${index}, this.value)">
                        <button class="qty-btn" onclick="POS.updateQty(${index}, 1)">+</button>
                    </div>
                    <div class="cart-item-price-box">
                        <div class="cart-item-total">${ReceiptManager.formatCurrency(item.line_total)}</div>
                    </div>
                    <div class="cart-item-delete" onclick="POS.removeFromCart(${index})" title="Remove item">&times;</div>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    // 3. Payment Modal
    openPaymentModal() {
        if (this.cart.length === 0) {
            this.playErrorBeep();
            App.toast("Cart is empty! Add products before checking out.", "error");
            return;
        }

        const totals = this.getTotals();
        this.cashTendered = totals.grandTotal; // Default to exact amount

        const modal = document.getElementById('payment-modal');
        if (!modal) return;

        document.getElementById('modal-pay-amount').innerText = ReceiptManager.formatCurrency(totals.grandTotal);
        const cashInput = document.getElementById('cash-tendered-input');
        if (cashInput) {
            cashInput.value = totals.grandTotal.toFixed(2);
        }

        this.calculateChange();
        modal.classList.add('active');

        // Auto-focus cash input
        setTimeout(() => {
            if (cashInput) {
                cashInput.focus();
                cashInput.select();
            }
        }, 100);
    },

    closePaymentModal() {
        const modal = document.getElementById('payment-modal');
        if (modal) modal.classList.remove('active');
    },

    setPaymentMethod(method) {
        this.currentPaymentMethod = method;
        document.querySelectorAll('.pay-method-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.method === method);
        });

        const cashContainer = document.getElementById('cash-tender-container');
        if (cashContainer) {
            cashContainer.style.display = (method === 'cash') ? 'block' : 'none';
        }

        this.calculateChange();
    },

    setQuickCash(amount) {
        const cashInput = document.getElementById('cash-tendered-input');
        if (cashInput) {
            cashInput.value = amount.toFixed(2);
            this.calculateChange();
        }
    },

    calculateChange() {
        const totals = this.getTotals();
        const cashInput = document.getElementById('cash-tendered-input');
        const tenderAmount = cashInput ? parseFloat(cashInput.value) || 0 : 0;
        this.cashTendered = tenderAmount;

        const change = Math.max(0, tenderAmount - totals.grandTotal);
        const changeEl = document.getElementById('modal-change-due');
        if (changeEl) {
            changeEl.innerText = ReceiptManager.formatCurrency(change);
        }
    },

    // Complete Order Transaction
    async processCheckout() {
        const totals = this.getTotals();
        const activeShift = window.POS_STATE?.activeShift;

        const payload = {
            shift_id: activeShift ? activeShift.id : null,
            user_id: window.POS_STATE?.currentUser?.id || 1,
            customer_id: this.selectedCustomer ? this.selectedCustomer.id : null,
            items: this.cart.map(i => ({
                product_id: i.product_id,
                product_name: i.name,
                barcode: i.barcode,
                unit_price: i.unit_price,
                quantity: i.quantity,
                discount_amount: i.discount_amount,
                line_total: i.line_total
            })),
            payment_method: this.currentPaymentMethod,
            cash_tendered: this.currentPaymentMethod === 'cash' ? this.cashTendered : totals.grandTotal,
            discount_amount: totals.discount,
            tax_amount: totals.taxAmount
        };

        try {
            const btnPay = document.getElementById('confirm-pay-btn');
            if (btnPay) btnPay.disabled = true;

            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (btnPay) btnPay.disabled = false;

            if (res.ok && data.success) {
                this.closePaymentModal();
                this.playSuccessChime();

                // Clear current cart
                this.cart = [];
                this.billDiscount = 0;
                this.selectedCustomer = null;
                this.renderCart();

                // Refresh product catalog to show updated stock counts
                if (window.App && window.App.loadProducts) {
                    window.App.loadProducts();
                }

                // Show Receipt Modal
                ReceiptManager.showReceiptModal(data.order);
            } else {
                this.playErrorBeep();
                App.toast("Checkout Error: " + (data.message || "Failed to process sale"), "error");
            }
        } catch (e) {
            this.playErrorBeep();
            console.error("Checkout error:", e);
            App.toast("Error communicating with POS server", "error");
        }
    },

    // 4. Hold (Park) Bill
    async holdCurrentOrder() {
        if (this.cart.length === 0) {
            App.toast("Cart is empty. Nothing to park / hold.", "error");
            return;
        }

        const customerName = this.selectedCustomer ? this.selectedCustomer.name : 'Walk-in';
        const timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const label = `Hold: ${customerName} (${timeStr})`;

        try {
            const res = await fetch('/api/orders/hold', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: this.cart,
                    label: label,
                    user_id: window.POS_STATE?.currentUser?.id || 1,
                    customer_id: this.selectedCustomer ? this.selectedCustomer.id : null
                })
            });

            if (res.ok) {
                this.playBeep(900, 0.1);
                this.cart = [];
                this.billDiscount = 0;
                this.selectedCustomer = null;
                this.renderCart();
                App.toast(`Order parked under "${label}". Recall anytime from Parked Bills!`, "info");
                if (window.App && window.App.loadHeldOrdersCount) {
                    window.App.loadHeldOrdersCount();
                }
            }
        } catch (e) {
            console.error("Hold order error:", e);
            App.toast("Error parking order", "error");
        }
    },

    // 5. Graphical Bill Discount Modal
    openDiscountModal() {
        const modal = document.getElementById('discount-modal');
        if (!modal) return;

        this.setDiscountType(this.billDiscountType || 'fixed');
        const input = document.getElementById('discount-modal-value');
        if (input) {
            input.value = this.billDiscount ? this.billDiscount : "";
            setTimeout(() => {
                input.focus();
                input.select();
            }, 100);
        }
        modal.classList.add('active');
    },

    closeDiscountModal() {
        const modal = document.getElementById('discount-modal');
        if (modal) modal.classList.remove('active');
    },

    setDiscountType(type) {
        this.billDiscountType = type;
        const fixedTab = document.getElementById('disc-type-fixed');
        const percentTab = document.getElementById('disc-type-percent');
        const fixedPresets = document.getElementById('disc-fixed-presets');
        const percentPresets = document.getElementById('disc-percent-presets');
        const label = document.getElementById('disc-value-label');

        if (type === 'percent') {
            percentTab.classList.add('active');
            fixedTab.classList.remove('active');
            percentPresets.style.display = 'flex';
            fixedPresets.style.display = 'none';
            label.innerText = "Discount Percentage (%)";
        } else {
            fixedTab.classList.add('active');
            percentTab.classList.remove('active');
            fixedPresets.style.display = 'flex';
            percentPresets.style.display = 'none';
            label.innerText = "Discount Amount (Rs.)";
        }
    },

    setQuickDiscount(val) {
        const input = document.getElementById('discount-modal-value');
        if (input) input.value = val;
    },

    applyDiscountModal() {
        const input = document.getElementById('discount-modal-value');
        const val = parseFloat(input.value) || 0;
        this.billDiscount = Math.max(0, val);
        this.renderCart();
        this.closeDiscountModal();
        if (this.billDiscount > 0) {
            App.toast(`Discount of ${this.billDiscountType === 'percent' ? this.billDiscount + '%' : ReceiptManager.formatCurrency(this.billDiscount)} applied!`);
        }
    },

    removeDiscount() {
        this.billDiscount = 0;
        this.renderCart();
        this.closeDiscountModal();
        App.toast("Discount removed");
    }
};

window.POS = POS;
