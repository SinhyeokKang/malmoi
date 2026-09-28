import { isAllowedHost } from "@/lib/github-connect/origin";

/**
 * `/api/mcp`의 `Origin` 대조 (mcp-connector design §1.2 — 검수 J). **CSRF 방어의 전부는 "쿠키를 읽지 않는다"이고**(제3자 페이지는
 * Bearer를 붙일 수 없다) 이것은 스펙의 DNS rebinding 권고 한 겹이다.
 *
 * ⚠️ **없으면 통과한다** — Node `fetch`·CLI는 `Origin`을 싣지 않는다(design §1.1 실측: Claude Code·Codex 둘 다). 거부하면 모든
 * 정상 클라이언트가 죽는다. 있으면 브라우저이고, 그때만 우리 호스트인지 본다.
 */
export function checkOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (origin === null) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  // 불투명 origin(`null`)·`file:`은 host가 비어 있다 — 호스트 대조가 거른다. 스킴은 보지 않는다: localhost는 http다.
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  return isAllowedHost(url.host);
}
