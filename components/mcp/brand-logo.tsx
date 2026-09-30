import { BRAND_LOGO, type Brand } from "@/lib/mcp/brand";
import { cn } from "@/lib/utils";

/**
 * 에이전트 로고 — 공식 배포본 SVG를 **그대로** 싣는다(`lib/mcp/brand.ts`). 색을 입히지 않으려고 인라인 SVG가 아니라 `<img>`다 — `currentColor`로
 * 칠하는 순간 "받은 그대로"가 깨진다. 같은 origin 정적 파일이라 CSP `img-src 'self'`로 충분하다.
 * 이름이 늘 옆에 있으므로 장식이다(`alt=""`).
 */
/**
 * ⚠️ **OpenAI 마크만 1.5배로 보인다** (2026-09-30 사용자 — Claude보다 작아 보였다). 원본 SVG의 마크가 뷰박스의 67%뿐이고(안쪽 여백)
 * Claude Spark는 거의 100%다. 파일은 그대로 두고 **표시 크기만** 비율대로 키운다 — 규정이 막는 것은 색·비율·요소 변경이지 크기가 아니다.
 * `scale`이라 레이아웃 칸은 그대로다.
 */
const OPTICAL: Partial<Record<Brand, string>> = { openai: "scale-150" };

export function BrandLogo({ brand, className }: { brand: Brand; className?: string }) {
  return <img src={BRAND_LOGO[brand]} alt="" aria-hidden className={cn("shrink-0 object-contain", OPTICAL[brand], className)} />;
}
