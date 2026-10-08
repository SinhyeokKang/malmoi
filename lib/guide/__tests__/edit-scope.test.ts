import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseMd } from "../parse";
import { sectionByAnchor } from "../sections";

const GUIDE = fileURLToPath(new URL("../../../guide/", import.meta.url));

// 문장 전체를 고정하지 않고 라벨 설명과 같은 문장에 표시 조건이 있는지 검사한다.
const cases = [
  { locale: "en", all: "All sources", namespaces: "All namespaces", search: /search/i, multiple: /(?:several|multiple|more than one) sources/i, single: /(?:one|single) source/i },
  { locale: "ko", all: "모든 소스", namespaces: "모든 네임스페이스", search: /검색/, multiple: /소스가 여러 개/, single: /소스가 하나/ },
  { locale: "es", all: "Todas las fuentes", namespaces: "Todos los espacios de nombres", search: /busca/i, multiple: /(?:varias|múltiples) fuentes/i, single: /(?:una sola|única) fuente/i },
] as const;

describe("검색 범위 가이드 — 소스 수 조건", () => {
  it.each(cases)("$locale: All sources는 다중 소스 검색 중에만, 단일 소스는 All namespaces", ({ locale, all, namespaces, search, multiple, single }) => {
    const tree = parseMd(readFileSync(join(GUIDE, locale, "translate/edit.md"), "utf8"));
    const text = sectionByAnchor(tree, "find-key");
    expect(text).not.toBeNull();
    const sentences = text!.split(/[.!?。]\s+/);
    expect(sentences.some((sentence) => sentence.includes(all) && search.test(sentence.slice(0, sentence.indexOf(all))) && multiple.test(sentence.slice(0, sentence.indexOf(all))))).toBe(true);
    expect(sentences.some((sentence) => sentence.includes(namespaces) && single.test(sentence))).toBe(true);
  });
});
