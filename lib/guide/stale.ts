/**
 * 촬영 매핑 표(`guide/SHOOTING.md` `#shots`)의 기록 SHA와 현재 소스의 blob SHA를 견준다. 입력은 표의 셀 문자열
 * 그대로다 — `sources`는 쉼표로 가른 리포 경로, `blobs`는 같은 순서의 `git hash-object` SHA.
 *
 * ⚠️ 한국어 열 이름을 여기서 읽지 않는다 — `lib/`는 `no-korean-ui`가 훑는다. 열 → 필드 매핑은 표를 읽는
 * `scripts/guide-check.ts`의 몫이다.
 *
 * **git 히스토리를 보지 않는다** — 기록 시점의 SHA 하나와 작업 트리의 SHA 하나만 있으면 된다. 그래서 얕은 체크아웃·
 * 미커밋 수정에서도 같은 답을 준다(미커밋 수정도 stale이다 — 찍을 화면은 작업 트리가 그린다).
 *
 * ⚠️ `pnpm test`의 게이트가 아니다 — "화면이 바뀌었으니 다시 찍어라"는 red로 막을 일이 아니고, 찍을 수 있는 런타임이
 * 로컬뿐이다. 소비자는 `pnpm guide:check` 하나다.
 */

export type StaleReason = "changed" | "deleted" | "unrecorded" | "count-mismatch";

export type ShotRecord = { asset: string; sources: string; blobs: string };

export type StaleShot = { asset: string; reason: StaleReason; source: string | null };

const split = (cell: string): string[] =>
  cell
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");

/** 모든 행의 소스 경로 — 중복 없이 처음 나온 순서. 호출자가 이 경로들의 현재 SHA를 잰다. */
export function shotSources(rows: readonly ShotRecord[]): string[] {
  return [...new Set(rows.flatMap((row) => split(row.sources)))];
}

/**
 * `currentBlobs`에 없는 경로는 작업 트리에 없는 것이다(삭제·이동). 행 순서를 지킨다.
 */
export function staleShots(rows: readonly ShotRecord[], currentBlobs: ReadonlyMap<string, string>): StaleShot[] {
  return rows.flatMap(({ asset, ...row }): StaleShot[] => {
    const sources = split(row.sources);
    const blobs = split(row.blobs);
    // 견줄 기록이 없는 행을 신선하다고 말하지 않는다 — 소스별로 쪼개면 한 컷이 여러 줄로 부풀 뿐이다
    if (sources.length === 0 || blobs.length === 0) return [{ asset, reason: "unrecorded", source: null }];
    // 순서로 짝짓는 계약이라 개수가 어긋나면 어느 SHA가 어느 소스인지 모른다
    if (sources.length !== blobs.length) return [{ asset, reason: "count-mismatch", source: null }];
    return sources.flatMap((source, i): StaleShot[] => {
      const current = currentBlobs.get(source);
      if (current === undefined) return [{ asset, reason: "deleted", source }];
      return current === blobs[i] ? [] : [{ asset, reason: "changed", source }];
    });
  });
}
