import type { PullWarning } from "@/lib/pull/run";
import type { OpenImportPr } from "@/lib/import/confirm";
import type { PublishDiff } from "./diff";
/** `keys`는 **미발송 전체**의 키 수다 — 표에 실린 행이 아니라 바닥 요약이 드는 값이다. */
/**
 * `withoutFile`은 **pull이 쓰지 않아 표에서 뺀 셀 수**다 — 수술적 per-locale 어댑터의 원본 파일이 base에 없다
 * (`render.ts`의 `original-file-missing`). `truncated`(상한 밖)와 섞지 않는다 (launch-readiness L3.7).
 */
/**
 * `withoutKey`는 ts-dict 로케일 객체에 **자리가 없는** 키의 셀 수다(`write-slot-missing` — 실행이 그 셀만 보류한다, delivery-invariants D3).
 * 두 수는 실행 결과의 `withheld.file`·`withheld.key`와 같은 판정이다 — 단 이 표가 읽는 pending 200행 안에서만 같다(`truncated`와 같이 읽힌다).
 */
export type PublishPreview = PublishDiff & {
  openPr: OpenImportPr; keys: number; withoutFile: number; withoutKey: number;
  /**
   * **이 Publish가 바꾸는 파일** (#128) — 실행과 같은 렌더·blob 비교(`renderProject`)의 결과라 결과 화면의 "N files changed"와 같다. `groups`는 편집이
   * 사는 파일이라 이보다 적을 수 있다 — 토큰 없이 바뀌는 파일(orphan 줄 제거, 앞서 닫힌 PR에 실렸던 값)이 여기에만 있다.
   */
  changedFiles: string[];
  /** 실제로 나가는 편집·키 수 (#84). 제목·요약·PR 줄·실행 진행 제목이 이 수로 말한다 — `total`·`keys`는 보류를 포함한 미발송 전체다. */
  sendable: { total: number; keys: number };
  /**
   * **Publish 지문** (mcp-connector design §3.1) — MCP `publish`가 `expectedFingerprint`로 돌려주면 실행이 실행권 뒤 같은 입력으로 대조해 다르면
   * `reconfirm`이다. 웹 Publish는 쓰지 않는다. 상태 digest라 비밀이 아니다(편집 토큰 원문은 해시 안에만 있다).
   */
  fingerprint: string;
};
/**
 * 미리보기 조회의 결과. **거부(`rejected`)와 읽기 실패(`failed`)가 갈린다** (launch-readiness L3.3) — 거부는 실행 전
 * 거부(`1h`)로, 실패만 `1k`의 Retry로 그린다. `error`는 `triggerPullAction`의 실행 전 거부와 같은 낱말이다.
 */
/**
 * **base 언어 파일이 설정된 경로·브랜치에 없다** (delivery-invariants D3 · coordinator review r1 — 사용자 결정). 실행이 `writer-warnings`로 거부하는
 * 상태라 미리보기도 약속하지 않는다. 읽기 실패(`failed` → Try again)가 아니라 **이유가 있는 거부**다 — 다시 눌러도 같은 거부다(L3.3).
 * ⚠️ 잎 모듈이라 서버 조회(`read.ts`)와 Action(`publish-actions.ts`)이 같은 클래스를 본다.
 */
export class PreviewBaseFileMissing extends Error {
  override readonly name = "PreviewBaseFileMissing";
  constructor(readonly path: string, readonly branch: string) { super("Preview base file missing"); }
}
/**
 * **base 언어 파일을 읽을 수 없다** (B3 r3 — B3.4). 재생성 per-locale 표면은 base 원본으로 base 키 집합을 정하므로 실행이 `write-parse-failed`로
 * 거부한다 — 비-base 편집만 있어도 그렇다. 부재와 같은 "이유가 있는 거부"이고 고칠 곳이 다르다(파일을 고친다).
 */
export class PreviewBaseFileUnreadable extends Error {
  override readonly name = "PreviewBaseFileUnreadable";
  constructor(readonly path: string, readonly branch: string) { super("Preview base file unreadable"); }
}
export class PreviewWriterWarnings extends Error {
  override readonly name = "PreviewWriterWarnings";
  constructor(readonly warnings: PullWarning[]) { super("Preview cannot deliver empty values"); }
}
export type PublishPreviewResult =
  | { status: "blocked"; warnings: PullWarning[] }
  | { status: "ok"; preview: PublishPreview }
  | { status: "refused"; reason: "base-file-missing" | "base-file-unreadable"; path: string; branch: string }
  | { status: "rejected"; error: "unauthorized" | "forbidden" | "not-found" | "archived" | "invalid input" }
  | { status: "failed" };
export type PublishModalState =
  | { kind: "preview-loading" }
  | { kind: "preview-ready"; preview: PublishPreview }
  | { kind: "preview-error" }
  | { kind: "preview-refused"; reason: "base-file-missing" | "base-file-unreadable"; path: string; branch: string }
  | { kind: "running" }
  | { kind: "result"; outcome: import("@/lib/pull/message").PullOutcome };
