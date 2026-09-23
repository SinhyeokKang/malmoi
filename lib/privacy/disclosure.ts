/**
 * 등재(`collected.ts`) ↔ 방침 본문의 절 대조 (privacy design §2.2 (B)). **대조 단위는 절 id다** — 등재는
 * 필드별 1:1이고 방침 표는 여럿을 한 행으로 접으므로 항목 라벨 문자열은 본문에 없다.
 *
 * 반환이 배열 셋인 이유: 실패 메시지에 **이름**이 나와야 고칠 자리를 안다. 불리언이면 "어딘가 틀렸다"뿐이다.
 */
export function sectionGaps(
  disclosed: readonly string[],
  sections: readonly { id: string }[],
  disclosureSections: readonly string[],
): { missingSections: string[]; unusedSections: string[]; duplicateIds: string[] } {
  // ⚠️ 중복을 따로 센다 — Set으로 모으면 같은 id가 조용히 하나로 접히고 앵커는 첫 절로만 간다.
  const counts = new Map<string, number>();
  for (const section of sections) counts.set(section.id, (counts.get(section.id) ?? 0) + 1);
  const duplicateIds = [...counts].filter(([, n]) => n > 1).map(([id]) => id);

  const wanted = new Set([...disclosed, ...disclosureSections]);
  const missingSections = [...wanted].filter((id) => !counts.has(id));

  const pointed = new Set(disclosed);
  const unusedSections = disclosureSections.filter((id) => !pointed.has(id));

  return { missingSections, unusedSections, duplicateIds };
}
