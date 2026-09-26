import { getDatabaseHealth } from "@/lib/db/mongodb";
import { toSuccessResponse } from "@/lib/utils/http";

/**
 * Operational health probe: reports whether the app can reach MongoDB.
 * Exposes nothing about credentials or the deployment.
 */
export async function GET() {
  const health = await getDatabaseHealth();

  return toSuccessResponse(
    {
      status: health.connected ? "ok" : "degraded",
      database: {
        configured: health.configured,
        connected: health.connected,
      },
      timestamp: new Date().toISOString(),
    },
    health.connected ? 200 : 503,
  );
}
