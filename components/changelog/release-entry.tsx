import type { Release } from "@/lib/changelog/parse";
import { releaseTagUrl } from "@/lib/links";
import { utcDay } from "@/lib/utc-time";
import { cn } from "@/lib/utils";

import { ReleaseMarkdown } from "./release-markdown";

const FOCUS = "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";

/**
 * 항목 틀 — 위 선 + 위아래 48(시안 1a는 40 — 2026-09-28 사용자가 눈으로 맞췄다). ⚠️ **첫 항목도 같다** — 소개 아래 40 뒤에 선이 한 번 서야 목록이 소개와 갈린다.
 * 실패·빈 목록·100건 문장(1c·1d)도 첫 항목 자리의 **이 틀**에 선다(`app/changelog/page.tsx`).
 */
export const ENTRY_BLOCK = "border-border border-t py-12";

/**
 * `/changelog`의 항목 하나 (시안 `Changelog.dc.html` 1a–1b) — 버전 `h1` 30/600 → 4 → 날짜 14 muted → 24 → 본문.
 * ⚠️ **버전이 `h1`이다** (2026-09-28 사용자 — 태그째 한 단계 올렸다). 페이지 제목 `Changelog`와 본문 `##`도 `h1`이라 한 문서에 `h1`이 여럿이다.
 * 틀(위 선 + 위아래 48)은 `ENTRY_BLOCK`이다.
 *
 * ⚠️ **버전 글자가 곧 그 판의 GitHub Release 링크다**(같은 날 — 옛 자기 앵커 `#v1.0.1`과 본문 아래 `View on GitHub` 버튼 대체).
 * compare가 없는 첫 판에도 서도록 Release 페이지(`releaseTagUrl`)로 간다. 버전 주소의 해시 착지·포커스는 `h1`의 `id`를 `PublicScroller`가
 * 그대로 받는다. 태그가 `v<x.y.z>`만 지나오므로(`parseReleases`) `id`로 안전하다.
 */
export function ReleaseEntry({ release }: { release: Release }) {
  const { tag, publishedAt, body } = release;
  return (
    // 이름 없는 `<section>`을 두지 않는다 (POSTMORTEM 2026-09-15) — 이름은 버전 `h1`이 댄다.
    <section aria-labelledby={tag} className={ENTRY_BLOCK}>
      {/* `scroll-mt-12` — 해시 착지가 헤더 아래 48에 선다. `tabIndex={-1}` — 착지 포커스 대상이라 링을 그리지 않는다. */}
      <h1 id={tag} tabIndex={-1} className="m-0 scroll-mt-12 text-3xl leading-[1.3] font-semibold focus:outline-none">
        {/*
          버전 글자가 곧 외부 링크다(2026-09-28 사용자 — 글리프 없음, §6.3). 행선지는 그 판의 GitHub Release이고, 옛 자기 앵커
          (`#v1.0.4`)와 본문 아래 `View on GitHub` 버튼을 함께 대체한다. 해시 착지는 `h1`의 `id`가 그대로 받는다.
        */}
        <a
          href={releaseTagUrl(tag)}
          target="_blank"
          rel="noreferrer"
          className={cn("text-primary hover:text-muted-foreground rounded-sm", FOCUS)}
        >
          {tag}
        </a>
      </h1>
      <p className="text-muted-foreground mt-1 text-sm leading-[1.6]">
        {/* 보이는 쪽은 UTC 날짜(`utcDay`), 정확한 값은 `dateTime`의 원 ISO다. UTC라는 사실은 소개 문장이 한 번 말한다. */}
        <time dateTime={publishedAt}>{utcDay(new Date(publishedAt))}</time>
      </p>
      <div className="mt-6 [&>:first-child]:mt-0">
        <ReleaseMarkdown body={body} />
      </div>
    </section>
  );
}
