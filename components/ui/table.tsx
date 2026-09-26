import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * shadcn/ui `new-york-v4` Table 기반 (2026-09-12).
 * 원본: https://ui.shadcn.com/r/styles/new-york-v4/table.json
 *
 * ⚠️ **프리셋이 둘이고 구현은 하나다.** 아래 `Th`·`Td`·`Tr`은 **별도 구현이 아니라** 이 파일의
 * `TableHead`·`TableCell`·`TableRow`를 감싼 프리셋이다 — 마크업·`data-slot`이 한 곳에서 나오므로
 * 기본값을 고치면 양쪽이 함께 움직인다. 프리셋이 **되눌러야 하는 기본값**은 각 함수 위에 적혀 있고,
 * 기본값을 바꿀 때 그 목록이 확인 대상이다.
 *
 * ⚠️ **`TableFooter`·`TableCaption`은 두지 않는다** — 원본에는 있지만 이 리포에 소비자가 없다.
 * 필요해지면 그때 원본에서 가져온다 (PoC: 선반영은 그 자체가 결함).
 */
export function Table({
  className,
  scrollable = true,
  ...props
}: ComponentProps<"table"> & { scrollable?: boolean }) {
  const table = (
    <table
      data-slot="table"
      className={cn("w-full caption-bottom border-collapse text-sm", className)}
      {...props}
    />
  );
  /**
   * ⚠️ **가로·세로 스크롤을 이 컨테이너가 든다** — 페이지 본문이 가로로 밀리면 사이드바까지 따라
   * 움직이고, `sticky top-0`은 **가장 가까운 스크롤 컨테이너** 기준이라 세로를 바깥이 들면 헤더가
   * 붙을 대상이 없어 그냥 흘러간다. 높이는 부모(`min-h-0 flex-1`)가 정해 준다.
   *
   * ⚠️ **끄는 곳이 셋이다** — 번역 화면(`PanelBody`가 스크롤을 소유한다) · 온보딩 ②의 파일 표
   * (`steps/files.tsx`가 바깥 `div`로 스크롤을 들어야 `Th`의 `sticky`가 거기 붙는다) · 공개 문서
   * (`public-doc-table.tsx`가 그 `div`에 `role="region"`을 걸어야 키보드로 가로 스크롤된다). 여기서
   * 컨테이너를 하나 더 만들면 스크롤이 중첩된다.
   */
  return scrollable ? <div className="h-full min-w-0 overflow-auto">{table}</div> : table;
}

export function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b", className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap",
        "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        // ⚠️ 원본의 `p-2`를 축별로 쪼갰다 — 프리셋이 `px-4 py-3`로 되누를 때 tailwind-merge가
        // `p-2`를 **지우지 못해** 클래스가 남고, 그때 누가 이기는지가 Tailwind의 출력 순서에
        // 암묵적으로 걸린다. 값은 같고 되눌림만 명시적이 된다 (`table-presets.test.tsx`가 센다).
        "px-2 py-2 align-middle whitespace-nowrap",
        "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}

/**
 * 열 헤더 프리셋 — 언어·이력·멤버 화면이 쓴다 (번역 화면은 `TableHead`를 직접 든다).
 *
 * 되누르는 기본값: `h-10`(→ `h-auto`, 내용 높이로 둔다) · `whitespace-nowrap`(→ `normal`) ·
 * `text-foreground`(→ `/60`) · `px-2`(→ `px-4 py-2`).
 *
 * ⚠️ muted 표면 위라 `text-muted-foreground`를 쓰지 않는다 — 대비가 4.34:1로 미달이다 (DESIGN §2.2).
 *
 * ⚠️ **`sticky`에는 `z`가 함께 있어야 한다** — 없으면 스크롤할 때 셀 내용(특히 입력의 포커스 링)이
 * 헤더 위로 그려진다.
 */
export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <TableHead
      className={cn(
        "bg-muted/50 text-foreground/60 sticky top-0 z-10 h-auto px-4 py-2 whitespace-normal",
        className,
      )}
      {...props}
    />
  );
}

/**
 * 본문 셀 프리셋.
 *
 * 되누르는 기본값: `whitespace-nowrap`(→ `normal`, 이력의 사유처럼 긴 문장이 온다) ·
 * `align-middle`(→ `top`) · `p-2`(→ `px-4 py-3`).
 */
export function Td({ className, ...props }: ComponentProps<"td">) {
  return (
    <TableCell
      className={cn("border-border border-t px-4 py-3 align-top whitespace-normal", className)}
      {...props}
    />
  );
}

/**
 * 행 프리셋.
 *
 * 되누르는 기본값: `border-b`(→ `0`, 이 형은 행 구분선을 `Td`의 `border-t`가 든다. 둘 다 두면
 * 마지막 행 아래에 선이 하나 더 생긴다) · `hover:bg-muted/50`(→ `/30`).
 */
export function Tr({ className, ...props }: ComponentProps<"tr">) {
  return <TableRow className={cn("border-b-0 hover:bg-muted/30", className)} {...props} />;
}
