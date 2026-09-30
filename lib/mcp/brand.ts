/**
 * 에이전트 로고 (2026-09-30 사용자). 파일은 각 회사의 공식 배포본을 **변형 없이** `public/brand/agents/`에 둔다 — 두 회사 규정이 공통으로
 * "받은 그대로 · 우리 브랜드보다 작게 · 제휴 암시 없이 식별 용도로만"이다(Anthropic press kit Claude Spark · OpenAI black monoblossom). ⚠️ Anthropic 상표 지침은 사전 승인을 요구한다 — 쓰임을 넓히기 전에 그 조항을 다시 본다.
 *
 * ⚠️ **잎이다 — import가 0이다.** 클라이언트 컴포넌트가 값으로 읽는다.
 */
export type Brand = "claude" | "openai";

export const BRAND_LOGO: Record<Brand, string> = {
  claude: "/brand/agents/claude.svg",
  openai: "/brand/agents/openai.svg",
};

/**
 * 연결 행의 로고는 **client_id 호스트가 정확히 같을 때만**이다. 이름(`client_name`)은 연결하는 쪽이 정하는 값이라 아무나 "Claude Code"를 댈 수 있다.
 * 등록이 CIMD뿐이라(`lib/oauth/metadata.ts`) client_id는 그 호스트가 메타데이터 문서를 내준 URL이고, 그 호스트는 그 회사만 쓴다.
 * ⚠️ **접미 일치를 쓰지 않는다** — `evil.claude.ai`는 몰라도 `claude.ai.evil.com`은 누구나 만든다.
 */
const HOSTS: Record<string, Brand> = { "claude.ai": "claude", "chatgpt.com": "openai" };

export function connectionBrand(clientId: string): Brand | null {
  if (!URL.canParse(clientId)) return null;
  const url = new URL(clientId);
  if (url.protocol !== "https:") return null;
  return Object.hasOwn(HOSTS, url.hostname) ? HOSTS[url.hostname]! : null;
}
