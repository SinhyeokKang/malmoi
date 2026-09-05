import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `getPrisma()`가 **프로덕션에서도** 인스턴스를 재사용하는지 본다.
 *
 * 전에는 `NODE_ENV !== "production"`일 때만 전역에 저장해서, 프로덕션은 호출마다 새 `PrismaClient`와
 * `pg.Pool`을 만들었다(`@prisma/adapter-pg`는 클라이언트마다 풀을 만든다). 번역 화면 한 번에 `auth()` 둘 +
 * 인가 + 조회 = 풀 4개, 연결·TLS 핸드셰이크 4회. dev는 캐시가 있어 **로컬에서는 원리적으로 안 보인다**
 * (Codex 감사 2026-09-06 #9). "dev에서만 전역에 붙인다"는 Prisma 관용구는 모듈 최상위 `const`와 짝이고,
 * 지연 생성에서는 그 짝이 깨진다.
 *
 * `server-only`는 vitest에서 던지므로 mock한다 — 이 테스트가 보는 것은 캐시 정책 하나다.
 */

vi.mock("server-only", () => ({}));

const globalForPrisma = globalThis as unknown as { prisma?: unknown };

describe("getPrisma — 인스턴스 재사용", () => {
  beforeEach(() => {
    delete globalForPrisma.prisma;
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:6543/db?pgbouncer=true");
  });

  afterEach(() => {
    delete globalForPrisma.prisma;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("NODE_ENV=production에서 두 번 부르면 같은 인스턴스다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { getPrisma } = await import("../db");
    // `toBe`는 실패 시 두 프록시를 diff하려다 스택이 터진다 — 동일성만 본다.
    expect(Object.is(getPrisma(), getPrisma())).toBe(true);
  });

  it("NODE_ENV=development에서도 같은 인스턴스다", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { getPrisma } = await import("../db");
    expect(Object.is(getPrisma(), getPrisma())).toBe(true);
  });
});
