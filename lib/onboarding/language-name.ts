/**
 * 로케일 코드 → **영어 언어 이름** (③의 기준 언어 행).
 *
 * ⚠️ **자국어가 아니다** (2026-09-13 사용자 — 실측 뒤 뒤집었다). 처음에는 `Intl.DisplayNames([code])`로
 * 자국어를 냈는데, **그 로케일 데이터가 없으면 보는 사람의 시스템 언어로 떨어진다**: Chrome(시스템 ko)
 * 에서 `az-AZ`가 `azərbaycan (아제르바이잔)`이었고 같은 코드가 Node에서는 `azərbaycan (Azərbaycan)`
 * 이었다. 팀원마다 다른 화면을 보고, 그 값이 서버 렌더 경로에 실리는 날 **hydration text mismatch**가
 * 된다. 영어로 고정하면 런타임·시스템과 무관하게 같은 문자열이고, 화면 문구가 전부 영어인 것과도 맞다.
 *
 * ⚠️ **하위태그를 떼지 않는다.** `zh-Hans`/`zh-Hant`·`pt-BR`/`pt-PT`가 같은 이름이 되면 **되돌릴 수
 * 없는 결정을 잘못 내린다** — 언어 서브태그만 넘기는 안을 그래서 버렸다.
 *
 * ⚠️ **실패하면 코드를 그대로 돌려준다.** 코드는 리포에서 온 임의 문자열이라 매핑이 원리적으로
 * 실패한다 — `flagFor`가 `null`을 내는 것과 같은 자리다 (DESIGN: "답은 아무것도 안 그린다").
 *
 * ⚠️ **`Intl.DisplayNames`를 인자마다 새로 만들지 않는다** — 생성이 비싸고 ③은 로케일 수만큼 부른다.
 * 다만 **모듈 최상위에서 만들지도 않는다**: 그러면 파일을 읽기만 해도 ICU가 깨어난다.
 */
let names: Intl.DisplayNames | undefined;

export function languageName(code: string): string {
  if (code === "") return code;
  try {
    names ??= new Intl.DisplayNames(["en"], { type: "language" });
    // ⚠️ 매핑이 없으면 `of`가 **코드를 그대로** 돌려준다 — 그 경우와 성공을 값으로 가르지 않는다.
    return names.of(code) ?? code;
  } catch {
    // ⚠️ `of`는 구조적으로 잘못된 코드에 `RangeError`를 던진다 (`"not a locale"`).
    return code;
  }
}
