import { NextResponse } from "next/server";

import {
  InvalidRequestError,
  isAppError,
  type AppErrorCode,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

export interface ApiErrorBody {
  error: {
    code: AppErrorCode;
    message: string;
    fieldErrors?: Record<string, string[]>;
  };
}

/**
 * Maps any thrown value to a customer-safe JSON error response.
 * Internal details (stack traces, MongoDB errors, file paths) stay on the server.
 */
export function toErrorResponse(error: unknown, context: string): NextResponse<ApiErrorBody> {
  if (isAppError(error)) {
    if (error.status >= 500) {
      logger.error(context, error);
    }
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
        },
      },
      { status: error.status },
    );
  }

  logger.error(context, error);
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR" as AppErrorCode,
        message: "Something went wrong on our side. Please try again.",
      },
    },
    { status: 500 },
  );
}

export function toSuccessResponse<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status });
}

/**
 * Reads a JSON request body or returns a ready-to-send error response.
 * Keeps every route handler's malformed-body handling identical.
 */
export async function readJsonBody(
  request: Request,
  context = "Read JSON request body",
): Promise<{ body: unknown } | { error: NextResponse<ApiErrorBody> }> {
  try {
    return { body: await request.json() };
  } catch {
    return {
      error: toErrorResponse(new InvalidRequestError("Send a JSON body."), context),
    };
  }
}

/** Backward-compatible name used by the POS route handlers. */
export const parseJsonBody = readJsonBody;
