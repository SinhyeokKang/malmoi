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
      className={cn(buttonClass({ variant: "primary" }),
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none aria-disabled:cursor-wait",
      )}
      onNavigate={(event) => {
        // Next calls onNavigate only for same-tab navigation, preserving modified clicks.
        event.preventDefault();
        if (!pending) startTransition(() => router.push(href));
      }}
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
      {m.common.nav.newProject}
    </Link>
  );
}
