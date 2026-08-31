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

// Next.js dev는 매 수정마다 모듈을 다시 평가한다. 전역에 붙이지 않으면 커넥션 풀이 계속
// 새로 생겨 Supabase 커넥션 한도를 금방 먹는다.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * **지연 생성이다 — 모듈 최상위에서 만들지 않는다.**
 * 최상위에서 만들면 `requireEnv`가 import 시점에 던지고, DATABASE_URL이 없는 환경
 * (CI의 `next build`·이 모듈을 import하는 테스트)에서 파일을 읽기만 해도 죽는다.
 * `prisma.config.ts`가 정확히 이 함정으로 CI를 red로 만든 전례가 있다 —
 * docs/POSTMORTEM.md 2026-08-31 항목.
 */
export function getPrisma(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (existing) return existing;

  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireEnv("DATABASE_URL") }),
  });
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}
