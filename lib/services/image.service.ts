import "server-only";

import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";

import { PRODUCT_IMAGE_ALLOWED_TYPES, PRODUCT_IMAGE_MAX_BYTES } from "@/lib/constants/pos";
import { connectDB } from "@/lib/db/mongodb";
import { ImageUploadFailedError } from "@/lib/utils/errors";

/**
 * Product images are stored in MongoDB via GridFS under the "product_images"
 * bucket. Referencing images by URL (the product's `image` field) keeps the
 * product schema unchanged: an uploaded file simply gets a `/api/pos/images/:id`
 * URL just like a pasted one.
 */

const BUCKET_NAME = "product_images";

function getBucket(): GridFSBucket | null {
  const db = mongoose.connection.db;
  if (!db) return null;
  return new GridFSBucket(db, {
    bucketName: BUCKET_NAME,
    chunkSizeBytes: 255 * 1024,
  });
}

export interface StoredProductImage {
  url: string;
  fileId: string;
}

/**
 * Stores a single uploaded image in GridFS. Throws ImageUploadFailedError on
 * anything the route should surface as a 4xx/5xx (oversize, bad type, IO).
 */
export async function saveProductImage(
  buffer: Buffer,
  contentType: string,
  originalName: string,
): Promise<StoredProductImage> {
  if (buffer.byteLength === 0) {
    throw new ImageUploadFailedError("The uploaded image is empty.");
  }
  if (buffer.byteLength > PRODUCT_IMAGE_MAX_BYTES) {
    throw new ImageUploadFailedError(
      `The uploaded image is too large (max ${Math.round(PRODUCT_IMAGE_MAX_BYTES / (1024 * 1024))} MB).`,
    );
  }
  if (!(PRODUCT_IMAGE_ALLOWED_TYPES as readonly string[]).includes(contentType)) {
    throw new ImageUploadFailedError(
      "Unsupported image type. Use JPEG, PNG, GIF or WebP.",
    );
  }

  await connectDB();
  const bucket = getBucket();
  if (!bucket) {
    throw new ImageUploadFailedError("Image storage is not available right now.");
  }

  const fileId = new mongoose.Types.ObjectId();
  const safeName = originalName.trim().slice(0, 180) || "product-image";

  try {
    await new Promise<void>((resolve, reject) => {
      const stream = bucket.openUploadStreamWithId(fileId, safeName, {
        metadata: { kind: "product-image", contentType, uploadedAt: new Date() },
      });
      stream.once("finish", () => resolve());
      stream.once("error", reject);
      stream.end(buffer);
    });
  } catch (error) {
    throw new ImageUploadFailedError("Image upload failed.", error);
  }

  return { url: `/api/pos/images/${String(fileId)}`, fileId: String(fileId) };
}

export interface ProductImageResult {
  stream: import("stream").Readable;
  contentType: string;
  length: number;
}

/** Returns a download stream for a stored image, or null when it does not exist. */
export async function getProductImage(fileId: string): Promise<ProductImageResult | null> {
  if (!mongoose.Types.ObjectId.isValid(fileId)) return null;

  await connectDB();
  const bucket = getBucket();
  if (!bucket) return null;

  const reference = new mongoose.Types.ObjectId(fileId);
  const document = await bucket.find({ _id: reference }).next();
  if (!document) return null;

  const metadata = (document.metadata ?? {}) as Record<string, unknown>;
  const contentType =
    typeof metadata.contentType === "string"
      ? metadata.contentType
      : "application/octet-stream";

  return {
    stream: bucket.openDownloadStream(reference),
    contentType,
    length: document.length,
  };
}