import { z } from "zod";

/**
 * GitHub Releases API 응답 → 화면에 설 앱 릴리스. **원문의 정본은 GitHub Release**라 소스에 사본을 두지 않고,
 * 여기서 검증 · 거르기 · 정렬만 한다.
 */

/** 한 요청 상한 — 로더가 `per_page`로 싣고, 원 배열이 이만큼 차면 그 너머가 있다고 본다(페이지네이션 없음). */
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

/** 형이 어긋나면 `null`(실패) — 빈 배열(아직 릴리스 없음)과 구별한다. */
export function parseReleases(json: unknown): { releases: Release[]; truncated: boolean } | null {
  const parsed = Schema.safeParse(json);
  if (!parsed.success) return null;
  const releases = parsed.data
    .flatMap((r): Release[] =>
      !r.draft && !r.prerelease && r.published_at !== null && APP_TAG.test(r.tag_name)
        ? [{ tag: r.tag_name, publishedAt: r.published_at, body: r.body ?? "" }]
        : [],
    )
    .sort(newestFirst);
  // 거르기 전 길이로 잰다 — 액션 태그 릴리스도 같은 100칸을 쓴다.
  return { releases, truncated: parsed.data.length >= RELEASES_PAGE_SIZE };
}
