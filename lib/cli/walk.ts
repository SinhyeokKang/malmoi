import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * 대상 리포 훑기 — 세 CLI가 각자 들고 있던 `SKIP_DIR`·`walk`를 한 곳에 둔다. 셋이 갈리면 같은
 * 리포를 `push:local`과 `scan`으로 훑었을 때 파일 집합이 다르다 (`scan.ts`만 `dist-log-viewer`가
 * 없었다 — 2026-09-04 audit #35).
 *
 * ⚠️ 파일시스템을 아는 층이다 — `server-only`를 붙이지 않는다 (tsx 스크립트가 import한다).
 */

/** 들어가지 않을 디렉터리. 산출물을 훑으면 같은 키가 중복 ref로 부풀고 느려진다. */
export const SKIP_DIR: ReadonlySet<string> = new Set([
  "node_modules", ".git", "dist", "dist-e2e", "dist-log-viewer", "build", "out", ".next",
  "coverage", "generated", ".vercel", "playwright-report", "test-results",
]);

/** AST 경로로 보낼 확장자. */
const TS_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
/** `__MSG_key__` 정규식 경로로 보낼 확장자. */
const RAW_EXT = new Set([".html", ".htm", ".json"]);

/** 스캐너에 넘길 종류. 둘 다 아니면 스캔 대상이 아니다. */
export function sourceKind(path: string): "ts" | "raw" | undefined {
  const dot = path.lastIndexOf(".");
  const ext = dot === -1 ? "" : path.slice(dot);
  return TS_EXT.has(ext) ? "ts" : RAW_EXT.has(ext) ? "raw" : undefined;
}

/**
 * 리포 기준 상대 경로(posix) 전부. 정렬돼 있다 — GitHub permalink가 이 값을 그대로 쓴다.
 *
 * ⚠️ **심링크를 따라가지 않는다** (2026-09-09, sec-audit 발견 12). 대상 리포는 **남이 쓰는 트리**이고
 * 세 CLI(`ingest`·`scan`·`push:local`)가 전부 여기를 지난다. 전에는 `statSync`(따라간다)를 써서
 * 링크 하나로 훑기가 리포 밖으로 나갔고(`ln -s /etc x` → 남의 파일이 키 집합에 들어온다),
 * 자기 자신을 가리키면 `ELOOP`로 죽었다(`ln -s . loop`).
 *
 * 순환 검출을 `dev:ino`로 따로 두는 이유: 심링크가 아닌 **하드링크된 디렉터리**나 마운트 구성으로도
 * 같은 디렉터리에 두 번 닿을 수 있고, 그때는 `lstat`만으로 못 가른다.
 */
export function walkFiles(root: string): string[] {
  const acc: string[] = [];
  /** 이미 들어간 디렉터리의 `dev:ino`. 같은 실체에 두 번 들어가지 않는다. */
  const visited = new Set<string>();
  const visit = (dir: string): void => {
    const id = (() => {
      const st = statSync(dir);
      return `${st.dev}:${st.ino}`;
    })();
    if (visited.has(id)) return;
    visited.add(id);
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const name = entry.name;
      const full = join(dir, name);
      // `withFileTypes`는 `lstat` 기반이라 심링크가 심링크로 보인다 — 따라가지 않고 건너뛴다.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (SKIP_DIR.has(name) || name.startsWith(".")) continue;
        visit(full);
        continue;
      }
      if (!entry.isFile()) continue;
      acc.push(relative(root, full).split(sep).join("/"));
    }
  };
  visit(root);
  return acc;
}
