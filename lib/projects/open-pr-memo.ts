import { PROBE_MEMO_MAX, PROBE_MEMO_TTL_MS } from "@/lib/github-connect/probe-memo";

/**
 * **Home의 열린 PR 조회를 짧게 기억한다** (ux-drift-unify U15 — T18 실측: 편집 0인 프로젝트는 Home 착지·`?event=` 상세마다
 * GitHub 2회였다 — 리포 신원 + PR 목록). 연결 확인 메모(`probe-memo.ts`)와 같은 TTL·상한·모양이다.
 *
 * ⚠️ **Home 표시에만 쓴다** — 보류를 **말하는** 자리이지 판정하는 자리가 아니다. 게이트(`/api/push`·야간·Publish 미리보기·Sync 확인·
 * 설정·MCP)는 `loadOpenPrUrl`을 그대로 불러 언제나 실물을 본다. 거기서 옛 "없음"을 쓰면 fail-closed가 깨진다.
 *
 * ⚠️ **PR 상태를 바꿀 수 있는 실행이 그 프로젝트의 항목을 지운다**(`forgetOpenPr`) — Publish(`runSync`)가 PR을 열고, 수동 Sync는
 * 머지 뒤 사람이 누르는 다음 버튼이다. 안 지우면 방금 연 PR을 TTL 동안 "보류 없음"으로 말한다. ⚠️ **대가: GitHub에서 직접 머지·닫은
 * PR은 TTL 동안 여전히 열린 것으로 말한다** — 앱이 그 순간을 모르므로 TTL이 그 차이의 상한이다.
 *
 * ⚠️ **모름(`undefined`)은 기억하지 않는다** — 화면에서 `pr-check-failed`(보류)로 서므로 일시 장애를 TTL 동안 붙잡게 된다. 기억하면
 * 장애 중 착지의 GitHub 호출은 줄지만 스트리밍이라 본문을 막지 않고, 회복은 다음 착지에 바로 보인다 — 짧게라도 기억할 이득이 없다.
 * ⚠️ **인스턴스마다 갈린다** — 지우기도 그 인스턴스 안에서만이다. 웹 Publish는 같은 요청의 재렌더가 Home을 그리므로 지운 인스턴스가 본다.
 */
export const OPEN_PR_MEMO_TTL_MS = PROBE_MEMO_TTL_MS;
export const OPEN_PR_MEMO_MAX = PROBE_MEMO_MAX;

type Identity = { repoOwner: string; repoName: string; installationId: string | null; repositoryId: string | null };

export function createOpenPrMemo({ ttlMs, max }: { ttlMs: number; max: number }) {
  /**
   * ⚠️ **키에 slug와 저장된 신원이 다 든다** — sync 브랜치가 slug에서 나오므로 같은 리포의 다른 프로젝트는 다른 PR이고, Reconnect로
   * 설치·리포 id가 바뀌면 옛 답이 새 연결의 것이 아니다. JSON 배열이라 `/`가 든 이름끼리 겹치지 않는다.
   */
  const entries = new Map<string, { slug: string; at: number; value: string | null }>();
  // 조회가 도는 동안 `forget`이 불렸는지 — Publish 전에 출발한 조회의 "없음"이 PR 생성 뒤에 자리를 차지하지 않게 한다.
  let epoch = 0;

  return {
    async load(slug: string, project: Identity, lookup: () => Promise<string | null | undefined>, now: number = Date.now()): Promise<string | null | undefined> {
      const key = JSON.stringify([slug, project.repoOwner, project.repoName, project.installationId, project.repositoryId]);
      const hit = entries.get(key);
      if (hit !== undefined && now - hit.at < ttlMs) return hit.value;
      const started = epoch;
      const value = await lookup();
      // 다시 넣어 삽입 순서를 갱신한다 — 버리는 쪽이 "가장 오래 전에 확인한 것"이 된다.
      entries.delete(key);
      if (value !== undefined && started === epoch) {
        entries.set(key, { slug, at: now, value });
        for (const oldest of entries.keys()) {
          if (entries.size <= max) break;
          entries.delete(oldest);
        }
      }
      return value;
    },
    forget(slug: string): void {
      epoch += 1;
      for (const [key, entry] of entries) if (entry.slug === slug) entries.delete(key);
    },
  };
}

/** 모듈 수명의 인스턴스 하나 — 조회는 `loadOpenPrUrlMemo`(`open-pr.ts`)만, 지우기는 `forgetOpenPr`만 만진다(`open-pr-memo.test.ts` 배선). */
export const homeOpenPrMemo = createOpenPrMemo({ ttlMs: OPEN_PR_MEMO_TTL_MS, max: OPEN_PR_MEMO_MAX });

export function forgetOpenPr(slug: string): void {
  homeOpenPrMemo.forget(slug);
}
