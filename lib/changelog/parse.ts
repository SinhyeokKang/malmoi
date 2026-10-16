import { z } from "zod";

/**
 * GitHub Releases API 응답 → 화면에 설 앱 릴리스. **원문의 정본은 GitHub Release**라 소스에 사본을 두지 않고,
 * 여기서 검증 · 거르기 · 정렬만 한다.
 */

/** 한 요청 상한(GitHub `per_page` 최댓값) — 로더가 싣고, 원 배열이 이만큼 차면 다음 페이지가 있을 수 있다고 본다. */
export const RELEASES_PAGE_SIZE = 100;

/** 앱 태그만 — 같은 리포의 액션 태그(`malmoi-i18n-push-vN`)는 별개 축이다. 이 패턴이 태그를 `id`로 쓸 수 있게도 보장한다. */
const APP_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

const Schema = z.array(
  z.object({
    tag_name: z.string(),
    published_at: z.iso.datetime().nullable(),
    body: z.string().nullable(),
    draft: z.boolean(),
    prerelease: z.boolean(),
  }),
);

export type Release = { tag: string; publishedAt: string; body: string };

function semver(tag: string): [number, number, number] {
  const m = APP_TAG.exec(tag);
  return [Number(m?.[1]), Number(m?.[2]), Number(m?.[3])];
}

/** 같은 시각이면 semver **숫자** 내림차순 — 문자열 비교는 `v1.0.9`를 `v1.0.10` 앞에 둔다. 결정성을 위해 끝까지 판정한다. */
function newestFirst(a: Release, b: Release): number {
  const byTime = Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  if (byTime !== 0) return byTime;
  const [x, y] = [semver(a.tag), semver(b.tag)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (y[i] ?? 0) - (x[i] ?? 0);
  return 0;
}

/**
 * 한 페이지 — 형이 어긋나면 `null`(실패)이고 빈 배열(아직 릴리스 없음)과 구별한다. 정렬은 하지 않는다(합친 뒤 한 번 —
 * `mergeReleasePages`). `full`은 **거르기 전** 길이가 상한을 채웠는가다 — 액션 태그 릴리스도 같은 100칸을 쓰므로
 * 거른 뒤 0건이어도 다음 페이지에 앱 태그가 있을 수 있다.
 */
export function parseReleasePage(json: unknown): { releases: Release[]; full: boolean } | null {
  const parsed = Schema.safeParse(json);
  if (!parsed.success) return null;
  const releases = parsed.data.flatMap((r): Release[] =>
    !r.draft && !r.prerelease && r.published_at !== null && APP_TAG.test(r.tag_name)
      ? [{ tag: r.tag_name, publishedAt: r.published_at, body: r.body ?? "" }]
      : [],
  );
  return { releases, full: parsed.data.length >= RELEASES_PAGE_SIZE };
}

/**
 * 여러 페이지 → 화면 목록. 태그로 중복을 걷고(먼저 나온 것을 남긴다) 합친 뒤 한 번 정렬한다 — GitHub 응답 순서(생성 순)와
 * 화면 순서(`published_at` → semver)가 달라 페이지 안 정렬만으로는 경계에서 순서가 틀린다. 중복은 페이지마다 따로 캐시되어
 * 뒤 페이지만 새것일 때 경계 항목이 두 번 나오는 경우의 안전망이다(같은 `id`가 둘이 되면 해시 착지 대상이 모호하다).
 */
export function mergeReleasePages(pages: Release[][]): Release[] {
  const byTag = new Map<string, Release>();
  for (const page of pages) for (const r of page) if (!byTag.has(r.tag)) byTag.set(r.tag, r);
  return [...byTag.values()].sort(newestFirst);
}
