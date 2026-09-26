import mongoose from "mongoose";

import {
  DatabaseNotConfiguredError,
  DatabaseUnavailableError,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

/**
 * Server-only MongoDB connection module.
 *
 * - Connections are cached on `globalThis` so Next.js development hot reload
 *   does not open a new pool on every recompile.
 * - `bufferCommands: false` means a query fails fast (503) instead of hanging
 *   for 10s+ when MongoDB is unreachable.
 * - `MONGODB_URI` is read on the server only and never exposed to the browser.
 *
 * This module must never be imported from a Client Component.
 */

interface MongooseCache {
  connection: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

const globalForMongoose = globalThis as typeof globalThis & {
  __nexoraMongoose?: MongooseCache;
};

const cache: MongooseCache =
  globalForMongoose.__nexoraMongoose ?? { connection: null, promise: null };
globalForMongoose.__nexoraMongoose = cache;

const CONNECT_OPTIONS: mongoose.ConnectOptions = {
  bufferCommands: false,
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
  maxPoolSize: 10,
  retryWrites: true,
};

export function getMongoUri(): string {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new DatabaseNotConfiguredError(
      "MONGODB_URI is missing. Copy .env.example to .env.local and set your MongoDB connection string.",
    );
  }
  return uri;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI?.trim());
}

/** Returns a cached Mongoose connection, connecting on first use. */
export async function connectDB(): Promise<typeof mongoose> {
  if (cache.connection && cache.connection.connection.readyState === 1) {
    return cache.connection;
  }

  if (!cache.promise) {
    const uri = getMongoUri();
    cache.promise = mongoose
      .connect(uri, CONNECT_OPTIONS)
      .then((instance) => {
        cache.connection = instance;
        logger.info("MongoDB connected", {
          database: instance.connection.name,
          host: instance.connection.host,
        });
        return instance;
      })
      .catch((error: unknown) => {
        // Reset so the next request can retry instead of caching a failure.
        cache.promise = null;
        cache.connection = null;
        logger.error("MongoDB connection failed", error);
        throw new DatabaseUnavailableError(undefined, error);
      });
  }

  return cache.promise;
}

export async function disconnectDB(): Promise<void> {
  cache.promise = null;
  cache.connection = null;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export interface DatabaseHealth {
  configured: boolean;
  connected: boolean;
  database: string | null;
}

/** Lightweight health probe used by /api/health and the order flow. */
export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  if (!isDatabaseConfigured()) {
    return { configured: false, connected: false, database: null };
  }
  try {
    const instance = await connectDB();
    await instance.connection.db?.admin().ping();
    return {
      configured: true,
      connected: true,
      database: instance.connection.name ?? null,
    };
  } catch {
    return { configured: true, connected: false, database: null };
  }
}
