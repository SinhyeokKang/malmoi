import { describe, expect, it } from "vitest";
import { ADAPTERS, detectFormat } from "../../adapters";
import { candidatesFor, mergeCandidates } from "../merge";
import { selectSurveyFiles } from "../select";
import { surveyOne } from "../one";
import type { SurveyInput } from "../types";

// ── 픽스처 4개 — 실제 리포에서 관측한 형태 ──────────────────────────────
/** 1. 정상 flat JSON 카탈로그 (skillflo 형태) */
const FLAT = {
  "src/i18n/en.json": JSON.stringify({ "b.two": "Two", "a.one": "One" }, null, 2) + "\n",
  "src/i18n/ko.json": JSON.stringify({ "b.two": "둘", "a.one": "하나" }, null, 2) + "\n",
};

/** 2. 오탐 유발 — 검색 인덱스가 진짜 카탈로그와 공존 (bugshot-web) */
const MISDETECT = {
  "public/search/en.json": "[{\"id\":1}]\n",
  "public/search/ko.json": "[{\"id\":2}]\n",
  "src/lib/i18n/en.json": JSON.stringify({ hero: { title: "Hi" } }, null, 2) + "\n",
  "src/lib/i18n/ko.json": JSON.stringify({ hero: { title: "안녕" } }, null, 2) + "\n",
};

/**
 * 3. read 에러가 섞인 카탈로그 — 깨진 JSON / 최상위 배열 / 숫자 리프 / 키 충돌.
 *
 * ⚠️ 숫자 리프를 `en`이 아니라 `zz`에 둔 것은 의도다. `detect`의 probe는 **정렬상 첫 로케일**
 * 하나만 읽어 카탈로그 모양을 확인하므로, `en`에 숫자를 두면 후보 자체가 걸러져 read 에러를
 * 재볼 기회가 사라진다.
 */
const BROKEN = {
  "locales/en.json": '{"ok": "OK", "a.b": "flat", "a": {"b": "nested"}}\n',
  "locales/ko.json": "{ this is not json\n",
  "locales/ja.json": "[1,2,3]\n",
  "locales/zz.json": '{"ok": "OK", "n": 3}\n',
};

/** 4. 어댑터 간 경합 — chrome `_locales`(2키)가 ts-dict(4키)를 가린다 (bugshot-2) */
const TS_SOURCE = `// 주석 보존
const ko = {
  "common.ok": "확인",
  "common.close": "닫기",
  ...base,
  "time.now": "방금",
  shorthandKey,
} as const;

const en = {
  "common.ok": "OK",
  "common.close": "Close",
  ...base,
  "time.now": "Just now",
  shorthandKey,
} satisfies Bundle;

export const app = { ko, en };
`;
const CROSS = {
  "public/_locales/en/messages.json": JSON.stringify({ EXT_NAME: { message: "X" }, CMD: { message: "C" } }, null, 2) + "\n",
  "public/_locales/ko/messages.json": JSON.stringify({ EXT_NAME: { message: "엑스" }, CMD: { message: "씨" } }, null, 2) + "\n",
  "src/i18n/namespaces/app.ts": TS_SOURCE,
};

const input = (repo: string, files: Record<string, string>, extraPaths: string[] = []): SurveyInput => ({
  repo,
  paths: [...Object.keys(files), ...extraPaths],
  files: new Map(Object.entries(files)),
});

describe("mergeCandidates — 어댑터를 가로지르는 순위", () => {
  it("ADAPTERS 순서로 이어붙인다", () => {
    const merged = mergeCandidates([
      [{ adapter: "chrome-locales", pathTemplate: "a/_locales/{locale}/messages.json", locales: ["en", "ko"] }],
      [
        { adapter: "json-catalog", pathTemplate: "x/{locale}.json", locales: ["en", "ko"] },
        { adapter: "json-catalog", pathTemplate: "y/{locale}.json", locales: ["en", "ko"] },
      ],
      [],
    ]);
    expect(merged.map((c) => c.pathTemplate)).toEqual([
      "a/_locales/{locale}/messages.json",
      "x/{locale}.json",
      "y/{locale}.json",
    ]);
  });

  it("전부 비면 빈 배열", () => {
    expect(mergeCandidates([[], [], []])).toEqual([]);
  });
});

describe("candidatesFor — [0]이 항상 detectFormat 결과다", () => {
  const CASES: Record<string, Record<string, string>> = { FLAT, MISDETECT, BROKEN, CROSS };
  for (const [name, files] of Object.entries(CASES)) {
    it(name, () => {
      const paths = Object.keys(files);
      const probe = (p: string) => files[p];
      expect(candidatesFor(paths, probe)[0]).toEqual(detectFormat(paths, probe));
    });
  }

  it("어댑터 간 경합에서 가려진 후보가 목록에는 남는다", () => {
    const paths = Object.keys(CROSS);
    const probe = (p: string) => (CROSS as Record<string, string>)[p];
    const found = candidatesFor(paths, probe);
    // 1순위는 chrome(우선순위) — 그런데 실제 번역 표면은 ts-dict다
    expect(found[0]?.adapter).toBe("chrome-locales");
    expect(found.map((c) => c.adapter)).toContain("ts-dict");
  });
});

describe("selectSurveyFiles — 무엇을 물리화할지가 로직이다", () => {
  it("로케일이 2개 이상인 디렉터리의 JSON만 고른다", () => {
    const { paths } = selectSurveyFiles([
      "src/i18n/en.json",
      "src/i18n/ko.json",
      "src/data/users.json",
      "config/en.json",
      "README.md",
    ]);
    expect(paths).toEqual(["src/i18n/en.json", "src/i18n/ko.json"]);
  });

  it("chrome _locales는 전부 고른다", () => {
    const { paths } = selectSurveyFiles([
      "public/_locales/en/messages.json",
      "public/_locales/ko/messages.json",
      "public/img/a.png",
    ]);
    expect(paths).toEqual(["public/_locales/en/messages.json", "public/_locales/ko/messages.json"]);
  });

  it("i18n 신호가 있는 디렉터리의 .ts만 고른다 (아무 .ts 디렉터리나 읽지 않는다)", () => {
    const { paths } = selectSurveyFiles([
      "src/i18n/namespaces/a.ts",
      "src/i18n/namespaces/b.ts",
      "src/components/Button.tsx",
      "src/utils/date.ts",
    ]);
    expect(paths).toEqual(["src/i18n/namespaces/a.ts", "src/i18n/namespaces/b.ts"]);
  });

  it("설정 파일을 고른다 (빈도만 센다)", () => {
    const { configFiles } = selectSurveyFiles([
      "i18next-parser.config.js",
      "crowdin.yml",
      "lingui.config.ts",
      "package.json",
    ]);
    expect(configFiles).toEqual(["crowdin.yml", "i18next-parser.config.js", "lingui.config.ts"]);
  });

  it("예산을 넘으면 잘라내고 그 사실을 알린다", () => {
    const many = Array.from({ length: 2000 }, (_, i) => [`src/i18n/d${i}/en.json`, `src/i18n/d${i}/ko.json`]).flat();
    const r = selectSurveyFiles(many);
    expect(r.truncated).toBe(true);
    expect(r.paths.length).toBeLessThanOrEqual(1200);
  });

  it("결정적이다 — 입력 순서를 바꿔도 같은 목록", () => {
    const p = ["src/i18n/ko.json", "src/i18n/en.json", "public/_locales/en/messages.json", "public/_locales/ko/messages.json"];
    expect(selectSurveyFiles(p).paths).toEqual(selectSurveyFiles([...p].reverse()).paths);
  });
});

describe("surveyOne — 리포 하나의 판정 전체", () => {
  it("정상 flat: 왕복 2층이 전부 통과한다", () => {
    const s = surveyOne(input("acme/flat", FLAT));
    expect(s.failure).toBeUndefined();
    expect(s.chosen?.adapter).toBe("json-catalog");
    expect(s.localeCount).toBe(2);
    expect(s.keyCount).toBe(2);
    expect(s.roundtrip.semantic).toBe("same");
    expect(s.roundtrip.byteFixpoint).toBe("same");
    // 원본이 이미 정렬돼 있지 않다 → 첫 write에서 재정렬 diff가 난다
    expect(s.diffRatio).toBeGreaterThan(0);
  });

  it("오탐 픽스처: 1순위가 진짜 카탈로그이고 검색 인덱스는 probe에서 걸러진다", () => {
    const s = surveyOne(input("acme/misdetect", MISDETECT));
    expect(s.chosen?.pathTemplate).toBe("src/lib/i18n/{locale}.json");
    expect(s.candidates.map((c) => c.pathTemplate)).not.toContain("public/search/{locale}.json");
  });

  it("read 에러를 유형별로 센다 (키 충돌 포함)", () => {
    const s = surveyOne(input("acme/broken", BROKEN));
    expect(s.errors["json-parse"]).toBe(1); // ko.json
    expect(s.errors["non-object-root"]).toBe(1); // ja.json
    expect(s.errors["leaf-type"]).toBe(1); // zz.json의 "n": 3
    expect(s.keyCollisions).toBe(1); // "a.b" 가 flat·중첩 양쪽에서 나온다
  });

  it("어댑터 간 경합: 가려진 ts-dict 후보가 목록에 남는다", () => {
    const s = surveyOne(input("acme/cross", CROSS));
    expect(s.chosen?.adapter).toBe("chrome-locales");
    expect(s.candidates.map((c) => c.adapter)).toContain("ts-dict");
    // 1순위가 2키인데 2순위는 그보다 많다 — 오탐 판정의 실제 근거가 된다
    expect(s.keyCount).toBe(2);
  });

  it("코드 어댑터의 무증상 skip을 센다 (에러가 아니라 조용히 건너뛴 것)", () => {
    const tsOnly = { "src/i18n/namespaces/app.ts": TS_SOURCE };
    const s = surveyOne(input("acme/ts", tsOnly));
    expect(s.chosen?.adapter).toBe("ts-dict");
    // spread(...base) 1개 + shorthand 1개 × 로케일 2개 = 4
    expect(s.silentSkips).toBe(4);
    // 읽힌 키(3) < 파일의 문자열 리터럴 수 — 부분 읽기의 유일한 그물이다
    expect(s.readKeyCount).toBe(3);
    expect(s.literalCount).toBeGreaterThan(s.readKeyCount!);
  });

  it("clone 실패는 전체를 멈추지 않고 결과에 남는다", () => {
    const s = surveyOne({ repo: "acme/gone", paths: [], files: new Map(), failure: "clone 실패" });
    expect(s.failure).toBe("clone 실패");
    expect(s.candidates).toEqual([]);
    expect(s.roundtrip.semantic).toBe("not-run");
  });

  it("탐지 실패(빈 트리)도 실패가 아니라 결과다", () => {
    const s = surveyOne(input("acme/empty", { "README.md": "# hi" }));
    expect(s.failure).toBeUndefined();
    expect(s.chosen).toBeUndefined();
    expect(s.roundtrip.semantic).toBe("not-run");
  });

  it("어댑터가 throw해도 유형화해서 담는다 (ts-dict는 파싱 실패를 errors로 주지 않는다)", () => {
    // 로케일 객체가 둘이라 detect는 통과하지만 read에서 깨지는 소스
    const good = "const ko = { \"a\": \"1\" };\nconst en = { \"a\": \"2\" };\n";
    const s = surveyOne({
      repo: "acme/throws",
      paths: ["src/i18n/a.ts", "src/i18n/b.ts"],
      files: new Map([
        ["src/i18n/a.ts", good],
        ["src/i18n/b.ts", good],
      ]),
    });
    expect(s.chosen?.adapter).toBe("ts-dict");
    expect(s.failure).toBeUndefined();
  });

  it("생산자에 타입이 붙어 있다 — 필드를 늘리면 컴파일러가 잡는다", () => {
    // 이 테스트는 타입 수준 보증의 자리 표시다. 실제 검사는 `pnpm typecheck`가 한다.
    const s = surveyOne(input("acme/flat", FLAT));
    expect(Object.keys(s)).toContain("errors");
    expect(Object.keys(s)).toContain("roundtrip");
  });

  it("결정적이다 — 같은 입력을 두 번 재면 같은 결과 (소요 시간 제외)", () => {
    const a = surveyOne(input("acme/flat", FLAT));
    const b = surveyOne(input("acme/flat", FLAT));
    expect({ ...a, ms: 0 }).toEqual({ ...b, ms: 0 });
  });

  it("ADAPTERS 전부가 후보 탐색에 참여한다", () => {
    expect(ADAPTERS).toHaveLength(3);
  });
});
