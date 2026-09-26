"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";

interface PayPalActions { order: { create(input: { purchase_units: never[] }): Promise<string> }; reject(): Promise<void>; }
interface PayPalButtonsOptions {
  style?: Record<string, unknown>;
  onClick?: (_data: unknown, actions: PayPalActions) => Promise<void>;
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onCancel: () => Promise<void>;
  onError: (error: unknown) => void;
}
interface PayPalButtonsInstance { render(selector: string): Promise<void>; close?(): Promise<void>; }
declare global { interface Window { paypal?: { Buttons(options: PayPalButtonsOptions): PayPalButtonsInstance }; } }

interface Props {
  clientId: string; currency: string; payload: unknown; disabled?: boolean;
  validate(): boolean; onSuccess(orderNumber: string): void; onError(message: string): void;
}

export function PayPalCheckoutButton({ clientId, currency, payload, disabled, validate, onSuccess, onError }: Props) {
  const payloadRef = useRef(payload); const validateRef = useRef(validate); const successRef = useRef(onSuccess); const errorRef = useRef(onError);
  const sessionRef = useRef<{ sessionId: string; paypalOrderId: string } | null>(null);
  const [loading, setLoading] = useState(Boolean(clientId));
  useEffect(() => { payloadRef.current = payload; validateRef.current = validate; successRef.current = onSuccess; errorRef.current = onError; }, [payload, validate, onSuccess, onError]);

  useEffect(() => {
    if (!clientId) return;
    const containerId = "paypal-button-container";
    let instance: PayPalButtonsInstance | undefined; let cancelled = false;
    async function render() {
      if (!window.paypal) return;
      instance = window.paypal.Buttons({
        style: { layout: "vertical", shape: "rect", label: "paypal" },
        onClick: async (_data, actions) => { if (!validateRef.current()) await actions.reject(); },
        createOrder: async () => {
          const response = await fetch("/api/paypal/create-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payloadRef.current) });
          const body = await response.json() as { sessionId?: string; paypalOrderId?: string; error?: { message?: string } };
          if (!response.ok || !body.sessionId || !body.paypalOrderId) { const message = body.error?.message ?? "Could not start PayPal checkout."; errorRef.current(message); throw new Error(message); }
          sessionRef.current = { sessionId: body.sessionId, paypalOrderId: body.paypalOrderId }; return body.paypalOrderId;
        },
        onApprove: async ({ orderID }) => {
          const active = sessionRef.current; if (!active || active.paypalOrderId !== orderID) throw new Error("Checkout reference mismatch.");
          const response = await fetch("/api/paypal/capture-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(active) });
          const body = await response.json() as { orderNumber?: string; error?: { message?: string } };
          if (!response.ok || !body.orderNumber) { const message = body.error?.message ?? "Payment could not be confirmed."; errorRef.current(message); throw new Error(message); }
          successRef.current(body.orderNumber);
        },
        onCancel: async () => {
          if (sessionRef.current) await fetch("/api/paypal/cancel-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sessionRef.current) }).catch(() => undefined);
          errorRef.current("Payment was cancelled. You can try again or return to your bag."); sessionRef.current = null;
        },
        onError: () => errorRef.current("PayPal could not complete this checkout. Please try again."),
      });
      await instance.render(`#${containerId}`); if (!cancelled) setLoading(false);
    }
    const existing = document.querySelector<HTMLScriptElement>("script[data-nexora-paypal]");
    if (existing) { if (window.paypal) void render(); else existing.addEventListener("load", () => void render(), { once: true }); }
    else {
      const script = document.createElement("script"); script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture&components=buttons`;
      script.async = true; script.dataset.nexoraPaypal = "true"; script.onload = () => void render(); script.onerror = () => { setLoading(false); errorRef.current("The PayPal checkout library could not be loaded."); }; document.head.appendChild(script);
    }
    return () => { cancelled = true; void instance?.close?.(); };
  }, [clientId, currency]);

  if (!clientId) return <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">PayPal checkout is not configured. Add the public PayPal client ID to continue.</div>;
  return <div aria-busy={loading || undefined} className={disabled ? "pointer-events-none opacity-50" : ""}>{loading ? <div className="flex items-center justify-center gap-2 py-3 text-sm text-slate-600"><Spinner label="Loading PayPal" /> Loading secure PayPal checkout…</div> : null}<div id="paypal-button-container" className="min-h-12 overflow-hidden" /></div>;
}
