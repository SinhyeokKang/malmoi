import Link from "next/link";
import { Fragment } from "react";

import { cn } from "@/lib/utils";

/**
 * **페이지 콘텐츠의 첫 줄이다** — top bar가 아니다. 레이아웃은 페이지 props를 못 받으므로 거기 두면
 * parallel route 슬롯이나 클라이언트 컨텍스트(첫 페인트 플래시)가 필요해진다 (DESIGN §6.5).
 */
export function Breadcrumb({ items }: { items: readonly { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-xs">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <Fragment key={`${item.label}-${i}`}>
            {i > 0 && <span className="text-muted-foreground/60 px-2">/</span>}
            {item.href !== undefined && !last ? (
              <Link href={item.href} className="text-muted-foreground hover:text-foreground">
                {item.label}
              </Link>
            ) : (
              <span
                className={cn(last ? "text-foreground font-medium" : "text-muted-foreground")}
                aria-current={last ? "page" : undefined}
              >
                {item.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
