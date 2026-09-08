import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **멤버 화면의 배선을 소스로 센다** (6b-2, design §3.9). `translations-screen.test.ts`와 같은 계열 —
 * 렌더 테스트가 없는 자리의 상시 방어선이다.
 *
 * 여기 있는 것은 전부 **눈으로 훑어서는 안 보이는** 부류다: 마스킹은 정상 데이터에서도 "그럴싸한"
 * 이메일로 보이고, `?e=` 가드는 조작된 주소창에서만 드러나고, 역할별 컨트롤 감춤은 EDITOR 세션이
 * 있어야 보인다.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
/**
 * ⚠️ **주석을 벗기고 센다.** 이 리포의 주석은 함정을 인용하므로 금지 패턴을 **문장으로** 담는다 —
 * 벗기지 않으면 "`as AccessError`로 넘기면 죽는다"는 경고가 그 패턴의 사용으로 잡힌다
 * (`no-korean-ui.test.ts`와 같은 관용구).
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

const read = (path: string): string => stripComments(readFileSync(join(ROOT, path), "utf8"));

/** `?e=` 생산자를 세는 범위. `app/`·`components/` 전부 — 어디서 보내도 잡힌다. */
const SCANNED = (function collect(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".") || name === "node_modules" || name === "__tests__") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name)) out.push(read(full.slice(ROOT.length)));
    }
  };
  walk(join(ROOT, "app"));
  walk(join(ROOT, "components"));
  return out;
})();

const PAGE = "app/(edit)/projects/[slug]/members/page.tsx";
const LIST = "components/members/member-list.tsx";
const INVITE = "components/members/invite-dialog.tsx";
const PENDING = "components/members/pending-invitations.tsx";

describe("멤버 화면 — 페이지", () => {
  it("최상단에서 requireProjectAccess를 던진다 — 조건부 렌더는 차단이 아니다", () => {
    const src = read(PAGE);
    expect(src).toContain("requireProjectAccess");
    // EDITOR도 목록을 보므로 게이트는 `translation:write`다. `member:manage`면 EDITOR가 못 들어온다.
    expect(src).toContain('"translation:write"');
    expect(src).not.toContain('requireProjectAccess(...arguments)');
  });

  /**
   * **읽는 쪽과 보내는 쪽이 짝이다** (2026-09-08 code-review 🟡1).
   *
   * design §3.9는 `?e=` global Alert 슬롯을 요구했지만 **그 쿼리를 이 경로로 보내는 자리를 설계가
   * 만들지 않았다** — 거부는 `/projects?e=`로 가고 Action 실패는 행 옆 인라인이다. 읽는 쪽만 두면
   * 도달 불가 코드다. 그래서 지웠고, **이 검사가 그 상태를 고정한다**: 누가 슬롯만 되살리면 red이고,
   * 생산자를 만들면 같은 커밋에서 이 검사를 뒤집게 된다.
   *
   * ⚠️ **되살릴 때는 `isAccessError`로 거른다 — 캐스팅하지 않는다.** `?e=`는 주소창 값이라 union이
   * 아니고, `as AccessError`는 프로토타입 키(`?e=constructor`)에서 사전이 **함수**를 내주게 만들어
   * 화면을 통째로 죽인다 (POSTMORTEM 2026-09-08).
   */
  it("`?e=`를 읽지 않는다 — 그 쿼리를 이 경로로 보내는 자리가 없다", () => {
    const src = read(PAGE);
    expect(src).not.toContain("searchParams");
    // 되살리는 커밋이 캐스팅으로 가지 않도록 금지 패턴은 계속 센다.
    expect(src).not.toMatch(/as\s+AccessError/);
  });

  it("생산자 스캔이 실제로 파일을 걸었다 — 조용히 0건이 되지 않는다", () => {
    expect(SCANNED.length).toBeGreaterThan(20);
  });

  it("보내는 자리가 실제로 0곳이다 — 생산자가 생기면 위 검사를 뒤집어야 한다", () => {
    const producers = [...SCANNED].filter((s) => /\/members[^"'`]*\?e=|routes\.members\([^)]*\)\}\?e=/.test(s));
    expect(producers).toEqual([]);
  });

  it("이메일을 maskEmail로 낸다 — 이 표는 멤버 전원이 본다 (역할로 나누지 않는다)", () => {
    expect(read(PAGE) + read(LIST) + read(PENDING)).toContain("maskEmail");
  });
});

describe("멤버 화면 — 컨트롤", () => {
  it("역할 변경은 native Select다 — DropdownMenu가 아니다 (design §3.9)", () => {
    const src = read(LIST);
    expect(src).toContain('from "@/components/ui/select"');
    expect(src).not.toContain("DropdownMenu");
  });

  it("제거는 Dialog 확인을 지난다 — 되돌릴 수 없는 변경이다", () => {
    expect(read(LIST)).toContain('from "@/components/ui/dialog"');
  });

  /**
   * ⚠️ **노출은 편의이고 차단이 아니다.** 그래도 EDITOR에게 컨트롤을 그리면 눌렀을 때만 거부되어
   * "왜 안 되지"가 된다 — 판정은 Action이 하고 렌더는 role이 가른다.
   */
  it("컨트롤이 role로 갈린다 — canPerform을 읽는다", () => {
    expect(read(LIST) + read(PENDING)).toContain("canPerform");
  });

  it("초대 링크는 한 번만 보인다 — 닫으면 사라진다는 것이 상태로 있다", () => {
    const src = read(INVITE);
    expect(src).toContain("onOpenChange");
    expect(src).toContain("setLink(null)");
  });

  /**
   * ⚠️ **제출 버튼 없는 `<form>`은 Enter로 submit되지 않는다** (POSTMORTEM 2026-09-08 — 번역 화면의
   * 검색이 그렇게 조용히 무효였다).
   */
  it("초대 폼이 자기 안에 submit 버튼을 갖는다", () => {
    const src = read(INVITE);
    expect(src).toContain("<form");
    expect(src).toContain('type="submit"');
  });

  /**
   * ⚠️ **경로 리터럴은 타입이 아니라 데이터다** (POSTMORTEM 2026-09-05 — 라우트를 옮겼는데 링크
   * 생성기가 옛 경로를 든 채 남아 전부 404였다). `entry-points.test.ts`의 "죽은 라우트 링크"는
   * `app/` 아래 진입점만 읽어 `components/`가 사각지대다. 6a에서는 `translations-screen.test.ts`가
   * 이 몫을 셌고, 폼이 여기로 옮겨오면서 검사도 따라왔다.
   */
  it("초대 링크를 `routes.invite`로 만든다 — 경로를 문자열로 조립하지 않는다", () => {
    const src = read(INVITE);
    expect(src).toMatch(/routes\.invite\(/);
    expect(src).not.toMatch(/["`']\/invite\//);
  });
});

describe("멤버 화면 — 임시 폼이 대체됐다", () => {
  it("`components/invite-form.tsx`가 없다 — 초대 수단이 둘이면 하나가 낡는다", () => {
    expect(() => read("components/invite-form.tsx")).toThrow();
  });

  it("번역 화면이 그것을 더 이상 import하지 않는다", () => {
    expect(read("components/translations/header.tsx")).not.toContain("invite-form");
  });
});
