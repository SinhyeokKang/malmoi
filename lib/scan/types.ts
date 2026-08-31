/**
 * 래퍼 식별자 — `import { <export> } from "<module>"`.
 * 대상 리포마다 다를 수 있고, 잘못 잡으면 남의 함수를 우리 것으로 착각한다.
 */
export type WrapperId = {
  module: string;
  export: string;
};

/** 스캔 입력. `ts`는 AST 경로, `raw`는 `__MSG_key__` 정규식 경로다. */
export type SourceFileInput = {
  path: string;
  code: string;
  kind: "ts" | "raw";
};

/** AST 경로가 뽑아낸 원시 호출 하나. */
export type RawCall = {
  key: string;
  sourceText: string;
  path: string;
  line: number;
  description?: string;
};

/** 키의 코드 사용처. */
export type KeyRef = {
  path: string;
  line: number;
};

/** 스캔 결과의 키 하나. `KeyRef[]`는 정렬되어 있다. */
export type ScannedKey = {
  key: string;
  sourceText: string;
  namespace: string;
  refs: KeyRef[];
  description?: string;
};

/** CI를 실패시킬 이유 하나. `path:line`으로 사람이 바로 찾아갈 수 있어야 한다. */
export type ScanError = {
  path: string;
  line: number;
  message: string;
};

export type ScanResult = {
  keys: ScannedKey[];
  errors: ScanError[];
};
