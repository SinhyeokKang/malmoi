import { Badge } from "@/components/ui/badge";
import { m } from "@/lib/i18n";
import { flagFor } from "@/lib/keys/flag";

/**
 * 로케일 행의 왼쪽 칸 — **국기(있으면) + 코드** (8-4 design §4).
 *
 * ⚠️ **국기가 `<img>`가 아니라 `background-image`다.** `?ns=*`에서 이 배지가 2,709개 서는데
 * `<img>`면 요소·레이아웃 오브젝트가 그만큼 늘고, 그것이 이 화면이 실제로 더하는 렌더 비용의
 * 대부분이 된다. 요소는 `<span>` 하나이고 치수는 클래스가 든다 — `<img>` 치수 단언이 우연히
 * green이던 부류(POSTMORTEM 2026-09-10)가 아예 안 생긴다.
 *
 * ⚠️ **URL이 `globals.css`의 규칙이 아니라 인라인 `style`이다** (2026-09-11 — 초안의 전제가
 * 바뀌었다). 초안은 *"로케일 종류만큼(보통 3~6) CSS 규칙"*을 전제로 `data-flag` + 전역 규칙을
 * 골랐는데, 실제로 들어온 세트가 **253개**다. 그것을 전역 규칙으로 적으면 **국기가 하나도 없는
 * 화면까지 253줄을 받고**, 게다가 `globals.css`는 손으로 소유하는 파일이라 생성물이 된다.
 * 인라인은 **쓰는 것만** 나가고 요소 수는 그대로다.
 *
 * ⚠️ **`next/image`를 쓰지 않는다** — 정적 import한 SVG가 `data:` URI로 인라인되면 그 컴포넌트가
 * 거부한다 (POSTMORTEM 2026-09-10). 이 리포는 반대 방향의 단언도 갖고 있어(로그인 키비주얼은
 * `next/image`여야 한다) 근거를 안 적으면 다음 사람이 통일하려 든다.
 *
 * ⚠️ **매핑이 없으면 아무것도 안 그린다 — 코드만이다.** 물음표·지구본은 모르는 것을 아이콘으로
 * 주장하는 것이다 (spec Q4).
 *
 * ⚠️ **코드가 sans다 — `text-mono`가 아니다** (2026-09-11 사용자). 로케일 코드가 §4.1의 mono 표면
 * 목록에서 빠졌다: **mono는 8-P의 diff 표면으로 간다**는 방침이고, 그 전까지 식별자마다 mono를
 * 깔면 diff가 왔을 때 그것이 다른 표면과 구별되지 않는다. 여기서는 부수 효과도 있다 — `text-mono`가
 * 13px/18px이라 배지 높이가 22였고, 시안 `SolidBadge`는 19다.
 *
 * ⚠️ **orphaned는 배지 자체를 `danger`로 바꾼다.** 로케일 칸이 80px이고 배지가 이미 거의 다 쓰므로
 * "Orphaned" 배지를 옆에 붙일 자리가 없다. 로케일 헤더가 사라져 그 표시가 살 자리가 여기뿐이고,
 * 사유 문장은 `disabled` 입력의 placeholder가 든다.
 *
 * ⚠️ **`Base` 라벨은 들지 않는다** (2026-09-11 사용자). 이 표에서 base 행은 **키마다 맨 위 한 줄**이고
 * (`sortLocales`가 그렇게 세운다) 같은 사실을 903키 × 로케일 수만큼 반복하면 68px 칸의 예산만 먹는다 —
 * "가장 흔한 상태가 조용해야 한다"(DESIGN §6.2)의 연장이다. 그 라벨이 값을 하는 곳은 로케일이
 * **목록**으로 서서 순서가 단서가 못 되는 `/locales`·Home이고, `m.locales.base`는 거기 남아 있다.
 *
 * ⚠️ 그래서 이 표가 base를 말하는 수단은 **순서 하나**다 — base 셀을 비우면 그 키가 base 파일에서
 * 빠져 다음 push가 전 로케일에서 orphan한다(`lib/pull/plan.ts`). 라벨을 되살리고 싶어지면
 * `translations-screen.test.ts`의 그 단언을 먼저 읽는다.
 */
/**
 * 국기 조각만 — **배지와 로케일 드롭다운이 공유한다** (2026-09-11 실물 검증에서 갈라져 나왔다).
 *
 * ⚠️ **같은 로케일이 두 자리에서 다르게 보이면 안 된다** — 표의 배지엔 국기가 있는데 그것을 고르는
 * 드롭다운엔 없어서, 사용자가 `ko`를 고를 때와 표에서 확인할 때 다른 것을 보고 있었다.
 *
 * ⚠️ **`LocaleBadge`를 통째로 재사용하지 않는다** — 그쪽은 pill 배경을 들어 메뉴 항목에 놓으면
 * 항목마다 알약이 서고, `(base)`·orphaned 같은 **표 문맥의 표시**까지 메뉴로 따라온다.
 *
 * 16×11 — 시안의 국기 치수. 파일은 `public/flags/<id>.svg`(커밋된 원본)다.
 *
 * ⚠️ **radius가 `xs`(2px)이고 리포의 삼분 밖이다** (2026-09-11 사용자 — DESIGN §5). 이 리포의
 * 최소가 `rounded-sm`(8)인데 높이가 11px이라 그걸 주면 **국기가 타원이 된다.** `xs`는 `@theme`가
 * 안 덮은 Tailwind 기본값이고, 남의 나라 깃발을 우리 스케일로 재단하지 않는 가장 작은 처리다.
 * 배경은 border-box에 클립되므로 `overflow-hidden`이 필요 없다.
 */
export function LocaleFlag({ code }: { code: string }) {
  const flag = flagFor(code);
  if (flag === null) return null;
  return (
    <span
      className="h-[11px] w-4 shrink-0 rounded-xs bg-cover bg-center"
      style={{ backgroundImage: `url(/flags/${flag}.svg)` }}
      aria-hidden
    />
  );
}

export function LocaleBadge({ code, orphaned }: { code: string; orphaned: boolean }) {
  return (
    <Badge variant={orphaned ? "danger" : "neutral"} className="gap-1">
      <LocaleFlag code={code} />
      <span>{code}</span>
      {/* 색만으로는 말하지 않는다 — 배지가 `danger`인 이유를 스크린리더에도 준다 (DESIGN §7). */}
      {orphaned && <span className="sr-only">{m.locales.orphaned.badge}</span>}
    </Badge>
  );
}
