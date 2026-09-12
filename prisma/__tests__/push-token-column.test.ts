import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * `Project.pushTokenHash` — 프로젝트별 push 토큰의 sha256 (design §6 · PRODUCT §7.8). `schema-contract.test.ts`와 같은
 * 텍스트 대조다: 컬럼이 **nullable**이어야 기존 행에 무해하고(additive), **unique**여야 해시 조회가 행 하나를
 * 정하며(토큰이 프로젝트를 정한다 — design §3.8), 원문 컬럼이 없어야 "원문은 저장하지 않는다"가 스키마 수준에서
 * 지켜진다.
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

describe("schema.prisma — Project.pushTokenHash", () => {
  it("nullable String에 @unique다", () => {
    expect(projectBlock()).toMatch(/^\s*pushTokenHash\s+String\?\s+@unique\s*$/m);
  });

  it("토큰 원문 컬럼은 없다 — 해시만 저장한다", () => {
    expect(projectBlock()).not.toMatch(/pushToken\s+String/);
  });

  it("주석이 fail-closed 근거를 든다 — null이면 어떤 push도 통과하지 못한다", () => {
    const above = docCommentAbove(projectBlock(), /^\s*pushTokenHash\s+String\?/);
    expect(above).toMatch(/fail-closed/);
    expect(above).toMatch(/401/);
  });
});
