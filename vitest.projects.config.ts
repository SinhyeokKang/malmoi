import { defineConfig } from "vitest/config";
import base from "./vitest.config.js";
/**
 * 목록 집계의 **격리 PostgreSQL 검증** (projects-list tasks T3). `pnpm test`와 분리한 이유는
 * `vitest.credentials.config.ts`와 같다 — 로컬 PostgreSQL 바이너리를 요구하고 실제 클러스터를 띄운다.
 *
 * ⚠️ **`lib/keys/**`의 raw 집계를 건드렸으면 손으로 돌린다**: `pnpm test:projects:postgres`.
 */
export default defineConfig({ ...base, test: { ...base.test, include: ["lib/keys/__tests__/*.integration.ts", "lib/events/__tests__/*.integration.ts"], testTimeout: 30000, hookTimeout: 60000, fileParallelism: false } });
