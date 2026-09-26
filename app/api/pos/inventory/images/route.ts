import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { saveProductImage } from "@/lib/services/image.service";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

/**
 * Product image upload (manager/super-admin only).
 *
 * POST multipart/form-data with a single `file` field. Stores the image in
 * GridFS and hands back a /api/pos/images/:id URL that works like any pasted
 * image URL.
 */
export async function POST(request: Request) {
  try {
    await requirePermissionApi(STAFF_PERMISSION.ACCESS_INVENTORY);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/inventory/images auth");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return toErrorResponse(
      new Error("Send the image as multipart/form-data."),
      "POST /api/pos/inventory/images malformed form",
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return toErrorResponse(
      new Error("Include an image file in the form field named \"file\"."),
      "POST /api/pos/inventory/images missing file",
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await saveProductImage(
      buffer,
      file.type || "application/octet-stream",
      file.name,
    );
    return toSuccessResponse({ imageUrl: stored.url }, 201);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/inventory/images failed");
  }
}