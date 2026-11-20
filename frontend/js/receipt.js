/**
 * Thermal Receipt Generator (ESC/POS 80mm Standard)
 */

const ReceiptManager = {
    formatCurrency(amount) {
        const symbol = window.POS_STATE?.settings?.currency_symbol || 'Rs.';
        return `${symbol} ${Number(amount).toFixed(2)}`;
    },

    generateReceiptHTML(order) {
        const settings = window.POS_STATE?.settings || {};
        const storeName = settings.store_name || "METRO RETAIL MART";
        const tagline = settings.store_tagline || "Quality & Convenience";
        const address = settings.address || "No 45, High Level Road, Colombo";
        const phone = settings.phone || "+94 11 234 5678";
        const headerText = settings.receipt_header || "TAX INVOICE / CASH SALE";
        const footerText = settings.receipt_footer || "Thank you for shopping with us! Please come again.";

        let itemsRows = '';
        (order.items || []).forEach(item => {
            const lineTotal = Number(item.line_total || (item.unit_price * item.quantity)).toFixed(2);
            itemsRows += `
                <tr>
                    <td colspan="4" style="font-weight: bold; padding-top: 4px;">${item.product_name}</td>
                </tr>
                <tr>
                    <td style="color:#555; padding-left: 8px;">${item.barcode || ''}</td>
                    <td class="text-center">${item.quantity}</td>
                    <td class="text-right">${Number(item.unit_price).toFixed(2)}</td>
                    <td class="text-right" style="font-weight: bold;">${lineTotal}</td>
                </tr>
            `;
        });

        const subtotal = Number(order.subtotal || 0).toFixed(2);
        const discount = Number(order.discount_amount || 0).toFixed(2);
        const tax = Number(order.tax_amount || 0).toFixed(2);
        const grandTotal = Number(order.grand_total || 0).toFixed(2);
        const cashTendered = Number(order.cash_tendered || 0).toFixed(2);
        const changeDue = Number(order.change_due || 0).toFixed(2);

        return `
            <div class="thermal-receipt" id="printable-receipt">
                <div class="receipt-header-center">
                    <div class="receipt-store-name">${storeName}</div>
                    <div style="font-size: 11px;">${tagline}</div>
                    <div style="font-size: 11px;">${address}</div>
                    <div style="font-size: 11px;">Tel: ${phone}</div>
                    <div class="receipt-dashed-line"></div>
                    <div style="font-weight: bold; font-size: 12px; letter-spacing: 0.5px;">${headerText}</div>
                </div>

                <div class="receipt-meta-row">
                    <span>INV: <b>${order.invoice_number}</b></span>
                    <span>${order.created_at || new Date().toLocaleString()}</span>
                </div>
                <div class="receipt-meta-row">
                    <span>Cashier: ${order.cashier_name || 'Counter 01'}</span>
                    <span>Pay: ${(order.payment_method || 'CASH').toUpperCase()}</span>
                </div>
                ${order.customer_name ? `
                <div class="receipt-meta-row">
                    <span>Cust: ${order.customer_name}</span>
                    <span>${order.customer_phone || ''}</span>
                </div>` : ''}

                <div class="receipt-dashed-line"></div>

                <table class="receipt-table">
                    <thead>
                        <tr>
                            <th style="width: 45%;">Item / Barcode</th>
                            <th class="text-center" style="width: 15%;">Qty</th>
                            <th class="text-right" style="width: 20%;">Price</th>
                            <th class="text-right" style="width: 20%;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsRows}
                    </tbody>
                </table>

                <div class="receipt-dashed-line"></div>

                <div class="receipt-meta-row">
                    <span>Subtotal:</span>
                    <span>${this.formatCurrency(subtotal)}</span>
                </div>
                ${Number(discount) > 0 ? `
                <div class="receipt-meta-row" style="color: #000;">
                    <span>Bill Discount:</span>
                    <span>-${this.formatCurrency(discount)}</span>
                </div>` : ''}
                ${Number(tax) > 0 ? `
                <div class="receipt-meta-row">
                    <span>Tax (VAT):</span>
                    <span>${this.formatCurrency(tax)}</span>
                </div>` : ''}

                <div class="receipt-double-line"></div>

                <div class="receipt-total-row" style="font-size: 15px;">
                    <span>NET TOTAL:</span>
                    <span>${this.formatCurrency(grandTotal)}</span>
                </div>

                <div class="receipt-double-line"></div>

                ${order.payment_method === 'cash' ? `
                <div class="receipt-meta-row">
                    <span>Cash Tendered:</span>
                    <span>${this.formatCurrency(cashTendered)}</span>
                </div>
                <div class="receipt-meta-row" style="font-weight: bold;">
                    <span>Change Due:</span>
                    <span>${this.formatCurrency(changeDue)}</span>
                </div>` : ''}

                <div class="receipt-barcode">
                    *${order.invoice_number}*
                </div>

                <div class="receipt-header-center" style="margin-top: 10px;">
                    <div style="font-size: 11px;">${footerText}</div>
                    <div style="font-size: 9px; margin-top: 4px; color: #555;">Software: Metro POS Enterprise Edition</div>
                </div>
            </div>
        `;
    },

    showReceiptModal(order) {
        const modalContainer = document.getElementById('receipt-modal-container');
        if (!modalContainer) return;

        modalContainer.innerHTML = `
            <div class="modal-overlay active" id="receipt-modal">
                <div class="modal-box" style="max-width: 450px;">
                    <div class="modal-header">
                        <h3 class="modal-title">Receipt / Invoice Preview</h3>
                        <button class="modal-close" onclick="ReceiptManager.closeReceiptModal()">&times;</button>
                    </div>
                    <div class="modal-body receipt-wrapper">
                        ${this.generateReceiptHTML(order)}
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="ReceiptManager.closeReceiptModal()">Close (Esc)</button>
                        <button class="btn btn-primary" onclick="window.print()">Print Thermal Receipt (Enter)</button>
                    </div>
                </div>
            </div>
        `;
    },

    closeReceiptModal() {
        const modal = document.getElementById('receipt-modal');
        if (modal) modal.remove();
        // Return focus to barcode input for next sale
        const barcodeInput = document.getElementById('barcode-search-input');
        if (barcodeInput) barcodeInput.focus();
    }
};

window.ReceiptManager = ReceiptManager;
