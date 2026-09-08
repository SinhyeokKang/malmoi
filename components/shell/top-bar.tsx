import { UserMenu } from "./user-menu";

/**
 * 셸의 상단 바 (DESIGN §5.1 — `h-12` + 1px border).
 *
 * ⚠️ **breadcrumb이 여기 없다.** 페이지 콘텐츠의 첫 줄이 그것을 든다 — 레이아웃은 페이지 props를
 * 받지 못하므로 여기 두려면 parallel route 슬롯이나 클라이언트 컨텍스트(첫 페인트 플래시)가 필요하다
 * (design §2). 그래서 이 바가 드는 것은 **사용자 메뉴 하나**이고, 좌측은 사이드바의 햄버거 자리다.
 *
 * ⚠️ GitLab top bar의 검색·`+`·카운터 셋은 넣지 않는다 — 대응물이 없고 SAAS §4.2가 기능 밀도를 막는다.
 */
export function TopBar({
  name,
  email,
  signOut,
}: {
  name: string;
  email: string | null;
  signOut: () => void;
}) {
  return (
    <header className="bg-background border-border flex h-12 shrink-0 items-center justify-end border-b px-4">
      <UserMenu name={name} email={email} signOut={signOut} />
    </header>
  );
}
