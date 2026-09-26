import { Readable } from "node:stream";

import { getProductImage } from "@/lib/services/image.service";
import { toErrorResponse } from "@/lib/utils/http";

/**
 * Streams a stored product image from GridFS.
 *
 * Public on purpose: any product image URL must render in the storefront and
 * in the staff portal without extra auth. Unknown/expired ids simply 404.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ imageId: string }> },
) {
  const { imageId } = await params;

  try {
    const image = await getProductImage(imageId);
    if (!image) {
      return new Response(null, { status: 404 });
    }

    return new Response(Readable.toWeb(image.stream) as unknown as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": image.contentType,
        "Content-Length": String(image.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/images failed");
  }
}