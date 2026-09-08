import { readFileSync } from "node:fs";
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
   * ⚠️ **`?e=`를 판정 함수 없이 캐스팅하면 프로토타입 키가 함수를 JSX 자식으로 만든다**
   * (POSTMORTEM 2026-09-08 — 초대 화면이 그렇게 죽을 수 있었다). 다른 세 화면은 `isAccessError`류로
   * 거른다.
   */
  it("`?e=`를 isAccessError로 거른다 — 캐스팅하지 않는다", () => {
    const src = read(PAGE);
    expect(src).toContain("isAccessError");
    expect(src).not.toMatch(/as\s+AccessError/);
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
