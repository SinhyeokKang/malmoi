# android-strings 채록 픽스처 (android-strings T3.0d·T3.1)

`aapt2-values.json`은 `<string>` 안쪽 원문(`raw`)과 **aapt2가 컴파일한 값**(`aapt2`)의 쌍이다. 디코더(`decodeAndroidValue`)의 기대값이고 손으로 고치지 않는다 —
플랫폼 파서와 다르게 푸는 결함(apple-strings 리뷰 R1·R2-1)을 막는 정본이다.

- 채록 도구: aapt2 `2.20-15978811` — Google Maven `com.android.tools.build:aapt2:9.4.1-15978811:osx`(jar의 SHA-1 `8923869d6019c87d3f66294df0a82118d4488abd`).
  이 머신에 Android SDK가 없어 Gradle이 받는 것과 같은 jar를 받았다(2026-10-19).
- 절차: 케이스를 `res/values/strings.xml` 하나에 `<string name="cN">raw</string>`으로 모아 `aapt2 compile` → `aapt2 dump apc`의 값을 읽었다.
  dump는 값 안의 줄바꿈 뒤에 들여쓰기 8칸을 끼워 출력하므로 그것만 걷었다.
- 값 문법(orch 결정 14)은 이 표 밖이다 — `aapt2` 열은 aapt2가 읽은 **글**이고, 테스트가 그 글을 값 문법(글자 `<` → `&lt;`, `lt;`·`amp;` 앞 `&` → `&amp;`)으로 옮겨 견준다.
- 채록에서 aapt2 **오류**였던 것(이스케이프 안 된 `'` · 위치 지정 없는 `%s %d` 둘 · `&apos;x&apos;` · 같은 이름 · `name` 없음 · `&#1;` · `\uZZZZ`)은 표에 없다 —
  어댑터 테스트가 각각의 처리(읽되 글자 그대로 · 실패 · duplicate-key)를 따로 단언한다.

## 함께 채록한 의미(테스트가 단언한다)

- 스팬 태그(`<b>`·`<i>`·`<a>`) 경계에서 공백 접기가 다시 시작되고, 스팬이 있으면 앞뒤를 자르지 않는다(`"  <b>x</b>  "` → ` x `).
- `<xliff:g>`는 스팬이 아니다 — 접기가 이어지고 앞뒤를 자른다(`" Hi <xliff:g>%1$s</xliff:g> "` → `Hi %1$s`).
- 서로게이트 `😀`은 aapt2가 버린다(빈 값). 디코더도 버린다.
- 알려진 차이: 따옴표로 감싼 스팬 값 `"  <b>x</b>  "`을 aapt2는 `  x `(뒤 공백 하나)로 읽는다 — 디코더는 따옴표 상태를 스팬 경계에서 끊지 않아 `  x  `이다.
  드문 형이라 맞추지 않았고, 인코더는 앞뒤 공백이 있는 값을 감싼다.
