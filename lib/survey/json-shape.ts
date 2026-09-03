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
export type IndentStyle = { char: "space" | "tab" | "none"; width: number };

/** 순서 외에 첫 write diff를 만드는 원인들 — 텍스트에서 관측되는 것만. */
export type JsonDiffCauses = {
  /** 들여쓰기가 2칸 스페이스가 아니다 (`serialize`가 항상 2칸으로 낸다). */
  indent: boolean;
  /** 원본이 비ASCII를 `\uXXXX`로 이스케이프했다 — `JSON.stringify`가 풀어 그 줄 전부가 diff다. */
  escapedNonAscii: boolean;
  /** 빈 값(`null`·`""`)이 낀 배열이 있다 — 복원에서 dense가 깨져 **모양이 객체로 바뀐다.** */
  sparseArray: boolean;
  /** 객체 키가 정규 정수 문자열이다 — JS가 앞으로 끌어올려 **순서 보존이 원리적으로 불가능하다.** */
  integerKeys: boolean;
};

export type JsonShape = {
  /** 파일에 쓰인 순서 그대로의 문자열 리프 키. `failed`면 빈 배열이다. */
  keyOrder: string[];
  indent: IndentStyle;
  causes: JsonDiffCauses;
  /** 스캔이 끝까지 못 갔다 — 순서를 신뢰하면 안 된다. */
  failed: boolean;
};

const SEP = ".";

export const emptyJsonDiffCauses = (): JsonDiffCauses => ({
  indent: false,
  escapedNonAscii: false,
  sparseArray: false,
  integerKeys: false,
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
    indent: indentOf(text),
    causes: emptyJsonDiffCauses(),
    failed: false,
  };
  shape.causes.indent = shape.indent.char !== "none" && !(shape.indent.char === "space" && shape.indent.width === 2);
  shape.causes.escapedNonAscii = hasEscapedNonAscii(text);

  const scanner = new Scanner(text, shape);
  try {
    scanner.run();
  } catch {
    // 스캔 실패는 정상 관측치다 — 깨진 JSON·우리가 모르는 확장 문법. 던지지 않는다.
    shape.failed = true;
  }
  if (shape.failed) shape.keyOrder = [];
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
 * 첫 **들여쓴 줄**의 선행 공백을 본다.
 *
 * 깊은 층의 배수(4칸 파일의 2층은 8칸)에 흔들리지 않으려면 첫 층만 봐야 한다. 들여쓴 줄이
 * 없으면(한 줄 파일) `none`이다 — 0칸이라고 보고하면 "2칸이 아니다"가 되어 없는 원인이 선다.
 */
function indentOf(text: string): IndentStyle {
  for (const line of text.split("\n")) {
    const m = /^([ \t]+)\S/.exec(line);
    if (!m) continue;
    const lead = m[1]!;
    return lead[0] === "\t" ? { char: "tab", width: lead.length } : { char: "space", width: lead.length };
  }
  return { char: "none", width: 0 };
}

/**
 * JSON을 한 번 훑으며 문자열 리프의 경로를 등장 순서로 모은다.
 *
 * 값 자체는 만들지 않는다 — 필요한 건 "어떤 키가 언제 나왔나"뿐이고, 값을 복원하면 `JSON.parse`와
 * 같은 일을 두 번 하면서 정수 키 hoisting까지 되살아난다.
 */
class Scanner {
  private i = 0;

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

  /** 값 하나를 소비한다. 문자열 리프면 `path`를 순서에 기록한다. */
  private value(path: string): void {
    this.ws();
    const ch = this.peek();
    if (ch === undefined) throw new Error("입력이 끝났다");
    if (ch === "{") return this.object(path);
    if (ch === "[") return this.array(path);
    if (ch === '"') {
      this.string();
      // ⚠️ 최상위 값(`path === ""`)은 키가 없다 — 최상위는 객체라야 하므로 여기 오지 않는다.
      if (path !== "") this.shape.keyOrder.push(path);
      return;
    }
    this.literal();
  }

  private object(path: string): void {
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
      names.push(name);
      this.ws();
      this.expect(":");
      this.value(path === "" ? name : `${path}${SEP}${name}`);
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
  }

  private array(path: string): void {
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
      this.value(`${path}${SEP}${index}`);
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
  private literal(): void {
    const start = this.i;
    while (this.i < this.text.length && /[^,}\]\s]/.test(this.text[this.i]!)) this.i += 1;
    if (this.i === start) throw new Error("빈 리터럴");
  }
}
