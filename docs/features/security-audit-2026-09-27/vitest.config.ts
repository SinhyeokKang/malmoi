import { defineConfig } from "vitest/config";
import base from "../../../vitest.config";
export default defineConfig({ ...base, test: { ...base.test,
  include: ["docs/features/security-audit-2026-09-27/probes.test.ts"],
  testTimeout: 15000, hookTimeout: 60000, fileParallelism: false,
} });
