import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { dropFullChangelog, shiftHeadings } from "@/lib/changelog/markdown";

import { withImageLine } from "../release-image-note";

/**
 * **Release 본문의 이미지 줄 기입** (image-publish-workflow design §2.4). 9-b가 `pnpm` 없이 `node`로 직접 돌리므로
 * CLI는 `process.execPath`로 실제 spawn해 Node 24의 타입 제거 실행까지 같이 잰다(tsconfig가 `erasableSyntaxOnly`를 못 건다).
 */

const REF = "ghcr.io/sinhyeokkang/malmoi:v1.3.3";
const DIGEST = `sha256:${"a".repeat(64)}`;
const IMAGE = { ref: REF, digest: DIGEST };
const LINE = `**Self-hosting image:** \`${REF}@${DIGEST}\``;
const FULL = "**Full changelog:** https://github.com/o/r/compare/v1.3.2...v1.3.3";

describe("withImageLine", () => {
  it("Full changelog 문단 앞에 넣는다", () => {
    expect(withImageLine(`## Fixes\n\n- a\n\n${FULL}\n`, IMAGE)).toBe(`## Fixes\n\n- a\n\n${LINE}\n\n${FULL}\n`);
  });

  it("그 문단이 없으면 끝에 붙인다", () => {
    expect(withImageLine("## Fixes\n\n- a\n", IMAGE)).toBe(`## Fixes\n\n- a\n\n${LINE}\n`);
  });

  it("빈 본문이면 그 줄 하나", () => {
    expect(withImageLine("", IMAGE)).toBe(`${LINE}\n`);
  });

  it("1.0.0 꼴(compare 없음)은 끝에 붙인다", () => {
    expect(withImageLine("First release.\n", IMAGE)).toBe(`First release.\n\n${LINE}\n`);
  });

  it("본문이 Full changelog 문단 하나뿐이면 그 앞에 둔다", () => {
    expect(withImageLine(`${FULL}\n`, IMAGE)).toBe(`${LINE}\n\n${FULL}\n`);
  });

  it("중간의 Full changelog 줄은 꼬리로 보지 않는다", () => {
    expect(withImageLine(`${FULL}\n\nmore\n`, IMAGE)).toBe(`${FULL}\n\nmore\n\n${LINE}\n`);
  });

  it("기존 라벨 문단을 교체한다", () => {
    const old = `**Self-hosting image:** \`${REF}@sha256:${"b".repeat(64)}\``;
    expect(withImageLine(`- a\n\n${old}\n`, IMAGE)).toBe(`- a\n\n${LINE}\n`);
  });

  it("Full changelog 바로 앞의 기존 라벨 문단도 제자리에서 교체한다", () => {
    const old = "**Self-hosting image:** `stale`";
    expect(withImageLine(`- a\n\n${old}\n\n${FULL}\n`, IMAGE)).toBe(`- a\n\n${LINE}\n\n${FULL}\n`);
  });

  it("멱등이고 같은 입력은 바이트까지 같다", () => {
    for (const body of ["", "x", `- a\n\n${FULL}\n`, `- a\n\n${LINE}\n\n${FULL}`]) {
      const once = withImageLine(body, IMAGE);
      expect(withImageLine(once, IMAGE)).toBe(once);
      expect(withImageLine(body, IMAGE)).toBe(once);
    }
  });

  it("\\r\\n 입력은 \\n으로 읽고 끝 개행은 하나다", () => {
    expect(withImageLine(`- a\r\n\r\n${FULL}\r\n\r\n`, IMAGE)).toBe(`- a\n\n${LINE}\n\n${FULL}\n`);
  });

  it.each([
    ["ref 레지스트리", { ref: "docker.io/sinhyeokkang/malmoi:v1.3.3", digest: DIGEST }],
    ["ref latest", { ref: "ghcr.io/sinhyeokkang/malmoi:latest", digest: DIGEST }],
    ["ref 개행", { ref: `${REF}\n`, digest: DIGEST }],
    ["digest 길이", { ref: REF, digest: "sha256:abc" }],
    ["digest 대문자", { ref: REF, digest: `sha256:${"A".repeat(64)}` }],
    ["digest 알고리즘", { ref: REF, digest: `sha512:${"a".repeat(64)}` }],
  ])("잘못된 %s는 던진다", (_name, bad) => {
    expect(() => withImageLine("x", bad)).toThrow();
  });

  it("changelog 변환을 지나면 Full changelog는 걷히고 이미지 줄은 문단으로 남는다", () => {
    const tree = unified().use(remarkParse).use(remarkGfm).parse(withImageLine(`## Fixes\n\n- a\n\n${FULL}\n`, IMAGE));
    shiftHeadings(tree);
    dropFullChangelog(tree);
    const kinds = tree.children.map((n) => n.type);
    expect(kinds).toEqual(["heading", "list", "paragraph"]);
    const last = tree.children.at(-1);
    expect(last?.type === "paragraph" && last.children[0]?.type === "strong").toBe(true);
    expect(JSON.stringify(last)).toContain(DIGEST);
  });
});

describe("CLI", () => {
  const run = (args: string[], input: string) =>
    spawnSync(process.execPath, ["scripts/release-image-note.ts", ...args], { input, encoding: "utf8", timeout: 10_000 });
  const gh = (body: string | null) => JSON.stringify({ body });

  it("바뀌면 exit 0이고 stdout이 새 본문이다", () => {
    const r = run([REF, DIGEST], gh("- a\n"));
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(`- a\n\n${LINE}\n`);
  });

  it("같으면 exit 3이고 stdout이 비어 있다", () => {
    const r = run([REF, DIGEST], gh(`- a\n\n${LINE}\n`));
    expect(r.status).toBe(3);
    expect(r.stdout).toBe("");
  });

  it("gh의 \\r\\n·끝 개행 차이는 '같음'으로 본다", () => {
    expect(run([REF, DIGEST], gh(`- a\r\n\r\n${LINE}\r\n\r\n`)).status).toBe(3);
  });

  it.each([
    ["인자 없음", [], gh("x")],
    ["잘못된 ref", ["ghcr.io/x/y:latest", DIGEST], gh("x")],
    ["잘못된 digest", [REF, "sha256:1"], gh("x")],
    ["JSON 아님", [REF, DIGEST], "not json"],
    ["body 필드 없음", [REF, DIGEST], "{}"],
    ["body가 문자열 아님", [REF, DIGEST], '{"body":1}'],
  ])("%s는 exit 2이고 stdout이 비어 있다", (_name, args, input) => {
    const r = run(args, input);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe("");
  });

  it("body: null은 빈 문자열로 읽어 이미지 줄 하나를 낸다", () => {
    const r = run([REF, DIGEST], gh(null));
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(`${LINE}\n`);
  });

  it("gh release view --json body 모양 입력(추가 필드 포함)을 받는다", () => {
    const r = run([REF, DIGEST], JSON.stringify({ body: `## Fixes\r\n\r\n- a\r\n\r\n${FULL}\r\n`, tagName: "v1.3.3" }));
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(`## Fixes\n\n- a\n\n${LINE}\n\n${FULL}\n`);
  });
});
