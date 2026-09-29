import { McpIcon } from "@/components/signin/brand-icons";
import { IconTile } from "@/components/ui/icon-tile";
import { m } from "@/lib/i18n";

/**
 * 동의 화면의 **앱 카드** (mcp-oauth 핸드오프 §7.2) — 로그인 전·동의 단계가 같은 것을 쓴다. `EntityCard`와 같은 치수(radius 12 · padding 12 ·
 * 칩 32/8)이고 칩은 `McpIcon`이다 — 앱 로고·색을 가져오지 않는다(이름·이미지는 클라이언트가 정한 것이라 신원 보증이 아니다, design §6.1).
 *
 * ⚠️ **이름·식별 줄은 말줄임하지 않고 전문을 줄바꿈한다** — 말줄임하면 사칭 주소의 구별되는 부분이 잘리고 `title`은 키보드·터치에서 안 보인다.
 * 이름은 `overflow-wrap:anywhere`, 식별 줄은 `break-all`.
 * ⚠️ 배지 없음 — "공식 인증 아님"은 카드 아래 문장이 말한다. 검증되지 않은 요청(`1o`)에서는 이 카드를 그리지 않는다.
 * ⚠️ 식별 줄은 `/mcp` 연결 행과 **같은 문자열**이다(`clientIdLabel`).
 */
export function AppCard({ name, ident }: { name: string; ident: string }) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5">
      <div data-app-card className="border-border flex w-full min-w-0 items-center gap-3 rounded-lg border p-3">
        {/* ⚠️ 시안은 칩 32 · radius 8(EntityCard 아바타와 같은 치수)인데 칸 규격은 둘뿐이다(`IconTile` — 2026-09-28 사용자). 행 안의 칸 `sm`(28)을 쓴다 — design-sync에서 판정. */}
        <IconTile>
          <McpIcon />
        </IconTile>
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="text-sm font-medium [overflow-wrap:anywhere]">{name}</span>
          <span className="text-muted-foreground text-xs break-all">{ident}</span>
        </span>
      </div>
      <p className="text-muted-foreground text-xs leading-[1.6]">{m.oauthAuthorize.appNameNote}</p>
    </div>
  );
}
