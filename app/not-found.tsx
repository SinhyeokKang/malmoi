import { RootFallback } from "@/components/root-fallback";
import { ButtonLink } from "@/components/ui/button";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * 루트 not-found (audit #17) — 셸 밖(`/invite`·`/signin`·오타 URL)이 Next 기본 404로 떨어지지 않게 한다.
 * 로그인하지 않았으면 `/projects`가 미들웨어에서 로그인으로 보낸다 — 출구가 하나로 충분하다.
 */
export default function NotFound() {
  return (
    <RootFallback title={m.notFound.title} description={m.notFound.description}>
      <ButtonLink size="lg" className="w-full" href={routes.projects()}>{m.notFound.action}</ButtonLink>
    </RootFallback>
  );
}
