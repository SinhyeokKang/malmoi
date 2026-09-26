import type { Root } from "mdast";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";

import { DOC_TABLE, DOC_TABLE_HEAD, DOC_TABLE_ROW, DocTableFrame } from "@/components/public-doc-table";
import { Alert } from "@/components/ui/alert";
import { TableBody, TableHead, TableHeader, TableRow, Td } from "@/components/ui/table";
import { remarkGuide } from "@/lib/guide/remark";

import { DOC_LINK, INLINE_CODE } from "./classes";
import { CodeBlock } from "./code-block";

const PROSE = "text-prose mt-4 leading-[1.75] text-pretty";
const LIST = "text-prose mt-4 space-y-2 pl-[22px] leading-[1.75]";

type HastNode = NonNullable<ExtraProps["node"]>;

/** 요소의 글자 — 코드 블록 본문은 글자 노드 하나지만(문법 강조 없음) 규칙을 가정하지 않는다. */
function hastText(node: HastNode | HastNode["children"][number]): string {
  if (node.type === "text") return node.value;
  return "children" in node ? node.children.map(hastText).join("") : "";
}

/**
 * 문단의 유일한 자식이 이미지인가 — 그 문단은 `<p>` 없이 `<figure>`로 선다(`<p>` 안 `<figure>`는 잘못된 HTML이다).
 * 이미지는 늘 혼자 선다(게이트 `renderProblems`의 `image-inline`) — 섞인 경우를 여기서 따로 그리지 않는다.
 */
function isFigure(node: HastNode | undefined): boolean {
  const children = node?.children.filter((child) => !(child.type === "text" && child.value.trim() === "")) ?? [];
  return children.length === 1 && children[0]?.type === "element" && children[0].tagName === "img";
}

const components: Components = {
  h1: ({ node: _node, ...props }) => <h1 {...props} className="m-0 text-4xl leading-[1.3] font-semibold" />,
  // `scroll-mt-12` — 하드 해시 착지도 목차 클릭과 같은 48 아래에 선다. `tabIndex`는 remarkGuide가 싣는다.
  h2: ({ node: _node, ...props }) => (
    <h2 {...props} className="m-0 mt-14 scroll-mt-12 text-2xl leading-[1.4] font-semibold focus:outline-none" />
  ),
  h3: ({ node: _node, ...props }) => <h3 {...props} className="m-0 mt-8 scroll-mt-12 text-lg leading-[1.5] font-medium" />,
  p: ({ node, children }) => (isFigure(node) ? <>{children}</> : <p className={PROSE}>{children}</p>),
  ul: ({ node: _node, children }) => <ul className={`${LIST} list-disc`}>{children}</ul>,
  ol: ({ node: _node, children }) => <ol className={`${LIST} list-decimal`}>{children}</ol>,
  // 목록 속 문단은 항목 간격(8)이 이미 떼어 준다 — 문단의 mt 16이 겹치지 않게 첫 문단을 되누른다.
  li: ({ node: _node, children }) => <li className="[&>p:first-child]:mt-0">{children}</li>,
  // 브라우저 기본 700은 굵기 규칙(`visual-system.test.ts`) 밖이다.
  strong: ({ node: _node, children }) => <strong className="font-medium">{children}</strong>,
  hr: () => <hr className="border-border my-10" />,
  a: ({ node: _node, href = "", children, target, rel }) =>
    // 외부(`target`)는 remarkGuide가 표시한다 — 내부는 원고의 상대 `.md`가 이미 `/docs/...`로 바뀌어 있다.
    target === undefined && href.startsWith("/") ? (
      <Link href={href} className={DOC_LINK}>
        {children}
      </Link>
    ) : (
      <a href={href} target={target} rel={rel} className={DOC_LINK}>
        {children}
      </a>
    ),
  code: ({ node: _node, children }) => <code className={INLINE_CODE}>{children}</code>,
  pre: ({ node }) => {
    const code = node?.children.find((child) => child.type === "element" && child.tagName === "code");
    if (code?.type !== "element") return null;
    const filename = code.properties.dataFilename;
    // 끝 개행 하나는 펜스의 것이다 — 복사 값에 싣지 않는다.
    return <CodeBlock code={hastText(code).replace(/\n$/, "")} filename={typeof filename === "string" ? filename : null} />;
  },
  blockquote: ({ node: _node, children }) => (
    <Alert variant="info" className="mt-6 text-sm leading-[1.6] [&_p]:mt-0 [&_p]:text-sm [&_p]:leading-[1.6] [&_p+p]:mt-2">
      {children}
    </Alert>
  ),
  table: ({ node, children }) => {
    const label = node?.properties.dataLabel;
    return (
      <DocTableFrame label={typeof label === "string" ? label : ""} className={DOC_TABLE}>
        {children}
      </DocTableFrame>
    );
  },
  thead: ({ node: _node, children }) => <TableHeader>{children}</TableHeader>,
  tbody: ({ node: _node, children }) => <TableBody>{children}</TableBody>,
  tr: ({ node: _node, children }) => <TableRow className={DOC_TABLE_ROW}>{children}</TableRow>,
  th: ({ node: _node, children, style }) => (
    <TableHead scope="col" style={style} className={DOC_TABLE_HEAD}>
      {children}
    </TableHead>
  ),
  td: ({ node: _node, children, style }) => (
    <Td style={style}>
      {children}
    </Td>
  ),
  img: ({ node: _node, src, alt, title, width, height }) => <Figure src={src} alt={alt ?? ""} caption={title} width={width} height={height} />,
};

/**
 * 스크린샷 — 액자는 랜딩 목업 고정 상태(`--border-subtle` · radius 12 · `shadow-low`) · 본문 720 가득.
 * **캡션은 선택**(13 muted · 위 12) — alt는 보이는 상태, 캡션은 할 일이다. 확대 보기·로드 실패 상태 없음.
 * ⚠️ 치수(`width`·`height`)는 SHOOTING 에셋 표가 정본이다 — 렌더러가 그 값을 싣는 배선은 촬영 배치(G5)가 든다.
 */
function Figure({ src, alt, caption, width, height }: { src: ComponentProps<"img">["src"]; alt: string; caption?: string; width?: number | string; height?: number | string }) {
  return (
    <figure className="m-0 mt-6">
      {/* eslint 없음 — `next/image`를 쓰지 않는다: 원고 이미지는 `public/guide/`의 정적 WebP이고 치수는 표가 든다. */}
      <img src={typeof src === "string" ? src : undefined} alt={alt} width={width} height={height} loading="lazy" className="border-border-subtle shadow-low block h-auto w-full rounded-lg border" />
      {caption ? <figcaption className="text-muted-foreground mt-3 text-xs">{caption}</figcaption> : null}
    </figure>
  );
}

/**
 * 원고 렌더러 — **게이트와 같은 트리**(`parseMd`)를 받는다. react-markdown은 자기 파서로 빈 문자열을 읽고, 첫 플러그인이
 * 그 자리에 로더의 트리 **사본**을 꽂는다(remarkGuide가 트리를 바꾸므로 `cache`가 든 원본을 넘기지 않는다).
 *
 * ⚠️ **`urlTransform`을 덮지 않는다** — 기본값이 `javascript:` 같은 위험 스킴을 걷는다(리포가 public이라 원고 PR이 신뢰 경계다).
 * ⚠️ **`rehype-raw`가 없다** — 원고의 raw HTML은 **실행되지 않고 글자로** 나간다(`<b>`가 화면에 그대로 선다). 그래서
 * 원고에 HTML이 0이어야 하고 게이트가 막는다(`lib/guide/rules.ts`). `skipHtml`로 조용히 버리지 않는다 — 원고의 잘못이 가려진다.
 * 이미지가 문단에 혼자 서는 것·링크로 안 감싸는 것·각주 없음도 같은 게이트가 보장한다 — 이 렌더러는 그 경우를 모른다.
 */
export function GuideMarkdown({ tree, file }: { tree: Root; file: string }): ReactNode {
  const copy = structuredClone(tree);
  return (
    <Markdown remarkPlugins={[() => () => copy, [remarkGuide, { file }]]} components={components}>
      {""}
    </Markdown>
  );
}
