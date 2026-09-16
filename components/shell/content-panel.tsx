import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 콘텐츠가 앉는 흰 패널 — 시안의 `tab body` (8-2).
 *
 * ⚠️ **셸(`app/(edit)/layout.tsx`)이 `{children}`을 이걸로 감싸지 않는다.** 감싸면 흰 패널이 겹쳐
 * padding이 두 배가 된다 — 대신 각 갈래의 레이아웃이 든다. (2026-09-16까지 근거는 "감싸면 오른쪽
 * 패널이 그 안에 갇힌다"였는데 그 패널을 지웠다 — DESIGN §6.55. 규칙은 그대로이고 근거만 바뀐다.)
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
// Keep animated descendants inside their panel when route trees overlap.
export function ContentPanel({ children }: { children: ReactNode }) {
  return (
    <main className="isolate col-start-1 row-start-1 border-border-subtle bg-background shadow-low flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border">
      {children}
    </main>
  );
}

/**
 * **콘텐츠의 최대 폭 — 등급 둘** (2026-09-11 사용자 · 2026-09-15에 prop으로 올렸다).
 * 패널은 남은 폭을 다 쓰지만 **그 안의 내용은 1280 또는 896에서 멈춘다** — 둘 다 Tailwind 스케일의
 * 값이라 임의 치수를 늘리지 않는다(규약 6).
 *
 * ⚠️ **등급을 셋으로 늘린 것이 아니다** (DESIGN §5.1). 화면이 고르던 둘을 **프리미티브의 prop**으로
 * 올렸을 뿐이다 — 전에는 fluid가 여기 상수였고 limited 일곱은 **안쪽 래퍼**가 `max-w-4xl`을 다시
 * 씌웠다. 그 이중구조가 여백도 두 벌로 만들었고(`px-6 pt-6 pb-3`을 열한 곳이 각자 적었다),
 * **여백만 프리미티브로 올리면 limited 일곱이 `16 + 24 = 40`이 된다.** 두 값은 한 층에서 같이 정해진다.
 *
 * ⚠️ **fluid의 1280은 최소 폭과 같은 숫자다** — 셸 루트가 `min-w-[1280px]`이므로 "콘텐츠는 1280에서
 * 1280까지"가 한 문장이 된다. 1440을 고르지 않은 이유는 그것이 **뷰포트 2032px부터** 걸려서다:
 * 1920 디스플레이(패널 1328)에서는 아무 일도 안 한다.
 */
const CONTENT_MAX = {
  fluid: "mx-auto w-full max-w-7xl",
  limited: "mx-auto w-full max-w-4xl",
} as const;

/**
 * ⚠️ **기본이 `limited`다** — 소비자 열하나 중 일곱이고, 빠뜨렸을 때 좁아지는 쪽이 넘치는 쪽보다
 * 눈에 띈다. fluid 넷은 번역 표 · 프로젝트 목록(+ 그 스켈레톤) · 표면 추가다.
 */
type PanelWidth = keyof typeof CONTENT_MAX;

/**
 * 패널 안에서 **스크롤하지 않는** 머리 — 제목 · 툴바 · 전역 `Alert` · (선택) 설명 한 줄.
 *
 * ⚠️ **`shrink-0`이 없으면 본문이 길 때 머리가 눌린다.** flex 자식의 축소 하한은 콘텐츠 높이가
 * 아니라 0이다.
 *
 * ⚠️ **여백을 이제 이쪽이 든다** (projects-panel-rework · 캔버스 `1a`~`1d`의 `padding:16`).
 * 전엔 열한 곳이 각자 `px-6 pt-6 pb-3`을 적었고 그중 하나(`add-surface`)가 이미 `px-6 py-5`로
 * 어긋나 있었다. **폭 등급을 함께 든 것이 그것을 가능하게 한 조건이다** — `CONTENT_MAX` 주석 참조.
 *
 * ⚠️ **아래 선이 바깥에 있다.** 선은 패널 **전폭**이라 폭 상한 안쪽에 두면 1280을 넘는 화면에서
 * 잘린다 — 그 화면에서만 제목 줄이 다시 "떠 있는 요소"로 읽힌다.
 *
 * ⚠️ **선은 조건부가 아니다.** 스크롤할 때만 나타나는 선은 "무언가 숨어 있다"는 신호인데, 여기서는
 * 구조가 이미 그것을 말한다.
 *
 * ⚠️ **여백 16의 전제는 "제목 줄 하나"다** (POSTMORTEM 2026-09-14 — 프리미티브의 여백이 그 슬롯을
 * 안 쓰는 소비자에게만 깨졌다). 설명 한 줄이 붙는 화면 셋(`logs`·`locales`·`surfaces/new`)은 머리가
 * 세로로 늘어야 하므로 **그 조건을 주석이 아니라 슬롯으로 든다** — 크기(13)도 여기서 정해지고,
 * 호출부에 맡겼을 때 그것이 12와 14 두 벌로 갈려 있었다.
 *
 * ⚠️ **`className`이 안쪽 래퍼로 간다** — 여백이 상한 **안**에 있어야 머리와 본문의 왼쪽이 맞는다.
 */
export function PanelHeader({
  width = "limited",
  description,
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"div"> & { width?: PanelWidth; description?: ReactNode }) {
  return (
    <div className="border-border shrink-0 border-b" {...props}>
      <div className={cn(CONTENT_MAX[width], "flex flex-col gap-3 p-4", className)}>
        {children}
        {description !== undefined && <p className="text-muted-foreground text-xs">{description}</p>}
      </div>
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
 * 그래서 등급은 안쪽 래퍼가 들고 스크롤은 바깥이 든다. 눈으로는 "폭이 맞네"로 보이고, 콘텐츠가
 * 넘칠 때만 드러나는 부류다.
 *
 * ⚠️ **래퍼가 `min-h-full`을 든다** — 소비자가 `flex flex-col`을 넘겨 빈 상태를 `flex-1`로 세로
 * 중앙에 세운다. 래퍼 높이가 auto면 그 `flex-1`이 먹을 높이가 없어 빈 상태가 위에 붙는다.
 * ⚠️ **소비자는 넷이다** — `ProjectArchived` · `ProjectNotReady` · 번역 화면 · `add-surface`.
 * `/projects`는 2026-09-15에 빠졌다(빈 상태가 카드가 되어 본문 맨 위에 붙는다). 그 사실을 근거로
 * 이 클래스를 떼면 남은 넷이 깨진다. ⚠️ **세는 명령은 `<PanelBody`이지 `<PanelHeader`가 아니다** —
 * 이 주석 자체가 한 번 셋으로 틀렸다 (POSTMORTEM 2026-09-15).
 */
export function PanelBody({
  width = "limited",
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"div"> & { width?: PanelWidth }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" {...props}>
      <div className={cn(CONTENT_MAX[width], "min-h-full p-4", className)}>{children}</div>
    </div>
  );
}
