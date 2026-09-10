import { defineConfig } from "vitest/config";
import base from "./vitest.config.js";
export default defineConfig({ ...base, test: { ...base.test, include: ["lib/credentials/__tests__/*.integration.ts"], server: { deps: { inline: ["next-auth"] } }, testTimeout: 30000, hookTimeout: 60000, fileParallelism: false } });
