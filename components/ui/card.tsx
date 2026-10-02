"use client";

import { useId, type ReactNode } from "react";
import { CountBadge, type CountProps } from "./count-badge";
import { cn } from "@/lib/utils";

/** Header owns the one body boundary, below notice when present. */
export function Card({ title, titleId, count, countLabel, badge, description, action, notice, children }: {
  title?: ReactNode;
  /** Explicit headings are focus return targets after a row disappears. */
  titleId?: string;
  badge?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  notice?: ReactNode;
  children: ReactNode;
} & CountProps) {
  const generatedId = useId();
  const id = titleId ?? generatedId;
  return <section aria-labelledby={title === undefined ? undefined : id} className="@container border-border bg-background shrink-0 overflow-hidden rounded-lg border">
    {title !== undefined && <header className={cn("flex min-h-12 flex-wrap items-center gap-2 px-4 py-3", notice === undefined && "border-divider border-b")}>
      <h2 id={id} tabIndex={titleId === undefined ? undefined : -1} className="text-base font-medium outline-none">{title}</h2>
      {count !== undefined && <CountBadge count={count} label={countLabel} />}
      {badge}
      {description !== undefined && <div className="text-muted-foreground ml-auto @max-form:ml-0 @max-form:w-full text-xs">{description}</div>}
      {action}
    </header>}
    {notice !== undefined && <div data-card-notice className="border-divider border-b">{notice}</div>}
    {children}
  </section>;
}

/** Static account rows remain a list; facts/forms choose their own body. */
export function CardRows({ children }: { children: ReactNode }) {
  return <ul>{children}</ul>;
}

/** Only siblings are divided; banners inside an item retain their own alpha line. */
export function CardList({ children, "aria-labelledby": labelledBy }: { children: ReactNode; "aria-labelledby"?: string }) {
  return <ul aria-labelledby={labelledBy} className="@container [&>li+li]:border-border [&>li+li]:border-t">{children}</ul>;
}
