/**
 * Cash Drawer & Shift Management
 * Graphical Modals for Register Opening, Mid-Day X-Report, Petty Cash, and Day-End Z-Report
 */

const ShiftManager = {
    async checkActiveShift() {
        try {
            const res = await fetch('/api/shifts/current');
            const data = await res.json();
            const statusDot = document.getElementById('shift-status-dot');
            const statusText = document.getElementById('shift-status-text');

            if (data.id) {
                window.POS_STATE.activeShift = data;
                if (statusDot) statusDot.classList.remove('closed');
                if (statusText) statusText.innerText = `Shift #${data.id} Open`;
            } else {
                window.POS_STATE.activeShift = null;
                if (statusDot) statusDot.classList.add('closed');
                if (statusText) statusText.innerText = `No Active Shift (Click to Open)`;
            }
        } catch (e) {
            console.error("Shift check error:", e);
        }
    },

    openShiftModal() {
        const active = window.POS_STATE.activeShift;
        if (!active) {
            this.openOpenShiftModal();
        } else {
            this.openShiftMenuModal();
        }
    },

    // 1. Graphical Open Shift Modal
    openOpenShiftModal() {
        const modal = document.getElementById('open-shift-modal');
        if (modal) modal.classList.add('active');
    },

    closeOpenShiftModal() {
        const modal = document.getElementById('open-shift-modal');
        if (modal) modal.classList.remove('active');
    },

    async submitOpenShift() {
        const floatInput = document.getElementById('open-shift-float-input');
        const floatVal = parseFloat(floatInput.value) || 0;

        try {
            const res = await fetch('/api/shifts/open', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: window.POS_STATE?.currentUser?.id || 1,
                    opening_float: floatVal,
                    notes: "Shift opened at register"
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                this.closeOpenShiftModal();
                App.toast(`Shift #${data.shift_id} opened with float of ${ReceiptManager.formatCurrency(floatVal)}!`);
                await this.checkActiveShift();
            } else {
                App.toast(data.message || "Failed to open shift", "error");
            }
        } catch (e) {
            console.error(e);
            App.toast("Error opening shift", "error");
        }
    },

    // 2. Graphical Active Shift Dashboard
    openShiftMenuModal() {
        const active = window.POS_STATE.activeShift;
        if (!active) {
            this.openOpenShiftModal();
            return;
        }

        const modal = document.getElementById('shift-menu-modal');
        if (!modal) return;

        document.getElementById('shift-menu-id').innerText = `Active Shift #${active.id}`;
        document.getElementById('shift-menu-opened').innerText = `Opened: ${active.opening_time}`;
        document.getElementById('shift-menu-float').innerText = ReceiptManager.formatCurrency(active.opening_float);
        document.getElementById('shift-menu-cash-sales').innerText = ReceiptManager.formatCurrency(active.cash_sales);

        modal.classList.add('active');
    },

    closeShiftMenuModal() {
        const modal = document.getElementById('shift-menu-modal');
        if (modal) modal.classList.remove('active');
    },

    // 3. Graphical Petty Cash In / Out
    openCashTransactionModal(type) {
        this.closeShiftMenuModal();
        const modal = document.getElementById('shift-cash-modal');
        if (!modal) return;

        document.getElementById('shift-cash-type').value = type;
        const titleEl = document.getElementById('shift-cash-modal-title');
        const amountEl = document.getElementById('shift-cash-amount');
        const reasonEl = document.getElementById('shift-cash-reason');

        titleEl.innerText = (type === 'cash_in') ? "📥 Petty Cash In (Add Money)" : "📤 Petty Cash Out (Pay Expense)";
        amountEl.value = "";
        reasonEl.value = "";
        reasonEl.placeholder = (type === 'cash_in') ? "e.g. Added 50/100 coin change" : "e.g. Tea / Bread delivery / Cleaning expense";

        modal.classList.add('active');
        setTimeout(() => amountEl.focus(), 100);
    },

    closeCashModal() {
        const modal = document.getElementById('shift-cash-modal');
        if (modal) modal.classList.remove('active');
    },

    async submitCashTransaction() {
        const active = window.POS_STATE.activeShift;
        if (!active) return;

        const type = document.getElementById('shift-cash-type').value;
        const amount = parseFloat(document.getElementById('shift-cash-amount').value) || 0;
        const reason = document.getElementById('shift-cash-reason').value.trim();

        if (amount <= 0 || !reason) {
            App.toast("Please enter a valid amount and reason", "error");
            return;
        }

        try {
            const res = await fetch('/api/shifts/transaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shift_id: active.id,
                    type: type,
                    amount: amount,
                    reason: reason
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                this.closeCashModal();
                App.toast(`Recorded ${type === 'cash_in' ? 'Cash In' : 'Cash Out'} of ${ReceiptManager.formatCurrency(amount)}!`);
                await this.checkActiveShift();
            } else {
                App.toast(data.message || "Failed to record transaction", "error");
            }
        } catch (e) {
            console.error(e);
            App.toast("Error recording transaction", "error");
        }
    },

    // 4. Graphical Mid-Shift X-Report
    async openXReportModal() {
        this.closeShiftMenuModal();
        const active = window.POS_STATE.activeShift;
        if (!active) return;

        try {
            const res = await fetch(`/api/shifts/x-report?shift_id=${active.id}`);
            const data = await res.json();
            if (res.ok) {
                const body = document.getElementById('x-report-body');
                body.innerHTML = `
                    <div style="background: white; border: 1px dashed #334155; border-radius: 8px; padding: 18px; font-family: monospace; font-size: 13px;">
                        <div style="text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 8px;">INTERIM X-REPORT</div>
                        <div style="text-align: center; font-size: 11px; color: #64748b; margin-bottom: 12px;">Shift #${data.id} • Cashier: ${data.cashier_name}</div>
                        <div style="border-top: 1px dashed #cbd5e1; margin: 8px 0;"></div>
                        <div style="display: flex; justify-content: space-between; margin: 4px 0;"><span>Opening Float:</span> <b>${ReceiptManager.formatCurrency(data.opening_float)}</b></div>
                        <div style="display: flex; justify-content: space-between; margin: 4px 0;"><span>Cash Sales:</span> <b style="color: #059669;">+${ReceiptManager.formatCurrency(data.cash_sales)}</b></div>
                        <div style="display: flex; justify-content: space-between; margin: 4px 0;"><span>Card Sales:</span> <b>${ReceiptManager.formatCurrency(data.card_sales)}</b></div>
                        <div style="display: flex; justify-content: space-between; margin: 4px 0;"><span>Credit Sales:</span> <b>${ReceiptManager.formatCurrency(data.credit_sales)}</b></div>
                        <div style="display: flex; justify-content: space-between; margin: 4px 0;"><span>Petty Cash In:</span> <b>+${ReceiptManager.formatCurrency(data.cash_in_total)}</b></div>
                        <div style="display: flex; justify-content: space-between; margin: 4px 0;"><span>Petty Cash Out:</span> <b style="color: #dc2626;">-${ReceiptManager.formatCurrency(data.cash_out_total)}</b></div>
                        <div style="border-top: 2px solid #0f172a; margin: 10px 0 6px 0;"></div>
                        <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 800;"><span>EXPECTED CASH:</span> <span style="color: #2563eb;">${ReceiptManager.formatCurrency(data.current_expected_cash)}</span></div>
                        <div style="border-top: 1px dashed #cbd5e1; margin: 8px 0;"></div>
                        <div style="font-size: 11px; color: #64748b; text-align: center; margin-top: 6px;">Total Invoices Issued: ${data.total_orders}</div>
                    </div>
                `;
                document.getElementById('x-report-modal').classList.add('active');
            }
        } catch (e) {
            console.error(e);
        }
    },

    closeXReportModal() {
        const modal = document.getElementById('x-report-modal');
        if (modal) modal.classList.remove('active');
    },

    // 5. Graphical Day-End Z-Report
    async openCloseShiftModal() {
        this.closeShiftMenuModal();
        const active = window.POS_STATE.activeShift;
        if (!active) return;

        try {
            const res = await fetch(`/api/shifts/x-report?shift_id=${active.id}`);
            const data = await res.json();
            if (res.ok) {
                this.currentShiftAudit = data;
                document.getElementById('close-shift-expected').innerText = ReceiptManager.formatCurrency(data.current_expected_cash);
                document.getElementById('close-shift-actual').value = data.current_expected_cash.toFixed(2);
                document.getElementById('close-shift-notes').value = "Normal day-end closing count";
                this.calculateVariance();

                document.getElementById('close-shift-modal').classList.add('active');
            }
        } catch (e) {
            console.error(e);
        }
    },

    calculateVariance() {
        const expected = this.currentShiftAudit ? this.currentShiftAudit.current_expected_cash : 0;
        const actual = parseFloat(document.getElementById('close-shift-actual').value) || 0;
        const variance = actual - expected;
        const varEl = document.getElementById('close-shift-variance');

        if (varEl) {
            if (variance === 0) {
                varEl.innerText = `${ReceiptManager.formatCurrency(0)} (PERFECTLY BALANCED)`;
                varEl.style.color = "var(--success)";
            } else if (variance > 0) {
                varEl.innerText = `+${ReceiptManager.formatCurrency(variance)} (CASH SURPLUS)`;
                varEl.style.color = "var(--success)";
            } else {
                varEl.innerText = `${ReceiptManager.formatCurrency(variance)} (CASH SHORTAGE)`;
                varEl.style.color = "var(--danger)";
            }
        }
    },

    closeCloseShiftModal() {
        const modal = document.getElementById('close-shift-modal');
        if (modal) modal.classList.remove('active');
    },

    async submitCloseShift() {
        const active = window.POS_STATE.activeShift;
        if (!active) return;

        const actualCash = parseFloat(document.getElementById('close-shift-actual').value);
        if (isNaN(actualCash)) {
            App.toast("Please enter actual counted cash", "error");
            return;
        }

        const notes = document.getElementById('close-shift-notes').value.trim();

        try {
            const res = await fetch('/api/shifts/close', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shift_id: active.id,
                    closing_actual_cash: actualCash,
                    notes: notes
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                this.closeCloseShiftModal();
                App.toast(`Shift #${active.id} closed and register balanced!`);
                await this.checkActiveShift();
            } else {
                App.toast(data.message || "Failed to close shift", "error");
            }
        } catch (e) {
            console.error(e);
            App.toast("Error closing shift", "error");
        }
    }
};

window.ShiftManager = ShiftManager;
