import { Box, Plus, SearchX, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ButtonLink } from "@/components/ui/button";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * 본문이 빌 때의 카드 — 아트보드 `1b`(프로젝트 0건)와 `1d`(검색 0건).
 *
 * ⚠️ **둘이 같은 부품이고 다른 것은 아이콘과 출구의 무게뿐이다.** 프로젝트가 없을 때의 출구는
 * **만들기**(채운 버튼)이고, 검색이 빈 것의 출구는 **되돌리기**(링크)다 — 되돌리는 일에 채운 버튼을
 * 쓰면 그것이 이 화면의 목적처럼 보인다.
 *
 * ⚠️ **장식이 2026-09-15에 사라졌다.** 전엔 그라데이션 면 + 점 필드 + KV 합성이었고, 그것이
 * "장식은 패널 안에 살지 않는다"(DESIGN 원칙 5)의 **유일한 예외**였다. 본문이 전부 카드가 되면서
 * 그 면은 갈 곳이 없어졌다 — 다른 블록이 전부 `border 1 · radius 12 · 흰 배경`인데 한 면만 장식이면
 * **빈 상태가 화면 중 가장 화려해진다.** 브랜드가 서는 자리는 로그인 화면이 이미 든다.
 *
 * ⚠️ **`EmptyState` 프리미티브를 쓰지 않는다.** 그쪽은 칩 48 + 아이콘 16 + `py-12`이고 여기는
 * 카드 규격(칩 36 · padding `48 24`)이다. 프리미티브를 이 화면에 맞추면 표 안의 빈 상태들이 함께
 * 움직인다 — 소비자가 아홉이다.
 */
function EmptyCard({ icon: Icon, title, description, action }: {
  icon: LucideIcon;
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <div className="border-border bg-background flex shrink-0 flex-col items-center gap-3.5 rounded-lg border px-6 py-12 text-center">
      {/*
        ⚠️ **칩이 36이고 글리프는 16이다.** 캔버스는 글리프를 18로 그리는데 DESIGN §6.8이 아이콘
        크기를 **셋(16·12·24)으로 고정**하므로 18은 넷째 값이 된다 — 36 칩 안의 2px이라 검색 폭
        (220 vs 256)과 같은 급의 등재된 차이로 둔다.
      */}
      <span className="bg-foreground/[0.04] flex size-9 items-center justify-center rounded-sm text-neutral-600">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="flex flex-col items-center gap-1.5">
        <span className="text-base font-medium">{title}</span>
        {/* ⚠️ **46ch다** — `max-w-prose`(65ch)는 한 문장을 세 줄로 흘려 칩·제목과 무게가 뒤집힌다. */}
        <span className="text-muted-foreground max-w-[46ch] text-sm leading-relaxed text-pretty">{description}</span>
      </span>
      {action}
    </div>
  );
}

/**
 * `1b` — 프로젝트 0건. **첫 로그인의 착지점**이다.
 *
 * ⚠️ **버튼이 셸 안 규격이다**(36 · radius 10). 전엔 `size="lg"`(40 · radius 12 — 로그인·초대 전용)
 * 였는데, 카드 안에 앉으므로 머리의 [New project]와 같은 규격이어야 한다: 같은 행동이 한 앱에서
 * 두 크기로 보일 이유가 없다.
 */
export function EmptyProjects() {
  return (
    <EmptyCard
      icon={Box}
      title={m.projects.empty.title}
      description={m.projects.empty.description}
      action={
        <ButtonLink variant="primary" href={routes.newProject()}>
          <Plus aria-hidden />
          {m.common.nav.newProject}
        </ButtonLink>
      }
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
export function NoProjectsMatch({ query }: { query: string }) {
  return (
    <EmptyCard
      icon={SearchX}
      title={m.projects.narrowed.title(query)}
      description={m.projects.narrowed.description}
      action={
        <Link href={routes.projects()} className="text-sm text-blue-600">
          {m.projects.narrowed.reset}
        </Link>
      }
    />
  );
}
