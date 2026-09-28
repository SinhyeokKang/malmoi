import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ReleaseEntry } from "@/components/changelog/release-entry";
import { DOC_LINK, PROSE } from "@/components/docs/classes";
import { PublicShell } from "@/components/public-shell/public-shell";
import { publicCta } from "@/lib/auth/landing";
import { readSession } from "@/lib/auth/read-session";
import { loadReleases } from "@/lib/changelog/load";
import { m } from "@/lib/i18n";
import { GITHUB_RELEASES_URL } from "@/lib/links";
import { pageMetadata } from "@/lib/seo/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = pageMetadata({ title: m.changelog.title, description: m.changelog.description, path: "/changelog" });

/** 안내 문장 넷이 모두 받는 GitHub Releases 링크 — 새 탭 + `noreferrer`(공개 셸의 외부 링크 규칙). */
const releases: ReactNode = (
  <a href={GITHUB_RELEASES_URL} target="_blank" rel="noreferrer" className={DOC_LINK}>
    {m.changelog.releases}
  </a>
);

/**
 * **공개 셸 안의 릴리스 노트** (시안 `Changelog.dc.html` 1a–1d). 원문의 정본은 GitHub Release이고 소스에 사본이 없다 —
 * `loadReleases`가 1시간 캐시로 읽는다.
 *
 * ⚠️ **본문은 사전을 지나지 않는다** — 화면 문구가 아니라 외부 데이터라서다(그 원문의 계약은 `/merge` 5단계 ② 양식).
 * ⚠️ **인가를 지나지 않는다** — 로그인 없이 읽혀야 한다(`entry-points.test.ts`의 `EXEMPT`). 세션은 헤더 primary 하나 때문이다.
 * ⚠️ **GitHub가 실패해도 페이지는 선다** — 실패·빈 목록은 첫 항목 자리의 문장 하나다(`Alert`·재시도 없음 — 실패는 캐시되지
 * 않으니 새로고침이 곧 재시도다).
 *
 * ⚠️ **읽기 그릇은 `mx-auto max-w-[800px]` 한 겹이다** — 목차가 없어 `/docs`·`/privacy`의 720 + 목차 200 격자를 따르면
 * 빈 열이 남아 본문이 왼쪽으로 쏠린다. 위 64는 이웃 `/docs`와 같다.
 */
export default async function Changelog() {
  const [session, loaded] = await Promise.all([readSession(), loadReleases()]);

  return (
    <PublicShell cta={publicCta(session.status)} current="changelog">
      <div className="mx-auto max-w-[800px] px-10 pt-16 pb-30">
        <h1 className="m-0 text-4xl leading-[1.3] font-semibold">{m.changelog.title}</h1>
        <p className={cn(PROSE, "mt-5")}>{m.changelog.intro(releases)}</p>
        <div className="mt-10">
          {!loaded.ok ? (
            <p className={cn(PROSE, "mt-0")}>{m.changelog.failed(releases)}</p>
          ) : loaded.releases.length === 0 ? (
            <p className={cn(PROSE, "mt-0")}>{m.changelog.empty(releases)}</p>
          ) : (
            <>
              {loaded.releases.map((release) => (
                <ReleaseEntry key={release.tag} release={release} />
              ))}
              {/* 마지막 항목의 아래 40이 이미 떼어 준다. */}
              {loaded.truncated ? <p className={cn(PROSE, "mt-0")}>{m.changelog.truncated(releases)}</p> : null}
            </>
          )}
        </div>
      </div>
    </PublicShell>
  );
}
