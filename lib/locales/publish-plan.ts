import { localeFilePath } from "./add-plan";
import { normalizeLocaleEffects, type LocaleChangeRow, type LocaleEffect } from "./effects";
import { compareCodeUnits } from "@/lib/compare";

/**
 * **언어 변경 의도 × base 경로 → 이번 스냅샷의 생성·삭제·보류** (locale-add design §4 "파일 집합의 목표").
 *
 * - REMOVE는 행이 있는 한 매 스냅샷에 다시 적용한다 — sync 브랜치를 base에서 매번 다시 만들므로 한 번 보낸 삭제도 다시 실어야 남는다.
 * - delete는 경로가 base에 있을 때만 만든다. 렌더 결과에서 언어를 빼는 것만으로는 파일이 지워지지 않는다(design §2).
 * - 미전달 ADD의 경로가 이미 base에 있으면 그 언어만 보류한다. 다른 변경은 전달한다.
 * - 값 0개 ADD는 파일을 내지 않는다.
 *
 * ⚠️ **base를 못 읽으면 파일 부재가 아니다** (POSTMORTEM 2026-09-27) — 행이 하나라도 있으면 계획 전체를 거부한다. 호출부는 delete도
 * `no-changes`도 기록하지 않는다. 행이 없으면 base를 보지 않는다 — 언어 변경이 없는 소스의 기존 순서를 바꾸지 않는다.
 *
 * 의도와 리포 값을 견줘 승자를 고르지 않는다(불변식 1) — base는 "경로가 있나"만 답한다.
 */

export type BaseObservation =
  | { status: "read"; files: ReadonlyMap<string, "regular" | "irregular"> }
  | { status: "unreadable" };

export type LocalePublishInput = {
  pathTemplate: string | null;
  changes: readonly LocaleChangeRow[];
  /** 마지막 전달 목록. `null`은 확인 안 됨(무효화 중) — 그때 base에 있는 ADD는 미전달로 본다. */
  delivered: readonly LocaleEffect[] | null;
  valueCounts: ReadonlyMap<string, number>;
  base: BaseObservation;
  /** 이 스냅샷이 **변경 행이 없는** 로케일(이 소스의 나머지 + 다른 소스)에 쓰는 경로. */
  upsertPaths: readonly string[];
  /** 다른 소스가 쥔 경로 — 그 경로를 만들거나 지우지 않는다. */
  foreignPaths: readonly string[];
};

type LocalePath = { localeCode: string; path: string };

export type LocalePublishRefusal = "base-unreadable" | "unsafe-path" | "duplicate-path" | "path-conflict" | "irregular-file";

export type LocalePublishPlan =
  | {
      ok: true;
      /** 정규 렌더가 건너뛸 코드 — REMOVE · 보류된 ADD · 빈 ADD. */
      exclude: string[];
      creates: LocalePath[];
      deletes: LocalePath[];
      withheld: (LocalePath & { reason: "proposal-path-exists" })[];
      empty: string[];
      /** 이 스냅샷이 실제로 이루는 효과 — Publish가 PR/MR 경계까지 성공하면 이 목록을 전달 목록으로 기록한다. */
      captured: LocaleEffect[];
    }
  | { ok: false; error: "base-unreadable" | "unsafe-path" }
  | { ok: false; error: "duplicate-path" | "path-conflict" | "irregular-file"; path: string };

export function planLocalePublish(input: LocalePublishInput): LocalePublishPlan {
  const rows = [...input.changes].sort((a, b) => compareCodeUnits(a.localeCode, b.localeCode) || compareCodeUnits(a.operation, b.operation));
  const empty = { ok: true as const, exclude: [], creates: [], deletes: [], withheld: [], empty: [], captured: [] };
  if (rows.length === 0) return empty;

  const resolved: (LocaleChangeRow & { path: string })[] = [];
  const claimed = new Set<string>();
  for (const row of rows) {
    const path = input.pathTemplate === null ? null : localeFilePath(input.pathTemplate, row.localeCode);
    if (path === null) return { ok: false, error: "unsafe-path" };
    if (claimed.has(path)) return { ok: false, error: "duplicate-path", path };
    claimed.add(path);
    resolved.push({ ...row, path });
  }
  if (input.base.status === "unreadable") return { ok: false, error: "base-unreadable" };
  const files = input.base.files;

  const upserts = new Set(input.upsertPaths);
  const foreign = new Set(input.foreignPaths);
  const delivered = input.delivered ?? [];
  const exclude: string[] = [], creates: LocalePath[] = [], deletes: LocalePath[] = [], emptyCodes: string[] = [];
  const withheld: (LocalePath & { reason: "proposal-path-exists" })[] = [];
  const captured: LocaleEffect[] = [];

  for (const { localeCode, operation, path } of resolved) {
    if (foreign.has(path)) return { ok: false, error: "path-conflict", path };
    const inBase = files.has(path);
    if (operation === "REMOVE") {
      exclude.push(localeCode);
      captured.push({ localeCode, effect: "delete" });
      if (!inBase) continue;
      if (upserts.has(path)) return { ok: false, error: "duplicate-path", path };
      if (files.get(path) !== "regular") return { ok: false, error: "irregular-file", path };
      deletes.push({ localeCode, path });
      continue;
    }
    if ((input.valueCounts.get(localeCode) ?? 0) === 0) {
      exclude.push(localeCode);
      emptyCodes.push(localeCode);
      continue;
    }
    if (upserts.has(path)) return { ok: false, error: "duplicate-path", path };
    if (inBase) {
      // 전달된 ADD가 base에 있으면 그 파일을 원본으로 정규 렌더한다. 미전달이면 남의 파일일 수 있어 덮지 않는다.
      if (delivered.some(effect => effect.localeCode === localeCode && effect.effect === "create")) {
        captured.push({ localeCode, effect: "create" });
      } else {
        exclude.push(localeCode);
        withheld.push({ localeCode, path, reason: "proposal-path-exists" });
      }
      continue;
    }
    creates.push({ localeCode, path });
    captured.push({ localeCode, effect: "create" });
  }

  return { ok: true, exclude: exclude.sort(compareCodeUnits), creates, deletes, withheld, empty: emptyCodes, captured: normalizeLocaleEffects(captured) };
}
