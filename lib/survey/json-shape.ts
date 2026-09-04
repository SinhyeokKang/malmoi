import { indentOf, type IndentStyle } from "../adapters/json-style";

/**
 * 원본 JSON **텍스트**에서 키 등장 순서·들여쓰기·잔여 diff 원인을 뽑는다.
 *
 * ⚠️ **어댑터의 `read`로는 못 한다.** `json-catalog.read`가 엔트리를 코드 유닛 순으로 정렬해
 * 돌려주므로(`json-catalog.ts:173`) 파일 순서가 그 지점에서 사라진다. `JSON.parse`도 답이
 * 아니다 — 정규 정수 키(`"0"`·`"10"`)를 JS 객체가 숫자 오름차순으로 끌어올려 삽입 순서를 지운다.
 *
 * 그래서 텍스트를 한 번 훑는다. **판정만 하고 값을 복원하지 않으므로** 파서가 아니라 스캐너다 —
 * 실패하면 `failed`로 알리고 아무것도 추측하지 않는다.
 *
 * 키 표기는 `json-catalog`의 `flatten`과 맞춘다(`a.b.0`, 배열은 인덱스). 맞춰야 이 순서를
 * 어댑터가 내는 엔트리 키와 나란히 놓고 읽을 수 있다.
 */

/** 관측된 들여쓰기. `none`은 "들여쓴 줄이 없다"이지 "들여쓰기가 0칸"이 아니다. */
/**
 * ⚠️ **판정은 `lib/adapters/json-style.ts`가 든다.** 지표가 자기 사본을 들면 프로덕션이 내는
 * 파일과 지표가 재는 대상이 갈린다 — 그때 개선이 게이트에 안 나타난다.
 */
export type { IndentStyle } from "../adapters/json-style";

/**
 * 순서 외에 첫 write diff를 만드는 원인들 — 텍스트에서 관측되는 것만.
 *
 * ⚠️ **고쳐진 축은 여기서 뺀다.** 원인이 아닌데 남겨 두면 그 리포들이 `diff.clean` 분모에서
 * 계속 빠져 **개선이 게이트에 나타나지 않는다** — chrome 필드에서 정확히 그 일이 있었고 리포
 * 13개가 부당하게 빠졌다 (POSTMORTEM 2026-09-03). `indent`가 2026-09-04에 그렇게 빠졌다:
 * 재생성 writer가 원본 폭을 따르므로 더 이상 diff를 만들지 않고, **관측치 `JsonShape.indent`로만
 * 남는다.** `escapedNonAscii`·`compactContainer`는 아직 안 고쳐서 여전히 원인이다.
 */
export type JsonDiffCauses = {
  /** 원본이 비ASCII를 `\uXXXX`로 이스케이프했다 — `JSON.stringify`가 풀어 그 줄 전부가 diff다. */
  escapedNonAscii: boolean;
  /** 빈 값(`null`·`""`)이 낀 배열이 있다 — 복원에서 dense가 깨져 **모양이 객체로 바뀐다.** */
  sparseArray: boolean;
  /** 객체 키가 정규 정수 문자열이다 — JS가 앞으로 끌어올려 **순서 보존이 원리적으로 불가능하다.** */
  integerKeys: boolean;
  /**
   * 미번역(`""`·`null`) 값이 있다 — 재생성 writer가 그 **줄을 통째로 뺀다**.
   *
   * zulip 실측: base가 `ar`이고 미번역이 `""`라 2285줄이 1378줄이 됐다. **의도된 규칙이고 고쳐서도
   * 안 된다** — 빈 값을 남기면 크롬이 빈 문자열을 그대로 렌더한다 (MVP §4.1). 순서 보존이
   * 책임질 수 없는 축이라 원인으로 센다.
   */
  emptyValues: boolean;
  /**
   * 비어 있지 않은 객체·배열이 **한 줄에 담겨 있다** — `serialize`가 2칸으로 펼쳐서 diff가 난다.
   *
   * chrome `_locales`의 흔한 관례다: `"k": { "message": "…" }`. 순서가 완벽해도 파일 전체가
   * diff이고(button-stealer 실측 0.964, 38줄 → 128줄) **들여쓰기 원인의 사촌**이다 — 둘 다
   * `serialize`의 결정성 규칙이 만드는 것이라 같은 별 기능이 다뤄야 한다.
   *
   * 빈 `{}`·`[]`는 세지 않는다 — `JSON.stringify`도 한 줄로 낸다. 최상위 자체도 세지 않는다:
   * 파일 전체가 한 줄이면 들여쓰기 관측 불가와 같은 축이라 이중으로 세게 된다.
   */
  compactContainer: boolean;
  /**
   * 점 포함 키가 중첩과 **공존한다** — 복원에서 `"a.b"`가 경로로 쪼개져 구조가 바뀐다.
   *
   * `.`가 우리 조인 구분자이면서 실제 키에 든 문자라 flatten/unflatten이 단사가 아니다
   * (POSTMORTEM 2026-09-02). musicblocks·scratchblocks·siyuan이 이 축이고, 키 구분자를 계약으로
   * 빼는 별 기능이 담당한다. **중첩이 없으면 원인이 아니다** — flat write는 키를 쪼개지 않는다.
   */
  dottedWithNested: boolean;
};

export type JsonShape = {
  /** 파일에 쓰인 순서 그대로의 문자열 리프 키. `failed`면 빈 배열이다. */
  keyOrder: string[];
  /** 최상위 값 중 객체·배열이 하나라도 있는가 — `read`의 `nested` 판정과 같은 규칙이다. */
  nested: boolean;
  indent: IndentStyle;
  causes: JsonDiffCauses;
  /** 스캔이 끝까지 못 갔다 — 순서를 신뢰하면 안 된다. */
  failed: boolean;
};

const SEP = ".";

export const emptyJsonDiffCauses = (): JsonDiffCauses => ({
  escapedNonAscii: false,
  sparseArray: false,
  integerKeys: false,
  emptyValues: false,
  dottedWithNested: false,
  compactContainer: false,
});

/**
 * JS 객체가 **앞으로 끌어올리는** 키인가 — 정규 배열 인덱스(`0` ≤ i < 2³²−1).
 *
 * ⚠️ `normalizeArrays`의 `isDense`(`0..n-1`이 빠짐없이 있는가)와 **다른 판정이다.** 여기서 재는
 * 것은 "이 객체의 삽입 순서가 유지되는가"이고, 그건 정수 키가 **하나만 있어도** 깨진다.
 * 범위를 넓게 잡으면(`"99999999999999"`까지 세면) JS가 끌어올리지 않는 키까지 원인으로 세어져,
 * "정수 키는 원리적으로 보존 불가"라는 비목표의 근거가 부풀려진다.
 */
const isCanonicalIndex = (name: string): boolean => {
  const n = Number(name);
  return String(n) === name && Number.isInteger(n) && n >= 0 && n < 2 ** 32 - 1;
};

export function jsonShape(text: string): JsonShape {
  const shape: JsonShape = {
    keyOrder: [],
    nested: false,
    indent: indentOf(text),
    causes: emptyJsonDiffCauses(),
    failed: false,
  };
  shape.causes.escapedNonAscii = hasEscapedNonAscii(text);

  const scanner = new Scanner(text, shape);
  try {
    scanner.run();
  } catch {
    // 스캔 실패는 정상 관측치다 — 깨진 JSON·우리가 모르는 확장 문법. 던지지 않는다.
    shape.failed = true;
  }
  if (shape.failed) shape.keyOrder = [];
  // 둘이 **공존할 때만** 구조가 바뀐다 — 중첩이 없으면 flat write가 키를 그대로 둔다.
  // ⚠️ `keyOrder`의 `.`을 세면 안 된다 — 그건 **우리가 만든 조인 구분자**라 중첩이면 늘 있다.
  // 봐야 하는 것은 **원본 키 이름 자체**에 든 점이다.
  shape.causes.dottedWithNested = shape.nested && scanner.sawDottedName;
  return shape;
}

/**
 * 두 키 순서가 **공통 키에 대해** 같은가.
 *
 * 공통 키만 보는 이유: 로케일 파일은 번역이 덜 된 키가 빠져 있는 게 정상이다. 그걸 불일치로 세면
 * 일치율이 순서가 아니라 **번역 완성도**를 재게 된다.
 *
 * 공통 키가 하나도 없으면 `false`다 — 판정할 근거가 없는 것을 "같다"로 세면 일치율이 부풀고,
 * 그 값이 A안/대안 E를 가르므로 부풀린 쪽이 곧 잘못된 스키마다.
 */
export function sameCommonOrder(a: readonly string[], b: readonly string[]): boolean {
  const inB = new Set(b);
  const left = a.filter((k) => inB.has(k));
  if (left.length === 0) return false;
  const inA = new Set(a);
  const right = b.filter((k) => inA.has(k));
  if (left.length !== right.length) return false;
  return left.every((k, i) => k === right[i]);
}

/**
 * `\uXXXX` 이스케이프 중 **ASCII 범위를 벗어나는 것**이 있는가.
 *
 * `JSON.stringify`는 비ASCII를 그대로 낸다. 그래서 원본이 `\uD55C`로 쓴 줄은 write에서 `한`이
 * 되어 **그 줄 전부가 diff**다. `\u0041`(A)까지 세면 거짓 양성이므로 코드포인트를 본다.
 */
function hasEscapedNonAscii(text: string): boolean {
  for (const m of text.matchAll(/\\u([0-9a-fA-F]{4})/g)) {
    if (Number.parseInt(m[1]!, 16) > 0x7f) return true;
  }
  return false;
}

/**
 * JSON을 한 번 훑으며 문자열 리프의 경로를 등장 순서로 모은다.
 *
 * 값 자체는 만들지 않는다 — 필요한 건 "어떤 키가 언제 나왔나"뿐이고, 값을 복원하면 `JSON.parse`와
 * 같은 일을 두 번 하면서 정수 키 hoisting까지 되살아난다.
 */
class Scanner {
  private i = 0;
  /** 중첩 깊이. `1`이 최상위 값들이라 `read`의 `nested` 판정과 같은 지점을 본다. */
  private depth = 0;
  /** **원본 키 이름 자체**에 `.`이 든 것을 봤는가 — 평탄화 경로의 구분자와 구별해야 한다. */
  sawDottedName = false;

  constructor(
    private readonly text: string,
    private readonly shape: JsonShape,
  ) {}

  run(): void {
    this.ws();
    // 최상위가 객체가 아니면 카탈로그가 아니다 — 어댑터의 `non-object-root`와 같은 판정이다.
    if (this.peek() !== "{") {
      this.shape.failed = true;
      return;
    }
    this.value("");
    this.ws();
    if (this.i < this.text.length) this.shape.failed = true;
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
   * 값 하나를 소비한다. 문자열 리프면 `path`를 순서에 기록한다.
   *
   * @param inArray 배열 원소인가 — 빈 값의 결과가 다르다. 배열 안에서는 `sparseArray`(모양이
   *   객체로 바뀐다)이고 밖에서는 `emptyValues`(줄이 통째로 빠진다)라 **겹쳐 세면 안 된다.**
   */
  private value(path: string, inArray = false): void {
    this.ws();
    const ch = this.peek();
    if (ch === undefined) throw new Error("입력이 끝났다");
    // 최상위 값이 객체·배열이면 중첩이다 — `json-catalog.read`의 `nested` 판정과 같은 규칙.
    if ((ch === "{" || ch === "[") && this.depth === 1) this.shape.nested = true;
    if (ch === "{") return this.object(path);
    if (ch === "[") return this.array(path);
    if (ch === '"') {
      const text = this.string();
      // ⚠️ 최상위 값(`path === ""`)은 키가 없다 — 최상위는 객체라야 하므로 여기 오지 않는다.
      if (path !== "") this.shape.keyOrder.push(path);
      if (text === "" && !inArray) this.shape.causes.emptyValues = true;
      return;
    }
    // `null`은 미번역이다 — `flatten`이 건너뛰어 빈 문자열과 같은 결과가 된다.
    if (this.literal() === "null" && !inArray) this.shape.causes.emptyValues = true;
  }

  private object(path: string): void {
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
      if (name.includes(SEP)) this.sawDottedName = true;
      names.push(name);
      this.ws();
      this.expect(":");
      this.depth += 1;
      this.value(path === "" ? name : `${path}${SEP}${name}`);
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
    if (names.some(isCanonicalIndex)) this.shape.causes.integerKeys = true;
    this.markCompact(open, names.length > 0);
  }

  private array(path: string): void {
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
      this.value(`${path}${SEP}${index}`, true);
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
    if (sparse) this.shape.causes.sparseArray = true;
    this.markCompact(open, index > 0);
  }

  /**
   * 열고 닫는 사이에 개행이 없으면 **한 줄에 담긴 컨테이너**다.
   *
   * 최상위(`depth === 0`)는 세지 않는다 — 파일 전체가 한 줄인 경우이고 그건 들여쓰기 관측
   * 불가와 같은 사건이라 이중으로 세게 된다.
   */
  private markCompact(open: number, nonEmpty: boolean): void {
    if (!nonEmpty || this.depth === 0) return;
    if (!this.text.slice(open, this.i).includes("\n")) this.shape.causes.compactContainer = true;
  }

  /** 문자열 하나를 소비하고 **해석된** 값을 준다 — 키에 `\"`·`\\`가 들어갈 수 있다. */
  private string(): string {
    this.expect('"');
    const start = this.i;
    for (;;) {
      const ch = this.text[this.i];
      if (ch === undefined) throw new Error("닫히지 않은 문자열");
      if (ch === "\\") {
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
