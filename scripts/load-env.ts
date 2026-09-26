import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Minimal .env loader for standalone Node scripts (seed, tests).
 *
 * Next.js loads env files itself for the app, but scripts run outside of Next,
 * so we read `.env.local` first and then `.env`. Existing process values always
 * win, and no real credentials ever live in the repository.
 */
function parseEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key) continue;

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

export function loadEnvFiles(cwd: string = process.cwd()): string[] {
  const loaded: string[] = [];

  for (const file of [".env.local", ".env"]) {
    const fullPath = path.join(cwd, file);
    if (!existsSync(fullPath)) continue;

    const values = parseEnvFile(readFileSync(fullPath, "utf8"));
    for (const [key, value] of Object.entries(values)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    loaded.push(file);
  }

  return loaded;
}
