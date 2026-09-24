import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * `logs`(`/projects/:slug/logs`)의 배선을 **소스에서** 센다 (7단계 — DESIGN §6.68).
 *
 * 이 화면에는 렌더 테스트가 없는 층이 둘 있다:
 *
 * 1. **"없음"이 조회 성공에서만 나온다.** 조회가 실패했는데 빈 표를 그리면 "아직 실행이 없다"와
 *    "물어보지 못했다"가 **바이트 단위로 같아진다** — POSTMORTEM 2026-09-03이 정확히 그 형태였고
 *    (실패한 PR 조회를 "PR 없음"으로 읽어 경고가 사라졌다), 2026-09-06이 같은 축이었다.
 *    RSC에서 그 성질은 **`try`를 안 쓰는 것**으로 자동 성립한다: 던지면 Next 오류 화면이다.
 * 2. **8단계 패널과의 경계.** PRODUCT의 🔒 제안을 이 단계가 채택한다 — **`logs`는 과거 이력이고**
 *    "지금 상태 + 행동"은 패널이다. 여기에 [Send changes]를 두면 그 경계가 첫날에 무너진다.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** ⚠️ **주석을 벗기고 센다** — docstring이 자기가 피하는 것을 이름으로 적는다. */
const read = (path: string): string =>
  readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

const PAGE = "app/(edit)/projects/[slug]/logs/page.tsx";

describe("logs — 조회 실패와 '없음'이 다른 모양이다", () => {
  const src = read(PAGE);

  it("게이트가 `translation:write`다 — OWNER 전용이 아니다 (PRODUCT §3)", () => {
    expect(src).toContain("requireProjectAccess");
    expect(src).toMatch(/permission:\s*"translation:write"/);
  });

  it("⚠️ `try`가 없다 — 조회 실패는 던져서 '없음'과 다른 화면이 되어야 한다", () => {
    expect(src).not.toMatch(/\btry\s*\{/);
    expect(src).not.toMatch(/\bcatch\s*\(/);
  });

  /**
   * ⚠️ **머리 설명문이 없다** (2026-09-24 사용자) — 무엇이 쌓이는지는 종류 필터가 이미 말하고,
   * 보관 중일 때의 읽기 전용 안내만 남는다(DESIGN §6.68의 읽기 전용 신호 셋 중 하나).
   */
  it("머리 설명은 보관 안내 하나뿐이다", () => {
    expect(src).not.toContain("m.logs.description");
    expect(src).toContain("m.logs.archived.description");
  });

  it("빈 상태가 `EmptyState`다 — 빈 표가 아니다", () => {
    expect(src).toContain("EmptyState");
  });
});

describe("logs — 8단계 패널과의 경계", () => {
  const src = read(PAGE);

  it("⚠️ Publish 버튼이 없다 — `logs`는 과거 이력이고 행동은 패널이다", () => {
    expect(src).not.toContain("PublishButton");
    expect(src).not.toContain("publish-button");
    expect(src).not.toContain("triggerPullAction");
  });
});

describe("logs — 시각과 페이지네이션", () => {
  const src = read(PAGE);

  /**
   * ⚠️ **이력에서 "2 days ago"는 어느 밤인지 못 가른다.** 상대 시각은 보조이고 절대 시각이
   * `<time dateTime>`에 들어가야 브라우저·스크린리더가 정확한 값을 든다.
   */
  /**
   * ⚠️ **행이 `09:42`만 들지만 정확한 값은 사라지지 않는다** (logs-rework — 날짜는 카드 머리가
   * 한 번 든다). 그 값이 `<time dateTime>`과 접근 이름에 있어야 브라우저·스크린리더가 어느 밤인지
   * 안다 — **화면 파일이 아니라 행·상세 컴포넌트**가 그것을 그린다.
   */
  it("절대 시각을 `<time dateTime>`에 싣는다", () => {
    for (const path of ["components/logs/event-row.tsx", "components/logs/event-detail.tsx"]) {
      expect(read(path), path).toMatch(/<time[^>]*dateTime=/);
    }
    expect(read("components/logs/event-row.tsx")).toContain("aria-label={utcMinute(");
  });

  it("'Older'가 `routes.logs`를 지난다 — 경로를 화면이 조립하지 않는다", () => {
    expect(src).toContain("routes.logs");
    // 2026-09-05 사고의 답이다: 문자열 리터럴은 타입도 테스트도 못 본다.
    expect(src).not.toMatch(/["'`]\/projects\/\$\{[^}]+\}\/logs/);
  });

  /**
   * ⚠️ **한 페이지 크기를 화면이 모른다.** 자르는 것은 조회이고(`loadEvents`), 화면이 숫자를
   * 다시 적으면 둘이 갈려 "Older"가 있는데 다음 페이지가 비거나 그 반대가 된다.
   *
   * ⚠️ **이 화면이 실제로 부르는 조회를 잰다** — 전에는 화면이 안 부르는 옛 `loadSyncRuns`의 소스를 읽어
   * 이름만 참이었다(audit #64 · POSTMORTEM 2026-09-03 재발).
   */
  it("페이지 크기는 조회가 `EVENT_PAGE_SIZE`로 든다 — 화면엔 그 숫자가 없다", () => {
    expect(src).toContain("loadEvents(");
    expect(read("lib/events/query.ts")).toMatch(/options\.limit \?\? EVENT_PAGE_SIZE/);
    expect(src).not.toMatch(/\btake\b/);
    expect(src).not.toContain("EVENT_PAGE_SIZE");
  });
});

describe("logs — 사유 사전", () => {
  const dict = read("messages/en.tsx");

  /**
   * ⚠️ **갈래 누락을 컴파일 타임에 잡는다** — `lib/i18n/adapter-errors.ts` 선례다. 코드가 늘 때
   * 문장이 안 늘면 그 행의 사유 칸이 비고, 그것을 볼 사람은 실패를 겪은 사용자뿐이다.
   *
   * ⚠️ **`satisfies`는 소비자가 건다** — `messages/en.tsx`에서 union을 import하면 그 파일이 잎이
   * 아니게 되고, 그 그래프가 곧 클라이언트 번들이다 (POSTMORTEM 2026-09-07의 7.2MB).
   */
  it("`logs.reasons`의 전수 검사를 소비자가 건다", () => {
    expect(read("lib/events/view.ts")).toMatch(
      /satisfies\s+Record<\s*SyncErrorCode\s*\|\s*"fallback"\s*,\s*string\s*>/,
    );
  });

  it("사전이 잎으로 남는다 — `SyncErrorCode`를 import하지 않는다", () => {
    expect(dict).not.toContain("SyncErrorCode");
  });

  /**
   * ⚠️ **거부 문장도 같은 규칙이다** (logs-rework `logs.refusals`) — 실행이 시작도 못 한 이유를
   * 읽는 사람 역시 번역 편집자다. 전에는 슬라이스가 `reasons:`만 덮어서 그쪽이 사각지대였다.
   */
  it("사유·거부 문장에 git 어휘를 쓰지 않는다 — 읽는 사람은 번역 편집자다", () => {
    for (const key of ["reasons:", "refusals:"]) {
      const start = dict.indexOf(key);
      expect(start, key).toBeGreaterThan(-1);
      // ⚠️ **블록의 끝까지만 자른다** — 고정 길이로 자르면 이웃 절이 섞여 어느 쪽이 걸린 것인지
      // 알 수 없고, 절이 하나 늘 때마다 그 숫자가 낡는다.
      const block = dict.slice(start, dict.indexOf("\n    },", start));
      /**
       * ⚠️ **값만 본다, 키는 안 본다** — 키는 서버 코드(`stale-commit`)라 사용자에게 안 보인다.
       * 블록 전체를 훑으면 그 코드가 문장으로 오진돼, 규칙을 지키려고 **코드 이름을 바꾸게** 된다.
       */
      const sentences = [...block.matchAll(/:\s*"([^"]+)"/g)].map((match) => match[1] ?? "").join(" ");
      expect(sentences.length, key).toBeGreaterThan(0);
      expect(sentences, key).not.toMatch(/\bbranch\b/i);
      expect(sentences, key).not.toMatch(/\bcommit\b/i);
    }
  });
});

/**
 * 상세 껍데기의 시각 값을 **소스에서** 센다 (2026-09-22 `/design-sync` 실측 — DESIGN §6.68).
 *
 * ⚠️ **화면에도 값 테스트에도 안 나타나는 부류다.** 폭·구분선·라벨 색이 어긋나도 글자는 다 읽히고
 * DOM 테스트는 `textContent`만 본다 — computed style로 한 번 잡은 것을 여기서 상시로 든다.
 */
describe("logs 상세 — 껍데기 시각 값", () => {
  const dialog = read("components/logs/event-dialog.tsx");
  const body = read("components/logs/event-detail.tsx");

  /**
   * ⚠️ **1024는 핸드오프를 뒤집은 값이다** (2026-09-22 사용자 — 시안 `1d`는 640이었다).
   * `modal.tsx`와 같은 관용구를 쓰므로 dim 여백 48도 함께 따라온다 — 옛 `max-w-[calc(100vw-48px)]`는
   * 좌우 24만 비워 시안의 절반이었다.
   */
  it("폭이 1024 껍데기 관용구다 — 좁은 화면 여백도 96이다", () => {
    expect(dialog).toContain("max-w-[1024px]");
    expect(dialog).toContain("w-[calc(100%-96px)]");
    expect(dialog).not.toContain("w-[640px]");
    expect(dialog).not.toContain("calc(100vw-48px)");
  });

  /**
   * ⚠️ **dim·radius가 1024 모달(`modal.tsx`)과 같다** (2026-09-24 사용자) — 폭만 빌리고 셋을 따로
   * 두던 판정(`/35`·blur 없음·`rounded-2xl`)을 접었다. Sources 상세와 나란히 서면 차이가 먼저 보였다.
   */
  it("dim과 radius가 1024 모달과 같다 — `/32` + blur 6 · `rounded-xl`", () => {
    expect(dialog).toContain("bg-foreground/32");
    expect(dialog).toContain("backdrop-blur-[6px]");
    expect(dialog).toContain("rounded-xl");
    expect(dialog).not.toContain("bg-foreground/35");
    expect(dialog).not.toContain("rounded-2xl");
  });

  /** ⚠️ **`--shadow-medium`이 이 값과 바이트 단위로 같다** — raw로 박으면 토큰이 움직일 때 혼자 남는다. */
  it("그림자가 토큰이다 — raw rgba를 박지 않는다", () => {
    expect(dialog).toContain("shadow-medium");
    expect(dialog).not.toMatch(/rgba\(22,\s*24,\s*27/);
  });

  /**
   * ⚠️ **라벨과 보조 텍스트가 다른 색이다** — 시안은 필드 라벨 `#a3a3a3`(`text-neutral-400`),
   * 시각·설명 `#737373`(`text-muted-foreground`)이고 구현이 둘을 하나로 합쳐 두었다.
   */
  it("필드 라벨이 `text-neutral-400`이다", () => {
    expect(body).toMatch(/<TableHead scope="row" className="text-neutral-400/);
  });

  /**
   * ⚠️ **그룹 안의 선은 `--divider`(#f0f0f0)이고 `--border`(#e5e5e5)가 아니다.** 상세 안에서
   * 둘이 섞이면 같은 판에 두 굵기의 선이 선다 — 캔버스가 `--border`로 두는 것은 소스별 결과
   * **카드**의 테두리와 그 안의 **행 사이 선**뿐이다(`1e`).
   *
   * ⚠️ **개수로 센다** — 클래스 문자열의 순서를 박으면 누가 재배열하는 순간 조용히 통과한다
   * (이 리포에는 prettier도 tailwind 정렬 플러그인도 없어 순서가 사람 손이다).
   */
  it("`border-t`를 쓰는 넷 중 셋이 `border-divider`다 — 나머지 하나가 카드 안 행 선이다", () => {
    expect(body.match(/border-t\b/g)).toHaveLength(4);
    expect(body.match(/border-divider/g)).toHaveLength(3);
  });

  /**
   * ⚠️ **푸터 버튼의 폼을 손으로 쓰지 않는다** — `Button` `default`/`md`가 캔버스 값과 정확히
   * 겹치고(h36 · radius 10 · px 12 · hover `#fafafa`), 손수 문자열은 `Button`이 받은 갱신을
   * 못 받는다. 실제로 옛 문자열의 hover가 `--accent`(#f5f5f5)에 남아 2026-09-13의 교체를 놓쳤다.
   * ⚠️ **`ButtonLink`가 아닌 이유는 목적지 셋 중 하나가 `target="_blank"`라서다.**
   */
  it("푸터가 버튼 폼을 빌려 쓴다 — [Close]는 `Button`, 목적지는 `buttonClass()`다", () => {
    expect(body).toContain("buttonClass()");
    expect(body).toMatch(/<DialogClose asChild>\s*<Button/);
    expect(body).not.toMatch(/hover:bg-accent[^"]*rounded-\[10px\]/);
  });

  /** ⚠️ **화살표가 "여기를 떠난다"를 말한다** — 캔버스가 목적지 셋 모두에 달았다(`1d`·`1e`·`1f`). */
  // translation-rework T12가 넷째(`Open this translation`)를 더했다 — 문구는 그 전부터 사전에 있었고 소비자가 없었다.
  it("목적지 링크 넷이 모두 화살표를 든다", () => {
    expect(body.match(/\{LEAVE\}/g)).toHaveLength(4);
  });
});

/**
 * ⚠️ **15px는 `text-base`다** — 임의값 `text-[15px]`는 토큰의 자간 짝(0.015em)을 잃는다 (DESIGN §6.68,
 * 로그 상세가 같은 증상을 먼저 고쳤다). **손으로 쓴 버튼 형**은 hover가 `Button default`와 갈린다.
 */
describe("logs — 목록의 글자와 버튼이 토큰을 지난다", () => {
  it("15px 임의값이 없다", () => {
    for (const path of [PAGE, "components/logs/event-row.tsx"]) expect(read(path)).not.toContain("text-[15px]");
  });
  it("보관 안내의 복원 링크는 ButtonLink다", () => {
    expect(read(PAGE)).toMatch(/<ButtonLink[^>]*href=\{routes\.settings\(slug\)\}/);
  });
});

/**
 * **서버가 조립하는 목록 링크도 닫힌 상세의 `event`를 싣지 않는다** (malmoi#102). 상세 닫기가
 * `history.replaceState`라 이 렌더의 `filter.event`는 닫은 뒤에도 남는다 — [Older]·빈 상태의 [Clear filters]가
 * 그것을 실으면 누르는 순간 닫은 상세가 되살아났다. 둘 다 모달 뒤라 상세가 열린 동안에는 누를 수 없다.
 * 행 링크(`event: ref`)와 닫기(`event: undefined`)만 `event`를 정한다.
 */
describe("logs — 목록 링크가 닫힌 상세를 되살리지 않는다", () => {
  const src = read(PAGE);

  it("[Older]가 `event`를 비운다", () => {
    expect(src).toMatch(/cursor: encodeCursor\(page\.nextCursor\),\s*event: undefined/);
  });

  it("빈 상태의 [Clear filters]가 `event`를 비운다", () => {
    expect(src).toContain("clearedLogsQuery({ ...filter, event: null })");
    expect(src).not.toContain("clearedLogsQuery(filter)");
  });
});
