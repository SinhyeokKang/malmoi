import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ADAPTERS } from "../index";

/**
 * **`write`·`writeWithErrors`의 입력은 `WriteInput`이어야 한다** — 인라인 객체 타입으로 적지 않는다.
 *
 * ⚠️ **타입 검사가 이걸 못 본다.** 메서드 파라미터는 양변성(bivariant)이라 구현이 계약보다 **더 많은**
 * 필드를 요구해도 `Adapter`에 할당된다. 그래서 `chrome-locales.write`가 계약에 없는 `isBase`를 필수로
 * 받는 상태로 오래 통과했고, 호출부가 갈렸다 — `lib/pull/render.ts`는 안 넘기고 `lib/survey/one.ts`는
 * 넘겼다. 본문이 그 값을 안 써서 동작 결함이 없었을 뿐이고, **썼다면 프로덕션과 지표가 서로 다른
 * 파일을 냈을 것이다.**
 *
 * 계약을 이름으로 참조하게 두면 필드가 늘 때 컴파일러가 전 호출부를 붙잡는다.
 */

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

function sourceOf(name: string): string {
  return readFileSync(`${ROOT}/lib/adapters/${name}.ts`, "utf8");
}

/** `function write(format: …, input: …)` 의 두 번째 파라미터 타입만 뽑는다. */
function inputParamTypes(src: string, fn: "write" | "writeWithErrors"): string[] {
  const out: string[] = [];
  // 선언이 여러 줄로 감길 수 있어 `input:` 뒤부터 `)` 또는 `,` 전까지를 본다.
  const re = new RegExp(`function ${fn}\\s*\\(([\\s\\S]*?)\\)\\s*:`, "g");
  for (const m of src.matchAll(re)) {
    const params = m[1] ?? "";
    const i = params.indexOf("input:");
    // 여러 줄 선언은 `input: WriteInput,\n)` 모양이라 뒤 콤마가 딸려온다.
    if (i >= 0) out.push(params.slice(i + "input:".length).trim().replace(/,$/, ""));
  }
  return out;
}

describe("어댑터 write의 입력 계약 (types.ts의 WriteInput)", () => {
  it("검사 대상 어댑터를 실제로 찾는다", () => {
    // 목록이 조용히 0건이 되면 이 테스트가 장식이 된다.
    expect(ADAPTERS.length).toBeGreaterThan(0);
  });

  for (const adapter of ADAPTERS) {
    it(`${adapter.name}: write가 WriteInput을 이름으로 받는다`, () => {
      const src = sourceOf(adapter.name);
      const types = inputParamTypes(src, "write");
      expect(types.length).toBeGreaterThan(0);
      for (const t of types) expect(t).toBe("WriteInput");
    });

    if (adapter.writeWithErrors !== undefined) {
      it(`${adapter.name}: writeWithErrors도 WriteInput을 이름으로 받는다`, () => {
        const types = inputParamTypes(sourceOf(adapter.name), "writeWithErrors");
        expect(types.length).toBeGreaterThan(0);
        for (const t of types) expect(t).toBe("WriteInput");
      });
    }
  }

  it("스캐너가 인라인 객체 타입을 실제로 잡는다 — red를 낼 수 있는지", () => {
    const fake = `function write(format: DetectedFormat, input: { locale: string; isBase: boolean }): string | null {`;
    expect(inputParamTypes(fake, "write")).toEqual(["{ locale: string; isBase: boolean }"]);
  });
});
