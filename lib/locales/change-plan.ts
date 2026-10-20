import { localeFilePath, planLocaleAdd, supportsLocaleChanges, type LocaleAddRefusal } from "./add-plan";
import type { LocaleChangeRow } from "./effects";
import type { SurfacePaths } from "@/lib/surfaces/plan";

/**
 * **언어 변경 전이 판정** — design §1 전이 표의 사용자 입력 세 줄(추가 · 제거/추가 취소 · 제거 취소)과 그 거부.
 * Publish 전달 기록·만료·수동 Sync는 사용자 입력이 아니라 이 판정을 지나지 않는다(`./publish-plan`·`./expiry`).
 *
 * 화면의 사전 차단과 서버 거부가 이 하나를 지난다. 서버는 `Project`→`TranslationSurface` 잠금 **뒤** 다시 읽은 상태로 부른다.
 *
 * ⚠️ **거부 순서**: 권한 → 보관 → 미확정 Publish → 상태 → 지문. 상태 판정이 지문보다 앞이라 낡은 지문이 "기준 언어"·"이미 제거 중"을
 * 가리지 않는다. 지문 대조 자체는 호출부가 `sameFingerprint`(timing-safe, `node:crypto`)로 하고 결과만 넘긴다 — 이 모듈은 잎이다.
 */

export type LocaleChangeRequest =
  | { kind: "add"; code: string }
  /** 활성 일반 언어면 제거 요청, ADD 행이 있으면 추가 취소다 — 화면의 버튼이 하나다(design §6). */
  | { kind: "remove"; code: string }
  | { kind: "cancel-removal"; code: string };

export type ApprovalState = "valid" | "stale" | "missing";

export type LocaleChangeInput = {
  request: LocaleChangeRequest;
  /** `project:settings` — OWNER만. */
  projectArchived: boolean;
  /** 결과 미확정 Publish(`publish-unsettled` 장벽·RUNNING 실행권)가 있다. 그 사이 변경은 PR에 stale diff를 남긴다. */
  publishUnsettled: boolean;
  surface: { id: string; adapterName: string | null; pathTemplate: string | null; baseLocale: string | null };
  locales: readonly { code: string; orphaned: boolean }[];
  /** 그 소스의 `LocaleChange` 행 — 언어당 하나. */
  changes: readonly LocaleChangeRow[];
  otherSurfaces: readonly SurfacePaths[];
  /** 서버가 잠금 뒤 재계산한 지문과 요청의 승인을 대조한 결과. 제거·추가 취소만 본다. */
  approval: ApprovalState;
};

export type LocaleTransition =
  | { kind: "add"; code: string; action: "create" | "revive"; path: string }
  | { kind: "request-removal"; code: string; path: string; discardPending: true }
  | { kind: "cancel-add"; code: string; path: string | null; discardPending: true }
  | { kind: "cancel-removal"; code: string };

export type LocaleChangeRefusal =
  | "archived"
  | "publish-unsettled"
  | LocaleAddRefusal
  | "base-locale"
  | "not-found"
  | "removal-pending"
  | "no-removal"
  | "approval-required"
  | "stale-approval";

export type LocaleChangeVerdict = { ok: true; transition: LocaleTransition } | { ok: false; error: LocaleChangeRefusal };

export function planLocaleChange(input: LocaleChangeInput): LocaleChangeVerdict {
  if (input.projectArchived) return { ok: false, error: "archived" };
  if (input.publishUnsettled) return { ok: false, error: "publish-unsettled" };
  const { request } = input;
  const row = input.changes.find(change => change.localeCode === request.code);

  if (request.kind === "cancel-removal") {
    // 포맷 지원은 보지 않는다 — 취소는 리포에 아무것도 보내지 않는 쪽으로만 움직인다.
    if (row?.operation !== "REMOVE") return { ok: false, error: "no-removal" };
    return { ok: true, transition: { kind: "cancel-removal", code: request.code } };
  }

  if (request.kind === "add") {
    if (!supportsLocaleChanges(input.surface.adapterName)) return { ok: false, error: "unsupported-format" };
    if (row?.operation === "REMOVE") return { ok: false, error: "removal-pending" };
    if (row?.operation === "ADD") return { ok: false, error: "already-active" };
    const verdict = planLocaleAdd({ code: request.code, surface: input.surface, locales: input.locales, otherSurfaces: input.otherSurfaces });
    if (!verdict.ok) return verdict;
    return { ok: true, transition: { kind: "add", code: request.code, action: verdict.action, path: verdict.path } };
  }

  // 추가 취소는 제거 취소처럼 포맷·기준 언어를 보지 않는다(R-A1 Y3) — 리포로 새로 보내는 것이 없는 축소 방향이다.
  // ADD 행은 orphan이어도(롤백 잔재) 취소할 수 있다 — 행을 지우는 쪽이다.
  const cancelAdd = row?.operation === "ADD";
  if (!cancelAdd) {
    if (!supportsLocaleChanges(input.surface.adapterName)) return { ok: false, error: "unsupported-format" };
    // 기준 언어를 모르는 소스(첫 적재 전)는 어느 언어든 기준일 수 있다 — 기준 언어 거부로 막는다.
    if (input.surface.baseLocale === null || request.code === input.surface.baseLocale) return { ok: false, error: "base-locale" };
    if (row?.operation === "REMOVE") return { ok: false, error: "removal-pending" };
    const locale = input.locales.find(candidate => candidate.code === request.code);
    if (locale === undefined || locale.orphaned) return { ok: false, error: "not-found" };
  }
  const path = input.surface.pathTemplate === null ? null : localeFilePath(input.surface.pathTemplate, request.code);
  // 취소는 파일을 만들거나 지우지 않는다. 다중 언어 파일의 glob에는 언어별 경로가 없다(#303).
  if (!cancelAdd && path === null) return { ok: false, error: "unsafe-path" };
  if (input.approval === "missing") return { ok: false, error: "approval-required" };
  if (input.approval === "stale") return { ok: false, error: "stale-approval" };
  return {
    ok: true,
    transition: cancelAdd
      ? { kind: "cancel-add", code: request.code, path, discardPending: true }
      : { kind: "request-removal", code: request.code, path: path!, discardPending: true },
  };
}

/** 기준 언어 후보 — 추가 중·제거 예정 언어는 기준이 될 수 없다(design §2 끝). orphan·없는 코드는 후보가 아니다. */
export function planBaseLocaleCandidate(
  code: string,
  state: { locales: readonly { code: string; orphaned: boolean }[]; changes: readonly LocaleChangeRow[] },
): { ok: true } | { ok: false; error: "not-found" | "locale-change-pending" } {
  const locale = state.locales.find(candidate => candidate.code === code);
  if (locale === undefined || locale.orphaned) return { ok: false, error: "not-found" };
  if (state.changes.some(change => change.localeCode === code)) return { ok: false, error: "locale-change-pending" };
  return { ok: true };
}
