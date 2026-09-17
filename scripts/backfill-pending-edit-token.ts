#!/usr/bin/env tsx
/**
 * 배포 A 이전 편집에 편집 토큰을 채운다 (sync-edit-protection design §6.1 3단계 · tasks T5).
 *
 *   pnpm exec tsx scripts/backfill-pending-edit-token.ts
 *
 * **0행이 두 번 연속 나올 때까지 반복한다.** 한 번의 0행은 수렴의 증거가 아니다 — 배포 A 롤아웃 중이면 옛 코드가
 * 토큰 없이 저장한 행이 그 뒤에 들어올 수 있다. 문장은 멱등이라 몇 번을 돌아도 이미 발급한 토큰을 바꾸지 않는다.
 *
 * ⚠️ **대상 DB는 `DATABASE_URL`이다** — prod는 명령 한 줄에서 그 변수를 prod pooler로 넘긴다(dotenv는 이미 선
 * 환경변수를 덮지 않는다). `.env.local`은 편집하지 않는다 (CLAUDE.md "이 파일은 에이전트가 편집하지 않는다").
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";
import { requireEnv } from "../lib/env";
import { backfillPendingEditTokens } from "../lib/protection/backfill";

config({ path: ".env.local", quiet: true });

/** 롤아웃이 끝났으면 두세 바퀴에 수렴한다. 이 수를 넘으면 무언가 계속 토큰 없이 쓰고 있다는 뜻이다. */
const MAX_ROUNDS = 20;

async function main(): Promise<void> {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: requireEnv("DATABASE_URL") }), log: [] });
  try {
    let zeros = 0;
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const updated = await backfillPendingEditTokens(prisma);
      console.log(`round ${round}: ${updated} rows`);
      zeros = updated === 0 ? zeros + 1 : 0;
      if (zeros === 2) {
        console.log("converged: 0 rows twice in a row");
        return;
      }
    }
    console.error(`not converged after ${MAX_ROUNDS} rounds — an old writer may still be saving without tokens`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

await main();
