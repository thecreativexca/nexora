/** Minimal server-side logger. Never logs request bodies, URIs or credentials. */

type LogMeta = Record<string, unknown>;

function summarise(error: unknown): LogMeta {
  if (error instanceof Error) {
    const summary: LogMeta = { name: error.name, message: error.message };
    const code = (error as { code?: unknown }).code;
    if (code !== undefined) summary.code = code;
    if (process.env.NODE_ENV !== "production" && error.stack) {
      summary.stack = error.stack;
    }
    return summary;
  }
  return { error: String(error) };
}

export const logger = {
  info(message: string, meta?: LogMeta) {
    console.info(`[nexora] ${message}`, meta ?? "");
  },
  warn(message: string, meta?: LogMeta) {
    console.warn(`[nexora] ${message}`, meta ?? "");
  },
  error(message: string, error?: unknown, meta?: LogMeta) {
    console.error(`[nexora] ${message}`, {
      ...(meta ?? {}),
      ...(error === undefined ? {} : summarise(error)),
    });
  },
};
