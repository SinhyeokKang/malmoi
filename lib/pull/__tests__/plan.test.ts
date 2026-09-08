import { describe, expect, it } from "vitest";
import { blobSha } from "@/lib/githash";
import {
  buildWriteEntries,
  formatFromProject,
  planPullChanges,
  resolveLocalePaths,
  shouldSkipPull,
  type ProjectFormatColumns,
  type PullRow,
} from "../plan";

const T = (iso: string) => new Date(iso);

describe("shouldSkipPull — 1층 DB 측 스킵", () => {
  it("편집이 lastPulledAt 이후면 스킵하지 않는다", () => {
    expect(shouldSkipPull(T("2026-09-01T10:00:00Z"), T("2026-09-01T09:00:00Z"))).toBe(false);
  });

  it("편집이 lastPulledAt 이전이면 스킵한다 (편집 없는 날의 기본 경로)", () => {
    expect(shouldSkipPull(T("2026-09-01T09:00:00Z"), T("2026-09-01T10:00:00Z"))).toBe(true);
  });

  it("같은 시각이면 스킵한다 — 이미 그 시점까지 반영됐다", () => {
    const t = T("2026-09-01T10:00:00Z");
    expect(shouldSkipPull(t, new Date(t))).toBe(true);
  });

  it("첫 pull(lastPulledAt=null)은 스킵하지 않는다 — 아직 아무것도 안 나갔다", () => {
    expect(shouldSkipPull(T("2026-09-01T10:00:00Z"), null)).toBe(false);
  });

  it("편집이 0건(maxUpdatedAt=null)이면 스킵한다 — 내보낼 것이 없다", () => {
    expect(shouldSkipPull(null, T("2026-09-01T10:00:00Z"))).toBe(true);
  });

  it("편집 0건 + 첫 pull이면 스킵한다 — 빈 DB로 커밋을 만들지 않는다", () => {
    expect(shouldSkipPull(null, null)).toBe(true);
  });

  it("밀리초 차이도 편집으로 본다 (updatedAt이 그 해상도로 저장된다)", () => {
    expect(shouldSkipPull(T("2026-09-01T10:00:00.001Z"), T("2026-09-01T10:00:00.000Z"))).toBe(false);
  });
});

describe("formatFromProject — pull 경로엔 read가 없어 여기가 유일한 포맷 출처다", () => {
  const cols = (over: Partial<ProjectFormatColumns> = {}): ProjectFormatColumns => ({
    adapterName: "json-catalog",
    pathTemplate: "src/lib/i18n/{locale}.json",
    nested: true,
    nestedByPath: null,
    baseLocale: "en",
    ...over,
  });

  it("4컬럼에서 DetectedFormat을 재조립한다", () => {
    const f = formatFromProject(cols(), ["ko", "en"]);
    expect(f.adapter).toBe("json-catalog");
    expect(f.pathTemplate).toBe("src/lib/i18n/{locale}.json");
    expect(f.nested).toBe(true);
    expect(f.locales).toEqual(["ko", "en"]);
  });

  it("nested가 null이면 undefined로 둔다 — flat 전용 어댑터엔 무의미한 값이다", () => {
    expect(formatFromProject(cols({ nested: null }), ["ko"]).nested).toBeUndefined();
  });

  it("adapterName이 null이면 던진다 — push를 아직 받지 않은 프로젝트다", () => {
    expect(() => formatFromProject(cols({ adapterName: null }), ["ko"])).toThrow(/adapterName/);
  });

  it("pathTemplate이 null이면 던진다 — 어느 파일을 쓸지 알 수 없다", () => {
    expect(() => formatFromProject(cols({ pathTemplate: null }), ["ko"])).toThrow(/pathTemplate/);
  });

  it("baseLocale이 null이면 던진다 — base 판정 없이는 description을 어디 넣을지 모른다", () => {
    expect(() => formatFromProject(cols({ baseLocale: null }), ["ko"])).toThrow(/baseLocale/);
  });

  it("등록되지 않은 어댑터 이름이면 던진다 — 문자열 컬럼이라 DB가 막아주지 않는다", () => {
    expect(() => formatFromProject(cols({ adapterName: "po-gettext" }), ["ko"])).toThrow(
      /po-gettext/,
    );
  });

  it("로케일이 0개면 던진다 — 낼 파일이 없다", () => {
    expect(() => formatFromProject(cols(), [])).toThrow(/no locales/);
  });
});

describe("resolveLocalePaths — per-locale", () => {
  const format = formatFromProject(
    {
      adapterName: "json-catalog",
      pathTemplate: "src/lib/i18n/{locale}.json",
      nested: false,
      nestedByPath: null,
      baseLocale: "en",
    },
    ["ko", "en"],
  );

  it("{locale}을 치환해 로케일당 경로 하나를 만든다", () => {
    expect(resolveLocalePaths(format, "per-locale", [])).toEqual([
      { locale: "en", path: "src/lib/i18n/en.json" },
      { locale: "ko", path: "src/lib/i18n/ko.json" },
    ]);
  });

  it("트리 경로 목록을 보지 않는다 — 파일이 아직 없어도 새로 만든다", () => {
    const paths = resolveLocalePaths(format, "per-locale", ["무관한/경로.txt"]);
    expect(paths.map((p) => p.path)).toContain("src/lib/i18n/ko.json");
  });

  it("{locale}이 없는데 로케일이 여럿이면 던진다 — 안 던지면 세 로케일이 같은 경로를 받아 마지막 것이 이긴다", () => {
    const broken = formatFromProject(
      {
        adapterName: "json-catalog",
        pathTemplate: "src/i18n/messages.json",
        nested: false,
        nestedByPath: null,
        baseLocale: "en",
      },
      ["ko", "en", "fr"],
    );
    expect(() => resolveLocalePaths(broken, "per-locale", [])).toThrow(/\{locale\}/);
  });

  it("{locale}이 없고 로케일이 하나면 통과한다 — 경로가 겹칠 수 없다", () => {
    const single = formatFromProject(
      {
        adapterName: "json-catalog",
        pathTemplate: "src/i18n/messages.json",
        nested: false,
        nestedByPath: null,
        baseLocale: "en",
      },
      ["en"],
    );
    expect(resolveLocalePaths(single, "per-locale", [])).toEqual([
      { locale: "en", path: "src/i18n/messages.json" },
    ]);
  });

  it("multi-locale은 {locale} 검사를 받지 않는다 — 정의상 치환하지 않는다 (ARCHITECTURE §1.1)", () => {
    const glob = formatFromProject(
      {
        adapterName: "ts-dict",
        pathTemplate: "src/i18n/namespaces/*.ts",
        nested: null,
        nestedByPath: null,
        baseLocale: "en",
      },
      ["ko", "en", "fr"],
    );
    expect(resolveLocalePaths(glob, "multi-locale", ["src/i18n/namespaces/a.ts"])).toEqual([
      { path: "src/i18n/namespaces/a.ts" },
    ]);
  });

  it("결과가 로케일 코드 순으로 정렬된다 — 순서가 흔들리면 트리 페이로드가 비결정적이 된다", () => {
    const f = formatFromProject(
      {
        adapterName: "chrome-locales",
        pathTemplate: "public/_locales/{locale}/messages.json",
        nested: null,
        nestedByPath: null,
        baseLocale: "en",
      },
      ["ko", "fr", "en"],
    );
    expect(resolveLocalePaths(f, "per-locale", []).map((p) => p.locale)).toEqual(["en", "fr", "ko"]);
  });
});

describe("resolveLocalePaths — multi-locale (글롭)", () => {
  const format = formatFromProject(
    {
      adapterName: "ts-dict",
      pathTemplate: "src/i18n/namespaces/*.ts",
      nested: null,
      nestedByPath: null,
      baseLocale: "en",
    },
    ["ko", "en", "fr"],
  );

  const tree = [
    "src/i18n/namespaces/common.ts",
    "src/i18n/namespaces/ai.ts",
    "src/i18n/namespaces/settings.ts",
    "src/i18n/index.ts",
    "README.md",
  ];

  it("글롭을 트리 경로와 매칭한다 — 한 파일에 로케일이 여러 개라 치환하지 않는다", () => {
    expect(resolveLocalePaths(format, "multi-locale", tree).map((p) => p.path)).toEqual([
      "src/i18n/namespaces/ai.ts",
      "src/i18n/namespaces/common.ts",
      "src/i18n/namespaces/settings.ts",
    ]);
  });

  it("매칭 결과에 locale이 없다 — 파일 하나가 여러 로케일을 담는다", () => {
    for (const p of resolveLocalePaths(format, "multi-locale", tree)) {
      expect(p.locale).toBeUndefined();
    }
  });

  it("`*`가 `/`를 먹지 않는다 — 하위 디렉터리 파일을 잡으면 엉뚱한 파일을 덮는다", () => {
    const withNested = [...tree, "src/i18n/namespaces/deep/nested.ts"];
    expect(resolveLocalePaths(format, "multi-locale", withNested).map((p) => p.path)).not.toContain(
      "src/i18n/namespaces/deep/nested.ts",
    );
  });

  it("확장자가 다른 파일을 잡지 않는다", () => {
    const withJson = [...tree, "src/i18n/namespaces/common.json"];
    expect(resolveLocalePaths(format, "multi-locale", withJson).map((p) => p.path)).not.toContain(
      "src/i18n/namespaces/common.json",
    );
  });

  it("글롭이 0파일을 매칭하면 던진다 — 경로가 이동했다는 신호다. 조용히 빈 PR을 내면 안 된다", () => {
    expect(() => resolveLocalePaths(format, "multi-locale", ["README.md"])).toThrow(/matched no files/);
  });
});

describe("buildWriteEntries — writer에 넘길 entries의 유일한 관문", () => {
  const row = (over: Partial<PullRow> & Pick<PullRow, "key">): PullRow => ({
    sourceText: `src:${over.key}`,
    value: `val:${over.key}`,
    orphaned: false,
    ...over,
  });

  it("정상 값은 그대로 실린다", () => {
    const entries = buildWriteEntries([row({ key: "a.one" })], { isBase: false });
    expect(entries).toEqual([{ key: "a.one", message: "val:a.one" }]);
  });

  it("빈 문자열은 제외한다 — ts-dict는 orderedEntries를 지나지 않아 원문이 \"\"로 치환된다", () => {
    const entries = buildWriteEntries([row({ key: "a.one", value: "" })], { isBase: false });
    expect(entries).toEqual([]);
  });

  it("orphaned 키는 제외한다 — 재생성은 파일에서 빠지고, 치환은 원본 값이 남는다", () => {
    const entries = buildWriteEntries([row({ key: "a.gone", orphaned: true })], { isBase: false });
    expect(entries).toEqual([]);
  });

  it("orphaned인데 값이 있어도 제외한다 — 두 조건이 OR이다", () => {
    const entries = buildWriteEntries([row({ key: "a.gone", orphaned: true, value: "살아있음" })], {
      isBase: false,
    });
    expect(entries).toEqual([]);
  });

  it("번역 행이 없으면(value=null) 제외한다 — 미번역이다", () => {
    const entries = buildWriteEntries([row({ key: "a.one", value: null })], { isBase: false });
    expect(entries).toEqual([]);
  });

  it("base 로케일은 행이 없을 때 sourceText로 폴백한다 (MVP §3.2)", () => {
    const entries = buildWriteEntries([row({ key: "a.one", value: null })], { isBase: true });
    expect(entries).toEqual([{ key: "a.one", message: "src:a.one" }]);
  });

  it("base 로케일도 값이 빈 문자열이면 제외한다 — 폴백은 행 부재에만 적용된다", () => {
    const entries = buildWriteEntries([row({ key: "a.one", value: "" })], { isBase: true });
    expect(entries).toEqual([]);
  });

  it("base 로케일의 sourceText도 비어 있으면 제외한다", () => {
    const entries = buildWriteEntries([row({ key: "a.one", value: null, sourceText: "" })], {
      isBase: true,
    });
    expect(entries).toEqual([]);
  });

  it("description은 실어 보낸다 — base에만 넣는 판정은 어댑터가 isBase로 한다", () => {
    const entries = buildWriteEntries([row({ key: "a.one", description: "버튼 레이블" })], {
      isBase: true,
    });
    expect(entries[0]?.description).toBe("버튼 레이블");
  });

  it("빈 description은 싣지 않는다 — 없는 것과 같아야 파일이 결정적이다", () => {
    const entries = buildWriteEntries([row({ key: "a.one", description: "" })], { isBase: true });
    expect(entries[0]?.description).toBeUndefined();
  });

  it("orphaned 플래그를 entries에 남기지 않는다 — 이 함수가 이미 걸렀다", () => {
    const entries = buildWriteEntries([row({ key: "a.one" })], { isBase: false });
    expect(entries[0]).not.toHaveProperty("orphaned");
  });

  it("같은 입력 두 번 → 같은 결과 (결정성)", () => {
    const rows = [row({ key: "b.two" }), row({ key: "a.one" }), row({ key: "c.three" })];
    expect(buildWriteEntries(rows, { isBase: false })).toEqual(
      buildWriteEntries(rows, { isBase: false }),
    );
  });
});

describe("planPullChanges — 2층 blob SHA 비교", () => {
  const KO = '{\n  "a": "안녕"\n}\n';
  const EN = '{\n  "a": "hi"\n}\n';

  it("blob SHA가 같으면 변경분에서 제외한다 — 이게 API 호출을 아끼는 지점이다", () => {
    const changes = planPullChanges(
      [{ path: "i18n/ko.json", content: KO }],
      [{ path: "i18n/ko.json", sha: blobSha(KO) }],
    );
    expect(changes).toEqual([]);
  });

  it("blob SHA가 다르면 변경분에 넣는다", () => {
    const changes = planPullChanges(
      [{ path: "i18n/ko.json", content: KO }],
      [{ path: "i18n/ko.json", sha: blobSha(EN) }],
    );
    expect(changes).toEqual([{ path: "i18n/ko.json", content: KO }]);
  });

  it("base 트리에 없는 경로는 신규로 포함한다", () => {
    const changes = planPullChanges([{ path: "i18n/fr.json", content: EN }], []);
    expect(changes.map((c) => c.path)).toEqual(["i18n/fr.json"]);
  });

  it("base에만 있는 경로는 삭제하지 않는다 — 파일을 지우는 pull은 없다", () => {
    const changes = planPullChanges(
      [{ path: "i18n/ko.json", content: KO }],
      [
        { path: "i18n/ko.json", sha: blobSha(KO) },
        { path: "i18n/사라진.json", sha: blobSha(EN) },
      ],
    );
    expect(changes).toEqual([]);
  });

  it("content가 null이면(write가 낼 것 0개) 스킵한다 — 기존 파일을 유지한다", () => {
    const changes = planPullChanges(
      [{ path: "i18n/ko.json", content: null }],
      [{ path: "i18n/ko.json", sha: blobSha(KO) }],
    );
    expect(changes).toEqual([]);
  });

  it("content가 null이고 base에도 없으면 아무것도 만들지 않는다 — 빈 파일을 내지 않는다", () => {
    expect(planPullChanges([{ path: "i18n/ko.json", content: null }], [])).toEqual([]);
  });

  it("한글·이모지 내용의 SHA를 UTF-8 바이트로 계산한다 (content.length를 쓰면 여기서 깨진다)", () => {
    const emoji = '{\n  "a": "안녕 🎉"\n}\n';
    const changes = planPullChanges(
      [{ path: "i18n/ko.json", content: emoji }],
      [{ path: "i18n/ko.json", sha: blobSha(emoji) }],
    );
    expect(changes).toEqual([]);
  });

  it("변경분이 경로순으로 정렬된다 — 트리 페이로드가 결정적이어야 한다", () => {
    const changes = planPullChanges(
      [
        { path: "i18n/ko.json", content: KO },
        { path: "i18n/en.json", content: EN },
      ],
      [],
    );
    expect(changes.map((c) => c.path)).toEqual(["i18n/en.json", "i18n/ko.json"]);
  });

  it("같은 입력 두 번 → 같은 결과 (결정성)", () => {
    const local = [
      { path: "i18n/ko.json", content: KO },
      { path: "i18n/en.json", content: EN },
    ];
    expect(planPullChanges(local, [])).toEqual(planPullChanges(local, []));
  });
});

describe("formatFromProject — nestedByPath (ARCHITECTURE §1.35)", () => {
  const cols = (over: Partial<ProjectFormatColumns> = {}): ProjectFormatColumns => ({
    adapterName: "json-catalog",
    pathTemplate: "i18n/{locale}.json",
    nested: true,
    nestedByPath: null,
    baseLocale: "en",
    ...over,
  });

  it("경로별 관측값을 포맷에 실어 준다 — write가 이걸 먼저 본다", () => {
    const f = formatFromProject(cols({ nestedByPath: { "i18n/th.json": false } }), ["th"]);
    expect(f.nestedByPath).toEqual({ "i18n/th.json": false });
  });

  it("컬럼이 비어 있으면 undefined다 — write가 포맷 단위 `nested`로 폴백한다", () => {
    expect(formatFromProject(cols(), ["th"]).nestedByPath).toBeUndefined();
  });

  it("boolean이 아닌 값은 버린다 — Json 컬럼이라 DB가 모양을 제약하지 않는다", () => {
    const f = formatFromProject(cols({ nestedByPath: { "i18n/th.json": "yes", "i18n/en.json": true } }), ["th"]);
    expect(f.nestedByPath).toEqual({ "i18n/en.json": true });
  });
});
