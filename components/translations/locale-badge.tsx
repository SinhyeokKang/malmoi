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
 * ⚠️ **orphaned는 배지 자체를 `danger`로 바꾼다.** 로케일 칸이 80px이고 배지가 이미 거의 다 쓰므로
 * "Orphaned" 배지를 옆에 붙일 자리가 없다. 로케일 헤더가 사라져 그 표시가 살 자리가 여기뿐이고,
 * 사유 문장은 `disabled` 입력의 placeholder가 든다.
 */
export function LocaleBadge({
  code,
  isBase,
  orphaned,
}: {
  code: string;
  isBase: boolean;
  orphaned: boolean;
}) {
  const flag = flagFor(code);
  return (
    <Badge variant={orphaned ? "danger" : "neutral"} className="gap-1">
      {flag !== null && (
        /*
          16×11 — 시안의 국기 치수. 파일은 `public/flags/<id>.svg`(커밋된 원본)다.

          ⚠️ **radius가 `xs`(2px)이고 리포의 삼분 밖이다** (2026-09-11 사용자 — DESIGN §5). 이 리포의
          최소가 `rounded-sm`(8)인데 높이가 11px이라 그걸 주면 **국기가 타원이 된다.** `xs`는
          `@theme`가 안 덮은 Tailwind 기본값이고, 남의 나라 깃발을 우리 스케일로 재단하지 않는
          가장 작은 처리다. 배경은 border-box에 클립되므로 `overflow-hidden`이 필요 없다.
        */
        <span
          className="h-[11px] w-4 shrink-0 rounded-xs bg-cover bg-center"
          style={{ backgroundImage: `url(/flags/${flag}.svg)` }}
          aria-hidden
        />
      )}
      <span className="text-mono">{code}</span>
      {isBase && <span className="font-light">{m.locales.base}</span>}
      {/* 색만으로는 말하지 않는다 — 배지가 `danger`인 이유를 스크린리더에도 준다 (DESIGN §7). */}
      {orphaned && <span className="sr-only">{m.locales.orphaned.badge}</span>}
    </Badge>
  );
}
