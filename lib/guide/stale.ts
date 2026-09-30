/**
 * 촬영 매핑 표(`guide/SHOOTING.md` `#shots`)의 기록 SHA와 현재 소스의 blob SHA를 견준다. 입력은 표의 셀 문자열
 * 그대로다 — `sources`는 쉼표로 가른 리포 경로, `blobs`는 같은 순서의 `git hash-object` SHA.
 *
 * **소스가 사전 키일 수도 있다**(`dict:<키 경로>`, 기준값 = `dictDigest`) — 화면 낱말은 `messages/en.tsx` 한 파일에 모여
 * 있어서, 그 파일을 소스로 걸면 아무 낱말이 바뀌어도 모든 컷이 뜨고, 안 걸면 낱말만 바뀐 컷이 영영 안 뜬다
 * (2026-09-30 `state-filter.webp`가 "Not sent"를 보인 채 목록 밖에 있었다 — ux-drift-unify T26).
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

import { createHash } from "node:crypto";

export type StaleReason = "changed" | "deleted" | "invalid" | "unrecorded" | "count-mismatch";

export type ShotRecord = { asset: string; sources: string; blobs: string };

export type StaleShot = { asset: string; reason: StaleReason; source: string | null };

const split = (cell: string): string[] =>
  cell
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");

/**
 * 리포 루트 기준 상대 경로인가. 절대경로·`..` 세그먼트·백슬래시를 거른다 — 표의 경로를 그대로 `join`하면
 * 작업 트리 밖 파일을 해시하게 되고, 그 SHA가 우연히 같으면 신선하다고 말한다.
 */
function isRepoPath(path: string): boolean {
  if (path.startsWith("/") || path.includes("\\") || /^[A-Za-z]:/.test(path)) return false;
  return !path.split("/").some((segment) => segment === "..");
}

const DICT = "dict:";

const isDictSource = (source: string): boolean => source.startsWith(DICT);

/** 점으로 이은 식별자 조각 — 빈 조각·공백이 든 키는 표의 오타다. */
const isKeyPath = (path: string): boolean => /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(path);

/** 모든 행의 리포 안 소스 경로 — 중복 없이 처음 나온 순서. 호출자가 이 경로들의 현재 SHA를 잰다. */
export function shotSources(rows: readonly ShotRecord[]): string[] {
  return [...new Set(rows.flatMap((row) => split(row.sources).filter((source) => !isDictSource(source) && isRepoPath(source))))];
}

/** 모든 행의 사전 키 경로(`dict:` 뗀 것) — 중복 없이 처음 나온 순서. 호출자가 `dict:<경로>` → `dictDigest`를 채운다. */
export function shotDictKeys(rows: readonly ShotRecord[]): string[] {
  return [...new Set(rows.flatMap((row) => split(row.sources).filter(isDictSource).map((source) => source.slice(DICT.length)).filter(isKeyPath)))];
}

const isStringTree = (value: unknown): boolean =>
  typeof value === "string" || (value !== null && typeof value === "object" && !Array.isArray(value) && Object.values(value).every(isStringTree));

/**
 * 사전 키 값의 기준값 — 문자열이면 그 문자열의 SHA-1, 문자열만 든 서브트리(메뉴 하나의 낱말들)면 그 JSON의 SHA-1이다.
 * 없는 키·함수·JSX가 섞인 값은 `null` — 호출자가 현재값에서 빼므로 `deleted`로 뜬다(기록한 낱말을 그 키에서 더는 못 찾는다).
 *
 * ⚠️ 표의 키는 남이 적은 문자열이라 `Object.hasOwn`으로만 내려간다 — `constructor`가 함수로 찾아지면 안 된다.
 * ⚠️ 서브트리의 JSON은 사전의 키 순서를 따른다 — 순서만 바꿔도 stale로 뜨는데, 메뉴 순서도 화면이라 그게 맞다.
 */
export function dictDigest(dict: unknown, path: string): string | null {
  if (!isKeyPath(path)) return null;
  let value: unknown = dict;
  for (const key of path.split(".")) {
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, key)) return null;
    value = (value as Record<string, unknown>)[key];
  }
  if (!isStringTree(value)) return null;
  return createHash("sha1").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

/**
 * `currentBlobs`에 없는 경로는 작업 트리에 없는 것이다(삭제·이동). 사전 키는 `dict:`를 붙인 그대로 키다. 행 순서를 지킨다.
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
      if (isDictSource(source) ? !isKeyPath(source.slice(DICT.length)) : !isRepoPath(source)) return [{ asset, reason: "invalid", source }];
      const current = currentBlobs.get(source);
      if (current === undefined) return [{ asset, reason: "deleted", source }];
      return current === blobs[i] ? [] : [{ asset, reason: "changed", source }];
    });
  });
}
