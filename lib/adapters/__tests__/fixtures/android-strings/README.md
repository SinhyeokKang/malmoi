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

- aapt2는 `\u` 서로게이트(`\uD83D\uDE00`)를 버린다(빈 값) — 디코더도 버린다. 따옴표 안의 CRLF는 XML 파서가 LF 하나로 바꾼 뒤 읽는다.

## 스팬 공백 — `aapt2-styled.json` (fix1, 리뷰 R1)

`raw` → aapt2가 낸 styled string의 본문(`text`)과 스팬 범위(`spans`, dump 표기 그대로 — `b:2,2`는 시작·끝 포함, `a;href=…`는 속성). 같은 도구·절차다
(`.scratch/android-parser/cap2.py`가 `formatted="false"`를 붙여 컴파일한다 — 위치 없는 `%s`가 섞여도 오류가 나지 않게).

채록이 정한 규칙(디코더가 그대로 따른다):
- 스팬 태그(`<b>`·`<i>`·`<a>`·`<br/>` …)의 **시작과 끝에서 공백 접기와 따옴표 구간이 둘 다 다시 시작된다** — `"  <b>x</b>  "` → `  x `(뒤 따옴표 구간이 스팬
  경계에서 닫혀 뒤 공백 둘이 하나로 접힌다). `"a  <b>  x  </b>  b"` → `a   x  b`.
- 스팬이 있으면 앞뒤를 자르지 않는다(`  <b>x</b>  ` → ` x `). 스팬이 없으면 접어서 생긴 앞뒤 공백을 자른다.
- `<xliff:g>`는 스팬이 아니다 — 접기·따옴표가 이어지고 앞뒤를 자른다.

⚠️ **fix1 전 인계(“계획과 다른 점” 8)의 주장은 틀렸다** — “디코더만 `  x  `로 읽고 인코더는 감싸므로 새 값은 영향 없음”이 아니었다. 값 전체를 감싸는 인코더가
바로 그 원문(`"  <b>x</b>  "`)을 냈고 aapt2는 뒤 공백 하나를 잃었다. 지금 인코더는 스팬이 있으면 **스팬 경계 사이 구간마다** 연속 공백이 있을 때만 그 구간을
감싼다(`"  "<b>x</b>"  "`).

## 인코더 검증 — `aapt2-encoded.json`·`compose-encoded.json` (fix1)

DB 값(`value`)을 인코더(`encodeAndroidValue`)로 원문(`raw`)으로 만들고, 그 원문을 각 도구가 다시 읽은 결과다 — aapt2는 본문·스팬(`text`·`spans`),
Compose는 값(`compose`). 테스트가 인코더 출력이 이 `raw`와 같고 도구 결과가 값의 글(태그를 걷은 것)·스팬과 같음을 단언한다 — 새 값이 Publish 뒤
DB 값 그대로 앱에 보인다는 증거다. 만든 스크립트: `.scratch/android-parser/encode-cases.ts`(케이스 목록) → aapt2 `cap2.py` · Compose `Capture.java`.

## Compose Multiplatform — `compose-values.json` (fix1, 리뷰 Y2)

`composeResources/`의 값은 aapt2를 지나지 않는다 — Compose gradle 플러그인이 XML을 `.cvr`로 바꾼다. 채록은 그 변환의 실제 코드를 돌렸다:

- 도구: `org.jetbrains.compose:compose-gradle-plugin:1.12.2`(Maven Central — 코퍼스 Meshtastic 1.12.2 · NewPipe·EasyWatermark 1.12.0) jar의
  `PrepareComposeResourcesKt.handleSpecialCharacters` + 같은 클래스가 쓰는 `DocumentBuilderFactory.newInstance().newDocumentBuilder()`의 `textContent`
  (`XmlValuesConverterTask.convert` → `getItemRecord`의 STRING 갈래 그대로). JDK 21(Temurin, scratchpad) + `kotlin-stdlib` 2.1.0으로 돌렸다(2026-10-19).
- 규칙: 태그는 걷고(텍스트만 잇는다), 엔티티·CDATA는 풀고, 줄 끝은 XML 파서가 LF로 바꾼다. 그 글에서 `\n`·`\t`·`\uXXXX`(정확히 4자리)만 풀되 바로 앞이 `\\`의
  둘째 글자면 그대로 두고, 마지막에 `\\`를 `\`로 줄인다. **공백 접기·따옴표 구간·`\'`·`\"`·`\@`·`\?` 이스케이프가 없다** — `"[Remote] %1$s"`는 따옴표째,
  `Don\'t`는 역슬래시째다. 서로게이트 쌍 `\uD83D\uDE00`은 이모지다(aapt2는 버린다).
- 어댑터는 `values-{locale}/strings.xml` **바로 앞** 리소스 디렉터리가 `composeResources`일 때만 이 의미로 읽고 쓴다(`dialectOf` — 조상 이름이 아니다. `composeResources/app/src/main/res/`는 aapt2다, 리뷰 R2-1). 값의 태그는 원문 그대로, Compose가 본 글의 같은 자리에 남는다(Compose 화면에는 보이지 않는다 — 그대로 둔 `\n`·`\uXXXX` 매치 안의 태그도 제자리다, 리뷰 R2-2).

## `formatted` 속성 — 결정 18 (fix1, 리뷰 Y1)

create가 기준 `<string name="fmt" formatted="false">%s %d</string>`에서 만든 ko 파일 `<string name="fmt" formatted="false">%s · %d</string>`을 aapt2로
컴파일하면 통과하고, 속성을 뺀 대조는 `multiple substitutions specified in non-positional format; did you mean to add the formatted="false" attribute?`로
실패한다(2026-10-19, 같은 aapt2). 그래서 create와 비기준 파일의 누락 키 삽입이 기준 `<string>`의 `formatted` 속성 원문을 그대로 나른다 — 값은 DB에서만 온다.
