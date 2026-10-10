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
  /**
   * 비활성 행의 hover 면. ⚠️ **활성 면 하나로 칠하는 목록(전역 검색 option · 메뉴 행)은 끈다** — 포인터와 키보드가 각자 면을
   * 칠하면 칠해진 행이 둘이 된다(search-ux-unify C16). `selected` 면은 이것과 무관하다.
   */
  hoverFill?: boolean;
  /**
   * **`actions`를 좁은 그릇에서 둘째 줄 오른쪽으로 내린다** (responsive-app · 시안 AT2 "행 동작 버튼은 아래 줄 오른쪽"). 기준은 뷰포트가 아니라
   * **조상 컨테이너 640**(`@max-form` — `Card`·`CardList`가 선언한다)이고 DOM 순서는 그대로다 — CSS `order`가 아니라 `flex-wrap` + 전폭 basis다.
   * 꺼진 기본값은 지금 렌더와 바이트가 같다(1280 불변). ⚠️ **줄 수가 폭만으로 정해진다**("넘칠 때만 감김"이 아니다) — 언어마다 줄 수가 갈리면
   * 로딩 골격이 실물과 같은 줄 수를 못 낸다(spec A-09).
   */
  stackActions?: boolean;
};
type Props = Slots & (
  | (Omit<ComponentPropsWithRef<typeof Link>, "title"> & { href: string; as?: never })
  | (Omit<ComponentPropsWithRef<"button">, "title"> & { href?: never; as?: "button" })
  | (Omit<ComponentPropsWithRef<"li">, "title" | "onClick"> & { href?: never; as: "li"; onClick?: never })
  | (Omit<ComponentPropsWithRef<"div">, "title" | "onClick"> & { href?: never; as?: "div"; onClick?: never })
);

/** Server-safe row. Callers retain li ownership when an item also has a banner. */
export function ListRow({ icon, title, description, actions, aside, chevron, selected = false, variant = "card", ringInset = false, hoverFill = true, stackActions = false, children, className, ...props }: Props) {
  const interactive = props.href !== undefined || props.as === "button" || props.onClick !== undefined;
  const blocked = ("disabled" in props && props.disabled) || props["aria-disabled"] === true || props["aria-disabled"] === "true";
  const classes = cn(
    "flex items-center gap-3 px-4 py-row-y",
    stackActions && "@max-form:flex-wrap @max-form:gap-y-2",
    interactive && "w-full text-left focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
    interactive && ringInset && "focus-visible:ring-inset",
    selected ? "bg-foreground/[0.07]" : interactive && !blocked && hoverFill && (variant === "canvas" ? "hover:bg-foreground/[0.03]" : "hover:bg-foreground/[0.02]"),
    className,
  );
  const content = <>{icon}{title === undefined && description === undefined ? children : <span data-row-copy className="flex min-w-0 flex-1 flex-col gap-copy-gap"><span>{title ?? children}</span>{description !== undefined && <span className="text-muted-foreground text-xs leading-normal">{description}</span>}</span>}{aside}{actions !== undefined && <div className={cn("flex shrink-0 items-center gap-2", stackActions && "@max-form:basis-full @max-form:justify-end")}>{actions}</div>}{chevron && <ListRowChevron />}</>;
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
