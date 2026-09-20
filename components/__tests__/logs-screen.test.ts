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
   * ⚠️ **한 페이지 크기를 화면이 모른다.** 자르는 것은 조회이고(`loadSyncRuns`), 화면이 숫자를
   * 다시 적으면 둘이 갈려 "Older"가 있는데 다음 페이지가 비거나 그 반대가 된다.
   */
  it("페이지 크기는 조회가 `SYNC_LOG_PAGE_SIZE`로 든다 — 화면엔 그 숫자가 없다", () => {
    expect(read("lib/sync/query.ts")).toContain("SYNC_LOG_PAGE_SIZE");
    expect(src).not.toMatch(/\btake\b/);
    expect(src).not.toContain("SYNC_LOG_PAGE_SIZE");
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
    expect(read("lib/sync/view.ts")).toMatch(
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
