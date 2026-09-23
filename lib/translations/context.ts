import { createHash } from "node:crypto";

/**
 * 전달 확인의 context 지문 (translation-rework — ARCHITECTURE §5.8).
 *
 * 확인 뒤 이 값이 바뀌면 그 확인은 복원 근거가 아니다. **`importRevision`이 적재 쪽 무효화를 든다** — 성공한 strict 적재·
 * 수동 Sync마다 증가만 하므로 옛 기준이 부활할 길이 없다. 되돌릴 수 있는 설정(base branch)은 명시 무효화가 따로 막는다.
 *
 * ⚠️ `./baseline`과 분리한 이유는 `node:crypto`다 — 그쪽은 클라이언트가 읽는 잎이다.
 */
export type DeliveryContextInput = {
  repositoryId: string | null;
  baseBranch: string;
  surface: {
    id: string;
    importRevision: number;
    adapterName: string | null;
    pathTemplate: string | null;
    nested: boolean | null;
    nestedByPath: unknown;
    baseLocale: string | null;
  };
};

/** JSON 컬럼은 키 순서를 보장하지 않는다 — 객체 키를 정렬해 같은 값이 같은 문자열이 되게 한다. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]);
  }
  return value;
}

export function deliveryContextFingerprint(input: DeliveryContextInput): string {
  const s = input.surface;
  // 배열 튜플로 직렬화한다 — 구분자 이어붙이기는 경계가 움직인 두 입력을 같은 문자열로 만든다(`discardFingerprint`와 같은 형).
  const tuple = JSON.stringify([
    input.repositoryId, input.baseBranch,
    s.id, s.importRevision, s.adapterName, s.pathTemplate, s.nested, canonical(s.nestedByPath ?? null), s.baseLocale,
  ]);
  return createHash("sha256").update(tuple).digest("hex");
}

/** 무효화 표시가 없고 지문이 현재와 같을 때만 유효하다 — 표시가 있으면 설정을 되돌려도 부활하지 않는다. */
export function confirmationValid(row: { invalidatedAt: Date | null; contextFingerprint: string } | null, current: string): boolean {
  return row !== null && row.invalidatedAt === null && row.contextFingerprint === current;
}
