import Link from "next/link";

import { DocEyebrow, DocFrame } from "@/components/docs/doc-frame";
import { DOC_LINK } from "@/components/docs/classes";
import { RequestedPath } from "@/components/docs/requested-path";
import { PublicScroller } from "@/components/public-shell/scroller";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * `/docs/*`의 404(시안 `Docs.dc.html` 1d) — **셸·내비 안**이다(이 세그먼트의 레이아웃이 감싼다). 내비 현재 표시 없음 ·
 * 목차·이전/다음 없음. `/docs` 밖 404는 이 화면을 쓰지 않는다(루트 `not-found`).
 */
export default function DocsNotFound() {
  const t = m.publicDocs.docs.notFound;
  return (
    <PublicScroller>
      <DocFrame toc={[]}>
        <DocEyebrow>{t.eyebrow}</DocEyebrow>
        <h1 className="m-0 text-4xl leading-[1.3] font-semibold">{t.title}</h1>
        <p className="text-prose mt-5 leading-[1.75] text-pretty">
          {t.body(
            <RequestedPath />,
            <Link href={routes.docs()} className={DOC_LINK}>
              {t.overview}
            </Link>,
          )}
        </p>
      </DocFrame>
    </PublicScroller>
  );
}
