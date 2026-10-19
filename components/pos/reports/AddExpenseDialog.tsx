"use client";

import { useState } from "react";

import { postJson } from "@/components/pos/api";
import { Button } from "@/components/ui/Button";
import { CloseIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_CATEGORY_VALUES,
  type ExpenseCategory,
} from "@/lib/constants/expense";

export function AddExpenseDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [category, setCategory] = useState<ExpenseCategory>("RENT");
  const [amountRupees, setAmountRupees] = useState("");
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function submit() {
    const parsedAmount = parseFloat(amountRupees);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage("Please enter a valid positive expense amount.");
      return;
    }
    if (!description.trim()) {
      setErrorMessage("Please provide a description of the expense.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    const res = await postJson("/api/pos/expenses", {
      category,
      amountInPaise: Math.round(parsedAmount * 100),
      description: description.trim(),
      paymentMethod,
      notes: notes.trim(),
    });

    if (res.ok) {
      onDone();
      onClose();
    } else {
      setErrorMessage(res.message);
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="expense-dialog-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="expense-dialog-title" className="text-base font-semibold text-slate-900">
            Record Operating Expense
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close dialog"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4 text-xs">
          <div>
            <label htmlFor="expense-category-select" className="block font-semibold text-slate-700">
              Expense Category <span className="text-rose-600">*</span>
            </label>
            <select
              id="expense-category-select"
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
            >
              {EXPENSE_CATEGORY_VALUES.map((cat) => (
                <option key={cat} value={cat}>
                  {EXPENSE_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="expense-amount-input" className="block font-semibold text-slate-700">
              Amount (₹) <span className="text-rose-600">*</span>
            </label>
            <input
              id="expense-amount-input"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={amountRupees}
              onChange={(e) => setAmountRupees(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="expense-desc-input" className="block font-semibold text-slate-700">
              Description <span className="text-rose-600">*</span>
            </label>
            <input
              id="expense-desc-input"
              type="text"
              placeholder="e.g. October Store Rent, Electric Bill, Staff Stipend"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={250}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="expense-payment-method" className="block font-semibold text-slate-700">
              Payment Method
            </label>
            <select
              id="expense-payment-method"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
            >
              <option value="CASH">Cash Drawer</option>
              <option value="UPI">UPI</option>
              <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
              <option value="CARD">Debit / Credit Card</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>

          <div>
            <label htmlFor="expense-notes-input" className="block font-semibold text-slate-700">
              Additional Notes (Optional)
            </label>
            <textarea
              id="expense-notes-input"
              rows={2}
              placeholder="Invoice reference, payee details, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
            />
          </div>

          {errorMessage && (
            <p role="alert" className="rounded-xl bg-rose-50 p-2.5 text-xs text-rose-700">
              {errorMessage}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={submitting}>
            {submitting ? <Spinner /> : null}
            {submitting ? "Saving..." : "Record Expense"}
          </Button>
        </div>
      </div>
    </div>
  );
}
