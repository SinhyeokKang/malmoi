import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **스크립트의 Prisma `select` 키가 스키마에 실재하는가.**
 *
 * ⚠️ **`tsc`가 이것을 보지 않는다** (2026-09-14 실측 — `select`에 없는 컬럼을 넣어도 `pnpm typecheck`가
 * 0으로 끝난다. 읽는 쪽 `row.zzz`는 잡히지만 `select: { zzz: true }`는 안 잡힌다). `scripts/`는
 * `pnpm test`가 실행하지도 않으므로, **다중 표면 단계 B가 `Project`에서 열 열 개를 떼어냈을 때
 * `pnpm smoke:github`이 통째로 죽은 것을 어느 게이트도 알리지 않았다.**
 *
 * 그래서 여기는 실행이 아니라 **소스 스캔**이다 — `workflow-pins`·`credential-separation`과 같은 계보다.
 */

const SCHEMA = readFileSync(join("prisma", "schema.prisma"), "utf8");

/** `model X { … }` 블록의 필드 이름. 주석·블록 속성(`@@`)은 뺀다. */
function fieldsOf(model: string): Set<string> {
  const block = new RegExp(`^model ${model} \\{$([\\s\\S]*?)^\\}$`, "m").exec(SCHEMA);
  if (block?.[1] === undefined) throw new Error(`model ${model} 블록이 schema.prisma에 없다`);
  const names = block[1]
    .split("\n")
    .map((line) => /^\s{2}([A-Za-z_][A-Za-z0-9_]*)\s+\S/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined);
  return new Set(names);
}

/** `{`에서 짝이 맞는 `}`까지. 문자열 리터럴이 없는 select 블록만 다루므로 괄호만 센다. */
function balanced(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error("닫히지 않은 블록");
}

/** 중첩 관계 select는 그 모델의 문제라 **깊이 1의 키만** 센다. */
function topLevelKeys(block: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  for (const raw of block.split("\n")) {
    const line = raw.trim();
    const name = depth === 0 ? /^([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(line)?.[1] : undefined;
    if (name !== undefined) keys.push(name);
    for (const ch of line) {
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
    }
  }
  return keys;
}

/** `prisma.<model>.find…({ … select: { … } })` — 모델 이름과 그 select의 최상위 키. */
function selects(source: string): Array<{ model: string; keys: string[] }> {
  const found: Array<{ model: string; keys: string[] }> = [];
  const call = /prisma\.([a-z][A-Za-z0-9]*)\.(?:findUnique|findFirst|findMany|count|update|create|upsert)\(/g;
  for (let m = call.exec(source); m !== null; m = call.exec(source)) {
    const model = m[1];
    if (model === undefined) continue;
    const args = balanced(source, source.indexOf("{", m.index + m[0].length - 1));
    const at = args.indexOf("select:");
    if (at === -1) continue;
    found.push({ model: `${model[0]?.toUpperCase()}${model.slice(1)}`, keys: topLevelKeys(balanced(args, args.indexOf("{", at))) });
  }
  return found;
}

function scriptFiles(): string[] {
  return readdirSync("scripts", { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts"))
    .map((e) => join("scripts", e.name));
}

describe("scripts/ — Prisma select 키가 스키마에 있다", () => {
  it("스캐너가 실제로 무언가를 본다 — 0건이면 이 방어선은 장식이다", () => {
    const total = scriptFiles().flatMap((file) => selects(readFileSync(file, "utf8")));
    expect(total.length).toBeGreaterThanOrEqual(3);
    expect(total.flatMap((s) => s.keys).length).toBeGreaterThanOrEqual(10);
  });

  it("없는 컬럼을 고르는 자리가 없다", () => {
    const unknown: string[] = [];
    for (const file of scriptFiles()) {
      for (const { model, keys } of selects(readFileSync(file, "utf8"))) {
        const fields = fieldsOf(model);
        for (const key of keys) if (!fields.has(key)) unknown.push(`${file}: ${model}.${key}`);
      }
    }
    expect(unknown).toEqual([]);
  });
});
