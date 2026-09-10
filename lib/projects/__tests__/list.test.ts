import { describe, expect, it } from "vitest";

import { m } from "@/lib/i18n";

import {
  filterProjects,
  parseProjectFilter,
  projectStatus,
  searchProjects,
  type ProjectStatus,
} from "../list";

/**
 * 목록 필터의 순수 판정 (8-3). **입력이 주소창 값이라** 폴백이 계약의 절반이다.
 */
describe("parseProjectFilter", () => {
  it("여섯 갈래를 그대로 낸다 — `all` + 상태 다섯", () => {
    expect(parseProjectFilter("all")).toBe("all");
    expect(parseProjectFilter("active")).toBe("active");
    expect(parseProjectFilter("archived")).toBe("archived");
    expect(parseProjectFilter("setup")).toBe("setup");
    expect(parseProjectFilter("awaiting_first_sync")).toBe("awaiting_first_sync");
    expect(parseProjectFilter("needs_reconnect")).toBe("needs_reconnect");
  });

  it("없거나 모르는 값은 `all`이다 — 주소창을 고친 사람에게 빈 화면을 주지 않는다", () => {
    expect(parseProjectFilter(undefined)).toBe("all");
    expect(parseProjectFilter("")).toBe("all");
    expect(parseProjectFilter("ACTIVE")).toBe("all");
    expect(parseProjectFilter("deleted")).toBe("all");
  });

  /**
   * ⚠️ **프로토타입 키를 먹인다** — 이 리포가 두 번 밟은 부류다 (POSTMORTEM 2026-09-08·09).
   * 판정을 객체 조회로 바꾸는 순간 `constructor`가 함수 값으로 찾아지므로, 그때 red가 나야 한다.
   */
  it("프로토타입 키가 갈래로 새지 않는다", () => {
    for (const key of ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"]) {
      expect(parseProjectFilter(key)).toBe("all");
    }
  });
});

describe("filterProjects", () => {
  const READY = { installationId: "i", lastCommitSha: "s", repositoryId: "r", archivedAt: null };
  const rows = [
    { slug: "a", ...READY },
    { slug: "b", ...READY, archivedAt: new Date("2026-09-10T00:00:00Z") },
    { slug: "c", ...READY },
    { slug: "d", ...READY, installationId: null },
    { slug: "e", ...READY, lastCommitSha: null },
    { slug: "f", ...READY, repositoryId: null },
  ];

  it("`all`은 순서를 보존한 채 전부 낸다", () => {
    expect(filterProjects(rows, "all").map((r) => r.slug)).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  /**
   * ⚠️ **`archivedAt` 비교가 아니라 `projectStatus` 판정으로 좁힌다** (2026-09-11 사용자 —
   * 필터 축이 상태 다섯으로 넓어졌다). 둘로 나뉘어 있으면 배지와 탭이 다른 규칙으로 같은 행을
   * 가르게 되고, 그 어긋남은 화면에서 안 보인다.
   */
  it("상태마다 그 상태의 행만 낸다", () => {
    expect(filterProjects(rows, "active").map((r) => r.slug)).toEqual(["a", "c"]);
    expect(filterProjects(rows, "archived").map((r) => r.slug)).toEqual(["b"]);
    expect(filterProjects(rows, "setup").map((r) => r.slug)).toEqual(["d"]);
    expect(filterProjects(rows, "awaiting_first_sync").map((r) => r.slug)).toEqual(["e"]);
    expect(filterProjects(rows, "needs_reconnect").map((r) => r.slug)).toEqual(["f"]);
  });

  it("빈 목록에서도 죽지 않는다", () => {
    expect(filterProjects([], "archived")).toEqual([]);
  });

  /**
   * ⚠️ **원본을 건드리지 않는다** — 호출부가 같은 배열로 총계도 세므로, 제자리에서 잘라내면 제목 옆
   * 숫자가 탭에 따라 달라진다.
   */
  it("원본을 건드리지 않는다", () => {
    const original = [...rows];
    filterProjects(rows, "active");
    expect(rows).toEqual(original);
  });
});

describe("searchProjects", () => {
  const rows = [
    { slug: "a", name: "BugShot Web" },
    { slug: "b", name: "말모이" },
    { slug: "c", name: "bugshot-extension" },
  ];

  it("빈 질의는 전부 낸다", () => {
    expect(searchProjects(rows, "").map((r) => r.slug)).toEqual(["a", "b", "c"]);
    expect(searchProjects(rows, undefined).map((r) => r.slug)).toEqual(["a", "b", "c"]);
  });

  it("공백만 있는 질의도 전부 낸다", () => {
    expect(searchProjects(rows, "   ").map((r) => r.slug)).toEqual(["a", "b", "c"]);
  });

  // 이름은 사용자가 정하고 질의는 주소창 값이라 대소문자를 맞출 수 없다.
  it("대소문자를 가리지 않고 부분 일치한다", () => {
    expect(searchProjects(rows, "bugshot").map((r) => r.slug)).toEqual(["a", "c"]);
    expect(searchProjects(rows, "SHOT").map((r) => r.slug)).toEqual(["a", "c"]);
  });

  it("앞뒤 공백을 무시한다", () => {
    expect(searchProjects(rows, "  web  ").map((r) => r.slug)).toEqual(["a"]);
  });

  it("비ASCII 이름도 찾는다", () => {
    expect(searchProjects(rows, "말모").map((r) => r.slug)).toEqual(["b"]);
  });

  it("맞는 것이 없으면 빈 배열이다", () => {
    expect(searchProjects(rows, "zzz")).toEqual([]);
  });

  // ⚠️ 호출부가 같은 배열로 필터 전 총계를 센다 — 제자리에서 잘라내면 제목 옆 숫자가 흔들린다.
  it("원본을 건드리지 않는다", () => {
    const original = [...rows];
    searchProjects(rows, "bugshot");
    expect(rows).toEqual(original);
  });
});

describe("projectStatus", () => {
  const READY = { archivedAt: null, installationId: "1", lastCommitSha: "a".repeat(40), repositoryId: "42" };

  it("준비된 프로젝트는 `active`다 — 이 화면에서만 `ready`가 침묵이 아니다", () => {
    expect(projectStatus(READY)).toBe("active");
  });

  /**
   * ⚠️ **보관이 readiness보다 앞이다.** 멈춘 프로젝트에서 "첫 적재를 기다리는 중"은 답할 질문이
   * 아니다 — 순서를 뒤집으면 보관된 신규 프로젝트가 `Setting up`으로 보이고, 사용자는 그것을
   * 되돌리는 대신 온보딩을 고치러 간다.
   */
  it("보관이 readiness를 이긴다", () => {
    expect(projectStatus({ ...READY, archivedAt: new Date() })).toBe("archived");
    expect(
      projectStatus({ archivedAt: new Date(), installationId: null, lastCommitSha: null, repositoryId: null }),
    ).toBe("archived");
  });

  it("연결 전은 `setup`, 첫 적재 전은 `awaiting_first_sync`다", () => {
    expect(projectStatus({ ...READY, installationId: null })).toBe("setup");
    expect(projectStatus({ ...READY, lastCommitSha: null })).toBe("awaiting_first_sync");
  });

  /**
   * ⚠️ **`repositoryId`는 readiness와 다른 축이다** (SAAS §7.5). sec-audit-2 이전에 만들어진 행이
   * 이것이고, 그 상태에서 **Publish만 조용히 거부된다** — 목록이 여태 `Active`를 보였다.
   */
  it("준비됐는데 리포가 고정 안 됐으면 `needs_reconnect`다", () => {
    expect(projectStatus({ ...READY, repositoryId: null })).toBe("needs_reconnect");
  });

  /**
   * ⚠️ **`ready`일 때만 본다.** 첫 적재조차 안 끝난 프로젝트에서 "다시 연결하라"는 답할 질문이
   * 아니다 — 순서를 뒤집으면 온보딩 중인 프로젝트가 전부 그 배지를 달고, 사용자가 갓 만든 것을
   * 고치러 간다.
   */
  it("readiness가 `needs_reconnect`보다 앞이다", () => {
    expect(projectStatus({ ...READY, installationId: null, repositoryId: null })).toBe("setup");
    expect(projectStatus({ ...READY, lastCommitSha: null, repositoryId: null })).toBe("awaiting_first_sync");
  });

  /** 보관은 그 셋 전부를 이긴다. */
  it("보관이 `needs_reconnect`도 이긴다", () => {
    expect(projectStatus({ ...READY, archivedAt: new Date(), repositoryId: null })).toBe("archived");
  });
});

/**
 * 문구 — `readinessLabel`이 들던 방어선이 여기로 따라왔다.
 * **번역자도 이 목록을 보므로 내부 이름이 화면에 뜨면 안 된다** (SAAS §3).
 */
describe("상태 문구", () => {
  const ALL = [
    "active",
    "archived",
    "setup",
    "awaiting_first_sync",
    "needs_reconnect",
  ] as const satisfies readonly ProjectStatus[];

  type Missing = Exclude<ProjectStatus, (typeof ALL)[number]>;
  const _coversUnion: [Missing] extends [never] ? true : false = true;
  void _coversUnion;

  it("갈래 다섯이 전부 문구를 갖는다", () => {
    for (const status of ALL) expect(m.projects.status[status]).toBeTruthy();
  });

  it("내부 이름을 흘리지 않는다 — 읽는 사람은 비개발자 동료다", () => {
    for (const status of ALL) {
      const label = m.projects.status[status];
      expect(label).not.toContain(status);
      // snake_case는 우리 내부 이름의 모양이다 — en 라벨의 보통 낱말과 갈린다.
      expect(label).not.toMatch(/[a-z]+_[a-z]+/);
    }
  });

  it("다섯이 서로 다르다 — 한 문구로 접히면 상태를 구별할 수 없다", () => {
    expect(new Set(ALL.map((s) => m.projects.status[s])).size).toBe(ALL.length);
  });
});
