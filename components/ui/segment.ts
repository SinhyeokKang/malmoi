/**
 * 세그먼트 형의 **문자열 상수** — `SegmentedControl`(radiogroup)과 `Tabs`(tablist)가 같은 모양을 공유한다.
 *
 * ⚠️ **상수만 둔다** — `SegmentBody`는 JSX라 `.ts`에 둘 수 없어 `segmented-control.tsx`가 export한다.
 * `.tsx`를 새로 만들면 프리미티브 수가 하나 늘고 focus-ring 스캐너 `FILES`에 걸린다.
 */

/**
 * 트랙이 캔버스색이라 흰 패널 위에서 홈처럼 파인다 — 선택된 칸만 흰색으로 떠오른다.
 *
 * ⚠️ **칸의 radius가 `md` 버튼과 같다** (2026-09-11 사용자). 선택된 칸은 흰 배경 + `shadow-low`로
 * 떠올라 **버튼처럼 보이고**, 툴바에서 실제 `Button`과 나란히 선다 — 모서리가 다르면 둘이 다른
 * 계열로 읽힌다. **`size`를 따라 바뀌지 않는다**: 이 컨트롤엔 크기 축이 없다.
 *
 * ⚠️ **트랙은 한 단계 크다** — `p-1`(4px)만큼 바깥이라 동심이 되는 값은 14px인데 스케일에 없고,
 * `rounded-lg`(12)가 가장 가깝다. 트랙을 칸과 같게 두면 안쪽 모서리가 바깥으로 밀려 보인다.
 */
export const TRACK = "bg-canvas inline-flex items-center gap-1 rounded-lg p-1";
/** ⚠️ **`gap-1.5`가 base다** — 아이콘·배지가 선택이라 호출부가 있을 때만 붙이면 간격 규칙이 흩어진다. */
export const SEGMENT = "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1 text-center text-sm";
export const SELECTED = "bg-background shadow-low font-medium";
export const UNSELECTED = "text-muted-foreground hover:text-foreground";
