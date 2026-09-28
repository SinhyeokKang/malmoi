import "server-only";

import { GITHUB_RELEASES_API_URL } from "@/lib/links";

import { parseReleases, RELEASES_PAGE_SIZE, type Release } from "./parse";

/**
 * `/changelog`의 원문 — GitHub Releases를 **토큰 없이** `fetch`로 부른다. ⚠️ **GitHub 자격증명 셋 중 어느 것도
 * 쓰지 않는다** — installation 토큰을 끌어오면 공개 페이지가 App 설치 상태에 묶인다.
 *
 * - **캐시**: `revalidate > 0`을 명시하면 페이지가 동적(`readSession`)이어도 데이터 캐시가 요청 사이에 공유된다.
 *   Next는 `status === 200`만 저장하므로 403·5xx·타임아웃은 캐시 밖이고 다음 요청이 다시 부른다. ⚠️ 200인데 형이
 *   어긋난 응답은 1시간 캐시되어 그동안 안내가 고정된다 — 받아들였다(spec 조건 6).
 * - **비인증 한도(60회/시간)는 Vercel 공유 egress IP 단위다** — 남의 호출과 나눈다. 걸린 동안은 빠른 403 → 안내 문장이다.
 */

const REVALIDATE_SECONDS = 3600;
/** GitHub가 느리면 페이지가 같이 멈춘다 — 콜드 캐시 첫 진입의 상한이다. */
const TIMEOUT_MS = 3000;

export type LoadedReleases = { ok: true; releases: Release[]; truncated: boolean } | { ok: false };

/** ⚠️ 던지지 않는다 — 공개 페이지가 GitHub 장애로 에러 경계에 가지 않는다. */
export async function loadReleases(): Promise<LoadedReleases> {
  let res: Response;
  try {
    res = await fetch(`${GITHUB_RELEASES_API_URL}?per_page=${RELEASES_PAGE_SIZE}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "malmoi-changelog",
      },
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return fail(null, null);
  }
  const remaining = res.headers.get("x-ratelimit-remaining");
  if (!res.ok) return fail(res.status, remaining);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return fail(res.status, remaining);
  }
  const parsed = parseReleases(body);
  return parsed === null ? fail(res.status, remaining) : { ok: true, ...parsed };
}

/** 로그엔 상태와 남은 한도만 — 응답 본문·오류 메시지는 싣지 않는다(한도 메시지에 egress IP가 든다). */
function fail(status: number | null, rateLimitRemaining: string | null): { ok: false } {
  console.warn("[changelog] GitHub releases unavailable", { status, rateLimitRemaining });
  return { ok: false };
}
