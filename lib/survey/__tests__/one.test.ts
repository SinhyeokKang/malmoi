import { describe, expect, it, vi } from "vitest";
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

/**
 * 4. 어댑터 간 경합 — chrome `_locales`(2키)가 `code-dict`(3키)를 가린다.
 *
 * ant-design 실측이 이 형태였다: 부속 카탈로그가 진짜 코드 딕셔너리를 1순위에서 눌렀다.
 * (전에는 `ts-dict`로 썼는데 그것이 자동 탐지에서 빠졌던 동안 `code-dict`로 옮겼다. 2026-09-14에
 * 다시 참여하게 됐지만 **이 케이스는 그대로 둔다** — 재는 것이 어댑터 간 경합이지 특정 어댑터가 아니다.)
 */
const CODE_SOURCE = `// 주석 보존
export default {
  "common.ok": "확인",
  "common.close": "닫기",
  ...base,
  "time.now": "방금",
  shorthandKey,
}
`;
const CROSS = {
  "public/_locales/en/messages.json": JSON.stringify({ EXT_NAME: { message: "X" }, CMD: { message: "C" } }, null, 2) + "\n",
  "public/_locales/ko/messages.json": JSON.stringify({ EXT_NAME: { message: "엑스" }, CMD: { message: "씨" } }, null, 2) + "\n",
  "src/i18n/ko.ts": CODE_SOURCE,
  "src/i18n/en.ts": CODE_SOURCE,
};

const input = (repo: string, files: Record<string, string>, extraPaths: string[] = []): SurveyInput => ({
  repo,
  paths: [...Object.keys(files), ...extraPaths],
  files: new Map(Object.entries(files)),
  configFiles: [],
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
    // 1순위는 chrome(우선순위) — 그런데 실제 번역 표면은 코드 딕셔너리다
    expect(found[0]?.adapter).toBe("chrome-locales");
    expect(found.map((c) => c.adapter)).toContain("code-dict");
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

  /**
   * ⚠️ **껍데기가 파일을 안 고르면 어댑터는 존재하지 않는 것과 같다.**
   *
   * 실측 3회차에서 `yaml-catalog`가 1순위로 잡힌 리포가 **0개**였다. 어댑터 문제가 아니라
   * `selectSurveyFiles`가 `.yml`을 고르지 않아 probe에 내용이 오지 않았던 것이다 — YAML 어댑터가
   * 17개 리포를 덮으려고 만들어졌는데 실물 검증을 한 번도 못 받은 상태였다.
   */
  it("YAML 로케일 파일을 고른다 (yaml-catalog가 없으면 존재하지 않는 어댑터가 된다)", () => {
    const { paths } = selectSurveyFiles([
      "config/locales/ko.yml",
      "config/locales/en.yml",
      "config/database.yml",
      "app/src/lang/translations/ko-KR.yaml",
      "app/src/lang/translations/en-US.yaml",
    ]);
    expect(paths).toEqual([
      "app/src/lang/translations/en-US.yaml",
      "app/src/lang/translations/ko-KR.yaml",
      "config/locales/en.yml",
      "config/locales/ko.yml",
    ]);
  });

  it(".github 아래 YAML은 고르지 않는다 (CI 설정이 로케일처럼 보인다)", () => {
    const { paths } = selectSurveyFiles([".github/workflows/ko.yml", ".github/workflows/en.yml"]);
    expect(paths).toEqual([]);
  });

  it(".js·.mjs 로케일 파일도 고른다 (quasar가 ui/lang/{locale}.js다)", () => {
    const { paths } = selectSurveyFiles(["ui/lang/ko-KR.js", "ui/lang/en-US.js", "ui/index.js"]);
    expect(paths).toEqual(["ui/lang/en-US.js", "ui/lang/ko-KR.js"]);
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
    // 원본이 정렬돼 있지 않아도 **재정렬 diff가 나지 않는다** — 재생성 writer가 `order`로
    // 원본 순서를 되돌린다 (ARCHITECTURE §1.1). 전에는 이 줄이
    // `toBeGreaterThan(0)`이었고, 그 값(중앙값 0.784)이 이 기능이 존재하는 이유였다.
    expect(s.diffRatio).toBe(0);
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

  it("어댑터 간 경합: 가려진 code-dict 후보가 목록에 남는다", () => {
    const s = surveyOne(input("acme/cross", CROSS));
    expect(s.chosen?.adapter).toBe("chrome-locales");
    expect(s.candidates.map((c) => c.adapter)).toContain("code-dict");
    // 1순위가 2키인데 2순위는 그보다 많다 — 오탐 판정의 실제 근거가 된다
    expect(s.keyCount).toBe(2);
  });

  it("코드 어댑터는 건너뛴 프로퍼티를 **에러로** 보고한다 (무증상 skip이 아니다)", () => {
    const codeOnly = { "src/i18n/ko.ts": CODE_SOURCE, "src/i18n/en.ts": CODE_SOURCE };
    const s = surveyOne(input("acme/code", codeOnly));
    expect(s.chosen?.adapter).toBe("code-dict");
    // spread(...base)와 shorthand가 조용히 사라지지 않고 유형화된다 — `ts-dict`와의 차이다
    expect(s.errors["non-literal-value"] + s.errors.other).toBeGreaterThan(0);
    // 그래서 무증상 skip 카운터는 0이다 (셀 것이 없다)
    expect(s.silentSkips).toBe(0);
    // 읽힌 키(3) < 파일의 문자열 리터럴 수 — 부분 읽기의 그물은 그대로 둔다
    expect(s.readKeyCount).toBe(3);
    expect(s.literalCount).toBeGreaterThan(s.readKeyCount!);
  });

  /**
   * ⚠️ **수술적 치환 어댑터는 `currentFiles`를 받아야 write가 돈다.**
   *
   * 실측 2회차에서 code-dict 리포 8개의 왕복이 전부 `not-run`이었다 — `writePerLocale`이 원본을
   * 넘기지 않아 write가 매번 `null`을 냈고, 결과가 "측정 안 됨"으로 조용히 빠졌다. pull에서 같은
   * 부류를 고쳤는데(`writeStrategy` 분기) survey 쪽을 안 고친 것이다.
   */
  it("per-locale + surgical 어댑터의 왕복이 실제로 돈다 (not-run이면 조용히 안 재는 것이다)", () => {
    const codeOnly = { "src/i18n/ko.ts": CODE_SOURCE, "src/i18n/en.ts": CODE_SOURCE };
    const s = surveyOne(input("acme/code-rt", codeOnly));
    expect(s.chosen?.adapter).toBe("code-dict");
    expect(s.roundtrip.semantic).not.toBe("not-run");
    expect(s.roundtrip.byteFixpoint).not.toBe("not-run");
    expect(s.roundtrip.byteFixpoint).toBe("same");
    // 원본이 그대로 나오므로 diff는 0이다 — 수술적 치환의 요지다
    expect(s.diffRatio).toBe(0);
    // ⚠️ 그 0은 치환 경로를 안 밟은 결과라 공허하다. 키 하나를 바꾼 write가 hunk 1이어야 재직렬화가
    // 편집 밖 줄을 안 건드린 것이다.
    expect(s.surgicalEditHunks).toBe(1);
  });

  it("yaml-catalog의 왕복도 돈다", () => {
    const yamlOnly = {
      "config/locales/ko.yml": "# 주석\nko:\n  a:\n    one: 하나\n",
      "config/locales/en.yml": "# 주석\nen:\n  a:\n    one: one\n",
    };
    const s = surveyOne(input("acme/yaml-rt", yamlOnly));
    expect(s.chosen?.adapter).toBe("yaml-catalog");
    expect(s.roundtrip.semantic).toBe("same");
    expect(s.roundtrip.byteFixpoint).toBe("same");
    expect(s.surgicalEditHunks).toBe(1);
  });

  it("재생성 어댑터는 편집 hunk를 재지 않는다 — 재직렬화 자체가 그 방식이다", () => {
    expect(surveyOne(input("acme/flat", FLAT)).surgicalEditHunks).toBeUndefined();
  });

  it("접두 충돌을 센다 — 왕복이 잡은 손실을 지표 ③도 잡아야 한다", () => {
    // 실측 2건의 형태 그대로: 키가 다른 키의 **접두**이면 unflatten에서 한쪽이 조용히 사라진다.
    //   sugarlabs/musicblocks — `"Clear workspace"`와 `"Clear workspace."`가 공존
    //   siyuan-note/siyuan    — 중첩 객체 안의 키가 점을 품어 `a.b.c`와 `a.b.c.d`가 된다
    const files = {
      // `grp`가 객체라 read가 nested=true를 관측한다 → write가 모든 키를 `.`으로 쪼개 복원한다
      "locales/en.json": JSON.stringify({ "a.b": "X", "a.b.c": "Y", grp: { k: "N" } }, null, 2) + "\n",
      "locales/ko.json": JSON.stringify({ "a.b": "엑스", "a.b.c": "와이", grp: { k: "엔" } }, null, 2) + "\n",
    };
    const s = surveyOne(input("acme/prefix", files));
    expect(s.chosen?.adapter).toBe("json-catalog");
    // 로케일 2개 × 접두 쌍 1개
    expect(s.keyCollisions).toBe(2);
    // 그리고 그 손실이 왕복에서도 실제로 관측된다
    expect(s.roundtrip.semantic).toBe("different");
  });

  it("접두가 아닌 점 포함 키는 충돌이 아니다 (과다 계수하지 않는다)", () => {
    const files = {
      "locales/en.json": JSON.stringify({ "a.b": "X", "a.c": "Y", grp: { k: "N" } }, null, 2) + "\n",
      "locales/ko.json": JSON.stringify({ "a.b": "엑스", "a.c": "와이", grp: { k: "엔" } }, null, 2) + "\n",
    };
    const s = surveyOne(input("acme/noclash", files));
    expect(s.keyCollisions).toBe(0);
    expect(s.roundtrip.semantic).toBe("same");
  });

  it("clone 실패는 전체를 멈추지 않고 결과에 남는다", () => {
    const s = surveyOne({ repo: "acme/gone", paths: [], files: new Map(), configFiles: [], failure: "clone 실패" });
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

  /**
   * ⚠️ **제목의 조건을 실제로 만든다** (launch-readiness L4.3). 전에는 멀쩡한 파일만 먹여 어댑터가 한 번도 안 던졌고,
   * 감싸는 `try`를 지워도 green이었다. read·write가 각각 던지게 해 결과로 남는지 본다.
   */
  it.each(["read", "write"] as const)("어댑터 %s가 던져도 surveyOne은 던지지 않고 결과에 남긴다 — 리포 하나가 전체를 멈추지 않는다", (method) => {
    const good = 'export default { "a": "1" }\n';
    const codeDict = ADAPTERS.find((a) => a.name === "code-dict")!;
    // survey의 write 홉은 `writeWithErrors`다(프로덕션 pull과 같은 함수 — ARCHITECTURE §1.35).
    const spy = vi.spyOn(codeDict, method === "read" ? "read" : "writeWithErrors").mockImplementation(() => { throw new Error("boom"); });
    try {
      const s = surveyOne({
        repo: "acme/throws",
        paths: ["src/i18n/ko.ts", "src/i18n/en.ts"],
        files: new Map([
          ["src/i18n/ko.ts", good],
          ["src/i18n/en.ts", good],
        ]),
        configFiles: [],
      });
      expect(spy).toHaveBeenCalled();
      expect(s.chosen?.adapter).toBe("code-dict");
      expect(s.failure).toBe(`${method}가 던졌다: boom`);
      expect(s.errors["adapter-threw"]).toBe(1);
    } finally {
      spy.mockRestore();
    }
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

  /**
   * ⚠️ **옛 이름은 "ts-dict만 자동 탐지에서 빠져 있다"였고 본문이 그것을 안 쟀다** (2026-09-14 2차
   * 리뷰): 빈 문자열 probe면 다섯이 전부 0을 내므로 `> 0`이 **어떤 구현에서도 참**이었다.
   */
  it("ADAPTERS가 5개이고 ts-dict도 내용이 맞으면 후보를 낸다", () => {
    expect(ADAPTERS).toHaveLength(5);
    const tsDict = ADAPTERS.find((a) => a.name === "ts-dict")!;
    const source = 'const en = { "a": "A" };\nconst ko = { "a": "B" };\nexport const ns = { en, ko };';
    expect(tsDict.detectCandidates(["src/i18n/x.ts", "src/i18n/y.ts"], () => source)).toHaveLength(1);
    // probe가 없으면 경로만으로는 판단하지 않는다 — 1패스가 조용한 이유다.
    expect(tsDict.detectCandidates(["src/i18n/x.ts", "src/i18n/y.ts"])).toEqual([]);
  });
});
