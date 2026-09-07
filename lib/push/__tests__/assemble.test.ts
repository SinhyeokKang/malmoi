import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { detectFormat } from "@/lib/adapters";
import type { FileProbe } from "@/lib/adapters/types";

import { assemblePushInput } from "../assemble";

/**
 * `assemblePushInput` — select → read → base 판정. `scripts/push-local.ts`에 인라인이던 것을 옮겨
 * **CLI와 서버 첫 적재가 같은 함수를 지나게** 한다 (design §4).
 *
 * ⚠️ **"서버 첫 적재 = CLI push와 같은 DB 상태"가 §4의 실제 정확성 주장이다.** 함수를 공유하면 등가가
 * 구조로 보장되고, 그 사실을 여기서 한 번 잰다 — **같은 트리를 fs probe와 메모리 probe로 각각 먹여
 * 결과가 deep-equal**인지. 두 경로가 갈리면 "CI로 올린 것과 온보딩이 올린 것이 다르다"가 된다.
 *
 * ⚠️ `selectLocaleFiles`를 새로 짜지 않는다 — 껍데기가 파일을 안 골라 어댑터가 "존재하지 않았던"
 * 전례가 있다 (POSTMORTEM 2026-09-02).
 */

/** 인메모리 트리. 값이 `undefined`인 경로는 없는 파일이다. */
const TREE: Record<string, string> = {
  "src/locales/en.json": '{\n  "a.greet": "Hello",\n  "a.bye": "Bye"\n}\n',
  "src/locales/ko.json": '{\n  "a.greet": "안녕",\n  "a.bye": "잘 가"\n}\n',
  "src/locales/fr.json": '{\n  "a.greet": "Bonjour"\n}\n',
  "README.md": "# repo\n",
};

const paths = Object.keys(TREE);
const memProbe: FileProbe = (p) => TREE[p];

/** 같은 트리를 실제 디스크에 쓴 뒤 fs probe로 읽는다 — CLI가 하는 그대로다. */
const dir = mkdtempSync(join(tmpdir(), "assemble-"));
for (const [rel, content] of Object.entries(TREE)) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), content, "utf8");
}
const fsProbe: FileProbe = (p) => {
  try {
    return readFileSync(join(dir, p), "utf8");
  } catch {
    return undefined;
  }
};

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const format = () => {
  const found = detectFormat(paths, memProbe);
  if (!found) throw new Error("픽스처가 탐지되지 않는다");
  return found;
};

describe("assemblePushInput — fs probe와 메모리 probe가 같은 결과를 낸다", () => {
  it("두 경로의 반환값이 deep-equal이다 — 서버 첫 적재와 CLI push가 같은 DB 상태를 만든다", () => {
    const viaFs = assemblePushInput({ paths, probe: fsProbe, format: format() });
    const viaMemory = assemblePushInput({ paths, probe: memProbe, format: format() });
    // 둘 다 비어 있으면 deep-equal이 공허하게 통과한다 — 실제로 읽었다는 것을 먼저 단언한다.
    expect(viaFs.read.locales).toHaveLength(3);
    expect(viaFs.read.locales[0]?.entries.length).toBeGreaterThan(0);
    expect(viaMemory).toEqual(viaFs);
  });
});

describe("assemblePushInput — read", () => {
  it("탐지된 로케일 파일을 전부 읽는다", () => {
    const { read } = assemblePushInput({ paths, probe: memProbe, format: format() });
    expect(read.locales.map((l) => l.locale).sort()).toEqual(["en", "fr", "ko"]);
    expect(read.errors).toEqual([]);
  });

  it("트리에 없는 로케일 경로는 넘기지 않는다 — 빈 내용을 먹이면 그 로케일의 키를 통째로 잃는다", () => {
    const withGhost = { ...format(), locales: [...format().locales, "de"] };
    const { read } = assemblePushInput({ paths, probe: memProbe, format: withGhost });
    expect(read.locales.map((l) => l.locale)).not.toContain("de");
  });

  it("read 에러를 삼키지 않고 그대로 돌려준다 — 호출부가 CI를 실패시킬지 정한다", () => {
    const broken: Record<string, string> = { ...TREE, "src/locales/ko.json": "{ not json" };
    const { read } = assemblePushInput({ paths, probe: (p) => broken[p], format: format() });
    expect(read.errors.length).toBeGreaterThan(0);
    expect(read.errors[0]?.path).toBe("src/locales/ko.json");
  });
});

describe("assemblePushInput — base 로케일", () => {
  it("명시가 없으면 `pickBaseLocale` 규칙이다 (en 우선)", () => {
    expect(assemblePushInput({ paths, probe: memProbe, format: format() }).baseLocale).toBe("en");
  });

  it("명시가 있으면 그것이 이긴다", () => {
    const out = assemblePushInput({ paths, probe: memProbe, format: format(), baseLocale: "ko" });
    expect(out.baseLocale).toBe("ko");
  });

  it("⚠️ 명시가 탐지된 로케일에 없으면 거부한다 — 틀린 base는 진짜 base의 키를 orphaned로 떨군다", () => {
    // 2026-09-04 audit #1: `ingest`엔 `--base`가 있었는데 실제 적재 경로엔 없었다.
    expect(() => assemblePushInput({ paths, probe: memProbe, format: format(), baseLocale: "de" })).toThrow(/de/);
  });

  it("로케일이 하나도 없으면 거부한다", () => {
    const empty = { ...format(), locales: [] };
    expect(() => assemblePushInput({ paths, probe: memProbe, format: empty })).toThrow();
  });
});

describe("만든 것이 실제로 호출된다", () => {
  it("`scripts/push-local.ts`가 이 함수를 부른다 — 인라인 사본이 남으면 두 경로가 갈린다", () => {
    const source = readFileSync(new URL("../../../scripts/push-local.ts", import.meta.url), "utf8");
    expect(source).toContain("assemblePushInput");
    // 옮긴 자리에 옛 인라인이 남아 있지 않다.
    expect(source).not.toContain("selectLocaleFiles(");
  });
});
