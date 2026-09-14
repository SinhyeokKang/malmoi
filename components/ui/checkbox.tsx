"use client";

import { Checkbox as Primitive } from "radix-ui";
import { Check } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** 행의 상세 버튼과 형제로 선다. 접근 이름은 aria-label 또는 aria-labelledby로 제공한다. */
export function Checkbox({ className, ...props }: ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root
      className={cn(
        "bg-background flex cursor-pointer size-4 shrink-0 items-center justify-center rounded border border-neutral-300",
        "data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background",
        "disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        className,
      )}
      {...props}
    >
      <Primitive.Indicator><Check className="size-3" aria-hidden /></Primitive.Indicator>
    </Primitive.Root>
  );
}
