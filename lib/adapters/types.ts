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
   * (`docs/ADAPTER-COVERAGE.md` — 실측 109개 리포 1,888 로케일에서 이 가정이 유지됐다.)
   */
  locales: string[];
  /**
   * **수술적 치환 어댑터(`ts-dict`)가 write에 필요로 하는 원본 파일들.**
   *
   * 값만 바꾸고 나머지 소스를 보존하려면 원본이 있어야 한다. 재생성 어댑터는 무시한다.
   * pull은 이 어댑터를 쓰는 프로젝트에서 blob SHA만이 아니라 **내용**을 받아야 한다 (MVP §3.3).
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

  /**
   * 파일 경로 → 최상위가 로케일 코드 하나로 감싸여 있었는지 (`yaml-catalog` 전용).
   *
   * Rails 관례가 그렇다(`ko:` 아래에 내용 — mastodon·redmine·decidim). misskey·directus는 루트에
   * 바로 키가 온다. `read`가 관측하고 `write`가 같은 모양으로 되돌린다.
   */
  rootKeyedByPath?: Record<string, boolean>;
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
   * 그게 첫 pull PR이 파일을 통째로 재정렬하는 뿌리다 (`docs/features/key-order-preservation/`).
   * 순서를 **배열 위치가 아니라 필드로** 나르는 이유는 호출부가 "정렬된 배열"을 전제하기
   * 때문이다 (`__tests__/contract.ts`의 "입력 배열 순서 무관" 불변식).
   *
   * ⚠️ **파일 스코프다.** 파일이 여럿인 레이아웃에서는 `common.json`의 3번째 키와
   * `settings.json`의 3번째 키가 둘 다 2다 — 파일 경계를 넘어 비교할 수 없다.
   *
   * 없으면 "순서를 모른다"는 뜻이고 재생성 writer가 코드 유닛 순으로 뒤에 붙인다.
   */
  order?: number;
  /**
   * chrome `_locales`의 `placeholders` 블록. **해석하지 않고 원본 JSON을 그대로** 나른다.
   *
   * `{ content, example? }` 스키마를 우리가 검증하기 시작하면 크롬 스펙을 따라다녀야 하는데,
   * 이 필드가 요구하는 것은 "잃지 않는다"뿐이다. 객체 안의 키 순서도 원본 그대로 둔다 —
   * 우리가 만든 구조가 아니다.
   *
   * ⚠️ **왕복 의미 게이트가 이 필드의 손실을 원리적으로 못 본다.** 전에는 `LocaleEntry`에
   * 없어서 read1·read2가 둘 다 무시했고, 손실이 있는데 지표가 "같다"고 말했다
   * (`docs/ADAPTER-COVERAGE.md` §10.3 — chrome 33개 중 12개가 이 블록을 갖는다).
   */
  placeholders?: Record<string, unknown>;
  /**
   * 코드에서 사라진 키. DB엔 남으므로 브랜치를 되돌리거나 기능을 복구하면 번역이 살아 돌아온다.
   *
   * **처리가 writer 방식마다 다르다** (MVP §4.1):
   * - 재생성(`chrome-locales`·`json-catalog`) — 파일에서 **뺀다** (`usableEntries`가 거른다).
   * - 수술적 치환(`ts-dict`) — 파일에 **남기고 값을 바꾸지 않는다.** 지우면 그 소스를 참조하는
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

/** `path:line`이 아니라 `path`만 든다 — JSON 파서가 줄 번호를 주지 않는다. */
export type AdapterError = {
  path: string;
  message: string;
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
  /** 파일별 로케일 루트 키 여부 (`yaml-catalog` 전용). */
  rootKeyedByPath?: Record<string, boolean>;
};

export type WriteInput = {
  locale: string;
  /** base 로케일이면 description을 파일에 넣는다(지원하는 어댑터에서). */
  isBase: boolean;
  entries: readonly LocaleEntry[];
};

export type Adapter = {
  name: AdapterName;

  /**
   * 로케일 파일 경로를 만드는 방식. 어댑터마다 구조가 다르다:
   *
   * - `"per-locale"` — 로케일당 파일 하나. `pathTemplate`의 `{locale}`을 치환한다
   *   (`chrome-locales`, `json-catalog`).
   * - `"multi-locale"` — 한 파일에 로케일이 여러 개. `pathTemplate`이 글롭이고 치환하지 않는다
   *   (`ts-dict`). write도 파일별로 불러야 한다.
   */
  layout: "per-locale" | "multi-locale";
  /**
   * write 방식. **`layout`과 별개 축이다** (2026-09-02 분리).
   *
   * - `"regenerate"` — DB 상태만으로 파일을 새로 만든다. `usableEntries`의 결정성 규칙(§1.1)을
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
   * 없다. 후보 목록이 따로 필요한 이유는 **1순위가 틀렸을 때 정답이 몇 순위였는지**를 관측하기
   * 위해서다: 1순위만 보면 오탐이 났다는 사실은 알아도 탐지가 얼마나 가까웠는지는 알 수 없다
   * (`docs/features/adapter-generality/spec.md` 완료 조건 ②).
   *
   * ⚠️ **어댑터 *간* 순위는 여기에 없다.** 이 함수는 자기 어댑터의 후보만 낸다 — 어댑터를
   * 가로지르는 병합·순위는 지금 소비자가 측정 실험뿐이라 `lib/survey/`의 순수 함수가 맡는다.
   */
  detectCandidates(paths: readonly string[], probe?: FileProbe): DetectedFormat[];
  read(format: DetectedFormat, files: readonly AdapterFile[]): ReadResult;
  /** @returns 파일 내용. 낼 항목이 0개면 `null` — 호출부가 그 로케일을 트리에서 뺀다 (MVP §4.1). */
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
