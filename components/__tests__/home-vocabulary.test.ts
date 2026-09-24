import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { m } from "@/lib/i18n";

/**
 * Home의 **표현 규칙 셋**을 소스에서 센다 (DESIGN §6.64).
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
  "app/(edit)/projects/[slug]/(home)/page.tsx",
  "app/(edit)/projects/[slug]/(home)/loading.tsx",
  "components/home/actions.tsx",
  "components/home/count-cards.tsx",
  "components/home/attention-card.tsx",
  "components/home/logs-card.tsx",
  "components/home/meta-column.tsx",
  /**
   * ⚠️ **2026-09-20에 들어왔다** (logs-rework) — Recent logs가 Logs와 **같은 행 컴포넌트**를 쓰면서
   * 카드의 파랑이 이 파일로 옮겨갔다. 안 넣으면 "화면의 파랑이 몇 자리인가"가 Home 파일만 세어
   * 조용히 줄어든다 — 옮기는 것 자체가 검사를 회피시키는 모양이다.
   */
  "components/logs/event-row.tsx",
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
  it("그래프 여덟에 `text-mono`가 없다", () => {
    for (const path of HOME_GRAPH) {
      expect(bare(read(path)), path).not.toMatch(/text-mono/);
    }
  });

  /**
   * ⚠️ **카나리아가 코드 블록으로 옮겨 갔다** (2026-09-23). `text-mono`가 화면에서 걷히면서 Home 밖의
   * mono도 `<pre>` 하나와 파서 오류 하나만 남았다 — 그 전 카나리아였던 `sync-button.tsx`는 이제 sans다.
   * **전수로 세는 것은 `surface-rules.test.ts`다** — 여기는 Home 그래프만 본다.
   */
  it("스캐너가 실제로 잡는다 — mono를 쓰는 파일에서는 red다", () => {
    expect(bare(read("components/onboarding/workflow-block.tsx"))).toMatch(/text-mono/);
  });
});

describe("완료 조건 9 — 파랑이 정확히 네 자리다", () => {
  /**
   * 화면의 네 자리: 유입 카드 · 로그 행의 PR 번호 · 메타의 리포 주소 · 메타의 PR 번호.
   * (로그의 sync 줄 파랑은 logs-rework가 걷었다 — 점이 값을 싣지 않았고 "새 것"은 새로고침하면 뜻이 바뀐다.)
   *
   * ⚠️ **소스 리터럴은 다섯이고 화면 자리는 넷이다.** 유입 카드는 글리프와 수치가 **한 요소로**
   * 읽히지만 색을 두 곳에 적어야 하고(`tone` 분기 + 수치 분기), 그래서 총합이 아니라 **파일별 분해**를 고정한다 — 총합만
   * 맞추면 자리가 옮겨가도 green이다.
   *
   * ⚠️ **파랑은 링크색이 아니라 "리포 트래픽"이다.** 카드 넷이 전부 링크인데 파란 것은 첫 칸
   * 하나이고, 로그의 PR 번호는 링크가 아니다 — `<a>`를 세는 것으로는 이 규칙을 못 센다.
   *
   * ⚠️ **색 이름을 하드코딩하지 않는다.** DESIGN §6.2에 등재된 raw 파랑(`blue-600`)을 세는 것이고,
   * 그 값이 바뀌면 이 정규식 한 줄이 함께 바뀐다.
   */
  const BLUE = /\bblue-\d{2,3}\b/g;
  const count = (path: string): number => [...bare(read(path)).matchAll(BLUE)].length;

  it("유입 카드가 글리프와 수치 둘을 든다", () => {
    expect(count("components/home/count-cards.tsx")).toBe(2);
  });

  /**
   * ⚠️ **셋에서 하나로 줄었다** (logs-rework). 타임라인 점과 "새 키 수"의 파랑이 사라졌다 —
   * 점은 아무 값도 싣지 않았고, 파랑이 뜻하던 "새 것"은 새로고침하면 뜻이 바뀐다. 남은 하나는
   * **PR 번호**이고 그것이 이 규칙이 말하는 "리포 트래픽"이다. 카드가 행을 `event-row`에 넘겼으므로
   * 그 자리도 그 파일에 있다.
   */
  it("로그 카드에는 파랑이 없고, 행의 PR 번호 하나가 그 자리를 든다", () => {
    expect(count("components/home/logs-card.tsx")).toBe(0);
    expect(count("components/logs/event-row.tsx")).toBe(1);
  });

  it("메타가 리포 주소와 PR 번호로 둘을 든다", () => {
    expect(count("components/home/meta-column.tsx")).toBe(2);
  });

  it("나머지 그래프에는 파랑이 없다", () => {
    for (const path of ["app/(edit)/projects/[slug]/(home)/page.tsx", "app/(edit)/projects/[slug]/(home)/loading.tsx", "components/home/actions.tsx", "components/home/attention-card.tsx"]) {
      expect(count(path), path).toBe(0);
    }
  });

  it("그래프 전체의 합이 다섯이다 — 자리가 늘면 위 분해도 함께 바뀐다", () => {
    expect(HOME_GRAPH.reduce((sum, path) => sum + count(path), 0)).toBe(5);
  });
});

/**
 * ⚠️ **한 화면에서 천단위 구분자가 갈리면 안 된다** (2026-09-15 재리뷰 🟡8). 카운트 카드가 `+1,207`을
 * 띄우는 **바로 아래** 결과 Alert가 `Synced 1207 keys`라고 쓰고, 확인 Dialog의 `1207 edits` 위에는
 * `[Publish]` 배지가 `1,207`을 단다 — 같은 수가 두 표기로 서면 같은 수인지부터 다시 읽어야 한다.
 * `008efce`가 `home` 절 넷을 고쳤지만 같은 화면의 `repositorySync` 절은 안 건드렸다.
 */
/**
 * ⚠️ **목록을 손으로 적지 않는다** — 첫 판은 다섯을 적어 `home.cards.localeCount`를 못 봤고, 둘째 판은
 * 사전 **둘**만 훑어 `home.attention`·`home.logs`(2026-09-15에 고친 바로 그 넷)를 못 봤다. 구멍이
 * 한 겹씩 위로 올라갔을 뿐이라, 이제 **최상위 블록 안쪽을 중첩까지 전부** 훑는다.
 *
 * ⚠️ **모든 수에 구분자를 넣는 것이 아니다** — 세는 수가 아닌 자리는 **경로로** 면제한다(함수 이름만
 * 보면 다른 블록에 같은 이름이 생길 때 엉뚱한 쪽이 조용히 빠진다).
 */
const NOT_A_COUNT: Record<string, string> = {
  // 상한이 **코드 상수**로 강제된다 — 재검토가 필요 없는 부류다.
  "projects.count": "PROJECT_LIMIT = 3",
  "projects.memberCount": "MEMBER_LIMIT = 10",
  // 좌석 넷도 같은 상수가 강제한다 — 분모가 `MEMBER_LIMIT`이고 분자는 그보다 클 수 없다.
  "members.seats": "MEMBER_LIMIT = 10",
  "members.seatsFull": "MEMBER_LIMIT = 10",
  "members.count": "MEMBER_LIMIT = 10",
  "members.invite.seatsUsed": "MEMBER_LIMIT = 10",
  "errors.onboarding.limit-reached": "PROJECT_LIMIT = 3",
  // 수가 아니다 — 번호·단계·글자 상한.
  "projects.banner.prOpen": "PR 번호",
  "newProject.modal.step": "단계 번호 — `Step 3 of 4`",
  // 분모가 `LOGIN_PROVIDERS` 길이(2)라 코드 상수로 강제된다 — `Step 3 of 4`와 같은 부류다.
  "link.methods.count": "LOGIN_PROVIDERS 길이 = 2",
  "newProject.naming.slugTooLong": "글자 수 상한",
  "errors.onboarding.invalid-slug": "글자 수 상한",
  "account.profile.errors.tooLong": "글자 수 상한",
  /*
    ⚠️ **아래 셋은 상한을 강제하는 상수가 없다** (2026-09-16 라운드 6 Q3) — "한 자리다"는 **관측이지
    보장이 아니다.** 결론은 유지하되(로케일 파일 그룹이 천 개가 되는 경로가 없다) 표면 상한이
    생기거나 대량 표면 리포가 들어오면 **이 세 줄이 먼저 재검토 대상**이라는 뜻으로 적어 둔다.
  */
  "projects.banner.repoAhead": "로케일 파일 수 — 강제 상한 없음",
  "newProject.steps.files.description": "후보 세트 수 — 강제 상한 없음",
  "newProject.files.summaryShort": "로케일 수 — 강제 상한 없음",
  "repositorySync.openPr": "PR 번호 — `#1,207`은 그런 PR이 아니다",
  "home.meta.pr": "PR 번호 — 같은 이유다",
  "translations.publish.prOpen.title": "PR 번호",
  "translations.publish.replacePr": "PR 번호",
  "translations.publish.tellReviewer": "PR 번호",
  "translations.publish.closedPr.line": "PR 번호",
  "translations.publish.closedPr.view": "PR 번호",
  "translations.publish.same.undoes": "PR 번호",
  "translations.publish.same.closesTitle": "PR 번호",
  "translations.publish.same.closesBody": "PR 번호",
  "translations.publish.same.closeAction": "PR 번호",
  "translations.publish.wait": "남은 초 — 수가 아니라 대기 시간이다",
  "repositorySync.unreadable": "표면 수 — 강제 상한 없음(위 셋과 같은 부류)",
  "repositorySync.notReplaced": "표면 수 — 강제 상한 없음(위 셋과 같은 부류)",
  "home.cards.acrossSurfaces": "표면 수 — 강제 상한 없음(위 셋과 같은 부류)",
  "home.attention.more": "상한이 5다 — `lib/home/attention.ts`의 `CAP` 상수가 강제한다",
  // 수를 직접 찍지 않는다 — 보이는 수는 인자로 받은 `unsentCount(n)` 노드가 만들고, `n`은 단복수에만 쓴다.
  "repositorySync.unsent": "수를 찍지 않는다 — 단복수 판정에만 쓴다",
};

/**
 * 최상위 사전 블록 안의 `n: number`를 받는 정의 전부. 키는 **중첩 경로**이고 값은 **정의 전문**이다.
 *
 * ⚠️ **정의를 한 줄로 가정하지 않는다** — 인자 목록이나 본문이 다음 줄로 넘어가는 항목이 실제로 있고,
 * 시그니처만 보면 본문의 `toLocaleString`을 못 봐 **거짓 red**가 난다.
 */
function numberTakers(top: string): Map<string, string> {
  const source = readFileSync(join(ROOT, "messages/en.tsx"), "utf8");
  const open = source.indexOf(`\n  ${top}: {`);
  if (open < 0) throw new Error(`Missing dictionary block: ${top}`);
  let depth = 0, end = source.length;
  for (let i = source.indexOf("{", open); i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  const lines = source.slice(open, end).split("\n");
  const out = new Map<string, string>();
  const stack: { name: string; indent: number }[] = [];
  let current: { path: string; indent: number; text: string[] } | null = null;
  const flush = () => {
    if (current !== null && /:\s*number/.test(current.text.join("\n"))) out.set(current.path, current.text.join("\n"));
    current = null;
  };
  for (const line of lines) {
    const indent = line.length - line.trimStart().length;
    if (current !== null && indent > current.indent && line.trim() !== "") { current.text.push(line); continue; }
    flush();
    const block = /^\s*"?([\w-]+)"?: \{\s*$/.exec(line);
    if (block) { while (stack.length > 0 && (stack.at(-1)?.indent ?? 0) >= indent) stack.pop(); stack.push({ name: block[1] ?? "", indent }); continue; }
    // ⚠️ `} as const,`·`} satisfies X,`도 닫는 줄이다 — `},`만 보면 스택이 안 풀려 **뒤따르는 형제의 경로가 어긋난다.**
    if (/^\s*\}(?:\s+(?:as|satisfies)\s+[\w<>\[\]., ]+)?,?\s*$/.test(line)) { while (stack.length > 0 && (stack.at(-1)?.indent ?? 0) >= indent) stack.pop(); continue; }
    // ⚠️ 따옴표 키(`"too-soon": (s: number)`)도 센다 — 안 세면 그 자리가 조용히 면제된다.
    const fn = /^\s*"?([\w-]+)"?: \(/.exec(line);
    if (fn) current = { path: [...stack.map((s) => s.name), fn[1] ?? ""].join("."), indent, text: [line] };
  }
  flush();
  return out;
}

/**
 * ⚠️ **사전을 손으로 고르지 않는다.** 범위를 손으로 적을 때마다 같은 구멍이 **한 겹씩 위로** 올라갔다
 * — 다섯 함수 → 사전 둘 → 최상위 블록 둘 → 그리고 형제 하나만 고쳐 그룹이 갈라졌다(2026-09-16).
 * 규칙의 문장이 "이 제품이 보여주는 수"인데 검사 범위가 그보다 좁으면, 그 차이가 매번 결함이 된다.
 */
function topLevelDictionaries(): string[] {
  const source = readFileSync(join(ROOT, "messages/en.tsx"), "utf8");
  return [...source.matchAll(/^  "?([\w-]+)"?: \{$/gm)].map((match) => match[1] ?? "");
}

it("수를 세는 사전 함수는 전부 천단위 구분자를 쓴다", () => {
  const offenders: string[] = [];
  let checked = 0;
  const dictionaries = topLevelDictionaries();
  // ⚠️ 매칭이 0인 스캐너는 방어선이 아니라 장식이다 — 사전 목록과 대상 수를 함께 센다.
  expect(dictionaries.length).toBeGreaterThan(8);
  for (const top of dictionaries) {
    const takers = numberTakers(top);
    for (const [path, text] of takers) {
      if (Object.hasOwn(NOT_A_COUNT, path)) continue;
      checked += 1;
      if (!text.includes("toLocaleString")) offenders.push(`${path}: ${text.trim().split("\n")[0]}`);
    }
  }
  // 첫 판이 다섯, 둘째가 여덟, 셋째가 열셋을 봤다 — 넓힌 것이 실제로 늘었는지 센다.
  expect(checked).toBeGreaterThan(20);
  expect(offenders).toEqual([]);
});

/** ⚠️ 면제 목록이 **실재하는 경로**를 가리키나 — 이름이 바뀌면 조용히 면제가 풀리거나 죽은 줄이 남는다. */
it("면제 목록의 경로가 전부 실재한다", () => {
  const known = new Set(topLevelDictionaries().flatMap((top) => [...numberTakers(top).keys()]));
  expect(Object.keys(NOT_A_COUNT).filter((path) => !known.has(path))).toEqual([]);
});
