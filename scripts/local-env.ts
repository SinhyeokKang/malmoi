import { config } from "dotenv";

/**
 * `.env.local`을 읽는다. dotenv는 **이미 있는 `process.env`를 덮지 않으므로** 명령 앞에 붙인 값이 이긴다.
 *
 * ⚠️ **`scripts/local.ts`와 떨어져 있어야 한다** (action-run-cache r2). `push:local`은 대상 리포 러너에서 돌고 거기엔
 * `prisma generate`가 없다 — 같은 파일의 `PrismaClient` import가 딸려 오면 action이 `ERR_MODULE_NOT_FOUND`로 죽는다.
 * `__tests__/push-local-graph.test.ts`가 그 그래프를 센다.
 */
export function loadLocalEnv(): void {
  config({ path: ".env.local", quiet: true });
}
