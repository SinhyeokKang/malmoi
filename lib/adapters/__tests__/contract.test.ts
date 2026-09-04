import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { blobSha } from "../../githash";
import { ADAPTERS } from "../index";
import { observeJsonStyle } from "../json-style";
import { orderedEntries } from "../shared";
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
    ignoreOrder?: boolean;
  };

  const fakeRegenerating = (b: Break): Adapter => ({
    name: "json-catalog",
    layout: "per-locale",
    writeStrategy: "regenerate",
    detect: () => undefined,
    detectCandidates: () => [],
    read: () => ({ locales: [], errors: [], nested: false }),
    write: (_f: DetectedFormat, input: WriteInput): string | null => {
      let list: LocaleEntry[] = [...input.entries];
      if (!b.keepOrphaned) list = list.filter((e) => e.orphaned !== true);
      if (!b.keepEmpty) list = list.filter((e) => e.message !== "");
      const byKey = (x: LocaleEntry, y: LocaleEntry) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0);
      if (b.respectInputOrder) {
        // 정렬하지 않는다 — 배열 위치에 의존한다.
      } else if (b.sortWithLocaleCompare) {
        list = list.sort((x, y) => x.key.localeCompare(y.key));
      } else if (b.ignoreOrder) {
        // order를 통째로 무시하고 늘 코드 유닛 순 — 고치기 전의 동작이다.
        list = list.sort(byKey);
      } else {
        list = list.sort((x, y) => {
          if (x.order !== undefined && y.order !== undefined) return x.order - y.order || byKey(x, y);
          if (x.order !== undefined) return -1;
          if (y.order !== undefined) return 1;
          return byKey(x, y);
        });
      }
      if (list.length === 0 && !b.neverNull) return null;
      const out: Record<string, string> = {};
      for (const e of list) out[e.key] = e.message;
      // **규칙을 다 지키는 fake는 표현도 원본에서 읽는다** — 계약이 그만큼 넓어졌다
      // (원본 포맷 보존, 2026-09-04). `b.indent`를 준 위반 케이스만 그 관측을 무시한다.
      const observed = observeJsonStyle(_f.currentFiles?.[0]?.content).indent;
      const space = b.indent === undefined ? observed : b.indent;
      return JSON.stringify(out, null, space) + (b.noTrailingNewline ? "" : "\n");
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
    ["order를 무시하고 늘 코드 유닛 순", { ignoreOrder: true }, /order: LocaleEntry\.order 순서를 따르지 않는다/],
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
      writeStrategy: "surgical",
      detect: () => undefined,
      detectCandidates: () => [],
      read: () => ({ locales: [], errors: [], nested: false }),
      // 원본을 무시하고 새로 만든다 — 주석·빈 줄이 사라진다.
      write: (_f, input) => {
        const out: Record<string, string> = {};
        for (const e of orderedEntries(input.entries)) out[e.key] = e.message;
        return `export const ns = ${JSON.stringify(out, null, 2)};\n`;
      },
    };
    expect(writerContractViolations(fakeSurgical).join("\n")).toMatch(/주석/);
  });

  it("잡는다: 수술적 치환인데 값 무변경에도 원본 바이트를 안 내고 보고 통로가 없음", () => {
    const fakeReserializing: Adapter = {
      name: "yaml-catalog",
      layout: "per-locale",
      writeStrategy: "surgical",
      detect: () => undefined,
      detectCandidates: () => [],
      read: () => ({ locales: [], errors: [], nested: true }),
      // 주석은 남기지만(그 검사를 피한다) 끝에 한 줄을 더해 바이트를 바꾼다.
      write: (f, input) => {
        const src = f.currentFiles?.[0]?.content ?? "";
        let out = src;
        for (const e of input.entries) {
          if (e.orphaned === true) continue;
          out = out.replace(new RegExp(`(${JSON.stringify(e.key)}: ).*`), `$1${JSON.stringify(e.message)}`);
        }
        return `${out}# 재직렬화가 남긴 줄\n`;
      },
    };
    const found = writerContractViolations(fakeReserializing).join("\n");
    expect(found).toMatch(/원본 바이트를 그대로 돌려주지 않았다/);
    expect(found).toMatch(/writeWithErrors를 구현하지 않았다/);
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
