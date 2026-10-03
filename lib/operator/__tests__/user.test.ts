import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { lookupEmail } from "@/lib/credentials/storage";

import { isOperatorUser } from "../user";

/**
 * 운영자 판정 껍데기 — env 주소를 병합·로그인과 같은 `lookupEmail`(스코프 `user`)로 HMAC해 **그 사용자 행**의
 * `emailLookup`과 견준다. `lookupEmail`은 `vitest.setup.ts`의 테스트 키로 실물을 쓴다.
 */

type Row = { id: string; emailLookup: string | null };

function fakeDb(rows: Row[]) {
  const findUnique = vi.fn(async ({ where }: { where: { id: string }; select: unknown }) => {
    const row = rows.find((r) => r.id === where.id);
    return row === undefined ? null : { emailLookup: row.emailLookup };
  });
  // 대역은 `findUnique` 하나만 갖는다 — 판정이 다른 조회를 하면 여기서 터진다.
  return { db: { user: { findUnique } } as unknown as Parameters<typeof isOperatorUser>[0], findUnique };
}

const OPERATOR = "op@example.com";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isOperatorUser", () => {
  it("env가 없으면 DB를 읽지 않고 false — 운영자가 없는 환경의 비용 0", async () => {
    const { db, findUnique } = fakeDb([{ id: "a", emailLookup: lookupEmail(OPERATOR) }]);
    expect(await isOperatorUser(db, "a", {})).toBe(false);
    expect(await isOperatorUser(db, "a", { OPERATOR_EMAILS: "" })).toBe(false);
    expect(await isOperatorUser(db, "a", { OPERATOR_EMAILS: " , nope" })).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("사용자 둘 — 운영자 주소의 lookup을 가진 B만 true (POSTMORTEM 2026-09-06)", async () => {
    const { db } = fakeDb([
      { id: "a", emailLookup: lookupEmail("someone@example.com") },
      { id: "b", emailLookup: lookupEmail(OPERATOR) },
    ]);
    const source = { OPERATOR_EMAILS: OPERATOR };
    expect(await isOperatorUser(db, "a", source)).toBe(false);
    expect(await isOperatorUser(db, "b", source)).toBe(true);
  });

  it("env 주소가 대소문자·공백만 달라도 true — 저장 lookup과 같은 정규화", async () => {
    const { db } = fakeDb([{ id: "b", emailLookup: lookupEmail(OPERATOR) }]);
    expect(await isOperatorUser(db, "b", { OPERATOR_EMAILS: "  Op@Example.COM , other@x.io" })).toBe(true);
  });

  it("emailLookup이 null인 행·없는 행은 운영자가 아니다", async () => {
    const { db } = fakeDb([{ id: "a", emailLookup: null }]);
    expect(await isOperatorUser(db, "a", { OPERATOR_EMAILS: OPERATOR })).toBe(false);
    expect(await isOperatorUser(db, "missing", { OPERATOR_EMAILS: OPERATOR })).toBe(false);
  });

  it("조회가 던지면 같이 던진다 — 실패를 '운영자 아님'으로 접지 않는다 (POSTMORTEM 2026-09-03)", async () => {
    const db = { user: { findUnique: vi.fn().mockRejectedValue(new Error("db down")) } } as unknown as Parameters<
      typeof isOperatorUser
    >[0];
    await expect(isOperatorUser(db, "a", { OPERATOR_EMAILS: OPERATOR })).rejects.toThrow("db down");
  });

  it("호출 시점에 읽는다 — import 뒤에 env를 넣었다 빼면 결과가 따라온다 (POSTMORTEM 2026-08-31)", async () => {
    const { db } = fakeDb([{ id: "b", emailLookup: lookupEmail(OPERATOR) }]);
    vi.stubEnv("OPERATOR_EMAILS", OPERATOR);
    expect(await isOperatorUser(db, "b")).toBe(true);
    vi.stubEnv("OPERATOR_EMAILS", "");
    expect(await isOperatorUser(db, "b")).toBe(false);
    vi.stubEnv("OPERATOR_EMAILS", OPERATOR);
    expect(await isOperatorUser(db, "b")).toBe(true);
  });

  it("where가 { id: userId }다 — 그 사용자 한 행만 본다", async () => {
    const { db, findUnique } = fakeDb([{ id: "b", emailLookup: lookupEmail(OPERATOR) }]);
    await isOperatorUser(db, "b", { OPERATOR_EMAILS: OPERATOR });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "b" }, select: { emailLookup: true } });
  });
});

/**
 * **인가 경로가 운영자를 보지 않는다** (spec C13) — 운영자는 계정 축 쿼터만 바꾼다. 판정을 import하는 소스를
 * 상한 소비자로 고정한다. 백오피스 같은 새 소비자가 오면 그 기능의 PRODUCT 판정과 함께 이 목록을 늘린다.
 */
describe("isOperatorUser 소비자", () => {
  const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
  const SKIP = new Set(["node_modules", ".next", "generated", ".git", ".scratch", "__tests__"]);

  function* walk(dir: string): Generator<string> {
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name)) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) yield* walk(path);
      else if (/\.(ts|tsx)$/.test(name)) yield path;
    }
  }

  it("상한 자리만 import한다", () => {
    const importers = ["app", "components", "lib", "scripts"]
      .flatMap((dir) => [...walk(join(ROOT, dir))])
      .filter((path) => /from\s+["']@\/lib\/operator\/user["']/.test(readFileSync(path, "utf8")))
      .map((path) => relative(ROOT, path))
      .sort();
    expect(importers).toEqual([]);
  });
});
