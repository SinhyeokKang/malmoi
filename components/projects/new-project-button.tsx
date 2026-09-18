"use client";

import { Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { buttonClass } from "@/components/ui/button";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export function NewProjectButton({ q }: { q?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const href = routes.newProject({ q });
  return (
    <Link
      href={href}
      aria-busy={pending || undefined}
      aria-disabled={pending || undefined}
      // 겉모습은 `buttonClass`의 `aria-disabled:` 짝이 든다 — `<a>`는 `disabled`를 못 받는다.
      className={cn(buttonClass({ variant: "primary" }),
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
      )}
      onNavigate={(event) => {
        // Next는 같은 탭 이동에서만 onNavigate를 부른다 — 수정 키 클릭(새 탭)은 그대로 둔다.
        event.preventDefault();
        if (!pending) startTransition(() => router.push(href));
      }}
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
      {m.common.nav.newProject}
    </Link>
  );
}
