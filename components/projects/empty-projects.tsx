import { Box, RotateCcw } from "lucide-react";
import Link from "next/link";

import { NewProjectButton } from "@/components/projects/new-project-button";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, NoMatch } from "@/components/ui/empty-state";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * 본문이 빌 때의 카드 — 아트보드 `1b`(프로젝트 0건)와 `1d`(검색 0건).
 *
 * ⚠️ **둘이 같은 부품이고 다른 것은 아이콘과 출구의 무게뿐이다.** 프로젝트가 없을 때의 출구는
 * **만들기**(채운 버튼)이고, 검색이 빈 것의 출구는 **되돌리기**(`default` 버튼 + `RotateCcw`)다 — 되돌리는 일에 채운 버튼을
 * 쓰면 그것이 이 화면의 목적처럼 보인다.
 *
 * Card placement preserves the standalone empty card; NoMatch owns search-zero icon semantics.
 */

/**
 * `1b` — 프로젝트 0건. **첫 로그인의 착지점**이다.
 *
 * ⚠️ **버튼이 셸 안 규격이다**(36 · radius 10). 전엔 `size="lg"`(40 · radius 12 — 로그인·초대 전용)
 * 였는데, 카드 안에 앉으므로 머리의 [New project]와 같은 규격이어야 한다: 같은 행동이 한 앱에서
 * 두 크기로 보일 이유가 없다.
 */
export function EmptyProjects() {
  return (
    <EmptyState placement="card"
      icon={Box}
      title={m.projects.empty.title}
      description={m.projects.empty.description}
      action={<NewProjectButton />}
    />
  );
}

/**
 * `1d` — 검색 0건.
 *
 * ⚠️ **"프로젝트가 없다"와 다른 상태다** — 질의를 되돌리면 있다. 같은 빈 화면을 내면 사용자가
 * 프로젝트를 잃었다고 읽는다.
 *
 * ⚠️ **액션이 하나다.** 전엔 둘이었고([Clear search] + [New project]) DESIGN §6.4의 "버튼 하나"에
 * 등재된 예외였는데, 캔버스가 그 예외를 되돌렸다 — 머리의 [New project]가 이 화면에 이미 서 있으므로
 * 카드가 그것을 두 번 말할 이유가 없다.
 */
export function NoProjectsMatch({ query, onReset }: {
  query: string;
  /** 같은 탭 클릭을 가로채 로컬로 되돌린다 (audit-ux #17) — `href`는 새 탭용으로 남는다. */
  onReset: (event: { preventDefault(): void }) => void;
}) {
  return (
    <NoMatch placement="card"
      title={m.projects.narrowed.title(query)}
      description={m.projects.narrowed.description}
      /*
        좁힌 0건의 출구는 Logs 필터 0건과 같은 형이다(4-Y15 — `default` 버튼 + `RotateCcw`, 옛 파란 텍스트 링크). 앱 안 이동이라 파랑이 아니다.
        ⚠️ **`ButtonLink`가 아니라 `Link` + `buttonClass`다** — 같은 탭 클릭만 로컬로 되돌리는 `onNavigate`를 `ButtonLink`가 넘기지 않는다
        (새 탭·수정 키 클릭은 `href`로 남는다). ⚠️ **링을 직접 든다** — `focus-ring.test.ts`는 `button|input|select|textarea` 넷만 훑는다.
      */
      action={
        <Link
          href={routes.projects()}
          onNavigate={onReset}
          className={`${buttonClass()} focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none`}
        >
          <RotateCcw aria-hidden />
          {m.projects.narrowed.reset}
        </Link>
      }
    />
  );
}
