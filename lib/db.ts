// Prisma 7 클라이언트 단일 인스턴스.
//
// v7은 driver adapter를 필수화했고 접속 URL이 스키마에서 사라졌다. 그래서 URL이 두 곳으로
// 갈린다 — **여기는 런타임(transaction 모드 pooler 6543), prisma.config.ts는 마이그레이션
// (session 모드 pooler 5432)**이다. 바꿔 쓰면 서버리스에서 커넥션이 고갈되거나 DDL이 실패한다.
//
// `?pgbouncer=true`가 DATABASE_URL에 없으면 prepared statement가 충돌해 **간헐** 실패한다
// ("가끔 되고 가끔 안 됨"이라 진단이 오래 걸린다). .env.example의 값을 그대로 쓴다.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { requireEnv } from "@/lib/env";

// Next.js dev는 매 수정마다 모듈을 다시 평가한다. 전역에 붙이지 않으면 커넥션 풀이 계속
// 새로 생겨 Supabase 커넥션 한도를 금방 먹는다.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: requireEnv("DATABASE_URL") });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
