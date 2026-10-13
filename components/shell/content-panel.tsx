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
// 라우트 트리가 겹칠 때 애니메이션 중인 자손을 자기 패널 안에 가둔다.
// `relative` — `overflow-hidden`은 이 요소를 포함 블록으로 삼는 자손만 자른다. 없으면 스크롤러 아래 `position:absolute`(sr-only 등)가 문서 높이를 늘린다(#260, 공개 셸과 같은 형).
export function ContentPanel({ children }: { children: ReactNode }) {
  return (
    <main className="isolate relative col-start-1 row-start-1 border-border-subtle bg-background shadow-low flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border">
      {children}
    </main>
  );
}

/**
 * **콘텐츠의 최대 폭 — 1280 하나** (2026-09-30 사용자 — *"좁은 너비를 쓰는 곳은 이제 없음"*). 패널은 남은 폭을
 * 다 쓰지만 그 안의 내용은 1280에서 멈춘다. 설정·계정이 쓰던 896(`limited`)이 사라지며 등급 prop도 함께
 * 없앴다 — 소비자가 하나뿐인 값을 고르게 두면 좁은 등급이 되살아날 자리만 남는다.
 *
 * ⚠️ **상한만 있고 하한은 없다** — 옛 셸 하한 1280(`min-w-shell-min`)은 responsive-app(A6)에서 걷었다. 좁은 폭에서는 패널이 줄고
 * 내용은 각 화면의 컨테이너 질의가 적층한다. 1440을 고르지 않은 이유는 그것이 **뷰포트 2032px부터** 걸려서다:
 * 1920 디스플레이(패널 1328)에서는 아무 일도 안 한다.
 */
const CONTENT_MAX = "mx-auto w-full max-w-7xl";

/**
 * 패널 안에서 **스크롤하지 않는** 머리 — 제목 · 툴바 · (선택) 설명 한 줄.
 *
 * ⚠️ **페이지 수준 `Alert`는 여기 서지 않는다 — 본문의 첫 블록이다** (2026-10-01 사용자). 머리는 제목·툴바 **한 띠**로
 * 고정되고, Alert는 자기가 설명하는 콘텐츠와 함께 스크롤한다. 그래서 `notice` 슬롯(4-Y7)을 걷었다 — 소비자가 0이 됐다.
 *
 * ⚠️ **`shrink-0`이 없으면 본문이 길 때 머리가 눌린다.** flex 자식의 축소 하한은 콘텐츠 높이가
 * 아니라 0이다.
 *
 * ⚠️ **여백을 이제 이쪽이 든다** (projects-panel-rework · 캔버스 `1a`~`1d`의 `padding:16`).
 * 전엔 열한 곳이 각자 `px-6 pt-6 pb-3`을 적었고 그중 하나(`add-surface`)가 이미 `px-6 py-5`로
 * 어긋나 있었다. 폭 상한도 이쪽이 든다 — `CONTENT_MAX` 주석 참조.
 *
 * ⚠️ **아래 선이 바깥에 있다.** 선은 패널 **전폭**이라 폭 상한 안쪽에 두면 1280을 넘는 화면에서
 * 잘린다 — 그 화면에서만 제목 줄이 다시 "떠 있는 요소"로 읽힌다.
 *
 * ⚠️ **선은 조건부가 아니다.** 스크롤할 때만 나타나는 선은 "무언가 숨어 있다"는 신호인데, 여기서는
 * 구조가 이미 그것을 말한다.
 *
 * ⚠️ **머리 여백(상하 12 · 좌우 16 — 2026-09-28 사용자, 옛 전방향 16)의 전제는 "제목 줄 하나"다** (POSTMORTEM 2026-09-14 — 프리미티브의 여백이 그 슬롯을
 * 안 쓰는 소비자에게만 깨졌다). 설명 한 줄이 붙는 화면 셋(`logs`·`locales`·`surfaces/new`)은 머리가
 * 세로로 늘어야 하므로 **그 조건을 주석이 아니라 슬롯으로 든다** — 크기(13)도 여기서 정해지고,
 * 호출부에 맡겼을 때 그것이 12와 14 두 벌로 갈려 있었다.
 *
 * ⚠️ **`className`이 안쪽 래퍼로 간다** — 여백이 상한 **안**에 있어야 머리와 본문의 왼쪽이 맞는다.
 *
 * ⚠️ **제목 행의 최소 높이 36(`min-h-9`)을 여기가 든다** (2026-10-01 ux-drift-unify 4-Y8). 버튼 없는 화면에서 줄 높이가 28로
 * 떨어지면 머리가 라우트마다 4px 튄다 — 전엔 소비자 넷이 손으로 적고 나머지는 툴바 버튼의 36에 기댔다. **첫 자식이 제목 행이다**
 * (소비자 전부가 그렇게 쓴다). 제목 행을 prop으로 올리지 않은 이유: 소비자마다 행의
 * 내용(툴바·필터·액션 묶음)이 달라 슬롯 하나로 못 접는다.
 *
 * ⚠️ **바깥이 `@container/panel-head`를 선언한다** — 버튼을 든 제목 행(`PANEL_HEAD_ROW`)이 이 폭을 묻는다. 선언과 질의가 같은 요소면
 * 질의가 영영 참이 되지 않는다(POSTMORTEM 2026-09-15). 선을 든 전폭 요소라 폭 상한(`CONTENT_MAX`)과 무관하게 패널 폭을 잰다.
 */
export function PanelHeader({
  description,
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"div"> & { description?: ReactNode }) {
  return (
    <div className="@container/panel-head border-border shrink-0 border-b" {...props}>
      <div className={cn(CONTENT_MAX, "flex flex-col gap-3 px-4 py-3 [&>:first-child]:min-h-9", className)}>
        {children}
        {description !== undefined && <p className="text-muted-foreground text-xs">{description}</p>}
      </div>
    </div>
  );
}

/**
 * **버튼을 든 제목 행** — 머리 컨테이너 640(`@min-form`과 같은 경계) 미만이면 제목 첫 줄 · 버튼 묶음 둘째 줄 오른쪽, 이상이면 한 줄
 * (responsive-app · 2026-10-11 사용자, 시안 피드백 F1·R1). 첫 자식이 제목, 그 뒤 형제가 버튼 묶음이다.
 * ⚠️ **`:last-child`로 묻지 않는다** — 버튼이 없는 갈래(Projects 0건)에서는 제목이 마지막 자식이라 오른쪽으로 밀린다.
 *
 * ⚠️ **"넘칠 때만 감김"(`flex-wrap`)이 아니다** — 언어마다 줄 수가 갈리면 로딩 골격이 실물과 같은 줄 수를 못 낸다(spec A-09). 그래서
 * 골격도 이 조각을 쓴다. 버튼을 아이콘으로 줄이거나 숨기지 않는다 — 머리만 36 + 8 늘어난다.
 *
 * ⚠️ **질의만 든다 — 선언은 `PanelHeader` 바깥이다.** 머리를 손으로 드는 화면(번역 작업 화면 등)은 자기 바깥 요소에
 * `@container/panel-head`를 **리터럴로** 적고 이 조각을 안쪽 행에 쓴다(`container-query.test.ts`가 리터럴 className에서 선언을 센다).
 *
 * ⚠️ **제목 칸이 `min-w-0`이다** — 한 줄일 때 긴 제목이 버튼을 밀지 않고 말줄임된다. 줄 높이 36은 두 줄일 때 제목 줄의 몫이다.
 *
 * ⚠️ **한 줄일 때 위 맞춤이다**(`items-start` — #227). 제목 칸은 36(`min-h-9` · `items-center`)이고 버튼 줄도 36이라 가운데가 맞는다. 버튼 묶음이
 * 36보다 높아지는 폭과 골격(묶음이 두 줄로 감길 때)에서 `items-center`면 제목이 묶음 가운데로 내려간다 — 위 맞춤이면 제목이 첫 버튼 줄에 선다.
 * (#227 당시 묶음을 높이던 사유 줄은 disabled-reasons-revert가 걷었다 — 맞춤은 그대로 둔다.)
 * ⚠️ **버튼 묶음은 그릇 폭을 넘지 않는다**(`max-w-full` — #226). 두 줄일 때 묶음은 `self-end`라 자기 min-content 폭으로 서는데, 안에 고정 칸
 * (Projects 검색 256)이 있으면 그 폭이 그릇보다 넓어져 왼쪽 패널 밖으로 나갔다. 상한을 두면 안의 줄어드는 칸(`min-w-0 shrink`)이 실제로 준다.
 */
export const PANEL_HEAD_ROW =
  "flex flex-col gap-2 [&>:first-child]:flex [&>:first-child]:min-h-9 [&>:first-child]:min-w-0 [&>:first-child]:items-center [&>*+*]:max-w-full [&>*+*]:shrink-0 [&>*+*]:self-end @min-form/panel-head:flex-row @min-form/panel-head:items-start @min-form/panel-head:justify-between @min-form/panel-head:[&>*+*]:self-auto";

/**
 * 패널 안에서 **스크롤하는** 본문.
 *
 * ⚠️ **`min-h-0`이 `flex-1`의 짝이다.** 없으면 이 열이 콘텐츠 높이 아래로 못 줄어들어 패널이
 * 통째로 늘어나고, 스크롤이 여기가 아니라 바깥에 생긴다 — 그러면 머리가 다시 같이 올라간다.
 *
 * ⚠️ **폭 상한을 스크롤 컨테이너에 직접 주지 않는다** — 그러면 **스크롤바가 콘텐츠 옆에** 생긴다.
 * 그래서 폭 상한은 안쪽 래퍼가 들고 스크롤은 바깥이 든다. 눈으로는 "폭이 맞네"로 보이고, 콘텐츠가
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
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" {...props}>
      <div className={cn(CONTENT_MAX, "min-h-full p-4", className)}>{children}</div>
    </div>
  );
}
