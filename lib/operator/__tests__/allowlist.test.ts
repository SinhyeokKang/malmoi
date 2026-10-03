import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseOperatorEmails } from "../allowlist";

/**
 * 운영자 allowlist 파싱 — 계정 병합과 **같은 정규화**(`normalizeEmail`)를 지나야 env 주소가 저장된 `emailLookup`과
 * 맞는다. 형식이 틀린 조각은 버리고 나머지는 적용한다(fail-closed — 비면 운영자 0명).
 */

const set = (...emails: string[]) => new Set(emails);

describe("parseOperatorEmails", () => {
  it.each([undefined, "", " "])("%j → 빈 집합", (raw) => {
    expect(parseOperatorEmails(raw)).toEqual(set());
  });

  it("쉼표로 가르고 조각마다 trim·소문자 — 빈 조각과 `@` 없는 조각은 버린다", () => {
    expect(parseOperatorEmails("A@Example.com , b@x.io,,nope")).toEqual(set("a@example.com", "b@x.io"));
  });

  it("끝 개행은 trim이 접는다", () => {
    expect(parseOperatorEmails("a@x.io\n")).toEqual(set("a@x.io"));
  });

  it("대소문자만 다른 둘은 하나다", () => {
    expect(parseOperatorEmails("A@x.io,a@x.io")).toEqual(set("a@x.io"));
  });

  it.each(["@x.io", "a@", "a@b@c", "__proto__"])("%j는 무시한다 — `@`가 정확히 하나이고 앞뒤가 비지 않아야 한다", (raw) => {
    expect(parseOperatorEmails(raw)).toEqual(set());
  });

  it("gmail 점·`+` 태그를 접지 않는다 — `normalizeEmail`과 같은 결과", () => {
    expect(parseOperatorEmails("a.b+tag@gmail.com")).toEqual(set("a.b+tag@gmail.com"));
  });

  it("import는 `@/lib/auth/email` 하나다 — 키·DB를 모르는 순수 모듈로 남는다", () => {
    const source = readFileSync(fileURLToPath(new URL("../allowlist.ts", import.meta.url)), "utf8");
    expect([...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1])).toEqual(["@/lib/auth/email"]);
  });
});
