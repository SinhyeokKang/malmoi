import { cn } from "@/lib/utils";
import NextLink from "next/link";
import type { ComponentProps } from "react";

/** Inline navigation owns its blue text and keyboard ring. */
export function Link({ className, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink {...props} className={cn("text-link focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none", className)} />;
}
