import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * `Project.declaredBaseLocale` — 기준 로케일 변경의 **선언** (6b-3 · translation-ui design §3.13).
 * `push-token-column.test.ts`와 같은 텍스트 대조다.
 *
 * ⚠️ **컬럼이 둘인 것이 이 설계의 요지다.** 같은 컬럼(`baseLocale`)에 선언을 쓰면 pull이 그것을
 * 즉시 진실로 읽어 **옛 base의 원문이 새 base 파일에 실린 PR**을 낸다. 그래서 이 테스트는
 * "nullable이다"만 보지 않고 **주석이 소유자와 읽는 곳을 구별해 적었는지**까지 본다 — 그 구별이
 * 사라지면 다음 사람이 두 컬럼을 합친다.
 */

const SCHEMA = readFileSync(fileURLToPath(new URL("../schema.prisma", import.meta.url)), "utf8");

function projectBlock(): string {
  const lines = SCHEMA.split("\n");
  const start = lines.findIndex((l) => l.startsWith("model Project {"));
  if (start === -1) throw new Error("model Project 블록이 schema.prisma에 없다");
  const end = lines.findIndex((l, i) => i > start && l.startsWith("}"));
  if (end === -1) throw new Error("model Project 블록이 닫히지 않았다");
  return lines.slice(start + 1, end).join("\n");
}

/** 필드 줄 **바로 위**의 연속 `///` 주석만. 블록 어디에 있어도 통과하는 검사는 검사가 아니다. */
function docCommentAbove(block: string, field: RegExp): string {
  const lines = block.split("\n");
  const at = lines.findIndex((l) => field.test(l));
  if (at === -1) throw new Error(`필드 ${field}가 Project 블록에 없다`);
  const out: string[] = [];
  for (let i = at - 1; i >= 0 && lines[i]?.trimStart().startsWith("///"); i -= 1) out.unshift(lines[i] ?? "");
  return out.join("\n");
}

describe("schema.prisma — Project.declaredBaseLocale", () => {
  /** additive여야 `/db`가 한 파이프라인 안에서 마이그레이션할 수 있다 (`/ship` 7단계). */
  it("nullable String이고 제약이 붙지 않는다", () => {
    expect(projectBlock()).toMatch(/^\s*declaredBaseLocale\s+String\?\s*$/m);
  });

  it("`baseLocale`은 그대로 nullable String이다 — 선언을 그 컬럼으로 접지 않았다", () => {
    expect(projectBlock()).toMatch(/^\s*baseLocale\s+String\?\s*$/m);
  });

  it("주석이 pull은 이 컬럼을 읽지 않는다는 사실을 든다 — 그것이 이 컬럼의 존재 이유다", () => {
    const above = docCommentAbove(projectBlock(), /^\s*declaredBaseLocale\s+String\?/);
    expect(above).toMatch(/pull/);
    expect(above).toMatch(/checkFormat/);
  });

  it("주석이 일회용이라는 계약을 든다 — `applyPush`가 비운다", () => {
    const above = docCommentAbove(projectBlock(), /^\s*declaredBaseLocale\s+String\?/);
    expect(above).toMatch(/applyPush/);
    expect(above).toMatch(/일회용/);
  });
});
