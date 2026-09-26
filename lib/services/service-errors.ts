import "server-only";

import {
  DatabaseUnavailableError,
  isAppError,
  isConnectionError,
  type AppError,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

/**
 * Read paths only fail when MongoDB is unreachable, so unknown errors are
 * translated into a single customer-safe 503.
 */
export function toDatabaseError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (!isConnectionError(error)) {
    logger.error("Unexpected database error", error);
  }
  return new DatabaseUnavailableError(undefined, error);
}
