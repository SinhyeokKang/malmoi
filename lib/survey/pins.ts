/**
 * 코퍼스 리포의 커밋 고정 — `owner/repo` → 40자 SHA 맵의 읽기·쓰기.
 *
 * 고정이 없으면 survey가 매번 상류 최신 HEAD를 받아 리포별 결과를 회귀 비교에 쓸 수 없다. 형식은 사이드카 JSON이라
 * 기존 리포 목록(`repos*.txt`)이 그대로 쓰인다.
 */
import type { RepoSurvey } from "./types";

/** 전체 SHA만 받는다 — 약식·브랜치 이름은 시점이 움직이고, `-`로 시작하는 값은 git 옵션으로 읽힌다. */
export const PIN_SHA = /^[0-9a-f]{40}$/;

export function parsePins(json: string): Map<string, string> {
  const raw: unknown = JSON.parse(json);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("pins 파일은 {\"owner/repo\": \"<40자 sha>\"} 객체여야 한다");
  }
  const out = new Map<string, string>();
  for (const [repo, sha] of Object.entries(raw)) {
    if (typeof sha !== "string" || !PIN_SHA.test(sha)) throw new Error(`pins: ${repo}의 값이 40자 hex SHA가 아니다`);
    out.set(repo, sha);
  }
  return out;
}

/** 실패한 리포는 고정할 커밋이 없다 — 기록하지 않는다. 키 순서를 정렬해 파일이 결정적이다. */
export function pinsFromSurveys(surveys: readonly RepoSurvey[]): Record<string, string> {
  const out: Record<string, string> = Object.create(null) as Record<string, string>;
  const ok = surveys.filter((s) => s.failure === undefined && s.commit !== undefined);
  for (const s of [...ok].sort((a, b) => (a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : 0))) out[s.repo] = s.commit!;
  return out;
}
