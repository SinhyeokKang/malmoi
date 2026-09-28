import type { ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { DOC_LINK, INLINE_CODE, LIST, MINOR_HEADING, PROSE, SECTION_HEADING, SUB_HEADING } from "@/components/docs/classes";
import { dropFullChangelog, imagesToLinks, shiftHeadings } from "@/lib/changelog/markdown";

/**
 * 스킴이 있거나 `//`로 시작하면 외부다 — 원고 판정(`lib/guide/collect.ts`의 `resolveDocLink`)과 같은 기준이다.
 * `http(s):`만 보면 프로토콜 상대 `//host/x`가 같은 탭 · referrer 포함으로 나간다.
 */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const isExternal = (href: string) => SCHEME.test(href) || href.startsWith("//");

/**
 * 제목 급 — 버전이 `h1`이라 본문 `##`도 `h1`이다(`shiftHeadings`). 모양은 공개 문서 공통 급(`components/docs/classes.ts`)이고
 * `h4`~`h6`만 이 화면이 정한 급이다(16/1.6/500 · 위 16 — 원고엔 `h4`가 없다). 정하지 않으면 브라우저 기본 700이 나와 굵기 규칙 밖이다.
 */
const DEEP = "text-prose m-0 mt-4 leading-[1.6] font-medium";

const components: Components = {
  h1: ({ node: _node, children }) => <h1 className={SECTION_HEADING}>{children}</h1>,
  h2: ({ node: _node, children }) => <h2 className={SUB_HEADING}>{children}</h2>,
  h3: ({ node: _node, children }) => <h3 className={MINOR_HEADING}>{children}</h3>,
  h4: ({ node: _node, children }) => <h4 className={DEEP}>{children}</h4>,
  h5: ({ node: _node, children }) => <h5 className={DEEP}>{children}</h5>,
  h6: ({ node: _node, children }) => <h6 className={DEEP}>{children}</h6>,
  p: ({ node: _node, children }) => <p className={PROSE}>{children}</p>,
  ul: ({ node: _node, children }) => <ul className={`${LIST} list-disc`}>{children}</ul>,
  ol: ({ node: _node, children }) => <ol className={`${LIST} list-decimal`}>{children}</ol>,
  // `text-pretty` — 굵은 머리 + 긴 문장 한 항목이라 마지막 줄에 낱말 하나가 떨어지기 쉽다(시안 1a).
  li: ({ node: _node, children }) => <li className="text-pretty [&>p:first-child]:mt-0">{children}</li>,
  strong: ({ node: _node, children }) => <strong className="font-medium">{children}</strong>,
  code: ({ node: _node, children }) => <code className={INLINE_CODE}>{children}</code>,
  hr: () => <hr className="border-border my-10" />,
  // 원고와 달리 hProperties를 싣는 플러그인이 없다 — 외부 판정을 여기서 한다.
  a: ({ node: _node, href = "", children }) =>
    isExternal(href) ? (
      <a href={href} target="_blank" rel="noreferrer" className={DOC_LINK}>
        {children}
      </a>
    ) : (
      <a href={href} className={DOC_LINK}>
        {children}
      </a>
    ),
};

/**
 * 릴리스 본문 렌더러 — GitHub Release 원문(`/merge` 5단계 ② 양식)을 그린다. **원문이 외부 데이터라 이 렌더러가 방어선이다.**
 *
 * ⚠️ **`rehype-raw`가 없다** — raw HTML은 요소가 아니라 글자로 선다. ⚠️ **`urlTransform`을 덮지 않는다** — 기본값이
 * `javascript:` 같은 위험 스킴을 걷는다. ⚠️ **이미지는 `<img>`로 그리지 않는다**(`imagesToLinks`) — CSP `img-src`와
 * `/privacy`의 전송처를 넓히지 않는다.
 *
 * ⚠️ **`GuideMarkdown`을 재사용하지 않는다** — 그쪽은 스크린샷 크기 표·원고 게이트 같은 가이드 원고 전용 전제를 든다.
 * 공유하는 것은 클래스 상수(`components/docs/classes.ts`)뿐이다.
 */
export function ReleaseMarkdown({ body }: { body: string }): ReactNode {
  return (
    <Markdown remarkPlugins={[remarkGfm, () => shiftHeadings, () => dropFullChangelog, () => imagesToLinks]} components={components}>
      {body}
    </Markdown>
  );
}
