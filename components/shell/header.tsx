import Link from "next/link";

import { SearchTrigger } from "@/components/search/search-trigger";
import type { NavProject } from "@/lib/shell/nav";
import { PUBLIC_HEADER_LINK } from "@/components/public-shell/header";
import { MalmoiMark } from "@/components/ui/malmoi-mark";
import type { Messages } from "@/lib/i18n";
import { routes } from "@/lib/routes";

import { AttentionInbox } from "./attention-inbox";
import { HeaderBar } from "./header-bar";
import { NewProjectIcon } from "./new-project-icon";
import { UserMenu } from "./user-menu";

/**
 * 셸의 전폭 헤더 — **로고 좌측 · 가운데 검색 · 우측 `New project | Inbox 사용자 메뉴`** (8-2, 시안 `212:937`의 `header` · attention-inbox H1).
 *
 * ⚠️ **우측은 공개 셸 헤더(`components/public-shell/header.tsx`)와 같은 패턴이다** (2026-09-30 사용자) — 링크 모양·`gap-3`·연한 세로선이
 * 같고 GitHub 자리만 `New project`다. LNB·사용자 메뉴의 `New project`는 이때 빠졌다(`navWorkItems`).
 *
 * ⚠️ **PRODUCT의 "top bar가 사라진다"는 *지금의* top bar 얘기다.** 시안에는 전폭 48 헤더가 있고,
 * 이 파일이 옛 `top-bar.tsx`를 대체한다 — 상단이 두 벌이 되지 않게 그쪽은 지웠다.
 *
 * ⚠️ **패널이 아니다.** 헤더는 캔버스 위에 그냥 얹힌다(배경·border·그림자 0) — 시안에서 흰 패널은
 * 콘텐츠 패널 하나뿐(2026-09-16에 오른쪽 패널을 지웠다 — DESIGN §6.55)이고, 헤더에 배경을 주면 그 대비가 무너진다 (규약 3.5).
 *
 * ⚠️ **breadcrumb이 여기 없다.** 레이아웃은 페이지 props를 못 받으므로 페이지 콘텐츠의 첫 줄이
 * 든다. 8-3이 그것을 `[slug]` 레이아웃으로 옮길 자리다.
 */
export function Header({
  m,
  name,
  email,
  image,
  signOut,
  memberships,
}: {
  m: Messages;
  name: string;
  email: string | null;
  image: string | null;
  signOut: () => void;
  memberships: readonly NavProject[];
}) {
  return (
    <HeaderBar
      className="mb-1.5"
      center={<SearchTrigger account={{ name, email, image }} memberships={memberships} />}
      start={
        <Link
          href={routes.projects()}
          aria-label={m.common.nav.appHome}
          className="focus-visible:ring-ring flex size-8 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          {/* 로고는 토큰으로 칠하는 인라인 SVG다 — 다크에서 면·마크가 저절로 뒤집힌다(`MalmoiMark`). */}
          <MalmoiMark size={32} />
        </Link>
      }
      end={
        <div className="flex items-center gap-3">
          <Link href={routes.newProject()} className={PUBLIC_HEADER_LINK}>
            <NewProjectIcon />
            {m.common.nav.newProject}
          </Link>
          {/* 장식이다 — 공개 셸 헤더와 같은 선(`border-border-subtle`이 캔버스 위에서 보이는 가장 연한 선이다). */}
          <span aria-hidden className="bg-border-subtle h-5 w-px" />
          {/* Inbox는 세로선 오른쪽·아바타 왼쪽이다(attention-inbox) — 같은 32 아이콘 버튼끼리 사용자 축으로 묶인다. */}
          <AttentionInbox />
          <UserMenu name={name} email={email} image={image} signOut={signOut} memberships={memberships} />
        </div>
      }
    />
  );
}
