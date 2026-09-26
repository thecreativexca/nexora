import { InvalidRequestError } from "@/lib/utils/errors";

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const expected = new URL(process.env.NEXT_PUBLIC_APP_URL ?? request.url).origin;
  if (origin !== expected) throw new InvalidRequestError("The request origin is not allowed.");
}
