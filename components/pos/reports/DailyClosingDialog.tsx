"use client";

import { useEffect, useState } from "react";

import { getJson, postJson } from "@/components/pos/api";
import { Button } from "@/components/ui/Button";
import { CloseIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import type { LiveDailyCashSummary } from "@/lib/services/daily-closing.service";
import { formatMoney } from "@/lib/utils/money";

export function DailyClosingDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<LiveDailyCashSummary | null>(null);
  const [countedRupees, setCountedRupees] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await getJson<{ liveSummary: LiveDailyCashSummary }>("/api/pos/daily-closing");
      if (cancelled) return;
      setLoading(false);
      if (res.ok) {
        setSummary(res.data.liveSummary);
      } else {
        setErrorMessage(res.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const countedInPaise = Math.round((parseFloat(countedRupees) || 0) * 100);
  const expectedInPaise = summary?.expectedClosingCashInPaise ?? 0;
  const varianceInPaise = countedInPaise - expectedInPaise;

  async function submit() {
    if (!summary) return;
    if (isNaN(parseFloat(countedRupees)) || parseFloat(countedRupees) < 0) {
      setErrorMessage("Please enter a valid non-negative counted cash amount.");
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);

    const res = await postJson("/api/pos/daily-closing", {
      closingDate: summary.closingDate,
      openingCashInPaise: summary.openingCashInPaise,
      actualCountedCashInPaise: countedInPaise,
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
      aria-labelledby="closing-dialog-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="closing-dialog-title" className="text-base font-semibold text-slate-900">
            Daily Cash Closing &amp; Reconciliation
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

        <div className="space-y-4 px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
              <Spinner /> Calculating cash ledger...
            </div>
          ) : summary ? (
            <>
              {summary.alreadyClosed && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-bold">Closing Already Recorded</p>
                  <p className="mt-0.5">
                    A closing report for {summary.closingDate} has already been finalized.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="font-semibold text-slate-500 uppercase tracking-wide">Opening Cash</p>
                  <p className="mt-1 text-base font-bold text-slate-900">
                    {formatMoney(summary.openingCashInPaise)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="font-semibold text-slate-500 uppercase tracking-wide">Cash Sales</p>
                  <p className="mt-1 text-base font-bold text-emerald-700">
                    +{formatMoney(summary.cashSalesInPaise)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="font-semibold text-slate-500 uppercase tracking-wide">Cash Refunds</p>
                  <p className="mt-1 text-base font-bold text-rose-600">
                    -{formatMoney(summary.cashRefundsInPaise)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="font-semibold text-slate-500 uppercase tracking-wide">Cash Expenses</p>
                  <p className="mt-1 text-base font-bold text-rose-600">
                    -{formatMoney(summary.cashPaidOutInPaise)}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5 text-xs text-indigo-950">
                <div className="flex justify-between font-bold">
                  <span>Expected Drawer Cash:</span>
                  <span className="text-sm tabular-nums">{formatMoney(expectedInPaise)}</span>
                </div>
              </div>

              {!summary.alreadyClosed && (
                <div>
                  <label htmlFor="counted-cash-input" className="block text-xs font-semibold text-slate-700">
                    Actual Counted Physical Cash (₹)
                  </label>
                  <input
                    id="counted-cash-input"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={countedRupees}
                    onChange={(e) => setCountedRupees(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />

                  {countedRupees !== "" && (
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-slate-600">Reconciliation Variance:</span>
                      <span
                        className={`font-bold tabular-nums ${
                          varianceInPaise === 0
                            ? "text-emerald-600"
                            : varianceInPaise > 0
                              ? "text-blue-600"
                              : "text-rose-600"
                        }`}
                      >
                        {varianceInPaise > 0 ? "+" : ""}
                        {formatMoney(varianceInPaise)}{" "}
                        {varianceInPaise === 0 ? "(Exact match)" : varianceInPaise > 0 ? "(Surplus)" : "(Shortage)"}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label htmlFor="closing-notes" className="block text-xs font-semibold text-slate-700">
                  Closing Notes / Observations
                </label>
                <textarea
                  id="closing-notes"
                  rows={2}
                  placeholder="Optional closing notes or reason for cash variance..."
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
            </>
          ) : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          {summary && !summary.alreadyClosed && (
            <Button variant="primary" onClick={submit} disabled={submitting || countedRupees === ""}>
              {submitting ? <Spinner /> : null}
              {submitting ? "Finalizing..." : "Record Closing"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
