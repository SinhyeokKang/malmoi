import type { Root } from "mdast";

import { headingAnchor, toText } from "@/lib/guide/parse";
import { docHref } from "@/lib/guide/href";
import { flattenNav, type NavNode } from "@/lib/guide/summary";
import type { SearchEntry } from "./match";

export type DocsEntry = SearchEntry & { page: string; anchor: string | null; section: string | null; body: string };

export function docsSearchEntries(summary: readonly NavNode[], pageOf: (file: string) => Root): DocsEntry[] {
  return flattenNav(summary).flatMap(({ file, slug, title }) => {
    const page = slug.join("/");
    const tree = pageOf(file);
    const sections: { anchor: string | null; section: string | null; nodes: Root["children"] }[] = [{ anchor: null, section: null, nodes: [] }];
    let current = sections[0];
    for (const node of tree.children) {
      if (node.type === "heading" && node.depth === 1) continue;
      if (node.type === "heading" && node.depth === 2) {
        const heading = headingAnchor(node);
        current = heading.id === null ? undefined : { anchor: heading.id, section: heading.text, nodes: [] };
        if (current) sections.push(current);
      } else current?.nodes.push(node);
    }
    return sections.map(({ anchor, section, nodes }) => ({
      id: `docs:${page}${anchor === null ? "" : `#${anchor}`}`,
      page, anchor, title, section, ...(section === null ? {} : { context: section }),
      href: `${docHref(slug)}${anchor === null ? "" : `#${anchor}`}`,
      body: toText({ type: "root", children: nodes }).trim(),
    }));
  });
}
