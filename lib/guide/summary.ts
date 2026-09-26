import type { List, Root } from "mdast";

import { GuideError, toText } from "./parse";

/**
 * `guide/` 루트의 비서빙 문서. SUMMARY에 오르면 오류이고, slug로 해소되지 않는다 — `/docs/AUTHORING`은 404다.
 */
const RESERVED = new Set(["AUTHORING.md", "SHOOTING.md", "SUMMARY.md"]);

/**
 * ⚠️ **밑줄을 받지 않는다** — `__proto__`가 세그먼트로 설 자리를 문자 집합에서 먼저 없앤다. 공백·비ASCII·`.`·`..`도
 * 여기서 걸린다(`./x.md`는 같은 파일의 두 번째 이름이 되어 중복 판정을 빗나간다).
 */
const SEGMENT = /^[A-Za-z0-9-]+$/;

/** `setup/README.md` → `["setup"]` · `README.md` → `[]`. 해소되지 않는 경로는 null. */
export function pathToSlug(path: string): string[] | null {
  if (RESERVED.has(path) || !path.endsWith(".md")) return null;
  const parts = path.slice(0, -".md".length).split("/");
  if (!parts.every((part) => SEGMENT.test(part))) return null;
  if (parts[parts.length - 1] === "README") parts.pop();
  return parts;
}

/**
 * slug → 등재 파일. **충돌(`x.md`와 `x/README.md`)·미등재는 null** — 어느 쪽이 이겼는지 고르지 않는다.
 * URL 세그먼트는 남이 정한 키라 `Object.create(null)` 위에서 `Object.hasOwn`으로만 찾는다.
 */
export function slugToFile(slug: readonly string[], files: readonly string[]): string | null {
  if (!slug.every((part) => SEGMENT.test(part))) return null;
  const bySlug: Record<string, string | null> = Object.create(null);
  for (const file of files) {
    const key = pathToSlug(file)?.join("/");
    if (key === undefined) continue;
    bySlug[key] = Object.hasOwn(bySlug, key) ? null : file;
  }
  const key = slug.join("/");
  return Object.hasOwn(bySlug, key) ? (bySlug[key] ?? null) : null;
}

export type NavNode = { title: string; file: string; slug: string[]; children: NavNode[] };

/**
 * SUMMARY → 내비 트리. **들여쓰기가 계층이다**(중첩 목록). 문제가 하나라도 있으면 던진다 — 반쯤 맞는 내비를
 * 렌더하면 빠진 페이지가 조용히 404가 된다.
 */
export function parseSummary(tree: Root): NavNode[] {
  const seenFiles = new Set<string>();
  const seenSlugs = new Set<string>();

  const fromList = (list: List): NavNode[] =>
    list.children.map((item) => {
      const [head, ...rest] = item.children;
      const link = head?.type === "paragraph" ? head.children.find((child) => child.type === "link") : undefined;
      if (!link) throw new GuideError("summary-item", toText(item));
      const file = link.url;
      if (RESERVED.has(file)) throw new GuideError("summary-reserved", file);
      const slug = pathToSlug(file);
      if (!slug) throw new GuideError("summary-path", file);
      if (seenFiles.has(file)) throw new GuideError("summary-duplicate-path", file);
      const key = slug.join("/");
      if (seenSlugs.has(key)) throw new GuideError("summary-duplicate-slug", file);
      seenFiles.add(file);
      seenSlugs.add(key);
      const children = rest.flatMap((child) => (child.type === "list" ? fromList(child) : []));
      return { title: toText(link).trim(), file, slug, children };
    });

  return tree.children.flatMap((node) => (node.type === "list" ? fromList(node) : []));
}

export type FlatNavItem = { title: string; file: string; slug: string[]; parent: string | null };

/** 선위 순회 — 이전/다음 순서이고 장 경계를 넘는다. `parent`는 SUMMARY의 부모 제목(h1 위 줄). */
export function flattenNav(nav: readonly NavNode[]): FlatNavItem[] {
  const walk = (nodes: readonly NavNode[], parent: string | null): FlatNavItem[] =>
    nodes.flatMap(({ title, file, slug, children }) => [{ title, file, slug, parent }, ...walk(children, title)]);
  return walk(nav, null);
}
