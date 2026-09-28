import "server-only";

import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";
import { v2 as cloudinary } from "cloudinary";

import { PRODUCT_IMAGE_ALLOWED_TYPES, PRODUCT_IMAGE_MAX_BYTES } from "@/lib/constants/pos";
import { connectDB } from "@/lib/db/mongodb";
import { ImageUploadFailedError } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

/**
 * Product image storage.
 *
 * Primary backend: Cloudinary. When CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET
 * are configured, the uploaded buffer is streamed straight to Cloudinary and the
 * product's `image` field stores its permanent CDN URL (res.cloudinary.com) —
 * no local proxy route is involved.
 *
 * Fallback: when Cloudinary is not configured, images are stored in MongoDB via
 * GridFS under the "product_images" bucket and served through
 * /api/pos/images/:id, so development keeps working without credentials.
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

function cloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME?.trim() &&
      process.env.CLOUDINARY_API_KEY?.trim() &&
      process.env.CLOUDINARY_API_SECRET?.trim(),
  );
}

export interface StoredProductImage {
  url: string;
  fileId: string;
}

function validateUpload(buffer: Buffer, contentType: string): void {
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
}

/** Uploads the buffer to Cloudinary and resolves with its secure CDN URL. */
async function uploadToCloudinary(
  buffer: Buffer,
  contentType: string,
  originalName: string,
): Promise<StoredProductImage> {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
    api_key: process.env.CLOUDINARY_API_KEY?.trim(),
    api_secret: process.env.CLOUDINARY_API_SECRET?.trim(),
    secure: true,
  });

  const extension = originalName.includes(".")
    ? originalName.slice(originalName.lastIndexOf(".")).toLowerCase().slice(0, 10)
    : "";
  const publicId = `nexora/products/${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  try {
    return await new Promise<StoredProductImage>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "nexora/products",
          public_id: publicId.split("/").pop(),
          resource_type: "image",
          // Preserve the original extension/format instead of re-encoding.
          use_filename: false,
          unique_filename: true,
          overwrite: false,
          format: extension.replace(".", "") || undefined,
        },
        (error, result) => {
          if (error || !result) {
            reject(new ImageUploadFailedError("Image upload failed.", error));
            return;
          }
          resolve({
            url: result.secure_url,
            fileId: result.public_id,
          });
        },
      );
      stream.end(buffer);
    });
  } catch (error) {
    logger.error("Cloudinary upload failed", error);
    throw error instanceof ImageUploadFailedError
      ? error
      : new ImageUploadFailedError("Image upload failed.", error);
  }
}

/**
 * Stores a single uploaded image. Throws ImageUploadFailedError on anything the
 * route should surface as a 4xx/5xx (oversize, bad type, IO).
 */
export async function saveProductImage(
  buffer: Buffer,
  contentType: string,
  originalName: string,
): Promise<StoredProductImage> {
  validateUpload(buffer, contentType);

  if (cloudinaryConfigured()) {
    return uploadToCloudinary(buffer, contentType, originalName);
  }

  // GridFS fallback (no Cloudinary credentials configured).
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