import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";

import { PrismaClient } from "../generated/prisma/client";

/**
 * 스크립트 공통 준비 둘 (launch-readiness L7.4). 여섯 스크립트가 각자 조립하면서 옵션이 갈렸다.
 *
 * ⚠️ **`lib/db.ts`를 쓰지 않는다** — 그 파일의 `server-only`가 react-server 조건 없는 tsx를 막는다 (ARCHITECTURE §5.5.4).
 */

/** `.env.local`을 읽는다. dotenv는 **이미 있는 `process.env`를 덮지 않으므로** 명령 앞에 붙인 값이 이긴다. */
export function loadLocalEnv(): void {
  config({ path: ".env.local", quiet: true });
}

/**
 * ⚠️ **`log: []`다** — Prisma의 자체 로그가 쿼리 인자(자격증명 봉투·이메일)를 찍지 않게 한다. 오류는 그대로 던진다.
 */
export function scriptPrisma(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }), log: [] });
}
