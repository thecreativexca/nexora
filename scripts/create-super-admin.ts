/**
 * Creates or resets the Super-Admin account for the Nexora POS portal.
 *
 *   npm run create-super-admin
 *
 * Inputs come from SUPER_ADMIN_NAME / SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD
 * environment variables, or from interactive prompts (the password is typed
 * without echo). This is a development/ops tool - it is a deliberate CLI-only
 * flow and NOT exposed as an HTTP endpoint.
 *
 * Requires tsx to honour the react-server export condition so server-only
 * modules can be imported:
 *   tsx --conditions=react-server scripts/create-super-admin.ts
 */
import readline, { type Interface } from "node:readline/promises";

import { z } from "zod";

import { connectDB, disconnectDB } from "@/lib/db/mongodb";
import { bootstrapSuperAdmin } from "@/lib/services/staff.service";
import { loadEnvFiles } from "@/scripts/load-env";
import {
  emailSchema,
  customerNameSchema,
} from "@/lib/validations/common";
import { staffPasswordSchema } from "@/lib/validations/staff";

interface SuperAdminInput {
  name: string;
  email: string;
  password: string;
}

async function readSuperAdminInput(): Promise<SuperAdminInput> {
  const fromEnv = {
    name: process.env.SUPER_ADMIN_NAME?.trim() ?? "",
    email: process.env.SUPER_ADMIN_EMAIL?.trim() ?? "",
    password: process.env.SUPER_ADMIN_PASSWORD ?? "",
  };

  if (fromEnv.name && fromEnv.email && fromEnv.password) {
    return fromEnv;
  }

  const rl: Interface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const name =
    fromEnv.name || (await rl.question("Super-Admin name: "));
  const email =
    fromEnv.email || (await rl.question("Super-Admin email: "));
  rl.close();

  const password =
    fromEnv.password || (await promptHidden("Password (hidden): "));
  const confirm =
    fromEnv.password || (await promptHidden("Confirm password (hidden): "));

  if (confirm !== password) {
    throw new Error("Passwords do not match.");
  }

  return { name, email, password };
}

/** Cross-platform hidden input: disables terminal echo while typing. */
function promptHidden(promptText: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stdout.write(promptText);

    let value = "";

    const onData = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      for (const char of text) {
        if (char === "\r" || char === "\n") {
          process.stdout.write("\n");
          stdin.pause();
          stdin.removeListener("data", onData);
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          process.stdout.write("\n");
          process.exit(130);
        }
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
        } else {
          value += char;
        }
      }
    };

    if (typeof stdin.setRawMode === "function") {
      stdin.setRawMode(true);
      stdin.resume();
      stdin.on("data", onData);
    } else {
      reject(new Error("Interactive password entry is unavailable on this platform."));
    }
  });
}

async function main(): Promise<void> {
  const loadedFiles = loadEnvFiles();
  console.log(`[create-super-admin] env files loaded: ${loadedFiles.join(", ") || "none"}`);

  if (!process.env.MONGODB_URI?.trim()) {
    throw new Error(
      "MONGODB_URI is not set. Copy .env.example to .env.local and add your connection string.",
    );
  }

  const input = await readSuperAdminInput();
  const parsed = z
    .object({
      name: customerNameSchema,
      email: emailSchema,
      password: staffPasswordSchema,
    })
    .safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Invalid input: ${Object.entries(parsed.error.flatten().fieldErrors)
        .map(([key, messages]) => `${key}: ${messages.join(", ")}`)
        .join("; ")}`,
    );
  }

  const connection = await connectDB();
  console.log(`[create-super-admin] connected to database "${connection.connection.name}"`);

  const staff = await bootstrapSuperAdmin(parsed.data);
  console.log("[create-super-admin] Super-Admin is ready:");
  console.log(`  name:  ${staff.name}`);
  console.log(`  email: ${staff.email}`);
  console.log(`  role:  ${staff.role}`);

  await disconnectDB();
}

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[create-super-admin] failed: ${message}`);
  await disconnectDB().catch(() => undefined);
  process.exit(1);
});