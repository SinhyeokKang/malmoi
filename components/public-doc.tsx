import type { ReactNode } from "react";
import Link from "next/link";

import { DocTable } from "@/components/public-doc-table";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * `/docs`의 **장문 읽기 그릇** (DESIGN §6.61, launch-readiness L2.0). `/privacy`는 2026-09-26부터 공개 셸 안의
 * `components/privacy/privacy-doc.tsx`가 그리고(§6.616), 여기와는 표(`DocTable`)와 블록 타입만 공유한다.
 *
 * ⚠️ **시안이 없고 DESIGN §6.61이 정본이다** — 이 파일의 옛 주석이 가리키던 "8-1b 시안"은 존재한
 * 적이 없다. 형을 바꾸려면 그 절을 먼저 고친다.
 *
 * ⚠️ **셸 밖이라 사이드바도 푸터도 없다** — 돌아가는 링크가 없으면 뒤로가기 말고 길이 없다.
 * 로그인 화면 푸터와 **셸 사이드바의 `CircleHelp`** 둘 다 여기로 보내므로, 어디서 왔든 돌아갈 수
 * 있어야 한다.
 *
 * ⚠️ **클래스를 사전에 두지 않는다** — `messages/en.tsx`는 잎이라 컴포넌트를 import할 수 없다
 * (`components/__tests__/client-graph.test.ts`). 사전은 문구와 구조(`{ id, heading, blocks }`)만
 * 내놓고 마크업·클래스는 전부 여기 있다.
 */

/**
 * 문단·목록·표 셋. 법적 문서의 열거를 문단으로 접지 않고, 수집 항목과 쿠키는 표가 아니면
 * 읽을 수 없다 (DESIGN §6.61).
 *
 * ⚠️ **`label`은 표의 접근 이름이고 선택이 아니다** — 한 문서에 표가 둘이라 없으면 스크린리더
 * 목록에 "table"만 둘 뜬다. 이 리포에 `TableCaption`이 없어 `aria-label`로 건다.
 */
export type DocBlock =
  | { p: ReactNode }
  | { ul: readonly ReactNode[] }
  | { table: { label: string; head: readonly ReactNode[]; rows: readonly (readonly ReactNode[])[] } };

export type DocSection = {
  /**
   * ⚠️ **사전이 정하는 값이고 제목에서 파생하지 않는다** — 설정 화면이 `/docs#workflow`로 절을
   * 직접 가리킨다(L2.3). 제목 문구를 고칠 때마다 남의 링크가 죽으면 안 된다.
   */
  id: string;
  heading: string;
  blocks: readonly DocBlock[];
};

export function PublicDoc({
  title,
  effectiveDate,
  intro,
  sections,
  signedIn,
}: {
  title: string;
  /**
   * ⚠️ **지금 소비자가 0이다** — 유일한 소비자였던 `/privacy`가 2026-09-26에 `PrivacyDoc`으로 옮겼고, 도움말에 시행일은
   * 의미가 없다(prop과 그 테스트를 걷을지는 privacy-shell 후속 판정). 사전이 든 `"2026-09-19"`를 그대로
   * 보이고 같은 문자열을 `dateTime`에 넣는다: 날짜만 든 `datetime`은 올바른 HTML이고, 여기에
   * `lib/utc-time.ts`를 먹이면 분까지 붙는다.
   */
  effectiveDate?: string;
  intro?: ReactNode;
  /** 사전이 `as const`라 읽기 전용으로 온다. */
  sections: readonly DocSection[];
  /**
   * ⚠️ **세션을 못 읽는 장애(`unavailable`)는 `false` 쪽이다** — 공개 문서가 세션 장애로 못 열리는
   * 것이 "로그인 화면으로 보낸다"보다 나쁘다.
   */
  signedIn: boolean;
}) {
  const back = signedIn
    ? { href: routes.projects(), label: m.publicDocs.back.app }
    : { href: routes.signIn(), label: m.publicDocs.back.signIn };

  return (
    // ⚠️ 세로 중앙 정렬을 쓰지 않는다 — 절이 여럿이면 첫 화면이 문서 중간부터 시작한다 (§6.61).
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-8 px-8 py-12">
      <div className="space-y-3">
        <h1 className="text-2xl font-medium">{title}</h1>
        {effectiveDate === undefined ? null : (
          // 라벨 없이 날짜만 두면 무슨 날짜인지 알 수 없다. 이 줄은 `<section>` 밖이라 본문 링크 규칙이 안 걸린다.
          <p className="text-muted-foreground text-sm">
            {m.publicDocs.effectiveDate} <time dateTime={effectiveDate}>{effectiveDate}</time>
          </p>
        )}
        {intro === undefined ? null : <p className="text-sm leading-6">{intro}</p>}
      </div>
      {sections.map((section) => (
        // `[&_a]:`가 사전이 맨몸으로 내놓는 `<a>`에 색을 건다 (§6.3 — 셸 밖 링크는 파랑, 밑줄 없음).
        // 이름 없는 `<section>`을 두지 않는다 (POSTMORTEM 2026-09-15) — 이름은 `<h2 id>`가 댄다.
        <section
          key={section.id}
          aria-labelledby={section.id}
          className="space-y-3 [&_a]:text-blue-600"
        >
          <h2 id={section.id} className="text-base font-medium">
            {section.heading}
          </h2>
          {section.blocks.map((block, index) =>
            "p" in block ? (
              <p key={index} className="text-sm leading-6">
                {block.p}
              </p>
            ) : "ul" in block ? (
              <ul key={index} className="list-disc space-y-1 pl-5 text-sm leading-6">
                {block.ul.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </ul>
            ) : (
              <DocTable key={index} table={block.table} className="min-w-0 overflow-auto" />
            ),
          )}
        </section>
      ))}
      <Link
        href={back.href}
        // `self-start` — flex-col 자식의 기본 stretch면 줄 전체가 눌리는 자리가 된다.
        className="focus-visible:ring-ring self-start text-sm text-blue-600 focus-visible:ring-2 focus-visible:outline-none"
      >
        {back.label}
      </Link>
    </main>
  );
}
