import { scanJson, type IndentStyle } from "../adapters/json-style";

/**
 * 원본 JSON **텍스트**에서 키 등장 순서·들여쓰기·잔여 diff 원인을 뽑는다.
 *
 * ⚠️ **어댑터의 `read`로는 못 한다.** `json-catalog.read`가 엔트리를 코드 유닛 순으로 정렬해
 * 돌려주므로(`json-catalog.ts:173`) 파일 순서가 그 지점에서 사라진다. `JSON.parse`도 답이
 * 아니다 — 정규 정수 키(`"0"`·`"10"`)를 JS 객체가 숫자 오름차순으로 끌어올려 삽입 순서를 지운다.
 *
 * ⚠️ **훑는 일 자체는 `lib/adapters/json-style.ts`가 한다.** 이 모듈은 그 산출물(`JsonScan`)을
 * 지표의 어휘로 옮기는 얇은 껍데기다 — 스캐너가 두 벌이 되면 **지표가 재는 대상과 프로덕션이
 * 내는 파일이 갈리고**, 그때 개선이 게이트에 안 나타난다 (ARCHITECTURE §1.35).
 */

/** 관측된 들여쓰기. `none`은 "들여쓴 줄이 없다"이지 "들여쓰기가 0칸"이 아니다. */
export type { IndentStyle } from "../adapters/json-style";

/**
 * 순서 외에 첫 write diff를 만드는 원인들 — 텍스트에서 관측되는 것만.
 *
 * ⚠️ **고쳐진 축은 여기서 뺀다.** 원인이 아닌데 남겨 두면 그 리포들이 `diff.clean` 분모에서
 * 계속 빠져 **개선이 게이트에 나타나지 않는다** — chrome 필드에서 정확히 그 일이 있었고 리포
 * 13개가 부당하게 빠졌다 (POSTMORTEM 2026-09-03). `indent`가 2026-09-04에 그렇게 빠졌다:
 * 재생성 writer가 원본 폭을 따르므로 더 이상 diff를 만들지 않고, **관측치 `JsonShape.indent`로만
 * 남는다.**
 */
export type JsonDiffCauses = {
  /** 빈 값(`null`·`""`)이 낀 배열이 있다 — 복원에서 dense가 깨져 **모양이 객체로 바뀐다.** */
  sparseArray: boolean;
  /** 객체 키가 정규 정수 문자열이다 — JS가 앞으로 끌어올려 **순서 보존이 원리적으로 불가능하다.** */
  integerKeys: boolean;
  /**
   * 미번역(`""`·`null`) 값이 있다 — 재생성 writer가 그 **줄을 통째로 뺀다**.
   *
   * zulip 실측: base가 `ar`이고 미번역이 `""`라 2285줄이 1378줄이 됐다. **의도된 규칙이고 고쳐서도
   * 안 된다** — 빈 값을 남기면 크롬이 빈 문자열을 그대로 렌더한다 (ARCHITECTURE §1.1). 순서 보존이
   * 책임질 수 없는 축이라 원인으로 센다.
   */
  emptyValues: boolean;
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
  /**
   * 원본이 비ASCII를 `\uXXXX`로 적었는가. **원인이 아니라 관측치다** — 재생성 writer가
   * `JsonStyle.escapeNonAscii`로 되돌린다 (2026-09-04, 태스크 1b).
   */
  escapedNonAscii: boolean;
  /**
   * 비어 있지 않은 객체·배열이 **한 줄에 담겨 있다** (`"k": { "message": … }`). **원인이 아니라
   * 관측치다** — `JsonStyle.compactPaths`가 그 경로만 다시 한 줄로 낸다 (2026-09-04, 태스크 1b).
   *
   * 빈 `{}`·`[]`는 세지 않는다 — `JSON.stringify`도 한 줄로 낸다. 최상위 자체도 세지 않는다:
   * 파일 전체가 한 줄이면 들여쓰기 관측 불가와 같은 축이라 이중으로 세게 된다.
   */
  compactContainer: boolean;
  /**
   * 원본이 `/`를 `\/`로 적었는가. **관측치다** — `JsonStyle.escapeSlash`가 되돌린다
   * (2026-09-04, 10차가 드러낸 네 번째 표현 축).
   */
  escapedSlash: boolean;
  causes: JsonDiffCauses;
  /** 스캔이 끝까지 못 갔다 — 순서를 신뢰하면 안 된다. */
  failed: boolean;
};

export const emptyJsonDiffCauses = (): JsonDiffCauses => ({
  sparseArray: false,
  integerKeys: false,
  emptyValues: false,
  dottedWithNested: false,
});

export function jsonShape(text: string): JsonShape {
  const scan = scanJson(text);
  return {
    keyOrder: scan.keyOrder,
    nested: scan.nested,
    indent: scan.indent,
    // 스캔이 끝까지 못 갔으면 수집 축은 부분값이다 — `observeJsonStyle`이 버리는 것과 같은 판정으로
    // 버린다. 지표만 세면 그 리포가 "축 덮임"으로 과대 계상된다 (2026-09-04 audit #21).
    escapedNonAscii: !scan.failed && scan.escapeNonAscii,
    compactContainer: !scan.failed && scan.compactPaths.size > 0,
    escapedSlash: !scan.failed && scan.escapeSlash,
    causes: {
      sparseArray: scan.sparseArray,
      integerKeys: scan.integerKeys,
      emptyValues: scan.emptyValues,
      // 둘이 **공존할 때만** 구조가 바뀐다 — 중첩이 없으면 flat write가 키를 그대로 둔다.
      // ⚠️ `keyOrder`의 `.`을 세면 안 된다 — 그건 **우리가 만든 조인 구분자**라 중첩이면 늘 있다.
      // 봐야 하는 것은 **원본 키 이름 자체**에 든 점이다.
      dottedWithNested: scan.nested && scan.sawDottedName,
    },
    failed: scan.failed,
  };
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
