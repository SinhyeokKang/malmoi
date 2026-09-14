import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

export default function NotFound() {
  return <EmptyState title={m.surfaces.missingTitle} description={m.surfaces.missingDescription}
    action={<ButtonLink href={routes.projects()}>{m.surfaces.projects}</ButtonLink>} />;
}
