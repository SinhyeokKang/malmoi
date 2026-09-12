/** 어댑터 이름. 새 포맷을 지원하면 여기에 추가된다. */
export type AdapterName = "chrome-locales" | "json-catalog" | "yaml-catalog" | "code-dict" | "ts-dict";

/** 리포에서 찾아낸 로케일 파일 포맷. `detect`의 산출물이고 read·write 양쪽에 넘긴다. */
export type DetectedFormat = {
  adapter: AdapterName;
  /** `{locale}`을 치환하면 실제 경로가 된다. */
  pathTemplate: string;
  /**
   * 발견된 로케일 코드. 정렬돼 있지 않다 — 호출부가 필요하면 정렬한다.
   *
   * ⚠️ **파일명(또는 디렉터리명) 그대로가 로케일 코드의 진실이다. 정규화하지 않는다.**
   * `zh_CN` · `zh-CN` · `zh-Hans`가 리포마다 다르게 쓰이는데, `pathTemplate`의 `{locale}` 치환이
   * 이 문자열을 그대로 도로 끼우는 것으로 경로를 만든다. 어디서든 한 번 정규화하는 순간 write가
   * 존재하지 않는 경로를 만들어 조용히 빈 커밋이 되거나 새 파일을 만든다.
   * (`docs/ARCHITECTURE §1.9` — 실측 109개 리포 1,888 로케일에서 이 가정이 유지됐다.)
   */
  locales: string[];
  /**
   * **write가 받는 원본 파일들.** 두 방식이 다른 이유로 쓴다 (2026-09-04):
   * - 수술적(`ts-dict`·`yaml-catalog`·`code-dict`) — **필수.** 값만 바꾸고 나머지 소스를 보존한다.
   *   없으면 치환할 대상이 없어 파일을 안 낸다.
   * - 재생성(`chrome-locales`·`json-catalog`) — **표현**(들여쓰기·한 줄 컨테이너·이스케이프·필드 순서)만
   *   읽는다. 없으면 기본값으로 계속 만든다.
   * 그래서 pull은 어댑터 종류와 무관하게 blob **내용**을 받는다 (ARCHITECTURE §2). 값은 어느 쪽도 안 읽는다.
   */
  currentFiles?: readonly AdapterFile[];

  /**
   * json-catalog에서 원본이 중첩 구조였는지. write가 같은 모양으로 복원하는 데 쓴다.
   *
   * **`detect`는 이 값을 채울 수 없다** — 경로만 보고 내용을 안 읽는다. 중첩 여부는 내용의
   * 성질이라 `read`가 관측해서 `ReadResult.nested`로 돌려주고, 호출부가 write 전에 실어준다.
   */
  nested?: boolean;

  /**
   * 파일 경로 → 그 파일이 중첩이었는지. **`nested`보다 이쪽이 정확하다.**
   *
   * `nested`가 포맷 단위 boolean이라, 로케일 파일 하나가 중첩이면 형제 파일까지 중첩으로 취급돼
   * **평평한 파일의 점 포함 키가 쪼개지고 값이 사라졌다** (musicblocks 84로케일 중 81개 —
   * ARCHITECTURE §1.35). write는 이 맵을 먼저 보고, 없을 때만 `nested`로 폴백한다.
   */
  nestedByPath?: Record<string, boolean>;

};

/** 경로 → 내용. 읽을 수 없으면 undefined. */
export type FileProbe = (path: string) => string | undefined;

export type AdapterFile = {
  path: string;
  content: string;
};

/** 평탄화된 메시지 하나. 키는 어댑터가 정한 구분자로 이어진 전체 경로다. */
export type LocaleEntry = {
  key: string;
  message: string;
  description?: string;
  /**
   * 그 **파일 안에서의** 키 위치. 중첩이면 **평탄화 순서(첫 등장)** 다.
   *
   * `read`가 엔트리를 코드 유닛 순으로 정렬해 돌려주므로 원본 순서는 그 지점에서 사라진다 —
   * 그게 첫 pull PR이 파일을 통째로 재정렬하는 뿌리다 (ARCHITECTURE §1.1).
   * 순서를 **배열 위치가 아니라 필드로** 나르는 이유는 호출부가 "정렬된 배열"을 전제하기
   * 때문이다 (`__tests__/contract.ts`의 "입력 배열 순서 무관" 불변식).
   *
   * ⚠️ **파일 스코프다.** 파일이 여럿인 레이아웃에서는 `common.json`의 3번째 키와
   * `settings.json`의 3번째 키가 둘 다 2다 — 파일 경계를 넘어 비교할 수 없다.
   *
   * 없으면 "순서를 모른다"는 뜻이고 재생성 writer가 코드 유닛 순으로 뒤에 붙인다.
   *
   * ⚠️ **수술적 치환 어댑터(`yaml-catalog`·`code-dict`·`ts-dict`)는 이 필드를 채우지 않는다.**
   * 원본 파일이 순서를 이미 갖고 있고 그 방식은 파일을 다시 만들지 않으므로 쓸 곳이 없다 —
   * null인 것이 결함이 아니다.
   */
  order?: number;
  /**
   * chrome `_locales`의 `placeholders` 블록. **해석하지 않고 원본 JSON을 그대로** 나른다.
   *
   * 타입이 `unknown`인 것은 게으름이 아니라 계약이다. `{ content, example? }` 스키마를 우리가
   * 검증하기 시작하면 크롬 스펙을 따라다녀야 하는데, 이 필드가 요구하는 것은 **"잃지 않는다"**
   * 뿐이다. 객체 안의 키 순서도 원본 그대로 둔다 — 우리가 만든 구조가 아니다.
   *
   * ⚠️ **모양이 이상해도 버리지 않는다.** 객체가 아닌 값을 걸러내면 원본에 있던 것이 우리 PR에서
   * 조용히 사라진다 — 이 필드가 존재하는 이유가 바로 그 손실을 없애는 것이다. 에러로 보고하는
   * 것도 답이 아니다: read 에러는 `pnpm push:local`을 exit 1로 막아서
   * (`docs/POSTMORTEM.md` 2026-09-02) 남의 리포가 우리 규칙으로 실패한다.
   *
   * ⚠️ **왕복 의미 게이트가 이 필드의 손실을 원리적으로 못 본다.** 전에는 `LocaleEntry`에
   * 없어서 read1·read2가 둘 다 무시했고, 손실이 있는데 지표가 "같다"고 말했다
   * (`docs/ARCHITECTURE §1.9` §10.3 — chrome 33개 중 12개가 이 블록을 갖는다).
   */
  placeholders?: unknown;
  /**
   * 코드에서 사라진 키. DB엔 남으므로 브랜치를 되돌리거나 기능을 복구하면 번역이 살아 돌아온다.
   *
   * **처리가 writer 방식마다 다르다** (ARCHITECTURE §1.1):
   * - 재생성(`chrome-locales`·`json-catalog`) — 파일에서 **뺀다** (`orderedEntries`가 거른다).
   * - 수술적 치환(`ts-dict`·`yaml-catalog`·`code-dict`) — 파일에 **남기고 값을 바꾸지 않는다.** 지우면 그 소스를 참조하는
   *   코드가 깨지고, 원본 보존이 이 방식의 요지다.
   *
   * read 쪽에서는 항상 비어 있다 — 파일에 있는 키는 정의상 orphaned가 아니다.
   */
  orphaned?: boolean;
};

export type ReadLocale = {
  locale: string;
  /** 키 기준 정렬돼 있다 — 적재 결과가 결정적이어야 한다. */
  entries: LocaleEntry[];
};

/**
 * **어댑터가 낼 수 있는 오류 갈래 전부.** 문장은 여기 없다 — `lib/i18n/adapter-errors.ts`가 낸다.
 *
 * ⚠️ **자유 문자열이 아니라 코드인 이유**: 이 값이 온보딩 결과 화면·Publish warnings·CLI에 그대로
 * 실린다. 어댑터가 문장을 만들면 화면에 닿는 문구가 사전 밖에 있게 되어 **ko를 더할 때 따라오지
 * 않는다** (translation-ui design §3.1.4, 사용자 결정 2026-09-07).
 *
 * ⚠️ **갈래를 합치면 측정 지표가 조용히 움직인다.** `lib/survey/one.ts`의 `classify`가 이 코드로
 * 지표 ③(read 에러 유형별)을 가르므로, 옛 문구 기준으로 서로 다른 통에 있던 둘을 한 코드로
 * 묶으면 `docs/ARCHITECTURE §1.9`의 회차 간 대조가 무의미해진다 — `parse-failed`(구문 진단)와
 * `parse-crashed`(파서가 던졌다)가 정확히 그 쌍이다. `lib/survey/__tests__/classify.test.ts`가
 * 옛 문구 22개를 픽스처로 들고 대조한다.
 */
export const ADAPTER_ERROR_CODES = [
  // ── read: 파일 층 ──
  "parse-failed",
  "parse-crashed",
  "root-not-object",
  "no-default-export",
  // ── read: 엔트리 층 ──
  "invalid-chrome-key",
  "missing-message-field",
  "value-not-message-object",
  "value-not-string",
  "value-not-string-or-container",
  "value-not-string-literal",
  "shorthand-property",
  "not-property-assignment",
  "duplicate-key",
  // ── write ──
  "key-shadowed",
  "write-parse-failed",
  "write-no-default-export",
  "write-locale-object-missing",
  "write-slot-not-string-literal",
  "write-slot-not-scalar",
  "write-slot-missing",
  "original-file-missing",
  // ── 적재 껍데기 (`lib/onboarding/ingest.ts`) ──
  "download-failed",
] as const;

export type AdapterErrorCode = (typeof ADAPTER_ERROR_CODES)[number];

/**
 * `path:line`이 아니라 `path`만 든다 — JSON 파서가 줄 번호를 주지 않는다.
 *
 * - `key` — 어느 키에서 났는지. **903키 파일에서는 이것만이 행동 가능한 정보다.** 없는 갈래도 있다
 *   (파싱 실패는 파일 전체다).
 * - `detail` — 파서 원문 등 **진단**이다. 사전 밖이고 접힌 자리(`<details>`·CLI)에만 간다.
 */
export type AdapterError = {
  path: string;
  code: AdapterErrorCode;
  key?: string;
  detail?: string;
};

export type ReadResult = {
  locales: ReadLocale[];
  errors: AdapterError[];
  /**
   * 원본이 중첩 구조였는지 — 읽으면서 관측한 값이다. write가 같은 모양으로 되돌리려면
   * 이 값을 `DetectedFormat.nested`에 실어야 한다. flat 전용 어댑터(chrome)는 항상 false.
   *
   * ⚠️ **파일이 여럿이면 이 값은 거칠다** — 하나라도 중첩이면 true다. 정확한 값은
   * `nestedByPath`에 있고, 그쪽을 써야 평평한 파일이 쪼개지지 않는다 (ARCHITECTURE §1.35).
   */
  nested: boolean;
  /** 파일별 중첩 여부. 호출부가 `DetectedFormat.nestedByPath`에 그대로 실어준다. */
  nestedByPath?: Record<string, boolean>;
};

export type WriteInput = {
  locale: string;
  entries: readonly LocaleEntry[];
};

export type Adapter = {
  name: AdapterName;

  /**
   * 로케일 파일 경로를 만드는 방식. 어댑터마다 구조가 다르다:
   *
   * - `"per-locale"` — 로케일당 파일 하나. `pathTemplate`의 `{locale}`을 치환한다
   *   (`chrome-locales`, `json-catalog`, `yaml-catalog`, `code-dict` — ⚠️ 뒤 둘은 per-locale인데
   *   **수술적**이다. 경로 모양과 write 기계는 별개 축이다).
   * - `"multi-locale"` — 한 파일에 로케일이 여러 개. `pathTemplate`이 글롭이고 치환하지 않는다
   *   (`ts-dict`). write도 파일별로 불러야 한다.
   */
  layout: "per-locale" | "multi-locale";
  /**
   * write 방식. **`layout`과 별개 축이다** (2026-09-02 분리).
   *
   * - `"regenerate"` — DB 상태만으로 파일을 새로 만든다. `orderedEntries`의 결정성 규칙(§1.1)을
   *   지나야 한다 (`chrome-locales`·`json-catalog`).
   * - `"surgical"` — 원본을 파싱해 값만 갈아끼운다. 정렬·재조립을 하지 않고 주석·빈 줄·앵커를
   *   보존한다 (`yaml-catalog`·`code-dict`·`ts-dict`).
   *
   * ⚠️ **pull이 "원본 blob 내용을 받아야 하나"를 이 값으로 판단한다.** 전에는 `layout`으로
   * 갈랐는데 `per-locale` + `surgical` 조합(YAML·코드 딕셔너리)이 생겨 성립하지 않는다 —
   * `layout`으로 가르면 그 프로젝트가 원본 없이 write에 들어가 **PR이 조용히 비어 나간다.**
   */
  writeStrategy: "regenerate" | "surgical";
  /**
   * 리포 파일 경로 목록에서 이 포맷을 찾는다. 못 찾으면 undefined.
   *
   * `probe`를 주면 후보의 내용을 한 번 읽어 카탈로그 모양인지 확인한다 — 경로 신호만으로는
   * 검색 인덱스 같은 무관한 JSON 묶음을 잡는다(bugshot-web에서 실제로 발생). GitHub API에서는
   * 블롭 읽기가 비싸므로 경로로 좁힌 후보만 확인하도록 콜백으로 받는다.
   */
  detect(paths: readonly string[], probe?: FileProbe): DetectedFormat | undefined;
  /**
   * `detect`와 같은 판정을 하되 **후보를 전부 순위순으로** 돌려준다. 못 찾으면 빈 배열.
   *
   * `detect`는 이 결과의 `[0]`이다 — 두 함수가 같은 관문(순위·probe 검증)을 지나므로 어긋날 수
   * 없다. ⚠️ **예외는 `ts-dict` 하나다**: 자동 탐지에서 빠져 `detectCandidates`는 항상 `[]`이고
   * `detect`(명시 지정)만 내용 탐지를 돈다 — `detect-candidates.test.ts`가 그 예외를 단언한다
   * (POSTMORTEM 2026-09-03). 후보 목록이 따로 필요한 이유는 **1순위가 틀렸을 때 정답이 몇 순위였는지**를 관측하기
   * 위해서다: 1순위만 보면 오탐이 났다는 사실은 알아도 탐지가 얼마나 가까웠는지는 알 수 없다
   * (ARCHITECTURE §1.9).
   *
   * ⚠️ **어댑터 *간* 순위는 여기에 없다.** 이 함수는 자기 어댑터의 후보만 낸다 — 어댑터를
   * 가로지르는 순위는 `index.ts`의 `detectCandidatesAcross`가 맡는다 (2026-09-02부터 프로덕션
   * 탐지 경로다. 전에는 측정 실험 전용이었다).
   */
  detectCandidates(paths: readonly string[], probe?: FileProbe): DetectedFormat[];
  read(format: DetectedFormat, files: readonly AdapterFile[]): ReadResult;
  /** @returns 파일 내용. 낼 항목이 0개면 `null` — 호출부가 그 로케일을 트리에서 뺀다 (ARCHITECTURE §1.1). */
  write(format: DetectedFormat, input: WriteInput): string | null;
  /**
   * `write`와 같되 **버린 항목을 에러로 함께 돌려준다.** 있는 어댑터만 구현한다.
   *
   * 왜 필요한가: `json-catalog`의 중첩 복원에서 키가 다른 키의 점 경계 접두이면 한쪽이 사라지는데
   * (`a.b`와 `a.b.c`), 전에는 `setDeep`이 문자열 자리를 빈 객체로 조용히 갈아끼웠다. 값을 잃더라도
   * **어느 키에서 잃었는지 알려주는 것**이 최소 조건이다 (ARCHITECTURE §1.35).
   */
  writeWithErrors?(format: DetectedFormat, input: WriteInput): { content: string | null; errors: AdapterError[] };
};
