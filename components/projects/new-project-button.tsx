"use client";
import { Plus } from "lucide-react";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ButtonLink } from "@/components/ui/button";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";


export function NewProjectButton({ q }: { q?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const href = routes.newProject({ q });
  return (
    <ButtonLink variant="primary"
      href={href}
      busy={pending}

      // 겉모습은 `buttonClass`의 `aria-disabled:` 짝이 든다 — `<a>`는 `disabled`를 못 받는다.

      onNavigate={(event) => {
        // Next는 같은 탭 이동에서만 onNavigate를 부른다 — 수정 키 클릭(새 탭)은 그대로 둔다.
        event.preventDefault();
        if (!pending) startTransition(() => router.push(href));
      }}
    >
      <Plus className="size-4" aria-hidden />
      {m.common.nav.newProject}
    </ButtonLink>
  );
}
