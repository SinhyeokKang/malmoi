import "server-only";

import { appVersion } from "@/lib/app-version";
import { GITHUB_RELEASES_API_URL } from "@/lib/links";

import { mergeReleasePages, parseReleasePage, RELEASES_PAGE_SIZE, type Release } from "./parse";

/**
 * `/changelog`의 원문 — GitHub Releases를 **토큰 없이** `fetch`로 부른다. ⚠️ **GitHub 자격증명 셋 중 어느 것도
 * 쓰지 않는다** — installation 토큰을 끌어오면 공개 페이지가 App 설치 상태에 묶인다.
 *
 * - **캐시**: `revalidate > 0`을 명시하면 페이지가 동적(`readSession`)이어도 데이터 캐시가 요청 사이에 공유된다.
 *   Next는 `status === 200`만 저장하므로 403·5xx·타임아웃은 캐시 밖이고 다음 요청이 다시 부른다. ⚠️ 200인데 형이
 *   어긋난 응답은 1시간 캐시되어 그동안 안내가 고정된다 — 받아들였다(spec 조건 6).
 * - ⚠️ **배포마다 캐시 키가 바뀐다** (2026-09-30 사용자) — 데이터 캐시는 배포를 넘어 남고 키는 URL이라, 머지 직후에도 최대 1시간
 *   옛 목록이 섰다. 빌드가 박은 앱 버전을 `deploy=` 쿼리로 실어 새 배포의 첫 요청이 새로 가져온다(GitHub는 모르는 쿼리를 무시한다).
 *   `/merge`는 머지 직후 Release를 만들고 Vercel 빌드는 분 단위라, 새 배포가 뜰 때는 보통 그 Release가 이미 있다.
 * - **비인증 한도(60회/시간)는 Vercel 공유 egress IP 단위다** — 남의 호출과 나눈다. 걸린 동안은 빠른 403 → 안내 문장이다.
 *   원 배열이 100칸을 채우면 다음 페이지를 따라 읽으므로 캐시가 빈 진입의 호출 수는 1에서 최대 `MAX_PAGES`(3)로 는다.
 * - **페이지 상한 `MAX_PAGES`는 곧 렌더 상한이다** — 페이지가 동적(`readSession`)이라 요청마다 전 항목을 렌더하고 HTML과 RSC
 *   페이로드에 싣는다. 상한이 없으면 GitHub가 같은 100건을 되풀이할 때 루프가 끝나지 않는다.
 * - ⚠️ **시간 상한은 요청마다가 아니라 전체에 하나다** — signal을 루프 밖에서 한 번 만든다. 페이지마다 3초를 주면 "콜드 캐시 첫
 *   진입의 상한"이 페이지 수에 비례해 는다. (Next는 stale 재검증에서 signal을 떼고 부르므로 이 deadline은 포그라운드 콜드 미스에만 걸린다.)
 * - **부분 실패**: 첫 페이지가 실패하면 `{ ok: false }`(안내 문장)이고, 둘째 페이지부터는 읽은 데까지 + `truncated: true`다.
 *   합친 결과는 캐시하지 않는다 — 페이지마다 URL이 달라 각자 캐시되고, 요청마다 다시 합쳐도 캐시를 읽는 비용뿐이다.
 */

const REVALIDATE_SECONDS = 3600;
/** GitHub가 느리면 페이지가 같이 멈춘다 — 콜드 캐시 첫 진입의 **전체** 상한이다(페이지 수와 무관). */
const TIMEOUT_MS = 3000;
/** 따라 읽는 페이지 상한(원 배열 300건) — 넘으면 `truncated`고 그때 실측으로 다시 정한다. */
const MAX_PAGES = 3;

/** `truncated`: 읽지 못한 옛 판이 있을 수 있다 — 페이지 상한에 닿았거나 둘째 페이지부터 실패했다. */
export type LoadedReleases = { ok: true; releases: Release[]; truncated: boolean } | { ok: false };

/** ⚠️ 던지지 않는다 — 공개 페이지가 GitHub 장애로 에러 경계에 가지 않는다. */
export async function loadReleases(): Promise<LoadedReleases> {
  const deadline = AbortSignal.timeout(TIMEOUT_MS);
  const pages: Release[][] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const parsed = await fetchPage(page, deadline);
    if (parsed === null) {
      if (page === 1) return { ok: false };
      return { ok: true, releases: mergeReleasePages(pages), truncated: true };
    }
    pages.push(parsed.releases);
    if (!parsed.full) return { ok: true, releases: mergeReleasePages(pages), truncated: false };
  }
  return { ok: true, releases: mergeReleasePages(pages), truncated: true };
}

/** 한 페이지 — 실패(던짐 · `!ok` · json 실패 · 형 오류)는 warn 한 줄을 남기고 `null`이다. */
async function fetchPage(page: number, signal: AbortSignal): Promise<{ releases: Release[]; full: boolean } | null> {
  let res: Response;
  try {
    const version = appVersion();
    res = await fetch(
      `${GITHUB_RELEASES_API_URL}?per_page=${RELEASES_PAGE_SIZE}&page=${page}${version === "" ? "" : `&deploy=${encodeURIComponent(version)}`}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "malmoi-changelog",
        },
        next: { revalidate: REVALIDATE_SECONDS },
        signal,
      },
    );
  } catch {
    return fail(page, null, null);
  }
  const remaining = res.headers.get("x-ratelimit-remaining");
  if (!res.ok) return fail(page, res.status, remaining);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return fail(page, res.status, remaining);
  }
  return parseReleasePage(body) ?? fail(page, res.status, remaining);
}

/** 로그엔 페이지 번호와 상태와 남은 한도만 — 응답 본문·오류 메시지는 싣지 않는다(한도 메시지에 egress IP가 든다). */
function fail(page: number, status: number | null, rateLimitRemaining: string | null): null {
  console.warn("[changelog] GitHub releases unavailable", { page, status, rateLimitRemaining });
  return null;
}
