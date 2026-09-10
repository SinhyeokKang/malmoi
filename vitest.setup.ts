import { vi } from "vitest";
vi.mock("server-only", () => ({}));
for (const [prefix, byte] of [["TOKEN", 71], ["PII", 72]] as const) {
  process.env[`${prefix}_ENCRYPTION_KEYS`] = JSON.stringify({ test: Buffer.alloc(32, byte).toString("base64") });
  process.env[`${prefix}_ENCRYPTION_ACTIVE_KEY_ID`] = "test";
}
process.env.EMAIL_LOOKUP_KEY = Buffer.alloc(32, 73).toString("base64");
process.env.EMAIL_LOOKUP_KEY_ID = "test";
