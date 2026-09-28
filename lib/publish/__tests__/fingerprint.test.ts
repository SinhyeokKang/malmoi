import { describe, expect, it } from "vitest";

import type { PullState } from "@/lib/pull/run";

import { publishFingerprint } from "../fingerprint";

/**
 * Publish 지문 (mcp-connector design §3.1). `preview_publish`가 `loadPullState` 전체 + base head로 내고 `publish`가 실행권 뒤 같은
 * 입력으로 재계산해 대조한다 — 다르면 GitHub 쓰기 없이 `reconfirm`이다. **표시 상한과 무관하다**: 200행 밖 편집·토큰 없는 export
 * 변경(orphan 등)도 지문을 바꿔야 한다. 그래서 입력 축마다 "바꾸면 달라진다"를 하나씩 세고, DB 조회 순서처럼 export에 영향이
 * 없는 차이는 "같다"로 센다(순서가 흔들리면 매번 reconfirm이다).
 */

type Surface = PullState["surfaces"][number];
type Key = Surface["keys"][number];

const key = (id: string, name: string, cells: Key["cells"], extra: Partial<Key> = {}): Key => ({
  id, key: name, sourceText: `src ${name}`, description: null, sortIndex: Number(id.slice(1)), orphaned: false, cells, ...extra,
});

function base(): PullState {
  return {
    project: { id: "p1", slug: "acme", repoOwner: "o", repoName: "r", baseBranch: "main", installationId: "i1", repositoryId: "r1", lastPulledAt: null },
    surfaces: [
      {
        id: "s1", slug: "web", adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: true,
        nestedByPath: { "i18n/en.json": true, "i18n/fr.json": false }, baseLocale: "en", localeCodes: ["en", "fr"],
        keys: [
          key("k1", "hello", { en: { value: "Hello" }, fr: { value: "Bonjour" } }),
          key("k2", "bye", { en: { value: "Bye" }, fr: { value: "Salut", description: "fr note" } }),
        ],
      },
      {
        id: "s2", slug: "app", adapterName: "yaml-catalog", pathTemplate: "config/{locale}.yml", nested: null, nestedByPath: null,
        baseLocale: "en", localeCodes: ["en", "ko"],
        keys: [key("k3", "title", { en: { value: "Title" }, ko: { value: "제목" } })],
      },
    ],
    maxUpdatedAt: new Date("2026-09-28T00:00:00.000Z"),
    unpublished: 2,
    pendingEdits: [
      { id: "t1", token: "tok-a" },
      { id: "t2", token: "tok-b" },
    ],
    deliveryContexts: [{ surfaceId: "s1", fingerprint: "ctx-1" }, { surfaceId: "s2", fingerprint: "ctx-2" }],
  };
}

const HEAD = "headsha1";
const fp = (state: PullState, head: string = HEAD) => publishFingerprint(state, head);

function mutate(fn: (s: PullState) => void): PullState {
  const s = structuredClone(base());
  fn(s);
  return s;
}

describe("publishFingerprint — 같은 입력", () => {
  it("같은 상태 → 같은 지문, sha256 hex", () => {
    expect(fp(base())).toBe(fp(structuredClone(base())));
    expect(fp(base())).toMatch(/^[0-9a-f]{64}$/);
  });

  it("표면·키·로케일·편집 토큰·context의 입력 순서가 달라도 같은 지문", () => {
    const shuffled = mutate(s => {
      s.surfaces.reverse();
      for (const surface of s.surfaces) {
        surface.keys.reverse();
        surface.localeCodes.reverse();
      }
      s.pendingEdits = [...s.pendingEdits].reverse();
      s.deliveryContexts = [...(s.deliveryContexts ?? [])].reverse();
    });
    expect(fp(shuffled)).toBe(fp(base()));
  });

  it("셀 Record와 nestedByPath의 키 삽입 순서가 달라도 같은 지문", () => {
    const reordered = mutate(s => {
      const surface = s.surfaces[0]!;
      surface.nestedByPath = { "i18n/fr.json": false, "i18n/en.json": true };
      const k1 = surface.keys[0]!;
      k1.cells = { fr: k1.cells.fr, en: k1.cells.en };
    });
    expect(fp(reordered)).toBe(fp(base()));
  });

  it("export 입력이 아닌 값(maxUpdatedAt·unpublished·lastPulledAt)은 지문에 없다", () => {
    const other = mutate(s => {
      s.maxUpdatedAt = new Date("2030-01-01T00:00:00.000Z");
      s.unpublished = 99;
      s.project.lastPulledAt = new Date("2026-09-27T00:00:00.000Z");
    });
    expect(fp(other)).toBe(fp(base()));
  });

  it("description·placeholders의 undefined와 null을 같게 본다 — 조회 경로 차이로 흔들리지 않게", () => {
    const withUndefined = mutate(s => { s.surfaces[0]!.keys[0]!.description = undefined; });
    expect(fp(withUndefined)).toBe(fp(base()));
  });
});

describe("publishFingerprint — 바뀌면 다른 지문", () => {
  const cases: [string, (s: PullState) => void][] = [
    ["번역 값", s => { s.surfaces[0]!.keys[0]!.cells.fr = { value: "Salut!" }; }],
    ["셀 추가(미번역 → 번역)", s => { s.surfaces[1]!.keys[0]!.cells.fr = { value: "Titre" }; }],
    ["셀 제거", s => { delete s.surfaces[0]!.keys[1]!.cells.fr; }],
    ["셀 description", s => { s.surfaces[0]!.keys[1]!.cells.fr = { value: "Salut", description: "other" }; }],
    ["셀 placeholders", s => { s.surfaces[0]!.keys[0]!.cells.fr = { value: "Bonjour", placeholders: { name: "x" } }; }],
    ["편집 토큰 값", s => { s.pendingEdits = [{ id: "t1", token: "tok-a2" }, { id: "t2", token: "tok-b" }]; }],
    ["편집 토큰 추가", s => { s.pendingEdits = [...s.pendingEdits, { id: "t3", token: "tok-c" }]; }],
    ["키 추가", s => { s.surfaces[0]!.keys.push(key("k9", "new", { en: { value: "New" } })); }],
    ["키 제거", s => { s.surfaces[0]!.keys.pop(); }],
    ["키 orphaned (토큰 없는 export 변경)", s => { s.surfaces[0]!.keys[0]!.orphaned = true; }],
    ["원문", s => { s.surfaces[0]!.keys[0]!.sourceText = "Hello!"; }],
    ["키 description", s => { s.surfaces[0]!.keys[0]!.description = "greeting"; }],
    ["키 sortIndex", s => { s.surfaces[0]!.keys[0]!.sortIndex = 42; }],
    ["로케일 집합", s => { s.surfaces[0]!.localeCodes.push("de"); }],
    ["표면 adapter", s => { s.surfaces[0]!.adapterName = "chrome-locales"; }],
    ["표면 pathTemplate", s => { s.surfaces[0]!.pathTemplate = "locales/{locale}.json"; }],
    ["표면 baseLocale", s => { s.surfaces[0]!.baseLocale = "fr"; }],
    ["표면 nested", s => { s.surfaces[0]!.nested = false; }],
    ["표면 nestedByPath", s => { s.surfaces[0]!.nestedByPath = { "i18n/en.json": false, "i18n/fr.json": false }; }],
    ["표면 추가", s => { s.surfaces.push({ ...structuredClone(s.surfaces[1]!), id: "s3", slug: "cli" }); }],
    ["표면 slug", s => { s.surfaces[0]!.slug = "site"; }],
    ["context 지문", s => { s.deliveryContexts = [{ surfaceId: "s1", fingerprint: "ctx-1b" }, { surfaceId: "s2", fingerprint: "ctx-2" }]; }],
    ["리포 owner", s => { s.project.repoOwner = "o2"; }],
    ["리포 이름", s => { s.project.repoName = "r2"; }],
    ["base branch", s => { s.project.baseBranch = "release"; }],
    ["installation", s => { s.project.installationId = "i2"; }],
    ["repositoryId", s => { s.project.repositoryId = "r9"; }],
    ["프로젝트", s => { s.project.id = "p2"; }],
  ];

  it.each(cases)("%s", (_label, change) => {
    expect(fp(mutate(change))).not.toBe(fp(base()));
  });

  it("base head가 바뀌면 다르다", () => {
    expect(fp(base(), "headsha2")).not.toBe(fp(base()));
  });

  it("경계가 움직인 두 입력을 같은 문자열로 만들지 않는다(튜플 직렬화)", () => {
    const a = mutate(s => { s.pendingEdits = [{ id: "t1", token: "a|b" }]; });
    const b = mutate(s => { s.pendingEdits = [{ id: "t1|a", token: "b" }]; });
    expect(fp(a)).not.toBe(fp(b));
  });

  it("표시 상한(200행) 밖의 편집도 잡는다", () => {
    const many = mutate(s => {
      s.surfaces[0]!.keys = Array.from({ length: 300 }, (_, i) => key(`k${i + 10}`, `key${i}`, { en: { value: `v${i}` }, fr: { value: `f${i}` } }));
    });
    const lastEdited = structuredClone(many);
    lastEdited.surfaces[0]!.keys[299]!.cells.fr = { value: "changed" };
    expect(fp(lastEdited)).not.toBe(fp(many));
  });
});
