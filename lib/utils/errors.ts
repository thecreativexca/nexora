import { ZodError } from "zod";

/**
 * Application error taxonomy.
 *
 * Services throw these; route handlers / server actions translate them into
 * customer-safe responses. Raw Mongo/driver errors and stack traces must never
 * reach the browser.
 */
export type AppErrorCode =
  | "DATABASE_NOT_CONFIGURED"
  | "DATABASE_UNAVAILABLE"
  | "TRANSACTIONS_UNSUPPORTED"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "PRODUCT_UNAVAILABLE"
  | "OUT_OF_STOCK"
  | "ORDER_CREATION_FAILED"
  | "INVALID_CREDENTIALS"
  | "EMAIL_TAKEN"
  | "ACCOUNT_DISABLED"
  | "UNAUTHENTICATED"
  | "CUSTOMER_CREATION_FAILED"
  | "PROFILE_UPDATE_FAILED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "INVITATION_NOT_FOUND"
  | "INVITATION_EXPIRED"
  | "INVITATION_USED"
  | "INVITATION_EMAIL_MISMATCH"
  | "MFA_REQUIRED"
  | "MFA_INVALID"
  | "MFA_SETUP_REQUIRED"
  | "STAFF_MANAGEMENT_FAILED"
  | "SKU_TAKEN"
  | "SLUG_TAKEN"
  | "CATEGORY_NOT_FOUND"
  | "PRODUCT_SAVE_FAILED"
  | "IMG_UPLOAD_FAILED"
  | "ALREADY_REFUNDED"
  | "INVALID_ORDER_TRANSITION"
  | "ORDER_ALREADY_TERMINAL"
  | "ORDER_REFUND_FAILED"
  | "REPORT_AGGREGATION_FAILED"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(
    message: string,
    options: {
      code: AppErrorCode;
      status: number;
      fieldErrors?: Record<string, string[]>;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = new.target.name;
    this.code = options.code;
    this.status = options.status;
    this.fieldErrors = options.fieldErrors;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export class DatabaseNotConfiguredError extends AppError {
  constructor(message = "The database connection is not configured.") {
    super(message, { code: "DATABASE_NOT_CONFIGURED", status: 503 });
  }
}

export class DatabaseUnavailableError extends AppError {
  constructor(
    message = "The catalogue is temporarily unavailable. Please try again in a moment.",
    cause?: unknown,
  ) {
    super(message, { code: "DATABASE_UNAVAILABLE", status: 503, cause });
  }
}

export class TransactionsUnsupportedError extends AppError {
  constructor(
    message = "Ordering is temporarily unavailable: the connected MongoDB deployment does not support transactions. A replica-set deployment (MongoDB Atlas or a local single-node replica set) is required.",
    cause?: unknown,
  ) {
    super(message, { code: "TRANSACTIONS_UNSUPPORTED", status: 503, cause });
  }
}

export class InvalidRequestError extends AppError {
  constructor(
    message = "The request could not be processed.",
    fieldErrors?: Record<string, string[]>,
  ) {
    super(message, { code: "INVALID_REQUEST", status: 400, fieldErrors });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "That record could not be found.") {
    super(message, { code: "NOT_FOUND", status: 404 });
  }
}

export class ProductUnavailableError extends AppError {
  constructor(message: string) {
    super(message, { code: "PRODUCT_UNAVAILABLE", status: 409 });
  }
}

export class OutOfStockError extends AppError {
  constructor(message: string) {
    super(message, { code: "OUT_OF_STOCK", status: 409 });
  }
}

export class OrderCreationFailedError extends AppError {
  constructor(
    message = "We could not place your order. No payment has been taken - please try again.",
    cause?: unknown,
  ) {
    super(message, { code: "ORDER_CREATION_FAILED", status: 500, cause });
  }
}


export class InvalidCredentialsError extends AppError {
  constructor(message = "Invalid email or password.") {
    super(message, { code: "INVALID_CREDENTIALS", status: 401 });
  }
}

export class EmailTakenError extends AppError {
  constructor(message = "An account with this email already exists. Try signing in instead.") {
    super(message, { code: "EMAIL_TAKEN", status: 409 });
  }
}

export class AccountDisabledError extends AppError {
  constructor(
    message = "This account has been disabled. Please contact Nexora support for help.",
  ) {
    super(message, { code: "ACCOUNT_DISABLED", status: 403 });
  }
}

/** Thrown when a request needs a signed-in customer but none is present. */
export class UnauthenticatedError extends AppError {
  constructor(message = "Please sign in to continue.") {
    super(message, { code: "UNAUTHENTICATED", status: 401 });
  }
}

/** Authenticated but not allowed to perform the requested staff action. */
export class ForbiddenError extends AppError {
  constructor(message = "You are not allowed to do that.") {
    super(message, { code: "FORBIDDEN", status: 403 });
  }
}

/** Application-level throttling (staff login, MFA, invitation checks). */
export class TooManyRequestsError extends AppError {
  constructor(
    message = "Too many attempts. Please wait a moment and try again.",
    retryAfterSeconds?: number,
  ) {
    super(message, { code: "RATE_LIMITED", status: 429 });
    this.retryAfterSeconds = retryAfterSeconds;
  }
  readonly retryAfterSeconds?: number;
}

/** The invitation code does not exist / could not be matched. */
export class InvitationNotFoundError extends AppError {
  constructor(message = "No invitation matches that code.") {
    super(message, { code: "INVITATION_NOT_FOUND", status: 404 });
  }
}

export class InvitationExpiredError extends AppError {
  constructor(message = "This invitation has expired. Ask a manager for a new one.") {
    super(message, { code: "INVITATION_EXPIRED", status: 410 });
  }
}

export class InvitationUsedError extends AppError {
  constructor(message = "This invitation has already been used.") {
    super(message, { code: "INVITATION_USED", status: 409 });
  }
}

export class InvitationEmailMismatchError extends AppError {
  constructor(message = "This code was issued for a different email address.") {
    super(message, { code: "INVITATION_EMAIL_MISMATCH", status: 422 });
  }
}

/** The staff member must complete MFA before the portal session is granted. */
export class MfaRequiredError extends AppError {
  constructor(message = "Complete the two-step verification to continue.") {
    super(message, { code: "MFA_REQUIRED", status: 403 });
  }
}

export class MfaInvalidError extends AppError {
  constructor(message = "That code is not valid. Check your authenticator and try again.") {
    super(message, { code: "MFA_INVALID", status: 422 });
  }
}

export class MfaSetupRequiredError extends AppError {
  constructor(message = "Two-step verification must be set up before you continue.") {
    super(message, { code: "MFA_SETUP_REQUIRED", status: 403 });
  }
}

export class StaffManagementFailedError extends AppError {
  constructor(
    message = "We could not update that staff account.",
    cause?: unknown,
  ) {
    super(message, { code: "STAFF_MANAGEMENT_FAILED", status: 500, cause });
  }
}

export class DuplicateSkuError extends AppError {
  constructor(message = "SKU already exists.") {
    super(message, { code: "SKU_TAKEN", status: 409 });
  }
}

export class DuplicateSlugError extends AppError {
  constructor(message = "A product with this name already exists.") {
    super(message, { code: "SLUG_TAKEN", status: 409 });
  }
}

export class CategoryNotFoundError extends AppError {
  constructor(message = "The selected category does not exist.") {
    super(message, { code: "CATEGORY_NOT_FOUND", status: 400 });
  }
}

export class ProductSaveFailedError extends AppError {
  constructor(
    message = "We could not save that product.",
    cause?: unknown,
  ) {
    super(message, { code: "PRODUCT_SAVE_FAILED", status: 500, cause });
  }
}

export class ImageUploadFailedError extends AppError {
  constructor(
    message = "The image could not be uploaded. Check the file and try again.",
    cause?: unknown,
  ) {
    super(message, { code: "IMG_UPLOAD_FAILED", status: 500, cause });
  }
}

/** The order is already fully refunded (double-refund guard). */
export class AlreadyRefundedError extends AppError {
  constructor(message = "This order has already been refunded.") {
    super(message, { code: "ALREADY_REFUNDED", status: 409 });
  }
}

/** The requested status jump is not allowed by the controlled workflow. */
export class InvalidOrderTransitionError extends AppError {
  constructor(message = "That status change is not allowed for this order.") {
    super(message, { code: "INVALID_ORDER_TRANSITION", status: 409 });
  }
}

/** The order is in a terminal state and cannot move further. */
export class OrderAlreadyTerminalError extends AppError {
  constructor(message = "This order is already in its final state.") {
    super(message, { code: "ORDER_ALREADY_TERMINAL", status: 409 });
  }
}

/** A refund transaction did not commit - nothing was partially applied. */
export class OrderRefundFailedError extends AppError {
  constructor(
    message = "We could not process that refund. The sale was left unchanged - please try again.",
    cause?: unknown,
  ) {
    super(message, { code: "ORDER_REFUND_FAILED", status: 500, cause });
  }
}

/** The reports aggregation itself failed south of MongoDB. */
export class ReportAggregationFailedError extends AppError {
  constructor(
    message = "We could not calculate your reports right now. Please try again in a moment.",
    cause?: unknown,
  ) {
    super(message, { code: "REPORT_AGGREGATION_FAILED", status: 500, cause });
  }
}

export class CustomerCreationFailedError extends AppError {
  constructor(
    message = "We could not create your account right now. Please try again in a moment.",
    cause?: unknown,
  ) {
    super(message, { code: "CUSTOMER_CREATION_FAILED", status: 500, cause });
  }
}

export class ProfileUpdateFailedError extends AppError {
  constructor(
    message = "We could not save your profile changes. Please try again.",
    cause?: unknown,
  ) {
    super(message, { code: "PROFILE_UPDATE_FAILED", status: 500, cause });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toFieldErrors(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "form";
    const existing = fieldErrors[key] ?? [];
    existing.push(issue.message);
    fieldErrors[key] = existing;
  }
  return fieldErrors;
}

/** Builds a ZodError-based 400 without leaking internals. */
export function validationError(error: ZodError, message = "Please check the highlighted fields."): AppError {
  return new InvalidRequestError(message, toFieldErrors(error));
}

/**
 * MongoDB rejects transactions on standalone servers with one of these
 * messages. We surface a clear, actionable error instead of pretending the
 * write was atomic.
 */
export function isTransactionUnsupportedError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; message?: unknown; codeName?: unknown };
  if (candidate.code === 20 || candidate.codeName === "IllegalOperation") return true;
  const message = typeof candidate.message === "string" ? candidate.message : "";
  return (
    message.includes("Transaction numbers are only allowed on a replica set") ||
    message.includes("does not support transactions") ||
    message.includes("Transactions are not supported")
  );
}

export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}

export function isConnectionError(error: unknown): boolean {
  const name = (error as { name?: unknown })?.name;
  return (
    name === "MongooseServerSelectionError" ||
    name === "MongoNetworkError" ||
    name === "MongoServerSelectionError" ||
    name === "MongoNotConnectedError" ||
    name === "MongoTopologyClosedError"
  );
}
