/**
 * 활성 표면을 못 찾았을 때의 갈래 (sources-add-remove — ARCHITECTURE §5.5.5 표). 같은 프로젝트에 그 slug의 제거된 행이 있으면
 * `removed`다 — 할 일(워크플로에서 그 step을 지운다)이 불일치와 달라 응답과 Logs 거부로 가른다. 노출은 그 프로젝트의 push 토큰
 * 보유자에게 "그 slug가 있었다"는 사실뿐이다(slug는 프로젝트 안에서 unique다).
 */
export function classifyMissingSurface(row: { archivedAt: Date | null } | null): "removed" | "mismatch" {
  return row !== null && row.archivedAt !== null ? "removed" : "mismatch";
}
