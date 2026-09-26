import "server-only";

import { logger } from "@/lib/utils/logger";

type PayPalEnvironment = "sandbox" | "live";
interface PayPalAmount { currency_code: string; value: string; }
interface PayPalCapture { id: string; status: string; amount: PayPalAmount; }
interface PayPalOrderResponse { id: string; status: string; purchase_units?: Array<{ amount?: PayPalAmount; payments?: { captures?: PayPalCapture[] } }>; }

function config() {
  const environment = (process.env.PAYPAL_ENVIRONMENT ?? "sandbox") as PayPalEnvironment;
  if (!(["sandbox", "live"] as string[]).includes(environment)) throw new Error("PAYPAL_ENVIRONMENT must be sandbox or live.");
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  const currency = (process.env.PAYPAL_CURRENCY ?? "INR").trim().toUpperCase();
  if (!clientId || !secret) throw new Error("PayPal server credentials are not configured.");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("PAYPAL_CURRENCY must be a three-letter ISO code.");
  return { clientId, secret, currency, baseUrl: environment === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com" };
}

async function accessToken(): Promise<string> {
  const { clientId, secret, baseUrl } = config();
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials", cache: "no-store",
  });
  if (!response.ok) throw new Error(`PayPal authentication failed (${response.status}).`);
  const body = await response.json() as { access_token?: string };
  if (!body.access_token) throw new Error("PayPal did not return an access token.");
  return body.access_token;
}

async function paypalFetch<T>(path: string, init: RequestInit & { requestId?: string } = {}): Promise<T> {
  const { baseUrl } = config(); const token = await accessToken();
  const response = await fetch(`${baseUrl}${path}`, { ...init, cache: "no-store", headers: {
    Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json",
    ...(init.requestId ? { "PayPal-Request-Id": init.requestId } : {}), ...(init.headers ?? {}),
  }});
  const body = await response.json().catch(() => ({})) as T;
  if (!response.ok) { logger.warn("PayPal API request failed", { path, status: response.status }); throw new Error(`PayPal request failed (${response.status}).`); }
  return body;
}

export function getPayPalCurrency() { return config().currency; }
export function minorUnitsToPayPal(amount: number): string {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Invalid money amount.");
  return `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;
}
export function paypalAmountToMinorUnits(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) ? result : null;
}
export async function createPayPalOrder(input: { sessionId: string; amountInPaise: number; description: string }) {
  const currency = getPayPalCurrency();
  return paypalFetch<PayPalOrderResponse>("/v2/checkout/orders", { method: "POST", requestId: `create-${input.sessionId}`, body: JSON.stringify({
    intent: "CAPTURE", purchase_units: [{ custom_id: input.sessionId, description: input.description.slice(0, 127), amount: { currency_code: currency, value: minorUnitsToPayPal(input.amountInPaise) } }],
  }) });
}
export async function capturePayPalOrder(orderId: string, sessionId: string) {
  try {
    return await paypalFetch<PayPalOrderResponse>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST", requestId: `capture-${sessionId}`, body: "{}" });
  } catch (error) {
    // A lost capture response is ambiguous. Read the provider's source of truth
    // before reporting failure; the request id also makes retries idempotent.
    const existing = await getPayPalOrder(orderId);
    if (completedCapture(existing)) return existing;
    throw error;
  }
}
export async function getPayPalOrder(orderId: string) { return paypalFetch<PayPalOrderResponse>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`); }
export async function refundPayPalCapture(captureId: string, requestId: string) {
  return paypalFetch<{ id: string; status: string }>(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, { method: "POST", requestId, body: "{}", headers: { Prefer: "return=representation" } });
}
export function completedCapture(order: PayPalOrderResponse): PayPalCapture | null {
  return order.purchase_units?.flatMap((unit) => unit.payments?.captures ?? []).find((capture) => capture.status === "COMPLETED") ?? null;
}
export async function verifyPayPalWebhook(headers: Headers, event: unknown): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim(); if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID is not configured.");
  const body = await paypalFetch<{ verification_status?: string }>("/v1/notifications/verify-webhook-signature", { method: "POST", body: JSON.stringify({
    auth_algo: headers.get("paypal-auth-algo"), cert_url: headers.get("paypal-cert-url"), transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"), transmission_time: headers.get("paypal-transmission-time"), webhook_id: webhookId, webhook_event: event,
  }) });
  return body.verification_status === "SUCCESS";
}
