import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { blobSha } from "../../githash";
import { ADAPTERS } from "../index";
import { usableEntries } from "../shared";
import type { Adapter, DetectedFormat, LocaleEntry, WriteInput } from "../types";
import { CONTRACT_KEYS, formatFor, writerContractViolations } from "./contract";

/**
 * writer 계약을 **`ADAPTERS` 순회로** 검사한다. 어댑터를 추가하면 이 블록이 자동으로 늘어난다 —
 * 전에는 어댑터를 손으로 열거해서, 새 어댑터가 규칙을 하나도 안 지켜도 CI가 green이었다.
 *
 * 규칙 본문과 layout별 적용 범위는 `contract.ts`에 있다.
 */
describe("writer 계약 — ADAPTERS 전수 (MVP §4.1 / ARCHITECTURE §1.1·§1.4)", () => {
  for (const adapter of ADAPTERS) {
    it(`${adapter.name} (${adapter.layout})`, () => {
      expect(writerContractViolations(adapter)).toEqual([]);
    });
  }

  it("등록된 어댑터가 5개다 — 늘면 위 목록도 자동으로 는다", () => {
    expect(ADAPTERS.map((a) => a.name)).toEqual([
      "chrome-locales",
      "json-catalog",
      "yaml-catalog",
      "code-dict",
      "ts-dict",
    ]);
  });

  it("규칙 적용은 layout이 아니라 writeStrategy로 갈린다", () => {
    // yaml-catalog가 그 증거다 — per-locale인데 재생성 규칙을 지나지 않는다
    const yaml = ADAPTERS.find((a) => a.name === "yaml-catalog")!;
    expect(yaml.layout).toBe("per-locale");
    expect(yaml.writeStrategy).toBe("surgical");
    const json = ADAPTERS.find((a) => a.name === "json-catalog")!;
    expect(json.writeStrategy).toBe("regenerate");
  });
});

/**
 * **네거티브 — 이 헬퍼가 실제로 위반을 잡는가.**
 *
 * 규칙을 어기는 가짜 어댑터를 끼워 넣어 검사기가 red를 내는지 본다. 이게 없으면 헬퍼가 아무것도
 * 검사하지 않아도(예: 조건문이 뒤집혀도) 전부 green이라 **규칙에 주인이 있다는 착각**만 남는다.
 * 일회성으로 끼웠다 되돌리는 확인은 재현이 안 되므로 영구 테스트로 남긴다.
 */
describe("네거티브 — 규칙을 어기는 가짜 어댑터를 잡아낸다", () => {
  /** 규칙을 하나씩 골라 어기는 재생성 writer. */
  type Break = {
    sortWithLocaleCompare?: boolean;
    indent?: number;
    noTrailingNewline?: boolean;
    keepOrphaned?: boolean;
    keepEmpty?: boolean;
    neverNull?: boolean;
    respectInputOrder?: boolean;
  };

  const fakeRegenerating = (b: Break): Adapter => ({
    name: "json-catalog",
    layout: "per-locale",
    detect: () => undefined,
    detectCandidates: () => [],
    read: () => ({ locales: [], errors: [], nested: false }),
    write: (_f: DetectedFormat, input: WriteInput): string | null => {
      let list: LocaleEntry[] = [...input.entries];
      if (!b.keepOrphaned) list = list.filter((e) => e.orphaned !== true);
      if (!b.keepEmpty) list = list.filter((e) => e.message !== "");
      if (!b.respectInputOrder) {
        list = b.sortWithLocaleCompare
          ? list.sort((x, y) => x.key.localeCompare(y.key))
          : list.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
      }
      if (list.length === 0 && !b.neverNull) return null;
      const out: Record<string, string> = {};
      for (const e of list) out[e.key] = e.message;
      return JSON.stringify(out, null, b.indent ?? 2) + (b.noTrailingNewline ? "" : "\n");
    },
  });

  const cases: ReadonlyArray<[string, Break, RegExp]> = [
    ["localeCompare 정렬", { sortWithLocaleCompare: true }, /정렬/],
    ["4칸 들여쓰기", { indent: 4 }, /들여쓰기/],
    ["끝 개행 없음", { noTrailingNewline: true }, /파일 끝 개행이 없다/],
    ["orphaned를 남김", { keepOrphaned: true }, /orphaned/],
    ["빈 값을 남김", { keepEmpty: true }, /빈 문자열/],
    ["0개인데 null을 안 냄", { neverNull: true }, /null을 내지 않았다/],
    ["입력 순서를 그대로 따름", { respectInputOrder: true }, /입력 순서 무관|정렬/],
  ];

  for (const [name, brk, pattern] of cases) {
    it(`잡는다: ${name}`, () => {
      const found = writerContractViolations(fakeRegenerating(brk));
      expect(found.join("\n")).toMatch(pattern);
    });
  }

  it("잡는다: 수술적 치환이어야 하는데 재생성해 주석을 파괴함", () => {
    const fakeSurgical: Adapter = {
      name: "ts-dict",
      layout: "multi-locale",
      detect: () => undefined,
      detectCandidates: () => [],
      read: () => ({ locales: [], errors: [], nested: false }),
      // 원본을 무시하고 새로 만든다 — 주석·빈 줄이 사라진다.
      write: (_f, input) => {
        const out: Record<string, string> = {};
        for (const e of usableEntries(input.entries)) out[e.key] = e.message;
        return `export const ns = ${JSON.stringify(out, null, 2)};\n`;
      },
    };
    expect(writerContractViolations(fakeSurgical).join("\n")).toMatch(/주석/);
  });

  it("잡는다: 입력을 통째로 무시하고 상수를 내는 writer", () => {
    const fakeConstant: Adapter = {
      ...fakeRegenerating({}),
      write: () => '{\n  "a": "무관한 상수"\n}\n',
    };
    expect(writerContractViolations(fakeConstant).join("\n")).toMatch(/DB 값이 출력에 반영되지 않았다/);
  });

  it("가짜라도 규칙을 다 지키면 통과한다 (검사기가 무조건 red를 내지 않는다)", () => {
    expect(writerContractViolations(fakeRegenerating({}))).toEqual([]);
  });
});

describe("writer 출력의 blobSha가 git hash-object와 일치한다 (§1·§2 접점)", () => {
  for (const adapter of ADAPTERS) {
    it(adapter.name, () => {
      const out = adapter.write(formatFor(adapter), {
        locale: adapter.layout === "multi-locale" ? "ko" : "en",
        isBase: true,
        entries: CONTRACT_KEYS.map((k) => ({ key: k, message: "안녕 🎉", description: "d" })),
      });
      expect(out).not.toBeNull();
      const fromGit = execFileSync("git", ["hash-object", "--stdin"], { input: out!, encoding: "utf8" }).trim();
      expect(blobSha(out!)).toBe(fromGit);
    });
  }
});
