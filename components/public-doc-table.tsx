import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Table, TableBody, TableHead, TableHeader, TableRow, Td } from "@/components/ui/table";

/**
 * 공개 문서의 표 — `/docs`(`PublicDoc`)와 `/privacy`(`PrivacyDoc`)가 같은 표 규칙을 쓴다 (DESIGN §6.61).
 * 표 규칙을 두 벌로 두지 않으려고 뽑았다. 문단·목록은 두 그릇의 타이포가 달라 각자 든다.
 *
 * ⚠️ **스크롤 컨테이너를 여기서 든다** (`scrollable={false}` + 이 `div`) — 온보딩 ②와 같은
 * 형이다. 프리미티브의 래퍼는 `role`·`aria-label`을 받지 않고, 그 셋이 없으면 **키보드로
 * 가로 스크롤할 길이 없다**(표 안에 포커스 가능한 것이 0이라 컨테이너가 직접 받는다).
 * 컨테이너 자체를 없애면 3열 표가 페이지를 가로로 밀어 중앙 정렬 본문까지 어긋난다 (POSTMORTEM 2026-09-19).
 *
 * `className`은 래퍼에 붙는다 — 그릇마다 여백·테두리가 다르다.
 */
export function DocTable({
  table,
  className,
}: {
  table: { label: string; head: readonly ReactNode[]; rows: readonly (readonly ReactNode[])[] };
  className: string;
}) {
  return (
    // Tab을 받는 것이 이 래퍼라 링도 여기서 든다(DESIGN §7) — 없으면 브라우저 기본 outline이 선다.
    <div
      role="region"
      tabIndex={0}
      aria-label={table.label}
      className={cn("focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none", className)}
    >
      {/* 래퍼의 이름은 랜드마크의 이름이고, 표 목록은 `<table>` 자신의 이름을 읽는다 — 둘 다 준다. */}
      <Table scrollable={false} aria-label={table.label}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {table.head.map((cell, cellIndex) => (
              // ⚠️ `Th`가 아니라 `TableHead`다 — `Th`의 `bg-muted/50`+`text-foreground/60`은 AA 미달이고
              // (DESIGN §2.2) sticky는 스크롤 컨테이너가 표 자신뿐이라 무의미하다.
              <TableHead key={cellIndex} scope="col" className="bg-primary-foreground h-auto px-4 py-2 whitespace-normal">
                {cell}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((row, rowIndex) => (
            // 읽는 화면이라 hover 강조를 주지 않는다 — 조작 어포던스다 (§6.61).
            <TableRow key={rowIndex} className="border-b-0 hover:bg-transparent">
              {row.map((cell, cellIndex) => (
                <Td key={cellIndex}>{cell}</Td>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
