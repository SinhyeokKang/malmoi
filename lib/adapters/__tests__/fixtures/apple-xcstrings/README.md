# apple-xcstrings 골든 픽스처 (apple-strings T4.0)

`.xcstrings`는 Xcode가 쓰는 JSON이고, Malmoi의 수술적 치환·셀 삽입은 **Xcode가 다시 저장해도 diff가 생기지 않는 서식**이어야 한다(design §2.3).
여기 파일은 그 서식을 바이트로 고정한다. 손으로 고치지 않는다.

## 코퍼스 원본 — 바이트 그대로

모바일 코퍼스(`docs/adapter-survey/repos-mobile.txt`)의 정답 카탈로그를 고정 SHA(`pins-mobile.json`)에서 받았다. 라이선스가 MIT인 리포만 골랐다.

| 파일 | 출처 | 무엇을 고정하나 |
|---|---|---|
| `healthgpt.xcstrings` | StanfordBDHG/HealthGPT `0673a1c79e7af3a71b10fbb2ce217102c3b4522a` `HealthGPT/Supporting Files/Localizable.xcstrings` (MIT) — 원본 전체 | 2칸 들여쓰기 · `" : "` · 빈 객체 `{\n\n    }` · 끝 개행 없음 · `comment`·`extractionState` · 대소문자 무시 키 순서(옛 Xcode) · 옛 Xcode가 쓴 중복 키(`LLM Settings` — 앞은 셀, 뒤는 빈 객체) |
| `swiftuikit.xcstrings` | danielsaidi/SwiftUIKit `6b81a3234a3ee0afc1cdccd347a806da6d69155e` `Sources/SwiftUIKit/Resources/Localizable.xcstrings` (MIT) — 원본 전체 | `localizations`가 없는 키뿐(키 = 원문) · 빈 키 `""` |
| `shotnix-excerpt.xcstrings` | OMARVII/Shotnix `54a8d6446228c7a7e99751759a2c62584b1da35f` `Localization/Localizable.xcstrings` (MIT) — 원본 2.2MB에서 키 8개의 블록을 **원본 바이트 그대로** 이어 붙였다(머리·꼬리도 원본) | 원문(`en`) 셀 없는 키 · `variations`(복수형) · 6개 언어 · 이스케이프(`\n`) · 비ASCII · 끝 개행 있음 · 도구가 쓴 `{}` 빈 객체 |

`shotnix-excerpt`는 원본 파일이 아니라 원본의 키 블록 부분열이다 — 블록마다 원본과 바이트가 같고, 키 순서도 원본 순서다.

## Xcode가 만든 삽입 전·후 — `xcode-before.xcstrings`·`xcode-after.xcstrings`

Xcode 26.6의 `xcrun xcstringstool sync <file> --stringsdata <data> --skip-marking-strings-stale`가 직렬화했다(2026-10-19).
입력은 같은 카탈로그를 공백 없는 JSON으로 쓴 것이고, `after`는 `before`에 다음을 더한 의미다:

- `Greeting` — `ar`(앞)·`fr`(뒤) 셀 삽입
- `Key as source` — 원문 셀 없음, `fr` 셀 삽입(원문 셀은 그대로 없음)
- `Edited source` — 원문(`en`) 셀 삽입(값이 키와 다르다)
- `Empty` — 빈 객체에 `localizations`(`de`·`fr`) 생성
- `Commented` — `comment`·`extractionState` 뒤에 `localizations` 생성
- `Escapes` — `de` 값을 `"`·`\`·개행·탭·U+0001·U+007F·`/`·비ASCII·이모지로 바꿈(`en` 셀의 `needs_review`는 그대로)
- `Plural %lld`(variations)·`Skip`(`shouldTranslate: false`)은 그대로

`sync`는 바뀐 것이 없으면 파일을 다시 쓰지 않고, stringsdata에 없는 빈 키를 지운다. 그래서 모든 키와 탐침 키 `zzz probe` 하나를 Swift 소스
(`String(localized: "…")`)에서 `xcstringstool extract --modern-localizable-strings`로 뽑아 넘겼고, 출력에서 탐침 키 블록
(`,\n    "zzz probe" : {\n\n    }`) 하나를 걷어 냈다.

## 같은 이름 — `xcode-duplicate-input.xcstrings`·`xcode-duplicate-output.xcstrings`

`input`은 키(`LLM Settings` — HealthGPT 모양: 앞은 셀, 뒤는 빈 객체)·언어 셀(`Greeting`의 `de`)·필드(`Save`의 `value`)에 같은 이름을 둘씩 둔 손 작성
파일이고, `output`은 위와 같은 `sync`로 Xcode 26.6이 다시 저장한 것이다. **모든 깊이에서 앞의 것이 남고 뒤의 사본은 지워진다** — 어댑터가 앞의 것을
읽고 쓰는 근거다(지휘자 결정 14).

## 같은 언어 셀의 가려진 사본 — `xcode-dup-locale-*.xcstrings` (RX-Y1)

공백 없는 손 작성 입력이고, 기대값은 Xcode 26.6 `xcrun xcstringstool compile <file> --output-directory <dir>`가 낸 `de.lproj/Localizable.strings`를
`plutil -convert json`으로 읽어 채록했다(2026-10-19).

| 파일 | 입력 | Xcode compile |
|---|---|---|
| `xcode-dup-locale-later-null.xcstrings` | `"de": {…"FIRST"}`, 뒤에 `"de": null` | exit 0 · `de`의 `k` = `FIRST` |
| `xcode-dup-locale-later-string.xcstrings` | `"de": {…"FIRST"}`, 뒤에 `"de": "shadow"` | exit 0 · `k` = `FIRST` |
| `xcode-dup-locale-first-null.xcstrings` | `"de": null`, 뒤에 `"de": {…"SECOND"}` | exit 0 · **`de.lproj` 없음**(앞의 `null` = 값 없음, 뒤 사본을 쓰지 않는다) |

같은 방법으로 본 경계(픽스처 없이 테스트에 박았다): 뒤 언어 사본이 숫자·배열·빈 객체·`stringUnit: 5`여도 `FIRST` · 짝 없는 `"de": null`은 그 언어만
없음 · 짝 없는 `"de": "x"`·앞 사본 `{}`·`"localizations": null`은 exit 1 · **키 단위는 가려진 사본이 `null`·문자열이면 exit 1**(빈 객체 사본은 받는다).

채록한 Xcode 26.6 직렬화 규칙(테스트가 이 파일로 고정한다):

- 키·필드·언어 코드는 코드 유닛 순이다(옛 Xcode 파일은 키가 대소문자 무시 순이다 — Malmoi는 키를 삽입하지 않으므로 상관없다).
- 이스케이프는 `\"` `\\` `\n` `\r` `\t` `\b` `\f`와 그 밖의 C0 제어 문자 `\u00XX`(소문자 16진)뿐이다. `/`·U+007F·비ASCII는 그대로다 — `JSON.stringify`와 같다.
- 빈 객체는 `{\n\n<들여쓰기>}`이고 파일 끝 개행이 없다.
- 같은 이름이 둘이면 **앞의 것**을 읽는다(`JSON.parse`는 뒤의 것). 짝 없는 서로게이트는 파일을 읽지 못한다.
