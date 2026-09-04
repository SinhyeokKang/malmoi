/**
 * 원본 JSON 파일의 **표현**을 관측해 그대로 되돌려준다 (`docs/features/format-preservation/`).
 *
 * **값은 DB에서, 표현은 원본에서** — ARCHITECTURE §1.4가 수술적 치환에 세운 그 문장을 재생성
 * 어댑터로 옮긴 것이다. 여기서 원본에서 읽는 것은 표현뿐이고 **값은 절대 아니다**(코어 원칙
 * "병합 없음"). 계약 테스트의 센티넬 네거티브가 그것을 강제한다.
 *
 * ⚠️ **`writeStrategy`는 그대로 `regenerate`다.** 원본이 없어도 파일을 만들어야 한다(신규 로케일
 * 파일) — 없으면 `DEFAULT_JSON_STYLE`로 떨어진다. 그 갈림이 수술적 치환과의 계약 차이다.
 *
 * ⚠️ **스캐너가 여기 사는 이유는 지표와 프로덕션이 같은 판정을 쓰기 위해서다.**
 * `lib/survey/json-shape.ts`가 `scanJson`을 import한다 — 두 벌이 되면 지표가 재는 대상과
 * 프로덕션이 내는 파일이 갈리고, 그때 개선이 게이트에 안 나타난다 (ARCHITECTURE §1.35).
 *
 * 순수 함수다 — I/O가 없다.
 */

/** 지표(`lib/survey/json-shape.ts`)가 쓰는 모양. 문자열이 아니라 문자·폭으로 나눠 든다. */
export type IndentStyle = { char: "space" | "tab" | "none"; width: number };

/**
 * 원본에서 읽어낸 표현. **관측 실패라는 상태가 없다** — 못 읽으면 `DEFAULT_JSON_STYLE`이다.
 */
export type JsonStyle = {
  /** 한 단계 들여쓰기 문자열. `"  "` · `"    "` · `"\t"` 등 원본 리터럴 그대로. */
  indent: string;
  /** 원본이 비ASCII를 `\uXXXX`로 적었는가. */
  escapeNonAscii: boolean;
  /**
   * 원본이 `/`를 `\/`로 적었는가 — 합법이지만 **선택적인** JSON 이스케이프라
   * `JSON.stringify`는 절대 내지 않는다.
   *
   * 10차 측정이 드러냈다: Midnight-Lizard가 필드 순서를 고친 뒤에도 0.109가 남았고 그 잔여가
   * 전부 `\/`였다 (ADAPTER-COVERAGE §16).
   */
  escapeSlash: boolean;
  /**
   * 원본에서 **한 줄에 담겨 있던** 컨테이너의 경로. 키는 `pathKey`가 만든다.
   *
   * ⚠️ **`.` 조인 문자열이 아니다.** 점 든 키가 있는 리포에서 `{"a.b": [...]}`(단일 키)와
   * `{"a": {"b": [...]}}`(중첩)의 경로가 같아져 **엉뚱한 컨테이너가 한 줄로 나간다**
   * (ARCHITECTURE §1.35의 별칭 버그를 표현 축에서 재현하는 것이다).
   */
  compactPaths: ReadonlySet<string>;
};

const NO_COMPACT: ReadonlySet<string> = new Set<string>();

/** 원본이 없거나 관측 불가일 때. 지금까지의 동작과 같다 — 2칸, 이스케이프 없음, 전부 펼침. */
export const DEFAULT_JSON_STYLE: JsonStyle = {
  indent: "  ",
  escapeNonAscii: false,
  escapeSlash: false,
  compactPaths: NO_COMPACT,
};

/** 세그먼트 배열 → `compactPaths`의 키. 루트는 `[]`다. */
export function pathKey(segments: readonly string[]): string {
  return JSON.stringify(segments);
}

/**
 * 첫 **들여쓴 줄**의 선행 공백.
 *
 * 깊은 층의 배수(4칸 파일의 2층은 8칸)에 흔들리지 않으려면 첫 층만 봐야 한다. 들여쓴 줄이
 * 없으면(한 줄 파일) `none`이다 — 0칸이라고 보고하면 "2칸이 아니다"가 되어 없는 원인이 선다.
 *
 * ⚠️ **혼합 들여쓰기에서는 근사다.** 첫 층만 보므로 아래 층이 다른 폭이면 그것을 못 본다.
 * 출력은 균일해지므로 재관측이 같은 값을 내 고정점은 성립한다.
 */
export function indentOf(text: string): IndentStyle {
  for (const line of text.split("\n")) {
    const m = /^([ \t]+)\S/.exec(line);
    if (!m) continue;
    const lead = m[1]!;
    return lead[0] === "\t" ? { char: "tab", width: lead.length } : { char: "space", width: lead.length };
  }
  return { char: "none", width: 0 };
}

/** 원본 텍스트 → 스타일. **던지지 않는다** — 관측 불가면 DEFAULT다. */
export function observeJsonStyle(text: string | undefined): JsonStyle {
  if (text === undefined || text === "") return DEFAULT_JSON_STYLE;
  const scan = scanJson(text);
  const indent =
    scan.indent.char === "none"
      ? DEFAULT_JSON_STYLE.indent
      : (scan.indent.char === "tab" ? "\t" : " ").repeat(scan.indent.width);
  // 스캔이 끝까지 못 갔으면 수집한 두 축은 부분값이라 못 믿는다. 들여쓰기는 스캐너와 무관하게
  // 정규식으로 관측하므로 그대로 산다.
  if (scan.failed) return { indent, escapeNonAscii: false, escapeSlash: false, compactPaths: NO_COMPACT };
  return {
    indent,
    escapeNonAscii: scan.escapeNonAscii,
    escapeSlash: scan.escapeSlash,
    compactPaths: scan.compactPaths,
  };
}

/**
 * 스타일대로 직렬화한다. 들여쓰기 2칸 고정을 대신하지만 **끝 개행 1개는 그대로 불변식이다**
 * (MVP §4.1 — `JSON.stringify`는 개행을 안 붙인다).
 *
 * ⚠️ **기본 경로는 `JSON.stringify`를 그대로 지난다.** `space`가 문자열을 받고 명세상 `space: 2`와
 * `space: "  "`가 **동일**하므로 그 경로의 바이트 동일성이 구성상 참이고, 서로게이트 쌍·제어문자
 * 이스케이프 위험을 아예 지나지 않는다. 손으로 짠 직렬화기는 **두 축 중 하나라도 켜졌을 때만**
 * 쓰인다 — `replacer`·`space`로는 컨테이너마다 다른 펼침과 비ASCII 이스케이프를 낼 수 없다.
 */
export function serializeJson(value: unknown, style: JsonStyle = DEFAULT_JSON_STYLE): string {
  if (!style.escapeNonAscii && !style.escapeSlash && style.compactPaths.size === 0) {
    return `${JSON.stringify(value, null, style.indent)}\n`;
  }
  return `${render(value, style, [], "")}\n`;
}

/** 코드 유닛 하나를 `\uXXXX`로. 소문자 4자리 — 원본 관례이자 `charCodeAt` 기본형이다. */
const NON_ASCII_UNIT = /[-￿]/g;

/**
 * 문자열 하나를 JSON 리터럴로.
 *
 * ⚠️ **이스케이프는 `JSON.stringify`에 맡긴다** — 직접 풀면 서로게이트 쌍·제어문자에서 어긋난다.
 * `escapeNonAscii`면 그 결과에서 코드 유닛 > `0x7f`만 한 번 더 치환한다. 코드 **유닛**이라 이모지
 * 하나가 `\uXXXX` 둘로 나가고, 그게 정확히 원본이 하던 일이다.
 */
function quote(s: string, style: JsonStyle): string {
  let out = JSON.stringify(s);
  if (style.escapeNonAscii) {
    out = out.replace(NON_ASCII_UNIT, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  }
  // `JSON.stringify`가 이미 리터럴 백슬래시를 `\\`로 냈으므로 남은 `/`는 전부 맨 슬래시다.
  if (style.escapeSlash) out = out.replaceAll("/", "\\/");
  return out;
}

/**
 * 손으로 짠 직렬화기. **리프가 항상 문자열은 아니다** — chrome `placeholders`는 해석하지 않은
 * 임의 JSON이라 객체·배열·숫자·불린·`null`을 다뤄야 하고 **내부 키 순서를 원본대로** 둔다.
 *
 * ⚠️ **한 줄 컨테이너의 안쪽 여백은 관측하지 않는다** — 배열은 `["a", "b"]`, 객체는
 * `{ "a": "b" }`로 낸다. 실측에서 관측된 관례가 그 둘이다(chrome `_locales`의 `{ "message": … }`).
 * 여백까지 축으로 세면 관측 상태가 늘어나는데, 어긋나도 diff 노이즈일 뿐 고정점은 성립한다.
 */
function render(value: unknown, style: JsonStyle, path: readonly string[], pad: string): string {
  if (typeof value === "string") return quote(value, style);
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value) ?? "null";
  }
  const inner = pad + style.indent;
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const compact = style.compactPaths.has(pathKey(path));
    const items = value.map((v, i) => render(v, style, [...path, String(i)], compact ? pad : inner));
    if (compact) return `[${items.join(", ")}]`;
    return `[\n${items.map((s) => inner + s).join(",\n")}\n${pad}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return "{}";
    const compact = style.compactPaths.has(pathKey(path));
    const parts = entries.map(
      ([k, v]) => `${quote(k, style)}: ${render(v, style, [...path, k], compact ? pad : inner)}`,
    );
    if (compact) return `{ ${parts.join(", ")} }`;
    return `{\n${parts.map((s) => inner + s).join(",\n")}\n${pad}}`;
  }
  // `undefined`·함수 — `JSON.stringify`가 배열 원소에서 하는 것과 같은 취급.
  return "null";
}

// ── 스캐너 ─────────────────────────────────────────────────────────────────

/**
 * 평탄화 경로의 조인 구분자. **네 곳이 각자 `const SEP = "."`를 들고 있었다** — json-catalog·
 * yaml-catalog·code-dict의 flatten/unflatten과 이 스캐너. 한 곳이 바뀌면 나머지가 조용히 어긋난다
 * (2026-09-04 audit #22, POSTMORTEM 2026-09-02 재발). 이 모듈이 leaf라 여기 둔다.
 */
export const KEY_SEP = ".";
const SEP = KEY_SEP;

/**
 * 텍스트 한 번 훑기의 산출물. **표현(어댑터)과 원인(지표)이 같은 훑기에서 나온다.**
 *
 * 판정만 하고 값을 복원하지 않으므로 파서가 아니라 스캐너다 — 값을 복원하면 `JSON.parse`와 같은
 * 일을 두 번 하면서 정수 키 hoisting까지 되살아난다.
 */
export type JsonScan = {
  /** 파일에 쓰인 순서 그대로의 문자열 리프 키(`a.b.0`). */
  keyOrder: string[];
  /** 최상위 값 중 객체·배열이 하나라도 있는가 — `read`의 `nested` 판정과 같은 규칙이다. */
  nested: boolean;
  indent: IndentStyle;
  /** 한 줄에 담긴 **비어 있지 않은** 컨테이너의 경로. 루트는 담지 않는다. */
  compactPaths: Set<string>;
  /** 문자열 리터럴 **안에서** 코드포인트 > `0x7f`인 `\uXXXX`를 봤는가. */
  escapeNonAscii: boolean;
  /** 문자열 리터럴 **안에서** `\/`를 봤는가 — 선택적 이스케이프다. */
  escapeSlash: boolean;
  /** **원본 키 이름 자체**에 `.`이 든 것을 봤는가 — 평탄화 경로의 구분자와 구별해야 한다. */
  sawDottedName: boolean;
  /** 정규 정수 키를 가진 객체가 있는가 — JS가 앞으로 끌어올려 순서 보존이 원리적으로 불가능하다. */
  integerKeys: boolean;
  /** 빈 값(`null`·`""`)이 낀 배열이 있다 — 복원에서 dense가 깨져 모양이 객체로 바뀐다. */
  sparseArray: boolean;
  /** 미번역(`""`·`null`) 값이 있다 — 재생성 writer가 그 줄을 통째로 뺀다. */
  emptyValues: boolean;
  /** 스캔이 끝까지 못 갔다 — `keyOrder`와 수집 축을 신뢰하면 안 된다. */
  failed: boolean;
};

/**
 * JS 객체가 **앞으로 끌어올리는** 키인가 — 정규 배열 인덱스(`0` ≤ i < 2³²−1).
 *
 * ⚠️ `normalizeArrays`의 `isDense`(`0..n-1`이 빠짐없이 있는가)와 **다른 판정이다.** 여기서 재는
 * 것은 "이 객체의 삽입 순서가 유지되는가"이고, 그건 정수 키가 **하나만 있어도** 깨진다.
 */
const isCanonicalIndex = (name: string): boolean => {
  const n = Number(name);
  return String(n) === name && Number.isInteger(n) && n >= 0 && n < 2 ** 32 - 1;
};

/** 텍스트를 한 번 훑는다. **던지지 않는다** — 실패는 `failed`다. */
export function scanJson(text: string): JsonScan {
  const out: JsonScan = {
    keyOrder: [],
    nested: false,
    indent: indentOf(text),
    compactPaths: new Set<string>(),
    escapeNonAscii: false,
    escapeSlash: false,
    sawDottedName: false,
    integerKeys: false,
    sparseArray: false,
    emptyValues: false,
    failed: false,
  };
  try {
    new Scanner(text, out).run();
  } catch {
    // 스캔 실패는 정상 관측치다 — 깨진 JSON·우리가 모르는 확장 문법. 던지지 않는다.
    out.failed = true;
  }
  if (out.failed) out.keyOrder = [];
  return out;
}

class Scanner {
  private i = 0;
  /** 중첩 깊이. `1`이 최상위 값들이라 `read`의 `nested` 판정과 같은 지점을 본다. */
  private depth = 0;
  /** 지금 있는 컨테이너의 경로 세그먼트. 별칭을 안 만들려면 조인하지 않고 배열로 든다. */
  private readonly path: string[] = [];

  constructor(
    private readonly text: string,
    private readonly out: JsonScan,
  ) {}

  run(): void {
    this.ws();
    // 최상위가 객체가 아니면 카탈로그가 아니다 — 어댑터의 `non-object-root`와 같은 판정이다.
    if (this.peek() !== "{") {
      this.out.failed = true;
      return;
    }
    this.value();
    this.ws();
    if (this.i < this.text.length) this.out.failed = true;
  }

  private peek(): string | undefined {
    return this.text[this.i];
  }

  private ws(): void {
    while (this.i < this.text.length && /\s/.test(this.text[this.i]!)) this.i += 1;
  }

  private expect(ch: string): void {
    if (this.text[this.i] !== ch) throw new Error(`'${ch}' 자리에 '${this.text[this.i] ?? "EOF"}'`);
    this.i += 1;
  }

  /**
   * 값 하나를 소비한다. 문자열 리프면 현재 경로를 순서에 기록한다.
   *
   * @param inArray 배열 원소인가 — 빈 값의 결과가 다르다. 배열 안에서는 `sparseArray`(모양이
   *   객체로 바뀐다)이고 밖에서는 `emptyValues`(줄이 통째로 빠진다)라 **겹쳐 세면 안 된다.**
   */
  private value(inArray = false): void {
    this.ws();
    const ch = this.peek();
    if (ch === undefined) throw new Error("입력이 끝났다");
    // 최상위 값이 객체·배열이면 중첩이다 — `json-catalog.read`의 `nested` 판정과 같은 규칙.
    if ((ch === "{" || ch === "[") && this.depth === 1) this.out.nested = true;
    if (ch === "{") return this.object();
    if (ch === "[") return this.array();
    if (ch === '"') {
      const text = this.string();
      // ⚠️ 최상위 값은 키가 없다 — 최상위는 객체라야 하므로 여기 오지 않는다.
      if (this.path.length > 0) this.out.keyOrder.push(this.path.join(SEP));
      if (text === "" && !inArray) this.out.emptyValues = true;
      return;
    }
    // `null`은 미번역이다 — `flatten`이 건너뛰어 빈 문자열과 같은 결과가 된다.
    if (this.literal() === "null" && !inArray) this.out.emptyValues = true;
  }

  private object(): void {
    const open = this.i;
    this.expect("{");
    this.ws();
    const names: string[] = [];
    if (this.peek() === "}") {
      this.i += 1;
      return;
    }
    for (;;) {
      this.ws();
      const name = this.string();
      if (name.includes(SEP)) this.out.sawDottedName = true;
      names.push(name);
      this.ws();
      this.expect(":");
      this.depth += 1;
      this.path.push(name);
      this.value();
      this.path.pop();
      this.depth -= 1;
      this.ws();
      const next = this.peek();
      if (next === ",") {
        this.i += 1;
        continue;
      }
      this.expect("}");
      break;
    }
    // 정규 정수 키가 **하나라도** 있으면 그 객체의 순서는 JS가 다시 정한다.
    if (names.some(isCanonicalIndex)) this.out.integerKeys = true;
    this.markCompact(open, names.length > 0);
  }

  private array(): void {
    const open = this.i;
    this.expect("[");
    this.ws();
    if (this.peek() === "]") {
      this.i += 1;
      return;
    }
    let index = 0;
    let sparse = false;
    for (;;) {
      this.ws();
      // `null`과 `""`는 write에서 빠져(flatten이 건너뛰고 orderedEntries가 거른다) dense가 깨진다.
      if (this.text.startsWith("null", this.i)) sparse = true;
      else if (this.text.startsWith('""', this.i)) sparse = true;
      this.depth += 1;
      this.path.push(String(index));
      this.value(true);
      this.path.pop();
      this.depth -= 1;
      index += 1;
      this.ws();
      const next = this.peek();
      if (next === ",") {
        this.i += 1;
        continue;
      }
      this.expect("]");
      break;
    }
    if (sparse) this.out.sparseArray = true;
    this.markCompact(open, index > 0);
  }

  /**
   * 열고 닫는 사이에 개행이 없으면 **한 줄에 담긴 컨테이너**다.
   *
   * 최상위(`depth === 0`)는 담지 않는다 — 파일 전체가 한 줄인 경우이고, 담으면 **우리가 한 줄짜리
   * 파일을 낸다.** 들여쓰기 관측 불가와 같은 사건이라 지표에서도 이중으로 세게 된다.
   */
  private markCompact(open: number, nonEmpty: boolean): void {
    if (!nonEmpty || this.depth === 0) return;
    if (!this.text.slice(open, this.i).includes("\n")) this.out.compactPaths.add(pathKey(this.path));
  }

  /** 문자열 하나를 소비하고 **해석된** 값을 준다 — 키에 `\"`·`\\`가 들어갈 수 있다. */
  private string(): string {
    this.expect('"');
    const start = this.i;
    for (;;) {
      const ch = this.text[this.i];
      if (ch === undefined) throw new Error("닫히지 않은 문자열");
      if (ch === "\\") {
        // ⚠️ 이스케이프 관측이 **여기** 있어야 한다. 문자열 문맥을 안 보는 전역 정규식이면 값이
        // 담은 리터럴 백슬래시-u 여섯 글자를 이스케이프로 오독하고, 재관측이 false → true로
        // 뒤집혀 2차 write가 1차와 달라진다 (바이트 고정점이 깨진다).
        if (this.text[this.i + 1] === "/") this.out.escapeSlash = true;
        if (this.text[this.i + 1] === "u") {
          const hex = this.text.slice(this.i + 2, this.i + 6);
          // ASCII 범위(`A` = A)까지 세면 거짓 양성이다 — `JSON.stringify`가 ASCII를
          // 이스케이프하지 않으므로 그 줄은 어차피 diff가 아니다.
          if (/^[0-9a-fA-F]{4}$/.test(hex) && Number.parseInt(hex, 16) > 0x7f) {
            this.out.escapeNonAscii = true;
          }
        }
        this.i += 2;
        continue;
      }
      if (ch === '"') break;
      this.i += 1;
    }
    const raw = this.text.slice(start, this.i);
    this.i += 1;
    // 이스케이프 해석은 JSON.parse에 맡긴다 — 직접 풀면 `\uXXXX` 서로게이트 쌍에서 어긋난다.
    return raw.includes("\\") ? (JSON.parse(`"${raw}"`) as string) : raw;
  }

  /** `true`·`false`·`null`·숫자 — 문자열이 아니므로 키를 만들지 않는다. */
  private literal(): string {
    const start = this.i;
    while (this.i < this.text.length && /[^,}\]\s]/.test(this.text[this.i]!)) this.i += 1;
    if (this.i === start) throw new Error("빈 리터럴");
    return this.text.slice(start, this.i);
  }
}
