import type { AdapterName } from "../adapters/types";
import { emptyJsonDiffCauses, type IndentStyle, type JsonDiffCauses } from "./json-shape";

/**
 * 어댑터 범용성 측정 실험의 결과 타입.
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
  | "key-collision"
  | "adapter-threw"
  | "other";

export const READ_ERROR_KINDS: readonly ReadErrorKind[] = [
  "json-parse",
  "non-object-root",
  "leaf-type",
  "chrome-key",
  "non-literal-value",
  "key-collision",
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

/**
 * 첫 write diff의 **순서 외** 원인 (ARCHITECTURE §1.1).
 *
 * 순서 보존만으로 목표(diff ≤ 0.10)가 닫히는지는 여기 남는 것들이 정한다. 안 재면 목표 수치가
 * 근거 없는 희망값이 된다 — 그래서 원인을 세 두고, 지배 원인이 있으면 **별 기능으로 잘라낸다.**
 */
export type DiffCauses = JsonDiffCauses;

export const emptyDiffCauses = (): DiffCauses => emptyJsonDiffCauses();

/**
 * chrome `_locales`가 **원본에 들고 있는** 필드 — 이제 왕복에서 보존되므로 **diff 원인이 아니다.**
 *
 * ⚠️ 전에는 `DiffCauses`에 있었다. 태스크 2·4가 두 필드를 되돌리게 만든 뒤로는 diff를 만들지
 * 않는데도 원인으로 남아 있어서, **chrome 리포 13개가 `clean` 분모에서 부당하게 빠졌다**
 * (그 13개의 diff 중앙값은 0.032로 목표 통과였다). 관측 자체는 남길 값이 있다 — 20개 리포가
 * 잃던 필드라는 사실이 이 기능의 근거였다.
 */
export type ChromeFields = {
  /** `placeholders` 블록이 있다. 학습 코퍼스 33개 중 12개. */
  placeholders: boolean;
  /** 비-base 로케일에 `description`이 있다. 33개 중 20개. */
  nonBaseDescription: boolean;
  /**
   * 엔트리 안에서 `description`이 `message`보다 **먼저** 나온다 (Midnight-Lizard).
   *
   * ⚠️ **관측치로 태어났다** — `dominantFieldOrder`가 되돌리므로 diff 원인이 아니다. 지표를
   * 넣고 배선을 안 하는 것이 이 리포에서 세 번 반복된 실패라(POSTMORTEM 2026-09-02) 같은
   * 커밋에서 센다. 0이면 이 축의 근거가 코퍼스에 없다는 뜻이다.
   */
  descriptionFirst: boolean;
};

export const emptyChromeFields = (): ChromeFields => ({
  placeholders: false,
  nonBaseDescription: false,
  descriptionFirst: false,
});

/**
 * 원본 JSON이 들고 있던 **표현** — 이제 재생성 writer가 되돌리므로 **diff 원인이 아니다.**
 *
 * ⚠️ 둘 다 전에는 `DiffCauses`였다. 태스크 1b가 되돌리게 만든 뒤로 원인으로 남겨 두면 그 리포들이
 * `clean` 분모에서 계속 빠져 **개선이 게이트에 나타나지 않는다** — chrome 필드에서 정확히 그 일이
 * 있었고 리포 13개가 부당하게 빠졌다 (POSTMORTEM 2026-09-03). 관측은 남긴다: 몇 개 리포가 그
 * 표현을 쓰는지가 이 기능의 근거다.
 */
export type JsonPresentation = {
  /** 원본이 비ASCII를 `\uXXXX`로 적었다. */
  escapedNonAscii: boolean;
  /** 비어 있지 않은 컨테이너가 한 줄에 담겨 있다 (`"k": { "message": … }`). */
  compactContainer: boolean;
  /** `/`를 `\/`로 적었다 — 선택적 이스케이프라 `JSON.stringify`가 절대 안 낸다. */
  escapedSlash: boolean;
};

export const emptyJsonPresentation = (): JsonPresentation => ({
  escapedNonAscii: false,
  compactContainer: false,
  escapedSlash: false,
});

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
  /**
   * `selectSurveyFiles`가 센 설정 파일 — 내용은 안 읽는다.
   *
   * ⚠️ **필수 필드다.** 전에는 껍데기가 구조 분해에서 이걸 버려도 타입이 통과해
   * `metrics.configFileRepos`가 구조적으로 항상 0이었다(단위 테스트만 green). 지표를 만드는 것과
   * 지표가 배선되는 것은 다른 일이고, 그 차이를 컴파일러가 막게 한다.
   */
  configFiles: readonly string[];
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

  /**
   * write가 **보고한** 버림 건수 (`Adapter.writeWithErrors`).
   *
   * 왕복 의미 불일치와 함께 읽어야 한다: `writeErrors > 0`이면 **알려진 손실**이고, 0인데
   * 의미가 다르면 **조용한 손실**이다 — 후자만이 고쳐야 할 결함이다.
   */
  writeErrors: number;

  roundtrip: Roundtrip;
  /** 원본 대비 **1차 write**의 변경 줄 비율. base 로케일 파일 기준. */
  diffRatio?: number;
  /** `roundtripDiffRatio`가 근사 경로로 갔는가. */
  diffApproximate: boolean;
  /**
   * **비-base** 로케일 파일들의 1차 write diff 중앙값.
   *
   * `diffRatio`는 base 파일 하나만 잰다. 그런데 순서를 base에서 따와 전 로케일에 쓰는 설계
   * (`StringKey.sortIndex`)에서는 **정작 위험한 파일이 비-base 쪽**이라, base만 보면 그 위험이
   * 게이트에 안 잡힌다.
   */
  diffRatioNonBase?: number;
  /**
   * **수술적 어댑터 전용** — base 파일에서 키 **1개**의 값을 바꿔 write했을 때의 변경 hunk 수.
   * 정상은 1이다. 2 이상이면 편집하지 않은 줄까지 재직렬화가 건드렸다는 뜻이다(들여쓰기·접힘).
   *
   * ⚠️ 이 지표가 없던 동안 수술적 왕복·고정점·diff 0.000은 **공허했다** — read 결과를 그대로
   * write에 넣으면 값이 전부 같아 원본을 바이트 그대로 돌려주므로 치환 경로를 한 줄도 밟지
   * 않는다. YAML 17개·code-dict 12개에서 재직렬화가 한 번도 측정되지 않았다 (2026-09-04 audit #5).
   * 재생성 어댑터나 측정 불가면 `undefined`.
   */
  surgicalEditHunks?: number;

  /** base 로케일 파일의 들여쓰기. 재생성 어댑터가 아니거나 관측 불가면 `undefined`. */
  indent?: IndentStyle;
  /**
   * 비-base 로케일 파일 중 base와 **공통 키 순서가 완전히 같은** 비율 (0..1).
   *
   * 이 값의 리포별 중앙값이 `StringKey.sortIndex`(A안)와 `Translation.sortIndex`(대안 E)를
   * 가른다. 비교 대상이 없으면 `undefined`다 — 0으로 보고하면 "순서가 어긋난 리포"로 세어져
   * 판정이 오염된다.
   */
  localeOrderAgreement?: number;
  /** 위 비율의 분모 — 실제로 비교한 비-base 파일 수. */
  localeOrderCompared: number;
  /** 순서 외에 무엇이 diff를 만드는가. */
  diffCauses: DiffCauses;
  /** chrome이 원본에 들고 있는 필드 — 보존되므로 diff 원인은 아니다. 관측만 한다. */
  chromeFields: ChromeFields;
  /** 원본 JSON의 표현 — 보존되므로 diff 원인은 아니다. 관측만 한다. **리포 단위 OR**. */
  presentation: JsonPresentation;

  separators: SeparatorCounts;
  /** ICU 복수형(`{n, plural, …}`)을 쓰는 키 수 — PRODUCT §4.2 비범위라 **빈도만** 센다. */
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
  "key-collision": 0,
  "adapter-threw": 0,
  other: 0,
});

/**
 * 오탐 판정의 **유일한 정답 출처** (`docs/adapter-survey/verdicts.json`).
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
  /**
   * **다른 유효한 카탈로그 경로들.** 한 리포에 진짜 번역 표면이 둘 이상일 때 쓴다 — mastodon은
   * Rails YAML 106로케일과 프런트엔드 JSON 106로케일을 둘 다 갖고, Kavita·vikunja는 백엔드와
   * UI가 각자 카탈로그를 든다. 어느 쪽을 골라도 맞으므로 **오탐으로 세면 숫자가 과장된다.**
   *
   * `correctCatalogPath`가 "대표"이고 이쪽은 "그것도 맞다"는 목록이다. 비워두면 규칙은 그대로
   * 엄격하다.
   */
  alsoValid?: string[];
  /** 그렇게 판정한 근거. **사후 감사용이다** (무인 루프라 판정 주체가 실행 에이전트다). */
  note: string;
  /** 스타 수 구간 — 표에만 쓴다. */
  tier?: "A" | "B" | "C";
};

/** `n / of` 와 백분율. 분모가 0이면 `pct`는 0이다. */
export type Rate = { n: number; of: number; pct: number };
