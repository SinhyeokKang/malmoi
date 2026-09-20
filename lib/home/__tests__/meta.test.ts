import { describe, expect, it } from "vitest";

import { metaRows, type MetaRow } from "../meta";

/**
 * 오른쪽 `Project` 메타 열 (캔버스 `2a` 오른쪽 · DESIGN §6.64). **행이 상태에 따라 사라지거나 는다** —
 * 그 규칙을 JSX의 `&&`에 흩으면 여섯 상태 × 열 행의 매트릭스를 화면을 읽어야만 알 수 있다.
 */

const at = (iso: string): Date => new Date(iso);

const base = {
  state: "default" as const,
  repoOwner: "acme",
  repoName: "web",
  baseBranch: "main",
  surfaces: 3,
  locales: ["en", "ja", "ko"],
  keys: 903,
  members: 4,
  lastSyncAt: at("2026-09-14T00:00:00Z"),
  lastImportFailedAt: null,
  lastPublishedAt: at("2026-09-13T00:00:00Z"),
  lastPrUrl: "https://github.com/acme/web/pull/12",
  createdAt: at("2026-08-01T00:00:00Z"),
  archivedAt: null,
};

const kinds = (input: Parameters<typeof metaRows>[0]) => metaRows(input).map((r) => r.kind);
const row = (input: Parameters<typeof metaRows>[0], kind: string) => metaRows(input).find((r) => r.kind === kind);

describe("metaRows — 아홉 행", () => {
  it("순서가 고정이다", () => {
    expect(kinds(base)).toEqual([
      "repository", "branch", "surfaces", "locales", "keys", "members", "lastSync", "lastPublish", "created",
    ]);
  });

  it("리포 행은 주소와 링크를 든다", () => {
    expect(row(base, "repository")).toEqual({
      kind: "repository", owner: "acme", name: "web",
      href: "https://github.com/acme/web", disconnected: false,
    });
  });

  /** ⚠️ **표면이 하나면 그 행이 사라진다** — `1`이라고 적는 것은 정보가 아니다. */
  it("표면이 하나면 표면 행을 그리지 않는다", () => {
    expect(kinds({ ...base, surfaces: 1 })).not.toContain("surfaces");
    expect(kinds({ ...base, surfaces: 2 })).toContain("surfaces");
  });

  it("Publish 행이 PR 링크를 든다 — 없으면 시각만이다", () => {
    expect(row(base, "lastPublish")).toEqual({
      kind: "lastPublish", at: at("2026-09-13T00:00:00Z"), prUrl: "https://github.com/acme/web/pull/12",
    });
    expect(row({ ...base, lastPublishedAt: null, lastPrUrl: null }, "lastPublish")).toEqual({
      kind: "lastPublish", at: null, prUrl: null,
    });
  });
});

describe("metaRows — 상태가 행을 바꾼다", () => {
  /**
   * ⚠️ **`2c`에서 리포 링크가 사라진다** — 그 주소는 지금 우리가 읽을 수 없는 자리이고, 링크로 두면
   * 화면이 "여기 있다"고 말한다. pill이 그 자리를 대신한다.
   */
  it("미연결이면 리포 링크가 빠지고 pill이 선다", () => {
    expect(row({ ...base, state: "not_connected" }, "repository")).toEqual({
      kind: "repository", owner: "acme", name: "web", disconnected: true,
    });
  });

  /**
   * ⚠️ **타입이 어긋난 조합을 막는다** — 전에는 `href: string | null`과 `disconnected: boolean`이 따로
   * 서서 **연결됐다고 말하면서 주소가 없는 행**을 만들 수 있었고, 화면은 그것을 파랑 글자 + 외부 링크
   * 모양인데 **포커스를 못 받는 요소**로 그렸다. 도달 불가를 지키던 것은 타입이 아니라 `metaRows`의
   * 한 줄이었다. 아래 두 단언은 런타임이 아니라 **컴파일러**가 센다.
   */
  it("연결됐다고 말하면서 주소가 없는 행은 타입이 거부한다", () => {
    // @ts-expect-error — `disconnected: false`면 `href`가 필수다.
    const broken: MetaRow = { kind: "repository", owner: "acme", name: "web", disconnected: false };
    // @ts-expect-error — `disconnected: true`에는 `href` 자리가 없다.
    const alsoBroken: MetaRow = { kind: "repository", owner: "acme", name: "web", disconnected: true, href: "https://example.com" };
    expect([broken, alsoBroken].every(r => r.kind === "repository")).toBe(true);
  });

  it("Sync 실패면 마지막 Sync 행이 값 둘을 든다 — 성공 시각과 실패 시각", () => {
    const failed = { ...base, state: "import_failed" as const, lastImportFailedAt: at("2026-09-15T09:00:00Z") };
    expect(row(failed, "lastSync")).toEqual({
      kind: "lastSync", at: at("2026-09-14T00:00:00Z"), failedAt: at("2026-09-15T09:00:00Z"),
    });
    expect(row(base, "lastSync")).toEqual({ kind: "lastSync", at: at("2026-09-14T00:00:00Z"), failedAt: null });
  });

  /**
   * ⚠️ **실행자를 적지 않는다** (DESIGN §6.64 이탈 표) — 캔버스의 `· by Sinhyeok`을 뺀 **의도된 이탈**이다.
   * 보관은 OWNER만 할 수 있고 멤버 상한이 10이라 "누가"의 값이 낮다.
   */
  it("보관이면 행이 하나 늘고 시각만 든다", () => {
    const archived = { ...base, state: "archived" as const, archivedAt: at("2026-09-12T00:00:00Z") };
    expect(kinds(archived)).toEqual([
      "repository", "branch", "surfaces", "locales", "keys", "members", "lastSync", "lastPublish", "created", "archived",
    ]);
    expect(row(archived, "archived")).toEqual({ kind: "archived", at: at("2026-09-12T00:00:00Z") });
  });

  /** 보관 시각이 없으면 그 행도 없다 — 시각 없는 사건을 세우지 않는다(활동 스트림과 같은 규칙). */
  it("보관 상태여도 시각이 없으면 행을 만들지 않는다", () => {
    expect(kinds({ ...base, state: "archived", archivedAt: null })).not.toContain("archived");
  });
});
