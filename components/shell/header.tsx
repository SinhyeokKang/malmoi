import Image from "next/image";
import Link from "next/link";

import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import logo from "@/public/brand/malmoi-icon-black.svg";

import { UserMenu } from "./user-menu";

/**
 * 셸의 전폭 헤더 — **로고 좌측 · 사용자 메뉴 우측, 그 둘뿐이다** (8-2, 시안 `212:937`의 `header`).
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
  name,
  email,
  image,
  signOut,
}: {
  name: string;
  email: string | null;
  image: string | null;
  signOut: () => void;
}) {
  return (
    // 시안 좌표: 로고 x=4 · 아바타 오른쪽 여백 4 → 좌우 padding 4다.
    <header className="flex h-10 shrink-0 items-center justify-between px-1">
      <Link
        href={routes.projects()}
        aria-label={m.common.nav.appHome}
        className="focus-visible:ring-ring flex size-8 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:outline-none"
      >
        {/* 로고는 커밋된 원본이다(`public/brand/`) — 폰트와 달리 생성물이 아니다 (규약 2). */}
        <Image src={logo} alt="" width={32} height={32} priority />
      </Link>
      <UserMenu name={name} email={email} image={image} signOut={signOut} />
    </header>
  );
}
