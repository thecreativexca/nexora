"use client";

/**
 * Tiny fetch helpers for the POS client components. API routes return either a
 * typed payload or `{ error: { code, message, fieldErrors? } }`; these helpers
 * normalise that into simple results so every form handles errors identically.
 */

export interface ApiFieldErrors {
  [field: string]: string[];
}

export interface ApiFailure {
  ok: false;
  message: string;
  code: string;
  fieldErrors: ApiFieldErrors;
}

export async function postJson<T>(
  url: string,
  body: unknown,
): Promise<{ ok: true; data: T } | ApiFailure> {
  return callJson<T>(url, { method: "POST", body: JSON.stringify(body) });
}

export async function patchJson<T>(
  url: string,
  body: unknown,
): Promise<{ ok: true; data: T } | ApiFailure> {
  return callJson<T>(url, { method: "PATCH", body: JSON.stringify(body) });
}

export async function getJson<T>(
  url: string,
): Promise<{ ok: true; data: T } | ApiFailure> {
  return callJson<T>(url, { method: "GET" });
}

/** Multipart upload for product images (returns the served image URL). */
export async function uploadFileJson<T>(
  url: string,
  file: File,
): Promise<{ ok: true; data: T } | ApiFailure> {
  const form = new FormData();
  form.append("file", file);
  try {
    const response = await fetch(url, {
      method: "POST",
      body: form,
      credentials: "same-origin",
    });

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      const errorPayload = body as
        | { error?: { code?: string; message?: string; fieldErrors?: ApiFieldErrors } }
        | null;
      const error = errorPayload?.error;
      return {
        ok: false,
        message: error?.message ?? "Something went wrong. Please try again.",
        code: error?.code ?? "UNKNOWN",
        fieldErrors: error?.fieldErrors ?? {},
      };
    }

    return { ok: true, data: body as T };
  } catch {
    return {
      ok: false,
      message:
        "We could not reach the server. Please check your connection and try again.",
      code: "NETWORK",
      fieldErrors: {},
    };
  }
}

async function callJson<T>(
  url: string,
  init: RequestInit,
): Promise<{ ok: true; data: T } | ApiFailure> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
    });

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      const errorPayload = body as
        | { error?: { code?: string; message?: string; fieldErrors?: ApiFieldErrors } }
        | null;
      const error = errorPayload?.error;
      return {
        ok: false,
        message: error?.message ?? "Something went wrong. Please try again.",
        code: error?.code ?? "UNKNOWN",
        fieldErrors: error?.fieldErrors ?? {},
      };
    }

    return { ok: true, data: body as T };
  } catch {
    return {
      ok: false,
      message: "We could not reach the server. Please check your connection and try again.",
      code: "NETWORK",
      fieldErrors: {},
    };
  }
}