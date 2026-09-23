import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * 프로젝트 세그먼트의 경계 — **무엇을 잃었는지 단정하지 않는다** (audit #16). 이 아래 모든 `notFound()`가 여기로 오므로
 * 표면·소스·프로젝트 중 하나를 고르면 나머지 갈래에서 거짓이 된다. 표면을 잃은 갈래는 자기 경계(`translations/not-found.tsx`)가 든다.
 */
export default function NotFound() {
  return <EmptyState title={m.notFound.title} description={m.notFound.description}
    action={<ButtonLink href={routes.projects()}>{m.notFound.action}</ButtonLink>} />;
}
