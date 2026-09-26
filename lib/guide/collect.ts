import { posix } from "node:path";

import type { Root } from "mdast";
import { visit } from "unist-util-visit";

import { toText } from "./parse";
import { pathToSlug } from "./summary";

export type GuideLink = { url: string; text: string; line: number | null };

/** 인라인 링크와 참조 정의(`[ref]: url`)를 문서 순으로. 코드 속 `[a](b)`는 코드 노드라 안 잡힌다. */
export function collectLinks(tree: Root): GuideLink[] {
  const out: GuideLink[] = [];
  visit(tree, (node) => {
    if (node.type === "link") out.push({ url: node.url, text: toText(node), line: node.position?.start.line ?? null });
    else if (node.type === "definition") out.push({ url: node.url, text: node.label ?? node.identifier, line: node.position?.start.line ?? null });
  });
  return out;
}

export type DocLink =
  | { kind: "external" }
  | { kind: "doc"; file: string; anchor: string | null; href: string }
  | { kind: "invalid"; reason: "absolute" | "outside" | "not-markdown" | "bad-path" | "bad-anchor" };

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const ANCHOR_ID = /^[a-z0-9-]+$/;

/**
 * 원고의 링크 → 앱 경로. **원고는 상대 `.md`로만 서로를 가리킨다** — `/docs/...` 절대 경로는 파일이 없어도
 * 통과해 버려 해소 게이트를 빗나가므로 `absolute`로 막는다. 외부 URL은 판정 대상이 아니다.
 */
export function resolveDocLink(fromFile: string, href: string): DocLink {
  if (SCHEME.test(href) || href.startsWith("//")) return { kind: "external" };
  const hash = href.indexOf("#");
  const path = hash === -1 ? href : href.slice(0, hash);
  const anchor = hash === -1 || hash === href.length - 1 ? null : href.slice(hash + 1);
  if (anchor !== null && !ANCHOR_ID.test(anchor)) return { kind: "invalid", reason: "bad-anchor" };
  if (path.startsWith("/")) return { kind: "invalid", reason: "absolute" };

  let file = fromFile;
  if (path !== "") {
    if (!path.endsWith(".md")) return { kind: "invalid", reason: "not-markdown" };
    file = posix.normalize(posix.join(posix.dirname(fromFile), path));
    if (file === ".." || file.startsWith("../")) return { kind: "invalid", reason: "outside" };
  }
  const slug = pathToSlug(file);
  if (!slug) return { kind: "invalid", reason: "bad-path" };
  return { kind: "doc", file, anchor, href: `/docs${slug.map((part) => `/${part}`).join("")}${anchor ? `#${anchor}` : ""}` };
}

export type UiLabel = { text: string; line: number | null };

/** **굵게 = UI 라벨**(AUTHORING 규약). `**`·`__` 모두 `strong`이고, 코드 스팬·펜스 속 별표는 코드 노드다. */
export function collectUiLabels(tree: Root): UiLabel[] {
  const out: UiLabel[] = [];
  visit(tree, "strong", (node) => {
    out.push({ text: toText(node).trim(), line: node.position?.start.line ?? null });
  });
  return out;
}

export type ImageProblem = "src" | "empty-alt" | "reference";
export type GuideImage = { src: string; alt: string; line: number | null; problems: ImageProblem[] };

/**
 * 원고의 이미지는 **`/guide/<name>.webp` 절대경로만**이다 — `public/guide/`에 바로 커밋되고 복사 단계가 없다.
 * 상대경로는 페이지 URL 깊이에 따라 다른 곳을 가리킨다. 이름은 평평한 kebab이다(에셋 매핑 표의 키).
 *
 * 참조형(`![alt][ref]`)은 경로가 정의 쪽에 있어 해소 게이트를 빗나가므로 받지 않는다. 같은 에셋의 두 번
 * 참조는 된다. 문제는 버리지 않고 항목마다 든다 — 게이트가 한 번에 전부 보고한다.
 */
const IMAGE_SRC = /^\/guide\/[a-z0-9-]+\.webp$/;

export function collectImages(tree: Root): GuideImage[] {
  const out: GuideImage[] = [];
  visit(tree, (node) => {
    if (node.type !== "image" && node.type !== "imageReference") return;
    const alt = node.alt ?? "";
    const src = node.type === "image" ? node.url : node.identifier;
    const problems: ImageProblem[] = [];
    if (node.type === "imageReference") problems.push("reference");
    else if (!IMAGE_SRC.test(src)) problems.push("src");
    if (alt.trim() === "") problems.push("empty-alt");
    out.push({ src, alt, line: node.position?.start.line ?? null, problems });
  });
  return out;
}
