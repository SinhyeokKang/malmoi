import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Table, TableBody, TableHead, TableHeader, TableRow, Td } from "@/components/ui/table";

/**
 * 공개 문서의 표 — `/docs`(원고 표)와 `/privacy`(`PrivacyDoc`)가 같은 표 규칙을 쓴다 (DESIGN §6.61).
 * 표 규칙을 두 벌로 두지 않으려고 뽑았다. 문단·목록은 두 그릇의 타이포가 달라 각자 든다.
 *
 * ⚠️ **스크롤 컨테이너를 여기서 든다** (`scrollable={false}` + 이 `div`) — 온보딩 ②와 같은
 * 형이다. 프리미티브의 래퍼는 `role`·`aria-label`을 받지 않고, 그 셋이 없으면 **키보드로
 * 가로 스크롤할 길이 없다**(표 안에 포커스 가능한 것이 0이라 컨테이너가 직접 받는다).
 * 컨테이너 자체를 없애면 3열 표가 페이지를 가로로 밀어 중앙 정렬 본문까지 어긋난다 (POSTMORTEM 2026-09-19).
 *
 * `className`은 래퍼에 붙는다 — 그릇마다 여백·테두리가 다르다.
 */
/**
 * 표 급 — `/privacy`와 `/docs`(원고 표)가 같은 급을 쓴다(시안 Prototype `isPrivacy` · `Docs.dc.html` 1b — "Privacy 표 그대로"). 셀 14/1.6 · 머리 10/16 ·
 * 13/500/1.6 muted(행 ≈ 41) · radius 12(`rounded-lg` — `rounded-xl`은 16이다).
 *
 * ⚠️ **자간 0.015em은 `tracking-*` 예외다**(DESIGN §4 · `visual-system.test.ts`) — 크기 토큰 `text-sm`·`text-xs`의 짝은 0.02em인데
 * 시안이 이 표만 0.015em을 든다. `:is(th,td)` 하나로 건다 — `--tw-tracking`은 상속되지 않아 표에 걸면 칸의 크기 유틸이 0.02em으로 되돌린다.
 */
export const DOC_TABLE =
  "border-border mt-6 min-w-0 overflow-auto rounded-lg border [&_td]:leading-[1.6] [&_th]:text-muted-foreground [&_th]:text-xs [&_th]:px-4 [&_th]:py-2.5 [&_th]:leading-[1.6] [&_:is(th,td)]:tracking-[0.015em]";
/** 열 머리 칸 — `DocTable`과 원고 표(`components/docs/guide-markdown.tsx`)가 같은 칸을 쓴다. */
export const DOC_TABLE_HEAD = "bg-primary-foreground h-auto px-4 py-2 whitespace-normal";
/** 행 — 읽는 화면이라 hover 강조를 주지 않는다(조작 어포던스다, §6.61). 머리 행의 선은 `TableHeader`의 `[&_tr]:border-b`가 되살린다. */
export const DOC_TABLE_ROW = "border-b-0 hover:bg-transparent";

/**
 * region 래퍼 + `<table>` — 이름을 **둘 다에** 건다. 원고 표는 react-markdown이 칸을 그려 넘기므로 이 틀만 쓴다.
 */
export function DocTableFrame({ label, className, children }: { label: string; className: string; children: ReactNode }) {
  return (
    // Tab을 받는 것이 이 래퍼라 링도 여기서 든다(DESIGN §7) — 없으면 브라우저 기본 outline이 선다.
    <div
      role="region"
      tabIndex={0}
      aria-label={label}
      className={cn("focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none", className)}
    >
      {/* 래퍼의 이름은 랜드마크의 이름이고, 표 목록은 `<table>` 자신의 이름을 읽는다 — 둘 다 준다. */}
      <Table scrollable={false} aria-label={label}>
        {children}
      </Table>
    </div>
  );
}

export function DocTable({
  table,
  className,
}: {
  table: { label: string; head: readonly ReactNode[]; rows: readonly (readonly ReactNode[])[] };
  className: string;
}) {
  return (
    <DocTableFrame label={table.label} className={className}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {table.head.map((cell, cellIndex) => (
            // ⚠️ `Th`가 아니라 `TableHead`다 — `Th`의 `bg-muted/50`+`text-foreground/60`은 AA 미달이고
            // (DESIGN §2.2) sticky는 스크롤 컨테이너가 표 자신뿐이라 무의미하다.
            <TableHead key={cellIndex} scope="col" className={DOC_TABLE_HEAD}>
              {cell}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {table.rows.map((row, rowIndex) => (
          <TableRow key={rowIndex} className={DOC_TABLE_ROW}>
            {row.map((cell, cellIndex) => (
              <Td key={cellIndex}>{cell}</Td>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </DocTableFrame>
  );
}
