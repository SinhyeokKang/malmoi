import { docHref } from "@/lib/guide/href";
import type { NavNode } from "@/lib/guide/summary";

import { DocsNavLink } from "./nav-link";

/**
 * 문서 내비의 SUMMARY 트리 — 장 행 + 하위 행, 늘 펼친다. **고정 내비(264)와 좁은 폭의 장 내비 시트가 같은 트리를 쓴다**
 * (responsive-public PT2c — "DocsNavLink 그대로"). 행 높이처럼 그릇마다 다른 것은 그릇이 감싸서 든다.
 */
export function DocsNavTree({ nav }: { nav: readonly NavNode[] }) {
  return (
    <ul className="m-0 list-none space-y-3 p-0">
      {nav.map((chapter) => (
        <li key={chapter.file}>
          <DocsNavLink href={docHref(chapter.slug)} chapter>
            {chapter.title}
          </DocsNavLink>
          {chapter.children.length === 0 ? null : (
            <ul className="m-0 list-none p-0">
              {chapter.children.map((page) => (
                <li key={page.file}>
                  <DocsNavLink href={docHref(page.slug)} chapter={false}>
                    {page.title}
                  </DocsNavLink>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
