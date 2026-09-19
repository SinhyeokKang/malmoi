import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **멤버 화면의 배선을 소스로 센다** (6b-2 — DESIGN §6.65). `translations-screen.test.ts`와 같은 계열 —
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
  /**
   * **행을 지운 뒤의 포커스 착지점이 실제로 존재한다** (malmoi#51 · 2026-09-17 code-review 🟡1).
   *
   * ⚠️ `members-focus.test.tsx`는 제목을 **자기가** 그려서 잰다 — 페이지의 `id`와 `headingId`가 갈라져도
   * green이다. 갈라지면 `getElementById`가 `null`이고 `?.`가 조용히 넘어가 포커스가 다시 `body`로 빠진다.
   */
  it.each([["MemberList", LIST]])("%s가 받은 headingId를 카드 제목으로 넘긴다", (component, file) => {
    const src = read(PAGE);
    const passed = new RegExp(`<${component}\\b[^>]*headingId="([^"]+)"`).exec(src)?.[1];
    expect(passed).toBeDefined();
    // 카드가 그 id를 제목에 건다 — 값은 prop으로 흐르므로 **전달**을 센다.
    expect(read(file)).toMatch(/titleId=\{headingId\}/);
  });

  /**
   * ⚠️ **id와 `tabIndex={-1}`이 한 자리에서 나온다** (malmoi#51). 갈라지면 `getElementById`는 찾는데
   * `focus()`가 무시되어 포커스가 다시 `body`로 빠지고, 그 실패는 `?.`에 삼켜져 **조용하다.**
   * 실제 착지는 `members-focus.test.tsx`가 렌더로 재고(2026-09-19부터 그 래퍼가 제목을 안 그린다),
   * 여기서는 프리미티브가 그 짝을 놓지 않는지만 본다.
   */
  it("카드 제목은 id가 있으면 포커스도 받는다", () => {
    const card = read("components/ui/row-card.tsx");
    expect(card).toMatch(/id=\{titleId\}/);
    expect(card).toMatch(/tabIndex=\{titleId === undefined \? undefined : -1\}/);
  });

  it("최상단에서 requireProjectAccess를 던진다 — 조건부 렌더는 차단이 아니다", () => {
    const src = read(PAGE);
    expect(src).toContain("requireProjectAccess");
    // EDITOR도 목록을 보므로 게이트는 `translation:write`다. `member:manage`면 EDITOR가 못 들어온다.
    expect(src).toContain('"translation:write"');
    // ⚠️ **위치가 요지다** (launch-readiness L4.3). 옛 단언 `not.toContain('requireProjectAccess(...arguments)')`는
    // 아무도 안 쓰는 리터럴이라 절대 실패하지 않았다 — 호출이 첫 JSX `return`보다 **뒤**로 가도 green이었다.
    const call = src.indexOf("await requireProjectAccess(");
    const firstJsxReturn = src.search(/\breturn\s*(\(|<)/);
    expect(call).toBeGreaterThan(-1);
    expect(firstJsxReturn).toBeGreaterThan(-1);
    expect(call).toBeLessThan(firstJsxReturn);
  });

  /**
   * **읽는 쪽과 보내는 쪽이 짝이다** (2026-09-08 code-review 🟡1).
   *
   * 옛 설계는 `?e=` global Alert 슬롯을 요구했지만 **그 쿼리를 이 경로로 보내는 자리를 설계가
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

  /**
   * ⚠️ **마스킹이 로더로 갔다** (2026-09-09, sec-audit 발견 4). 전에는 이 자리가 "화면 셋 중
   * 어딘가에 `maskEmail`이 있다"를 셌는데, **그것이 바로 결함이었다** — 클라이언트에서 가리면
   * 원문은 이미 RSC 페이로드에 실려 있다. 지금 이 축의 검사는 아래 "원문이 안 간다" 블록이다.
   *
   * ⚠️ **두 표 다 목록 전체를 본 판정에서 온다** (malmoi#18): 행마다 따로 마스킹하면 서로 다른
   * 주소가 같은 행이 되고, [Revoke]는 되돌릴 수 없어 엉뚱한 링크를 무효화한다.
   */
  it("두 표가 서버가 만든 라벨을 그대로 그린다", () => {
    expect(read(LIST)).toContain("emailLabel");
    expect(read(PENDING)).toContain("emailLabel");
    expect(read(PAGE)).not.toContain("maskedInviteLabels");
  });
});

/**
 * **그릇이 표에서 카드로 바뀌었다** (members-rework · DESIGN §6.65).
 *
 * ⚠️ **갱신이 아니라 신설이다** — 이 파일에 `Table` 관련 단언은 **0건**이었다. 표를 지우는 변경이
 * 아무 검사도 건드리지 않고 지나갔다는 뜻이고, 되돌아오는 것도 똑같이 조용할 것이다.
 */
describe("멤버 화면 — 카드", () => {
  it.each([LIST])("%s가 `Table`을 쓰지 않는다 — 열 머리가 사라져 표의 가치가 사라졌다", (file) => {
    const src = read(file);
    expect(src).not.toContain('from "@/components/ui/table"');
    expect(src).not.toMatch(/<(Table|Th|Td)\b/);
  });

  it.each([LIST])("%s가 공유 카드 프리미티브를 쓴다 — `/projects`와 같은 그릇이다", (file) => {
    const src = read(file);
    expect(src).toContain('from "@/components/ui/row-card"');
    expect(src).toMatch(/<RowCard\b/);
    expect(src).toMatch(/<RowCardList\b/);
    expect(src).toMatch(/<RowCardItem\b/);
  });

  /**
   * ⚠️ **`<ul>`이 카드 제목에 묶인다** — 카드가 둘이라 "list, N items"만으로는 어느 목록인지 안 갈린다.
   */
  it.each([LIST])("%s가 목록을 카드 제목에 묶는다", (file) => {
    expect(read(file)).toMatch(/labelledBy=\{headingId\}/);
  });

  /**
   * ⚠️ **화면이 상한을 따로 들지 않는다.** 들면 `MEMBER_LIMIT`과 서버 거부가 갈리는 날 둘이 다른
   * 수를 말한다 — 좌석 수는 서버가 판정해 값으로 내려보낸다 (`planSeatNotice`).
   */
  it("멤버 화면 파일이 `MEMBER_LIMIT`을 import하지 않는다", () => {
    for (const file of [PAGE, LIST, PENDING]) {
      expect(read(file), file).not.toContain("MEMBER_LIMIT");
    }
  });
});

describe("멤버 화면 — 컨트롤", () => {
  it("역할 변경은 native Select다 — DropdownMenu가 아니다 (DESIGN §6.65)", () => {
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

/**
 * **마스킹은 서버가 한다 — 원문은 와이어에 안 오른다** (sec-audit 발견 4).
 *
 * 두 로더가 `email`을 원문으로 select하고 `"use client"` 컴포넌트 props로 넘어가면, 마스킹이
 * JSX 안에서 일어나도 **원문은 RSC 페이로드에 그대로 실린다.** 관측자는 그 프로젝트의 EDITOR
 * 이상이고 view-source로 읽는다 — **대기 초대 쪽이 더 민감하다**(아직 멤버가 아닌 외부인의 주소다).
 * `docs/DESIGN.md` §6.65가 "두 표 모두 마스킹"을 단언하는데 그 통제가 화장품이었다.
 *
 * ⚠️ **렌더가 아니라 스캔인 이유**: 페이로드는 눈으로 안 보인다. 화면은 마스킹된 값을 보여주고
 * 있었고 감사도 정적으로만 확인했다 — `focus-ring`·`multiline-detail`과 같은 계보다.
 *
 * ⚠️ **`app/invite/[token]/page.tsx`가 이미 서버에서 마스킹한다** — 두 화면 중 하나가 낡은 것이
 * 아니라 규칙이 문서에만 있고 배선이 안 따라간 것이다 (POSTMORTEM 2026-09-05과 같은 축).
 */
describe("멤버 화면 — 이메일 원문이 클라이언트로 안 간다 (sec-audit 4)", () => {
  /**
   * ⚠️ **파일 둘 하드코딩이었다** (2026-09-19에 넓혔다). 그 배열은 이 디렉터리에 파일이 둘일 때
   * 쓰였고, 넷이 되자 **신설 파일이 자동으로 방어선 밖**이었다 — 목록을 손으로 적는 검사가 늘
   * 겪는 일이다. 이제 `components/members/**`의 `"use client"` 파일을 전수로 센다.
   */
  const clients = (function collectClients(): string[] {
    const dir = join(ROOT, "components/members");
    return readdirSync(dir)
      .filter((name) => name.endsWith(".tsx"))
      .map((name) => `components/members/${name}`)
      .filter((rel) => /^\s*"use client"/.test(readFileSync(join(ROOT, rel), "utf8")));
  })();

  it("스캔이 실제로 파일을 걸었다 — 빈 배열은 방어선이 아니다", () => {
    expect(clients.length).toBeGreaterThan(1);
  });

  it("클라이언트 컴포넌트가 `maskEmail`을 import하지 않는다 — 마스킹은 서버의 일이다", () => {
    for (const path of clients) {
      expect(read(path), path).not.toMatch(/maskEmail/);
    }
  });

  it("반환 매핑이 `email`을 안 싣는다 — 읽는 것과 돌려주는 것은 다르다", () => {
    // 가리려면 원문을 읽어야 하므로 `select`에는 남는다. 나가면 안 되는 것은 **반환값**이다.
    const query = read("lib/auth/query.ts");
    expect(query).not.toMatch(/^\s*email:\s*r\./m);
  });

  it("두 반환 타입이 `email`을 안 든다 — 타입이 계약이라 호출부가 못 되살린다", () => {
    const query = read("lib/auth/query.ts");
    for (const name of ["MemberView", "PendingInvitation"]) {
      const at = query.indexOf(`export type ${name} = {`);
      expect(at, name).toBeGreaterThan(-1);
      const body = query.slice(at, query.indexOf("};", at));
      expect(body, name).not.toMatch(/^\s*email\??:/m);
      expect(body, name).toMatch(/emailLabel/);
    }
  });

  it("라벨은 서버가 목록 전체를 보고 만든다 — 행마다 따로 만들면 충돌이 안 갈린다", () => {
    expect(read("lib/auth/query.ts")).toMatch(/maskedEmailLabels/);
  });
});
