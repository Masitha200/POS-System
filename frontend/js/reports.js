/**
 * Reports & Analytics Dashboard
 */

const ReportsManager = {
    async loadDashboard() {
        try {
            const res = await fetch('/api/reports/dashboard');
            const data = await res.json();
            this.renderDashboard(data);
        } catch (e) {
            console.error("Failed to load dashboard:", e);
        }
    },

    renderDashboard(data) {
        const today = data.today || {};
        
        // Stat Cards
        const revEl = document.getElementById('stat-today-revenue');
        const profitEl = document.getElementById('stat-today-profit');
        const ordersEl = document.getElementById('stat-today-orders');
        const discountEl = document.getElementById('stat-today-discounts');

        if (revEl) revEl.innerText = ReceiptManager.formatCurrency(today.total_revenue || 0);
        if (profitEl) profitEl.innerText = ReceiptManager.formatCurrency(today.net_profit || 0);
        if (ordersEl) ordersEl.innerText = today.count || 0;
        if (discountEl) discountEl.innerText = ReceiptManager.formatCurrency(today.total_discounts || 0);

        // Payments Breakdown
        const payListEl = document.getElementById('payment-breakdown-list');
        if (payListEl) {
            const payments = data.payments || [];
            if (payments.length === 0) {
                payListEl.innerHTML = `<div style="color: #94a3b8; font-size: 13px;">No sales completed today yet.</div>`;
            } else {
                let html = '';
                payments.forEach(p => {
                    html += `
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px;">
                            <span style="font-weight: 700; text-transform: uppercase;">${p.payment_method} (${p.count} bills)</span>
                            <span style="font-weight: bold; color: var(--primary);">${ReceiptManager.formatCurrency(p.total)}</span>
                        </div>
                    `;
                });
                payListEl.innerHTML = html;
            }
        }

        // Top 5 Products
        const topListEl = document.getElementById('top-products-list');
        if (topListEl) {
            const tops = data.top_products || [];
            if (tops.length === 0) {
                topListEl.innerHTML = `<div style="color: #94a3b8; font-size: 13px;">No sales data available.</div>`;
            } else {
                let html = '';
                tops.forEach((p, idx) => {
                    html += `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px;">
                            <div>
                                <span style="font-weight: 800; color: var(--text-light); margin-right: 6px;">#${idx + 1}</span>
                                <span style="font-weight: 700;">${p.product_name}</span>
                            </div>
                            <div style="text-align: right;">
                                <span style="font-weight: 700;">${p.total_sold} units</span>
                                <span style="color: var(--text-secondary); font-size: 11px; margin-left: 6px;">(${ReceiptManager.formatCurrency(p.total_revenue)})</span>
                            </div>
                        </div>
                    `;
                });
                topListEl.innerHTML = html;
            }
        }

        // Low Stock Alert List
        const lowStockEl = document.getElementById('low-stock-alert-list');
        if (lowStockEl) {
            const lowItems = data.low_stock_items || [];
            if (lowItems.length === 0) {
                lowStockEl.innerHTML = `<div style="color: var(--success); font-weight: bold; font-size: 13px;">✅ All inventory items are well-stocked!</div>`;
            } else {
                let html = '';
                lowItems.forEach(p => {
                    html += `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px;">
                            <div>
                                <span style="font-weight: 700; color: var(--danger);">${p.name}</span>
                                <span style="font-size: 11px; color: var(--text-light); margin-left: 6px;">[${p.barcode}]</span>
                            </div>
                            <div>
                                <span class="stock-tag low">${p.stock_quantity} ${p.unit} remaining (Min: ${p.min_stock_level})</span>
                                <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 11px; display: inline-flex; margin-left: 6px;" onclick="InventoryManager.openStockAdjustModal(${p.id})">Restock</button>
                            </div>
                        </div>
                    `;
                });
                lowStockEl.innerHTML = html;
            }
        }
    }
};

window.ReportsManager = ReportsManager;
