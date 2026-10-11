/**
 * **Home 본문 격자** (responsive-app 시안 AT3) — 그릇(`PanelBody`의 `@container/home`, content box) 960 미만은 한 열, 이상은 `minmax(0,1fr) | 320`이다.
 * 1280 + LNB 240은 982라 지금처럼 두 열이고, 1024 + LNB 240(726)·40 레일(926)은 한 열이다. 실물(`page.tsx`)과 골격(`loading.tsx`)이 이 하나를 쓴다 —
 * 골격만 두 열이면 도착할 때 메타가 오른쪽에서 맨 아래로 튄다(A-09).
 *
 * ⚠️ **오른쪽 열이 320 고정이고 왼쪽이 `minmax(0,1fr)`이다** (캔버스). `flex-1`로 두면 카드 안의 긴 문장이 왼쪽 열을 밀어 오른쪽이 좁아진다 —
 * `min-width:auto`가 기본이라서다. ⚠️ **간격이 20이다** — 블록 사이도 같은 20이라 세로·가로가 한 격자로 읽힌다.
 * ⚠️ **질의만 든다** — 선언은 바로 위 `PanelBody`다(선언과 질의가 같은 요소면 영영 참이 안 된다, POSTMORTEM 2026-09-15).
 */
export const HOME_GRID = "grid grid-cols-1 @[960px]/home:grid-cols-[minmax(0,1fr)_320px] items-start gap-5";
