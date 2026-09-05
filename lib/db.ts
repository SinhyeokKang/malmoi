// 클라이언트 번들 유입을 컴파일 타임에 막는다. 이 파일이 "use client" 모듈 그래프에
// 들어가면 빌드가 실패한다 — 런타임에 DB URL이 브라우저로 새는 것보다 빌드 실패가 낫다.
// **lib/env.ts에는 붙이지 않는다**: 이 패키지는 react-server 조건 밖에서 import하면 던지고,
// env.ts는 lib/__tests__/env.test.ts가 직접 import하므로 테스트가 죽는다.
import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { requireEnv } from "@/lib/env";

// Prisma 7 클라이언트 단일 인스턴스.
//
// v7은 driver adapter를 필수화했고 접속 URL이 스키마에서 사라졌다. 그래서 URL이 두 곳으로
// 갈린다 — **여기는 런타임(transaction 모드 pooler 6543), prisma.config.ts는 마이그레이션
// (session 모드 pooler 5432)**이다. 바꿔 쓰면 서버리스에서 커넥션이 고갈되거나 DDL이 실패한다.
//
// `?pgbouncer=true`가 DATABASE_URL에 없으면 prepared statement가 충돌해 **간헐** 실패한다
// ("가끔 되고 가끔 안 됨"이라 진단이 오래 걸린다). .env.example의 값을 그대로 쓴다.

// 전역에 붙인다 — dev는 매 수정마다 모듈을 다시 평가하고, 프로덕션은 요청마다 이 함수를 여러 번
// 부른다(`auth()` 둘 + 인가 + 조회). 어느 쪽도 인스턴스가 새로 생기면 `pg.Pool`이 함께 생긴다.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * **지연 생성이다 — 모듈 최상위에서 만들지 않는다.**
 * 최상위에서 만들면 `requireEnv`가 import 시점에 던지고, DATABASE_URL이 없는 환경
 * (CI의 `next build`·이 모듈을 import하는 테스트)에서 파일을 읽기만 해도 죽는다.
 * `prisma.config.ts`가 정확히 이 함정으로 CI를 red로 만든 전례가 있다 —
 * docs/POSTMORTEM.md 2026-08-31 항목.
 *
 * ⚠️ **캐시 저장을 환경으로 가르지 않는다.** 전에는 `NODE_ENV !== "production"`일 때만 저장해서
 * **프로덕션이 호출마다 새 클라이언트와 `pg.Pool`을 만들었다** — 번역 화면 한 번에 풀 4개, 핸드셰이크
 * 4회이고 dev는 캐시가 있어 로컬에서는 보이지 않았다 (Codex 감사 2026-09-06 #9). "dev에서만 전역에
 * 붙인다"는 Prisma 관용구는 모듈 최상위 `const`가 프로덕션의 단일 인스턴스를 보장할 때의 것이고,
 * 지연 생성에서는 그 보장이 없다. `lib/__tests__/db.test.ts`가 두 환경 모두 동일성을 본다.
 */
export function getPrisma(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (existing) return existing;

  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireEnv("DATABASE_URL") }),
  });
  globalForPrisma.prisma = client;
  return client;
}
