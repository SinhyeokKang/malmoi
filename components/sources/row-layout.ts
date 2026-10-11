/**
 * Sources 목록 행의 **좁은 그릇 적층** (responsive-app AT2·AT3) — 실물(`sources-screen.tsx`)과 로딩 골격(`sources/loading.tsx`)이 **같은 상수**를 쓴다.
 * 옛 판(2026-10-06 사용자)은 "좁은 폭 분기를 두지 않는다"였고 좁아지면 경로만 `wrap-anywhere`로 줄바꿈했다 — 그 근거(행 버튼이 빠져 상태 배지만 남았다)는
 * 그대로이고, 375에서는 이름 칸이 약 130으로 줄어 상태 배지가 문장을 밀어내므로 **그릇 640 미만**에서만 상태를 문장 아래 줄로 내린다.
 *
 * ⚠️ **기준은 뷰포트가 아니라 `Card`(`@container`)의 폭이다** — 1024 + LNB 320의 카드(약 614)도 좁은 쪽이다. 선언은 카드, 질의는 행이다(POSTMORTEM 2026-09-15).
 * ⚠️ **DOM 순서는 `[칩][이름·경로][상태]` 그대로다** — CSS `order`가 없다(DESIGN §7). 상태는 `flex-wrap`의 둘째 줄이고 이름 칸 시작선(칩 28 + 간격 12 = `pl-10`)에 맞춘다.
 * chevron은 행 버튼 바깥 형제라 줄 구조와 무관하게 세로 가운데에 남는다.
 */
/** 칩 · 이름 칸을 든 안쪽 — 감긴다. */
export const SOURCE_CONTENT_STACK = "@max-form:flex-wrap @max-form:gap-y-2";
/** 상태 배지 — 둘째 줄 전체를 쓰고 이름 칸 시작선에 맞춘다. */
export const SOURCE_STATUS_STACK = "@max-form:basis-full @max-form:pl-10";
