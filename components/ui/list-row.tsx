import Link from "next/link";
import { ChevronRight, Loader2 } from "lucide-react";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Slots = {
  children?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  chevron?: boolean;
  selected?: boolean;
  variant?: "card" | "canvas";
  ringInset?: boolean;
};
type Props = Slots & (
  | (Omit<ComponentPropsWithRef<typeof Link>, "title"> & { href: string; as?: never })
  | (Omit<ComponentPropsWithRef<"button">, "title"> & { href?: never; as?: "button" })
  | (Omit<ComponentPropsWithRef<"li">, "title" | "onClick"> & { href?: never; as: "li"; onClick?: never })
  | (Omit<ComponentPropsWithRef<"div">, "title" | "onClick"> & { href?: never; as?: "div"; onClick?: never })
);

/** Server-safe row. Callers retain li ownership when an item also has a banner. */
export function ListRow({ icon, title, description, actions, aside, chevron, selected = false, variant = "card", ringInset = false, children, className, ...props }: Props) {
  const interactive = props.href !== undefined || props.as === "button" || props.onClick !== undefined;
  const blocked = ("disabled" in props && props.disabled) || props["aria-disabled"] === true || props["aria-disabled"] === "true";
  const classes = cn(
    "flex items-center gap-3 px-4 py-row-y",
    interactive && "w-full text-left focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
    interactive && ringInset && "focus-visible:ring-inset",
    selected ? "bg-foreground/[0.07]" : interactive && !blocked && (variant === "canvas" ? "hover:bg-foreground/[0.03]" : "hover:bg-foreground/[0.02]"),
    className,
  );
  const content = <>{icon}{title === undefined && description === undefined ? children : <span data-row-copy className="flex min-w-0 flex-1 flex-col gap-copy-gap"><span>{title ?? children}</span>{description !== undefined && <span className="text-muted-foreground text-xs leading-normal">{description}</span>}</span>}{aside}{actions !== undefined && <div className="flex shrink-0 items-center gap-2">{actions}</div>}{chevron && <ListRowChevron />}</>;
  if (props.href !== undefined) {
    const { as: _as, ...link } = props as ComponentPropsWithRef<typeof Link> & { as?: never };
    return <Link {...link} onClick={blocked ? event => event.preventDefault() : link.onClick} aria-current={link["aria-current"] ?? (selected ? "true" : undefined)} className={classes}>{content}</Link>;
  }
  if (interactive) {
    const { as: _as, ...button } = props as ComponentPropsWithRef<"button"> & { as?: "button" };
    return <button type="button" {...button} onClick={blocked ? event => event.preventDefault() : button.onClick} aria-current={button["aria-current"] ?? (selected ? "true" : undefined)} className={classes}>{content}</button>;
  }
  if (props.as === "li") {
    const { as: _as, ...item } = props;
    return <li {...item} className={classes}>{content}</li>;
  }
  const { as: _as, ...div } = props as ComponentPropsWithRef<"div"> & { as?: "div" };
  return <div {...div} className={classes}>{content}</div>;
}

/** The useLinkStatus client leaf passes busy; the server row has no hooks. */
export function ListRowChevron({ busy = false }: { busy?: boolean }) {
  return busy ? <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" aria-hidden /> : <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />;
}
