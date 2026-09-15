import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Home의 **표현 규칙 셋**을 소스에서 센다 (project-home spec §3.3의 완료 조건 7·8·9).
 *
 * ⚠️ **값이 아니라 구조를 센다.** 클래스 문자열을 통째로 박으면 스타일을 바꾸는 순간 green인 채
 * 결함만 돌아온다 — 세는 것은 "파랑이 몇 자리인가"이지 "그 자리가 어떤 클래스인가"가 아니다.
 *
 * ⚠️ **셋 다 일부러 깨뜨려 red를 확인했다** (2026-09-15) — 매칭이 0인 스캐너는 방어선이 아니라
 * 장식이다 (POSTMORTEM 2026-09-14: 접근성 방어선 셋을 지워도 green이었다).
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");

/** ⚠️ **주석을 벗기고 센다** — 이 화면의 docstring이 자기가 피하는 낱말을 이름으로 적는다. */
const bare = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

/**
 * Home **화면**의 그래프.
 *
 * ⚠️ **`sync-button.tsx`·`sync-result.tsx`가 빠져 있다.** 두 파일은 `components/home/`에 살지만
 * `sync-repository`의 산출물이고 자기 핸드오프(아트보드 `4a`~`4f`)를 따른다 — 그쪽의 파랑은
 * 확인 Dialog 안의 링크 둘이라 이 화면의 다섯과 다른 규칙이다.
 */
const HOME_GRAPH = [
  "app/(edit)/projects/[slug]/page.tsx",
  "app/(edit)/projects/[slug]/loading.tsx",
  "components/home/actions.tsx",
  "components/home/count-cards.tsx",
  "components/home/attention-card.tsx",
  "components/home/logs-card.tsx",
  "components/home/meta-column.tsx",
];

describe("완료 조건 7 — 화면에 `pull`·`push` 낱말이 0이다", () => {
  /**
   * 대상은 **`messages/en.tsx`의 Home 구역**이다 — 코드 식별자(`loadRecentEdits`·`push`)는 바꾸지
   * 않는다. 표시는 `Sync`(리포 → 앱)와 `Publish`(앱 → 리포) 둘뿐이고, 읽는 사람이 비개발자라
   * 저장소 방향을 말하는 낱말이 둘이면 어느 쪽이 자기 일인지 매번 다시 판단해야 한다.
   */
  const section = (): string => {
    const source = bare(read("messages/en.tsx"));
    const start = source.indexOf("\n  home: {");
    const end = source.indexOf("\n  logs: {", start);
    expect(start, "home 구역을 못 찾았다 — 스캐너가 조용히 0건이 됐다").toBeGreaterThan(-1);
    expect(end, "home 구역의 끝을 못 찾았다").toBeGreaterThan(start);
    return source.slice(start, end);
  };

  /**
   * ⚠️ **`pull request`는 예외다** — GitHub의 고유명사이고 그 화면에서 사용자가 실제로 보는 이름이다.
   * 금지하는 것은 **동작**을 가리키는 낱말(`pull`·`push`·`pushed`·`pushes`)이고, 그 둘을 한 정규식에
   * 넣으면 `Published pull request #3`이 걸려 규칙이 자기 문구를 금지하게 된다.
   */
  const operations = (text: string): string[] =>
    [...text.replace(/pull requests?/gi, "").matchAll(/\b(pull|push)(ed|es|ing|s)?\b/gi)].map((match) => match[0]);

  it("Home 구역에 동작 낱말이 없다", () => {
    expect(operations(section())).toEqual([]);
  });

  /** 스캐너가 실제로 무언가를 잡는지 — 대상을 바꾸면 red가 나와야 한다. */
  it("같은 정규식이 금지된 문장을 잡는다", () => {
    expect(operations("CI pushes are rejected")).toEqual(["pushes"]);
    expect(operations("we pull your translations")).toEqual(["pull"]);
    // 고유명사는 통과한다 — 이 예외가 없으면 규칙이 자기 로그 문구를 금지한다.
    expect(operations("Published pull request #3 · 2 files changed")).toEqual([]);
  });
});

describe("완료 조건 8 — Home 소스에 고정폭 글꼴이 0이다", () => {
  /**
   * ⚠️ **`text-mono`는 이 리포의 유일한 mono 소비 경로다** (`app/globals.css`의 `@utility`).
   * 시안이 Home에서 mono를 0으로 만들었으므로 여기서는 그 유틸이 한 번도 안 서야 한다.
   */
  it("그래프 여섯에 `text-mono`가 없다", () => {
    for (const path of HOME_GRAPH) {
      expect(bare(read(path)), path).not.toMatch(/text-mono/);
    }
  });

  it("스캐너가 실제로 잡는다 — mono를 쓰는 파일에서는 red다", () => {
    expect(bare(read("components/home/sync-button.tsx"))).toMatch(/text-mono/);
  });
});

describe("완료 조건 9 — 파랑이 정확히 다섯 자리다", () => {
  /**
   * 화면의 다섯 자리: 유입 카드 · 로그의 sync 줄 · 로그의 PR 번호 · 메타의 리포 주소 · 메타의 PR 번호.
   *
   * ⚠️ **소스 리터럴은 일곱이고 화면 자리는 다섯이다.** 유입 카드는 글리프와 수치가 **한 요소로**
   * 읽히지만 색을 두 곳에 적어야 하고(`tone` 분기 + 수치 분기), 로그의 sync 줄도 점의 테두리와
   * 키 수 조각 둘이 한 줄을 이룬다. 그래서 총합이 아니라 **파일별 분해**를 고정한다 — 총합만
   * 맞추면 자리가 옮겨가도 green이다.
   *
   * ⚠️ **파랑은 링크색이 아니라 "리포 트래픽"이다.** 카드 넷이 전부 링크인데 파란 것은 첫 칸
   * 하나이고, 로그의 두 자리는 링크가 아니다 — `<a>`를 세는 것으로는 이 규칙을 못 센다.
   *
   * ⚠️ **색 이름을 하드코딩하지 않는다.** DESIGN §6.2에 등재된 raw 파랑(`blue-600`)을 세는 것이고,
   * 그 값이 바뀌면 이 정규식 한 줄이 함께 바뀐다.
   */
  const BLUE = /\bblue-\d{2,3}\b/g;
  const count = (path: string): number => [...bare(read(path)).matchAll(BLUE)].length;

  it("유입 카드가 글리프와 수치 둘을 든다", () => {
    expect(count("components/home/count-cards.tsx")).toBe(2);
  });

  it("로그가 sync 줄(점 + 키 수)과 PR 번호로 셋을 든다", () => {
    expect(count("components/home/logs-card.tsx")).toBe(3);
  });

  it("메타가 리포 주소와 PR 번호로 둘을 든다", () => {
    expect(count("components/home/meta-column.tsx")).toBe(2);
  });

  it("나머지 그래프에는 파랑이 없다", () => {
    for (const path of ["app/(edit)/projects/[slug]/page.tsx", "app/(edit)/projects/[slug]/loading.tsx", "components/home/actions.tsx", "components/home/attention-card.tsx"]) {
      expect(count(path), path).toBe(0);
    }
  });

  it("그래프 전체의 합이 일곱이다 — 자리가 늘면 위 분해도 함께 바뀐다", () => {
    expect(HOME_GRAPH.reduce((sum, path) => sum + count(path), 0)).toBe(7);
  });
});
