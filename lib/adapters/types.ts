/** 어댑터 이름. 새 포맷을 지원하면 여기에 추가된다. */
export type AdapterName = "chrome-locales" | "json-catalog" | "ts-dict";

/** 리포에서 찾아낸 로케일 파일 포맷. `detect`의 산출물이고 read·write 양쪽에 넘긴다. */
export type DetectedFormat = {
  adapter: AdapterName;
  /** `{locale}`을 치환하면 실제 경로가 된다. */
  pathTemplate: string;
  /** 발견된 로케일 코드. 정렬돼 있지 않다 — 호출부가 필요하면 정렬한다. */
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
   * 코드에서 사라진 키. **`true`면 어떤 writer도 파일에 내지 않는다** (MVP §4.1).
   * DB엔 남으므로 브랜치를 되돌리거나 기능을 복구하면 번역이 살아 돌아온다.
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
   */
  nested: boolean;
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
   * 리포 파일 경로 목록에서 이 포맷을 찾는다. 못 찾으면 undefined.
   *
   * `probe`를 주면 후보의 내용을 한 번 읽어 카탈로그 모양인지 확인한다 — 경로 신호만으로는
   * 검색 인덱스 같은 무관한 JSON 묶음을 잡는다(bugshot-web에서 실제로 발생). GitHub API에서는
   * 블롭 읽기가 비싸므로 경로로 좁힌 후보만 확인하도록 콜백으로 받는다.
   */
  detect(paths: readonly string[], probe?: FileProbe): DetectedFormat | undefined;
  read(format: DetectedFormat, files: readonly AdapterFile[]): ReadResult;
  /** @returns 파일 내용. 낼 항목이 0개면 `null` — 호출부가 그 로케일을 트리에서 뺀다 (MVP §4.1). */
  write(format: DetectedFormat, input: WriteInput): string | null;
};
