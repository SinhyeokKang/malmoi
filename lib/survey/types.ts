import type { AdapterName } from "../adapters/types";

/**
 * 어댑터 범용성 측정 실험의 결과 타입 (`docs/features/adapter-generality/`).
 *
 * **생산자에 이 타입을 붙인다** (`const survey: RepoSurvey = { ... }`). 리터럴로 조립하면 지표를
 * 하나 늘렸을 때 `summarize`가 조용히 `undefined`를 센다 — `docs/POSTMORTEM.md` 2026-08-31
 * "외부 계약 페이로드를 리터럴로 조립해 필수 필드가 늘어도 컴파일러가 침묵했다"와 같은 함정이다.
 */

/**
 * `read` 실패의 유형 (지표 ③).
 *
 * ⚠️ **`silent-skip`은 `errors`에 안 들어간다.** 이름 그대로 어댑터가 에러를 만들지 않고 건너뛰는
 * 경로이고, 유일하게 CI 게이트를 통과해 `orphaned` 오인까지 가는 부류라 별도 카운터로 뺐다
 * (`RepoSurvey.silentSkips`).
 */
export type ReadErrorKind =
  | "json-parse"
  | "non-object-root"
  | "leaf-type"
  | "chrome-key"
  | "non-literal-value"
  | "adapter-threw"
  | "other";

export const READ_ERROR_KINDS: readonly ReadErrorKind[] = [
  "json-parse",
  "non-object-root",
  "leaf-type",
  "chrome-key",
  "non-literal-value",
  "adapter-threw",
  "other",
];

/** 키에 쓰인 구분자 분포 — `nested: boolean`이 좁은지(i18next는 `:`를 쓴다) 판정할 근거다. */
export type SeparatorCounts = { dot: number; underscore: number; colon: number; slash: number; none: number };

export type RoundtripVerdict = "same" | "different" | "not-run";

/**
 * 왕복 안정성 2층 (spec 완료 조건 ④).
 *
 * 첫 write는 바이트가 달라도 정상이다 — 원본이 우리 정렬 규칙을 따를 이유가 없다
 * (ARCHITECTURE §1.2). 그래서 "같다"를 두 뜻으로 나눠 잰다.
 */
export type Roundtrip = {
  /** read→write→read의 키·값 집합이 1차 read와 같은가. 다르면 **데이터 손실**이다. */
  semantic: RoundtripVerdict;
  /** 2차 write가 1차 write와 바이트 동일한가. 다르면 **결정성 결함**이다. */
  byteFixpoint: RoundtripVerdict;
};

export type SurveyCandidate = {
  adapter: AdapterName;
  pathTemplate: string;
  locales: string[];
};

export type SurveyInput = {
  repo: string;
  /** 리포의 전체 파일 경로 (git 트리 그대로, 리포 상대 POSIX). */
  paths: readonly string[];
  /** `selectSurveyFiles`가 고른 파일만 담긴 경로→내용. 나머지는 없다. */
  files: ReadonlyMap<string, string>;
  /** 껍데기 단계의 실패(clone 실패 등). 있으면 나머지를 재지 않는다. */
  failure?: string;
  /** 선택이 예산에 걸려 잘렸는가 — 숫자를 읽는 사람이 알아야 한다. */
  truncated?: boolean;
};

export type RepoSurvey = {
  repo: string;
  /** 리포 전체 파일 수. */
  fileCount: number;
  /** 실제로 내용을 읽은 파일 수. */
  selectedFileCount: number;
  truncated: boolean;

  /** 어댑터를 가로지르는 순위순 후보. `[0]`이 현재 `detectFormat`이 고르는 것과 같다. */
  candidates: SurveyCandidate[];
  chosen?: SurveyCandidate;

  localeCount: number;
  /** 1순위 후보에서 읽어낸 키의 합집합 크기. */
  keyCount: number;

  errors: Record<ReadErrorKind, number>;
  /** `flatten`이 검사하지 않는 중복 — `"a.b"`와 `{"a":{"b":…}}`가 같은 키로 겹친 횟수. */
  keyCollisions: number;
  /** 에러 없이 건너뛴 프로퍼티(spread·shorthand·computed·메서드). 코드 어댑터 전용. */
  silentSkips: number;
  /** 코드 어댑터일 때: 실제로 읽힌 키 수. `literalCount`와의 격차가 부분 읽기의 그물이다. */
  readKeyCount?: number;
  /** 코드 어댑터일 때: 파일에 있는 문자열 리터럴 수. */
  literalCount?: number;

  roundtrip: Roundtrip;
  /** 원본 대비 **1차 write**의 변경 줄 비율. base 로케일 파일 기준. */
  diffRatio?: number;
  /** `roundtripDiffRatio`가 근사 경로로 갔는가. */
  diffApproximate: boolean;

  separators: SeparatorCounts;
  /** ICU 복수형(`{n, plural, …}`)을 쓰는 키 수 — MVP §7 비범위라 **빈도만** 센다. */
  icuPluralKeys: number;
  /** 단순 치환자(`{name}`)를 쓰는 키 수. */
  placeholderKeys: number;

  /** `i18next-parser.config.*` 같은 설정 파일 — 다음 기능(설정 기반 탐지)의 우선순위 근거다. */
  configFiles: string[];

  failure?: string;
  ms: number;
};

export const emptyErrors = (): Record<ReadErrorKind, number> => ({
  "json-parse": 0,
  "non-object-root": 0,
  "leaf-type": 0,
  "chrome-key": 0,
  "non-literal-value": 0,
  "adapter-threw": 0,
  other: 0,
});

/**
 * 오탐 판정의 **유일한 정답 출처** (`docs/features/adapter-generality/verdicts.json`).
 *
 * `repos.md`의 "예상 포맷" 라벨을 쓰지 않는 이유: 관측된 오탐 전례(`public/search/{locale}.json`)가
 * **포맷은 맞고 경로가 틀린** 형태라 포맷 라벨 대조로는 원리적으로 못 잡는다. 판정 단위는 경로다.
 *
 * 판정을 코드 밖 파일에 두면 `detect`를 고쳐 재실행해도 판정이 파괴되지 않는다.
 */
export type Verdict = {
  repo: string;
  /** 그 리포에서 실제로 번역이 사는 경로 템플릿. 우리가 지원하지 않는 포맷이면 `null`. */
  correctCatalogPath: string | null;
  /** `correctCatalogPath`가 `null`일 때 왜인지 — `yaml`·`po`·`ts-per-locale`·`unknown` 등. */
  unsupported?: string;
  /** 그렇게 판정한 근거. **사후 감사용이다** (무인 루프라 판정 주체가 실행 에이전트다). */
  note: string;
  /** 스타 수 구간 — 표에만 쓴다. */
  tier?: "A" | "B" | "C";
};

/** `n / of` 와 백분율. 분모가 0이면 `pct`는 0이다. */
export type Rate = { n: number; of: number; pct: number };
