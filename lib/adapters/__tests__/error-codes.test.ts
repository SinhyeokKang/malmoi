import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ADAPTER_ERROR_CODES } from "@/lib/adapters/types";

/**
 * **`AdapterError`를 만드는 자리가 자유 문자열로 돌아가지 않는다** (6b-1).
 *
 * 소스 스캔이 답하는 것은 **둘뿐이고, 좁다**: `message`라는 이름이 그 객체 리터럴에 돌아왔는가,
 * 그리고 union의 코드가 실제로 쓰이는가. 다른 이름(`note`·`text`)으로 자유 문자열을 다시 싣는 것은
 * 잡지 못한다 — 그걸 잡으려면 정규식이 아니라 파서가 필요하고, 여기서 만들지 않는다.
 * ⚠️ **좁음을 주석에 적어 두는 것이 요지다** — 좁은 검사는 red를 못 내므로 자기 좁음을 신고할 수
 * 없다 (POSTMORTEM 2026-09-07).
 *
 * 뒤의 검사가 있는 이유: union에 코드를 더하고 아무도 안 쓰는 상태(사전에만 문장이 있는 낡은 코드)를
 * 타입이 못 본다 — 이 리포가 반복해 밟은 "만든 것이 실제로 호출되는가"의 형태다
 * (POSTMORTEM 2026-09-02·09-03).
 */

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/** 오류를 **만드는** 파일 전부. 소비자(`lib/i18n/adapter-errors.ts`·CLI·화면)는 대상이 아니다. */
function producerFiles(): string[] {
  const adapters = readdirSync(join(ROOT, "lib/adapters"))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join("lib/adapters", name));
  return [...adapters, "lib/pull/render.ts", "lib/onboarding/ingest.ts"];
}

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

const sources = (): { path: string; code: string }[] =>
  producerFiles().map((path) => ({ path, code: stripComments(readFileSync(join(ROOT, path), "utf8")) }));

describe("어댑터 오류는 코드다 — 자유 문자열 `message`가 없다", () => {
  it("스캐너가 실제로 파일을 걸었다 — 조용히 0건이 되지 않는다", () => {
    expect(sources().length).toBeGreaterThan(6);
  });

  it("`{ path, message }` 모양이 한 곳도 없다", () => {
    const offenders = sources()
      .filter(({ code }) => /\bpath\s*:[^,\n]*,\s*message\s*:/.test(code) || /\bmessage\s*:[^,\n]*,\s*path\s*:/.test(code))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("union의 모든 코드가 실제로 쓰인다 — 사전에만 있는 낡은 코드가 없다", () => {
    const all = sources()
      .map(({ code }) => code)
      .join("\n");
    const unused = ADAPTER_ERROR_CODES.filter((code) => !all.includes(`"${code}"`));
    expect(unused).toEqual([]);
  });
});
