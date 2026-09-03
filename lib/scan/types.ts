/**
 * 사용처 스캔의 타입. **키가 존재하는지는 여기서 정하지 않는다** — 그건 `lib/adapters/`의
 * 적재 층이 로케일 파일을 읽어 결정한다 (ARCHITECTURE §4).
 */

/**
 * 래퍼 식별자 — `import { <export> } from "<module>"`.
 *
 * `kind`가 **호출 형태**를 가른다. `direct`는 import한 것을 그대로 부르고(`t("k")`),
 * `hook`은 그것을 부른 **반환값**이 호출자다(`const { t } = useI18n()` /
 * `const t = useTranslations("ns")`). 실측 3개 리포 중 둘이 훅이라 이 축이 없으면 refs가 0건이다.
 */
export type WrapperId = {
  module: string;
  export: string;
  kind: "direct" | "hook";
};

/** 스캔 입력. `ts`는 AST 경로를 타고, 두 종류 모두 `__MSG_` 토큰 훑기를 탄다. */
export type SourceFileInput = {
  path: string;
  code: string;
  kind: "ts" | "raw";
};

/** 키의 코드 사용처 하나. */
export type KeyRef = {
  path: string;
  line: number;
};

/** 키 하나와 그 사용처들. `refs`는 path·line 기준 정렬돼 있다. */
export type ScannedRef = {
  key: string;
  refs: KeyRef[];
};

/**
 * 위치를 못 찾은 호출. **경고일 뿐 실패가 아니다** — 컨텍스트가 빠질 뿐 적재는 정상이고,
 * 남의 리포 CI를 우리 규칙으로 실패시킬 근거가 없다.
 */
export type ScanWarning = {
  path: string;
  line: number;
  message: string;
};

/** `errors`가 없는 것이 이 타입의 요지다. */
export type ScanResult = {
  refs: ScannedRef[];
  warnings: ScanWarning[];
};
