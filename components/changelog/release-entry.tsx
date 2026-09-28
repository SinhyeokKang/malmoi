import { GithubIcon } from "@/components/signin/brand-icons";
import { buttonClass } from "@/components/ui/button";
import type { Release } from "@/lib/changelog/parse";
import { m } from "@/lib/i18n";
import { releaseTagUrl } from "@/lib/links";
import { utcDay } from "@/lib/utc-time";
import { cn } from "@/lib/utils";

import { ReleaseMarkdown } from "./release-markdown";

const FOCUS = "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";

/**
 * 항목 틀 — 위 선 + 위아래 40 (시안 1a). ⚠️ **첫 항목도 같다** — 소개 아래 40 뒤에 선이 한 번 서야 목록이 소개와 갈린다.
 * 실패·빈 목록·100건 문장(1c·1d)도 첫 항목 자리의 **이 틀**에 선다(`app/changelog/page.tsx`).
 */
export const ENTRY_BLOCK = "border-border border-t py-10";

/**
 * `/changelog`의 항목 하나 (시안 `Changelog.dc.html` 1a–1b) — 버전 `h2` 24/600 → 8 → 날짜 14 muted → 32 → 본문 → `View on GitHub`.
 * 틀(위 선 + 위아래 40)은 `ENTRY_BLOCK`이다.
 *
 * ⚠️ **버전 앵커는 자기 자신을 가리키는 네이티브 `<a href="#v1.0.1">`다** — 하드 진입의 해시 착지·포커스는 `PublicScroller`가
 * 이미 한다(시안의 `replaceState` + JS 스크롤은 쓰지 않는다). 태그가 `v<x.y.z>`만 지나오므로(`parseReleases`) `id`로 안전하다.
 * 링크 색은 `foreground` 그대로다 — 본문 링크 파랑이 아니다.
 *
 * ⚠️ **`View on GitHub`는 `<a>` + `buttonClass`다** — `ButtonLink`는 `next/link`라 외부에 쓰지 않는다(랜딩 GitHub CTA와 같은 형).
 * compare가 없는 첫 판에도 서도록 그 판의 Release 페이지(`releaseTagUrl`)로 간다.
 */
export function ReleaseEntry({ release }: { release: Release }) {
  const { tag, publishedAt, body } = release;
  return (
    // 이름 없는 `<section>`을 두지 않는다 (POSTMORTEM 2026-09-15) — 이름은 버전 `h2`가 댄다.
    <section aria-labelledby={tag} className={ENTRY_BLOCK}>
      {/* `scroll-mt-12` — 해시 착지가 헤더 아래 48에 선다. `tabIndex={-1}` — 착지 포커스 대상이라 링을 그리지 않는다. */}
      <h2 id={tag} tabIndex={-1} className="m-0 scroll-mt-12 text-2xl leading-[1.4] font-semibold focus:outline-none">
        {/* hover는 글자색만 muted로 — 버전 글자가 누를 수 있는 앵커라는 유일한 신호다(시안 1b). */}
        <a href={`#${tag}`} className={cn("hover:text-muted-foreground rounded-sm", FOCUS)}>
          {tag}
        </a>
      </h2>
      <p className="text-muted-foreground mt-2 text-sm leading-[1.6]">
        {/* 보이는 쪽은 UTC 날짜(`utcDay`), 정확한 값은 `dateTime`의 원 ISO다. UTC라는 사실은 소개 문장이 한 번 말한다. */}
        <time dateTime={publishedAt}>{utcDay(new Date(publishedAt))}</time>
      </p>
      <div className="mt-8 [&>:first-child]:mt-0">
        <ReleaseMarkdown body={body} />
      </div>
      <a
        href={releaseTagUrl(tag)}
        target="_blank"
        rel="noreferrer"
        aria-label={m.changelog.viewOnGithubLabel(tag)}
        className={cn(buttonClass({ variant: "default", size: "md" }), "mt-8", FOCUS)}
      >
        <GithubIcon />
        {m.changelog.viewOnGithub}
      </a>
    </section>
  );
}
