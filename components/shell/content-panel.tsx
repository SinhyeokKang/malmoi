import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 콘텐츠가 앉는 흰 패널 — 시안의 `tab body` (8-2).
 *
 * ⚠️ **셸(`app/(edit)/layout.tsx`)이 `{children}`을 이걸로 감싸지 않는다.** 감싸면 오른쪽 패널이 그
 * 안에 갇혀 "패널 둘이 gap 8로 나란히"가 성립하지 않는다 — 대신 각 갈래의 레이아웃이 든다.
 * 라우트마다 **정확히 하나**인지는 `app/(edit)/__tests__/shell-layout.test.ts`가 체인을 훑어 센다.
 *
 * ⚠️ **네 클래스가 함께 있어야 패널이 뜬다** — 흰 배경 · radius · 아주 연한 border · `shadow-low`.
 * 8-1b가 그중 몇을 한꺼번에 잃고도 화면이 "그럭저럭" 보여서 못 알아챘다 (규약 3.5).
 *
 * ⚠️ **스크롤이 패널이 아니라 `PanelBody`에 있다** (2026-09-11 사용자). 패널이 통째로 스크롤하면
 * 제목·툴바가 콘텐츠와 함께 올라가는데, 그 둘은 **지금 보고 있는 것이 무엇인지**를 말하므로
 * 화면에 붙어 있어야 한다. 패널은 `overflow-hidden`으로 **경계만** 만든다 — 문서가 스크롤되면
 * 셸이 딸려 올라가는 것(malmoi#13)은 그대로 막힌다.
 *
 * ⚠️ **`head` prop을 받지 않는다.** 라우트 넷 중 셋(`[slug]`·`new`·`account`)은 이 패널을
 * **레이아웃**이 드는데 레이아웃은 페이지 props를 못 받아 머리를 모른다. 그래서 슬롯이 아니라
 * **형제 둘**(`PanelHeader`·`PanelBody`)이고, 페이지가 그 둘을 든다.
 *
 * ⚠️ **이것이 본문 랜드마크다 — 화면은 자기 `<main>`을 들지 않는다** (2026-09-11). 전엔 화면마다
 * 하나씩이라 라우트당 하나인지가 **관행**이었고, 실제로 `/projects`는 8-2에서 그것을 잃었다가
 * 2026-09-11에 되찾았다. 여기로 올리면 구조가 그것을 보장한다.
 *
 * ⚠️ **`<header>`가 아니라 `<main>`이다.** 셸(`components/shell/header.tsx`)이 이미 `<header>`를
 * 쓰는데 둘 다 sectioning content 밖이라, 패널 머리를 `<header>`로 만들면 **banner 랜드마크가
 * 둘**이 된다. 그래서 `PanelHeader`는 평범한 `div`다.
 */
export function ContentPanel({ children }: { children: ReactNode }) {
  return (
    <main className="border-border-subtle bg-background shadow-low flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border">
      {children}
    </main>
  );
}

/**
 * **콘텐츠의 최대 폭** (2026-09-11 사용자). 패널은 남은 폭을 다 쓰지만 **그 안의 내용은 1280에서
 * 멈춘다** — `max-w-7xl`이 Tailwind 스케일의 그 값이라 임의 치수를 늘리지 않는다(규약 6 — ⚠️ **2026-09-11에
 * 링이 `ring-2`가 되며 리포의 임의 치수가 0이 됐다**, 그때까지는 `ring-[3px]` 하나였다).
 *
 * ⚠️ **등급을 셋으로 늘린 것이 아니다** (DESIGN §5.1). 폼·설정이 쓰는 `max-w-4xl`(896)은 그대로이고,
 * 바뀐 것은 **fluid의 정의**다 — "제한 없음"에서 "1280 상한"으로. fluid 화면은 둘뿐이다
 * (번역 · 프로젝트 목록). 화면이 고르는 것은 여전히 둘이다.
 *
 * ⚠️ **최소 폭과 같은 숫자다** — 셸 루트가 `min-w-[1280px]`이므로 "콘텐츠는 1280에서 1280까지"가
 * 한 문장이 된다. 1440을 고르지 않은 이유는 그것이 **뷰포트 2032px부터** 걸려서다: 1920 디스플레이
 * (패널 1328)에서는 아무 일도 안 한다.
 */
const CONTENT_MAX = "mx-auto w-full max-w-7xl";

/**
 * 패널 안에서 **스크롤하지 않는** 머리 — 제목 · 툴바 · 전역 `Alert`.
 *
 * ⚠️ **`shrink-0`이 없으면 본문이 길 때 머리가 눌린다.** flex 자식의 축소 하한은 콘텐츠 높이가
 * 아니라 0이다.
 *
 * ⚠️ **여백은 화면이 정한다** — 현재 좌우 여백은 `px-6`이지만 limited 화면은 안쪽 래퍼가 든다.
 * 이 프리미티브에도 padding을 넣으면 그 화면들만 두 번 적용된다.
 *
 * ⚠️ **`className`이 안쪽 래퍼로 간다** — 여백이 상한 **안**에 있어야 머리와 본문의 왼쪽이 맞는다.
 */
export function PanelHeader({ children, className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div className="shrink-0" {...props}>
      <div className={cn(CONTENT_MAX, className)}>{children}</div>
    </div>
  );
}

/**
 * 패널 안에서 **스크롤하는** 본문.
 *
 * ⚠️ **`min-h-0`이 `flex-1`의 짝이다.** 없으면 이 열이 콘텐츠 높이 아래로 못 줄어들어 패널이
 * 통째로 늘어나고, 스크롤이 여기가 아니라 바깥에 생긴다 — 그러면 머리가 다시 같이 올라간다.
 *
 * ⚠️ **폭 상한을 스크롤 컨테이너에 직접 주지 않는다** — 그러면 **스크롤바가 콘텐츠 옆에** 생긴다.
 * 화면 다섯이 `max-w-4xl`을 안쪽 래퍼에 두는 이유가 그것이고, 여기가 그 래퍼를 프리미티브로
 * 올린 자리다(그 다섯은 안쪽에서 더 좁히므로 그대로 동작한다).
 *
 * ⚠️ **래퍼가 `min-h-full`을 든다** — `/projects`가 `flex flex-col`을 넘겨 빈 상태를 `flex-1`로
 * 세로 중앙에 세운다. 래퍼 높이가 auto면 그 `flex-1`이 먹을 높이가 없어 빈 상태가 위에 붙는다.
 */
export function PanelBody({ children, className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" {...props}>
      <div className={cn(CONTENT_MAX, "min-h-full", className)}>{children}</div>
    </div>
  );
}
