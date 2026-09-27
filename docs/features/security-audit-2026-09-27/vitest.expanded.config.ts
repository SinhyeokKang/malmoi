import { defineConfig } from "vitest/config";
import base from "../../../vitest.config";
export default defineConfig({ ...base, test: { ...base.test,
  include: ["docs/features/security-audit-2026-09-27/expanded.test.ts"],
  testTimeout: 10000, fileParallelism: false,
} });
