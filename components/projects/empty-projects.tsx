import { Plus } from "lucide-react";

import { KeyVisual } from "@/components/signin/auth-layout";
import { DotField } from "@/components/signin/dot-field";
import { ButtonLink } from "@/components/ui/button";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * 프로젝트 0건의 착지점 (캔버스 `1a`).
 *
 * ⚠️ **`EmptyState`가 아니다.** 이 화면은 첫 로그인의 착지점이고 사용자가 할 수 있는 일이 하나뿐이라,
 * 패널이 비면 **그 자리를 KV가 든다**. 검색 0건(`3b`)만 `EmptyState` 규격을 그대로 쓴다 — 그쪽은
 * "되돌리라"이고 이쪽은 "시작하라"다.
 *
 * ⚠️ **장식이 패널 안으로 들어오는 유일한 경우다** (DESIGN 원칙 5의 예외). 여백 12를 두고 앉아
 * 패널의 radius 16 안에 12가 겹치고, **행이 한 줄이라도 생기면 이 면은 통째로 사라진다.**
 *
 * ⚠️ **KV를 새로 그리지 않는다** — 로그인 우측의 넷(리포 카드 + 로케일 카드 셋)이 이 문장을 이미
 * 그리고 있다: "리포를 연결하면 로케일 파일을 찾아준다". 바뀌는 것은 상한 하나(768 → 620)다.
 *
 * ⚠️ **버튼이 셸 밖 규격이다**(`lg` — 40 · radius 12). 원래 로그인·초대 전용인데, 이 화면에서는
 * 그것이 **사용자가 할 수 있는 유일한 일**이라 같은 급으로 선다. ghost를 쓰지 않는 근거도 같다 —
 * 유일한 출구가 배경 없는 글자면 누를 것으로 안 보인다.
 */
export function EmptyProjects() {
  return (
    <div className="from-auth-hero-from to-auth-hero-to relative flex flex-1 flex-col items-center justify-center gap-10 overflow-hidden rounded-lg bg-gradient-to-b p-12">
      <DotField className="absolute inset-0 size-full" />

      <KeyVisual className="max-w-[620px]" />

      {/* ⚠️ **`relative`가 있어야 도트 필드 위에 선다** — canvas가 `absolute inset-0`이다. */}
      <div className="relative flex flex-col items-center gap-4 text-center">
        <p className="text-lg font-medium">{m.projects.empty.title}</p>
        {/*
          ⚠️ **`#404040`이고 muted(#737373)가 아니다** (DESIGN §6.2에 등재). 그라데이션 면 위라
          muted는 배경에 묻힌다 — 이 문단은 읽히라고 있는 것이지 곁들이가 아니다.
          `text-pretty`는 46ch에서 마지막 줄에 낱말 하나만 남는 것을 막는다.
        */}
        <p className="max-w-[46ch] text-sm leading-5 text-pretty text-neutral-700">{m.projects.empty.description}</p>
        <ButtonLink variant="primary" size="lg" href={routes.newProject()}>
          <Plus aria-hidden />
          {m.common.nav.newProject}
        </ButtonLink>
      </div>
    </div>
  );
}
