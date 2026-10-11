import type { Metadata } from "next";

import { Link as InlineLink } from "@/components/ui/link";


import { PAGE_TITLE } from "@/components/docs/classes";
import { DocEyebrow, DocFrame } from "@/components/docs/doc-frame";

import { RequestedPath } from "@/components/docs/requested-path";
import { PublicScroller } from "@/components/public-shell/scroller";
import { getMessages } from "@/lib/i18n/server";
import { routes } from "@/lib/routes";
import { en } from "@/messages/en";

/**
 * ⚠️ **첫 HTTP 응답의 `<title>`은 이 값이다** — 페이지가 던진 `notFound()`를 Next 16이 오류 복구 셸(`<html id="__next_error__">`)로
 * 다시 그리며 metadata를 이 파일에서 읽는다. 페이지 `generateMetadata`의 404 제목은 클라이언트 이동의 제목이라 둘 다 둔다.
 * 메타는 en이다(페이지 `generateMetadata`와 같은 이유 — 크롤러는 쿠키가 없다). (audit 18)
 */
export const metadata: Metadata = { title: en.publicDocs.docs.notFound.title };

/**
 * `/docs/*`의 404(시안 `Docs.dc.html` 1d) — **셸·내비 안**이다(이 세그먼트의 레이아웃이 감싼다). 내비 현재 표시 없음 ·
 * 목차·이전/다음 없음. `/docs` 밖 404는 이 화면을 쓰지 않는다(루트 `not-found`).
 *
 * ⚠️ **첫 HTTP 응답의 `<body>`는 비어 있고 이 화면은 hydration 뒤에 선다**(audit 18 미해결) — 위 오류 복구 셸은 본문을 그리지 않고
 * 원래 Flight만 싣는다. 셸 밖 Suspense 안에서 던지면 본문은 SSR되지만 상태가 200이 되고, `dynamicParams = false`도 같은 셸이다.
 */
export default async function DocsNotFound() {
  const m = await getMessages();
  const t = m.publicDocs.docs.notFound;
  return (
    <PublicScroller>
      <DocFrame m={m} toc={[]}>
        <DocEyebrow>{t.eyebrow}</DocEyebrow>
        <h1 className={PAGE_TITLE}>{t.title}</h1>
        <p className="text-prose mt-5 leading-[1.75] text-pretty">
          {t.body(
            <RequestedPath />,
            <InlineLink href={routes.docs()} >
              {t.overview}
            </InlineLink>,
          )}
        </p>
      </DocFrame>
    </PublicScroller>
  );
}
