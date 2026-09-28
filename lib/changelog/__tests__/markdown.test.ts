import type { Nodes, Root } from "mdast";
import { describe, expect, it } from "vitest";

import { parseMd } from "@/lib/guide/parse";

import { dropFullChangelog, imagesToLinks, shiftHeadings } from "../markdown";
import { V1_0_0, V1_0_1 } from "./fixtures";

/**
 * 릴리스 본문 mdast 손질 (design "순수 함수"). 버전 제목과 본문 `##`가 같은 `h1`이다 — 본문 제목의 바닥은 늘 `h1`이다(2026-09-28 사용자).
 * 본문 이미지는 `<img>`가 아니라 alt 글자의 링크가 된다 — CSP `img-src`와 `/privacy` 전송처를 넓히지 않는다.
 */

function run(md: string, ...fns: ((tree: Root) => void)[]): Root {
  const tree = parseMd(md);
  for (const fn of fns) fn(tree);
  return tree;
}

const depths = (tree: Root) => tree.children.flatMap((n) => (n.type === "heading" ? [n.depth] : []));

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) if (k !== "position") out[k] = strip(v);
    return out;
  }
  return node;
}

function find<T extends Nodes["type"]>(tree: Nodes, type: T): Extract<Nodes, { type: T }>[] {
  const out: Extract<Nodes, { type: T }>[] = [];
  const walk = (n: Nodes) => {
    if (n.type === type) out.push(n as Extract<Nodes, { type: T }>);
    if ("children" in n) for (const c of n.children) walk(c as Nodes);
  };
  walk(tree);
  return out;
}

describe("shiftHeadings", () => {
  it("## · ### → h1 · h2", () => {
    expect(depths(run(V1_0_1.body, shiftHeadings))).toEqual([1, 1, 2, 1]);
  });

  it("사람이 넣은 #는 그대로 h1이고 나머지도 그대로다", () => {
    expect(depths(run("# A\n\n## B\n\n### C", shiftHeadings))).toEqual([1, 2, 3]);
  });

  it("바닥이 1보다 깊으면 1로 올린다", () => {
    expect(depths(run("#### A\n\n##### B", shiftHeadings))).toEqual([1, 2]);
  });

  it("같은 폭으로 올리고 h6를 넘지 않는다", () => {
    expect(depths(run("## A\n\n#### B\n\n###### C", shiftHeadings))).toEqual([1, 3, 5]);
  });

  it("제목이 없으면 그대로다", () => {
    const before = strip(parseMd("text only"));
    expect(strip(run("text only", shiftHeadings))).toEqual(before);
  });
});

describe("dropFullChangelog", () => {
  it("마지막 문단의 **Full changelog:** 줄을 지운다", () => {
    const tree = run(V1_0_1.body, dropFullChangelog);
    expect(JSON.stringify(tree)).not.toContain("Full changelog");
    expect(tree.children.at(-1)?.type).toBe("list");
  });

  it("그 줄이 없는 본문(1.0.0)은 그대로다", () => {
    expect(strip(run(V1_0_0.body, dropFullChangelog))).toEqual(strip(parseMd(V1_0_0.body)));
  });

  it("중간 문단의 같은 줄은 건드리지 않는다", () => {
    const md = "**Full changelog:** x\n\nAfter.";
    expect(strip(run(md, dropFullChangelog))).toEqual(strip(parseMd(md)));
  });

  it("다른 강조로 시작하는 마지막 문단은 건드리지 않는다", () => {
    const md = "## Fixes\n\n**Invitation emails have tighter spacing.**";
    expect(strip(run(md, dropFullChangelog))).toEqual(strip(parseMd(md)));
  });

  it("Maintenance release 변형(merge.md)은 그 줄만 지운다", () => {
    const md = "## Highlights\n\nMaintenance release — no user-facing changes.\n\n**Full changelog:** https://github.com/SinhyeokKang/malmoi/compare/v1.0.2...v1.0.3\n";
    const tree = run(md, dropFullChangelog);
    expect(tree.children.map((n) => n.type)).toEqual(["heading", "paragraph"]);
    expect(JSON.stringify(tree)).toContain("Maintenance release");
  });

  it("그 줄만 있는 본문은 빈 트리가 된다 — 깨지지 않는다", () => {
    expect(run("**Full changelog:** https://example.com\n", dropFullChangelog).children).toEqual([]);
  });

  it("빈 본문도 깨지지 않는다", () => {
    expect(run("", dropFullChangelog).children).toEqual([]);
  });
});

describe("imagesToLinks", () => {
  it("이미지는 alt 글자의 링크가 된다", () => {
    const tree = run("See ![Settings screen](https://github.com/user-attachments/assets/abc) here.", imagesToLinks);
    expect(find(tree, "image")).toHaveLength(0);
    const [link] = find(tree, "link");
    expect(link?.url).toBe("https://github.com/user-attachments/assets/abc");
    expect(strip(link?.children)).toEqual([{ type: "text", value: "Settings screen" }]);
  });

  it("alt가 비면 URL이 글자다", () => {
    const [link] = find(run("![](https://github.com/user-attachments/assets/abc)", imagesToLinks), "link");
    expect(strip(link?.children)).toEqual([{ type: "text", value: "https://github.com/user-attachments/assets/abc" }]);
  });

  it("참조형 이미지도 링크 참조가 된다", () => {
    const tree = run("![shot][s]\n\n[s]: https://github.com/user-attachments/assets/abc", imagesToLinks);
    expect(find(tree, "imageReference")).toHaveLength(0);
    const [ref] = find(tree, "linkReference");
    expect(ref?.identifier).toBe("s");
    expect(strip(ref?.children)).toEqual([{ type: "text", value: "shot" }]);
  });
});

it("CRLF 본문이 LF 본문과 같은 트리를 낸다", () => {
  const all = [shiftHeadings, dropFullChangelog, imagesToLinks];
  const lf = run(V1_0_1.body, ...all);
  const crlf = run(V1_0_1.body.replace(/\n/g, "\r\n"), ...all);
  expect(strip(crlf)).toEqual(strip(lf));
});
