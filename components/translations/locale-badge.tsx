import { Badge } from "@/components/ui/badge";
import { m } from "@/lib/i18n";
import { flagFor } from "@/lib/keys/flag";

/**
 * 로케일 행의 왼쪽 칸 — **국기(있으면) + 코드** (8-4 design §4).
 *
 * ⚠️ **국기가 `<img>`가 아니라 CSS `background-image`다.** `?ns=*`에서 이 배지가 2,709개 서는데
 * `<img>`면 요소·레이아웃 오브젝트가 그만큼 늘고, 그것이 이 배송이 실제로 더하는 렌더 비용의
 * 대부분이 된다. 규칙은 로케일 **종류만큼**(보통 3~6) `app/globals.css`에 있고 요소는 `<span>`
 * 하나이며, 치수는 클래스가 든다 — `<img>` 치수 단언이 우연히 green이던 부류(POSTMORTEM
 * 2026-09-10)가 아예 안 생긴다.
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
        // 16×11 — 시안의 국기 치수. 파일은 `public/flags/<id>.svg`이고 규칙은 globals.css에 있다.
        <span data-flag={flag} className="h-[11px] w-4 shrink-0 bg-cover bg-center" aria-hidden />
      )}
      <span className="text-mono">{code}</span>
      {isBase && <span className="font-light">{m.locales.base}</span>}
      {/* 색만으로는 말하지 않는다 — 배지가 `danger`인 이유를 스크린리더에도 준다 (DESIGN §7). */}
      {orphaned && <span className="sr-only">{m.locales.orphaned.badge}</span>}
    </Badge>
  );
}
