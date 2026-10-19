# 지원 파일 형식

Malmoi는 JSON·YAML 카탈로그, Chrome 확장 프로그램 메시지, TypeScript·JavaScript 코드 사전, Flutter ARB 파일, Apple strings 파일, Apple String Catalog, Android strings 파일을 읽고 씁니다.

## 지원 형식 {#formats}

지원 형식은 JSON 카탈로그, YAML 카탈로그, Chrome 확장 프로그램 메시지, 언어별로 파일을 나눈 코드 사전, 모든 언어를 한 파일에 담은 코드 사전, Flutter ARB 파일, Apple strings 파일, Apple String Catalog, Android strings 파일입니다. 언어가 하나만 있어도 번역을 추가하기 전에 원문 편집을 시작할 수 있습니다.

| 형식 | 경로 예시 |
| --- | --- |
| **JSON 카탈로그** | `src/locales/{locale}.json` |
| **YAML 카탈로그** | `config/locales/{locale}.yml` |
| **Chrome 확장 프로그램 메시지** | `_locales/{locale}/messages.json` |
| **코드 사전(언어별 파일)** | `src/locales/{locale}.ts` |
| **코드 사전(모든 언어를 한 파일에)** | `src/i18n/namespaces/*.ts` |
| **Flutter ARB** | `lib/l10n/app_{locale}.arb` |
| **Apple strings 파일** | `App/{locale}.lproj/Localizable.strings` |
| **Apple String Catalog** | `App/Localizable.xcstrings` |
| **Android strings 파일** | `app/src/main/res/values-{locale}/strings.xml` |

`{locale}`은 `en` 같은 언어 코드를 뜻하고, `*`는 그 디렉터리 안의 파일 이름 한 부분과 일치합니다.

JSON 카탈로그는 언어 코드로 이름을 지은 `.json` 파일, `client.{locale}.json`처럼 접두사가 붙은 파일, `{locale}/common.json` 같은 언어 디렉터리를 지원합니다. YAML 카탈로그는 언어 이름으로 된 `.yml`·`.yaml` 파일과 그 이름 앞에 접두사가 붙은 파일을 지원합니다. Chrome 확장 프로그램 메시지의 경로는 `_locales/{locale}/messages.json`입니다.

언어별 코드 사전은 `.ts`, `.tsx`, `.js`, `.mjs`를 지원합니다. 모든 언어를 한 파일에 둔 코드 사전은 `.ts`와 `.tsx`만 지원합니다.

Flutter ARB 파일은 `{locale}.arb`처럼 언어 코드로 이름을 짓거나 `app_{locale}.arb`처럼 접두사를 붙일 수 있습니다. 리포지토리 루트에 `l10n.yaml`이 있으면 그 설정이 가리키는 파일을 맨 앞에 보여 주고, 템플릿 파일의 언어를 기준 언어로 제안합니다. 복수형·select 같은 ICU 메시지는 문자열 전체를 그대로 보여 주고 저장합니다.

Apple strings 파일은 `{locale}.lproj` 폴더에 있고, `Localizable.strings`·`InfoPlist.strings` 같은 테이블마다 소스 하나입니다. 언어 코드는 폴더 이름입니다. `Base.lproj`는 언어가 아니어서 목록에 나오지 않고, `es_419`·`zh-Hant-TW`처럼 지역이 숫자이거나 세 부분으로 된 이름은 언어로 읽지 않습니다. UTF-8과 UTF-16 파일을 지원합니다. 복수형 파일 `.stringsdict`는 읽지 않습니다.

Apple String Catalog는 모든 언어를 `.xcstrings` 파일 하나에 담고, 파일의 `sourceLanguage` 필드에 적힌 언어를 기준 언어로 제안합니다. Xcode가 코드에서 만든 키에는 그 언어 항목이 없는 경우가 많습니다. 이때 Malmoi는 키 자체를 원문으로 보여 주고, 원문을 고쳤을 때만 그 언어 항목을 씁니다. 복수형·기기별 변형, 번역하지 않도록 표시한 키, 빈 키는 보여 주지 않고 파일에 그대로 둡니다. 2MB가 넘는 카탈로그 파일은 읽을 수 없습니다. [한도](limits.md#files)를 참고하세요.

Android strings 파일은 모듈의 `res` 폴더(Compose Multiplatform은 `composeResources` 폴더) 아래 `values-{locale}` 폴더에 있습니다. 언어 코드는 Android가 쓰는 폴더 접미사 그대로입니다(`ko`·`zh-rCN`·`iw`). `values-night`·`values-v21` 같은 폴더는 언어가 아닙니다. 기준 언어 파일 `values/strings.xml`은 경로에 언어 코드가 없으므로 소스를 연결할 때 그 코드를 직접 입력하고, 나중에 바꿀 수 없습니다. `values/strings.xml`만 있는 모듈도 지원합니다. `<string>` 항목만 보여 주고, `<plurals>`·`<string-array>`·`translatable="false"`로 표시한 항목·`@string/name` 같은 참조는 파일에 그대로 둡니다. 값은 Android 이스케이프를 푼 모양으로 보여 줍니다(`Don\'t`는 `Don't`). `<b>`·`<xliff:g>` 같은 인라인 태그는 글자 그대로 보입니다. 기준 언어의 태그는 그대로 두고 그 사이 글만 번역하세요. 태그가 아닌 `<`는 `&lt;`로 보이고, 글자 `<`를 쓰려면 `&lt;`를 입력합니다. 같은 이름을 두 번 정의한 파일은 Android 빌드도 거부하므로 읽지 않습니다.

## 파일 구조 보존 {#file-structure}

기존 YAML 카탈로그, 코드 사전, Apple strings 파일, Android strings 파일은 주석, 빈 줄, 키 순서를 유지합니다. Apple String Catalog는 고친 항목만 바꾸고, 키에 아직 없는 언어 항목은 Xcode의 서식대로 넣습니다. JSON 카탈로그와 Chrome 확장 프로그램 메시지는 파일 표현(들여쓰기, 한 줄 컨테이너, 이스케이프, 필드 순서)을 유지합니다.

Flutter ARB 파일도 JSON 표현을 그대로 유지하며, 키마다 붙은 `@key` 메타데이터와 `@@` 항목은 기존 파일의 내용을 바꾸지 않고 옮깁니다. 이미 있는 `@@locale`은 그 파일의 언어 코드로 맞추고, 첫 게시에서 각 `@key`를 그 키 바로 뒤로 옮깁니다. `@key`는 코드에서 그 키를 지웠을 때만 빠집니다.

Apple strings 파일은 인코딩과 BOM을 그대로 유지하고, 값의 이스케이프도 그 값을 고치기 전까지 그대로 둡니다. 같은 키가 두 번 있으면 Apple의 읽기 방식처럼 마지막 항목을 보여 주고 고칩니다. 앞 줄은 그대로 두고, 업데이트는 실패하지 않고 경고만 남깁니다. 언어 파일에 아직 없는 키를 번역하면 기준 언어 파일에서 바로 앞에 오는 키 다음 줄에 넣습니다.

Android strings 파일은 고친 `<string>` 안의 글만 바꾸고 XML 서식을 다시 짜지 않습니다. 언어 파일에 아직 없는 키를 번역하면 기준 언어 파일에서 바로 앞에 오는 키 다음에 그 `<string>`을 넣고, 기준 항목의 `formatted` 속성도 함께 붙입니다. 기준 언어 파일에는 새 줄을 넣지 않습니다.

Apple String Catalog에 같은 이름이 두 번 있으면 Xcode가 읽는 방식대로 앞의 것을 보여 주고 고칩니다. 뒤의 사본은 Xcode가 다음에 저장할 때 지울 때까지 남고, 업데이트는 실패하지 않고 경고만 남깁니다. Malmoi는 카탈로그에 키를 추가하거나 지우지 않습니다. 키는 Xcode가 코드에서 추가합니다. 복수형·기기별 항목에는 값 하나를 넣을 수 없어서, 그런 항목을 고치면 그 파일의 게시가 중단됩니다.

번역 값은 Malmoi의 값을 쓰고, 파일 구조와 표현은 기존 파일을 따릅니다.

## 언어 추가·제거 {#languages}

프로젝트 소유자는 JSON·YAML 카탈로그, Chrome 확장 프로그램 메시지, Flutter ARB 파일, Apple strings 파일, Android strings 파일, 언어별 코드 사전에서 Malmoi로 언어를 추가·제거할 수 있습니다. [언어 추가·제거](../setup/languages.md#languages)를 참고하세요. 모든 언어를 한 파일에 담은 코드 사전은 리포지토리에서 언어 객체를 바꿔야 하고, Apple String Catalog는 Xcode에서 언어를 추가해야 합니다. 해당 카드에는 새 추가·제거 동작과 설명이 없습니다.

새 YAML·언어별 코드 파일은 해당하는 기준 파일의 루트 규약, 평평한 키·중첩 키 구조, 내보내기 형태와 표현을 따릅니다. YAML의 언어 루트는 기준 언어 코드와 같아야 합니다. 이름 있는 코드 내보내기는 같은 이름을 쓰며, 그 이름에 기준 언어 코드가 들어 있으면 거부합니다. 번역이 있는 키만 쓰고 기준 언어의 값·주석·`import`·타입 선언은 복사하지 않습니다. 파일을 안전하게 만들 수 없으면 게시가 중단됩니다. 추가를 취소하거나 리포지토리에서 파일을 직접 만드세요. 파일이 생긴 뒤의 게시는 그 파일의 구조를 보존합니다. 새 Flutter ARB 파일은 기준 파일의 표현을 따르고 `@@locale`과 번역이 있는 키만 씁니다. `flutter gen-l10n`은 템플릿 파일의 메타데이터를 읽으므로 `@key` 메타데이터는 복사하지 않습니다. 새 Apple strings 파일은 기준 파일의 인코딩을 따르고, 주석 없이 번역이 있는 키만 씁니다. 새 Android strings 파일은 기준 파일의 XML 선언과 `<resources>` 요소를 복사하고 번역이 있는 키만 쓰며, 키마다 기준 항목의 `formatted` 속성을 붙입니다. 지역이 붙은 Android 언어는 `pt-rBR`처럼 Android 철자를 씁니다.

새 파일에는 일부 키만 있을 수 있습니다. 이후 번역을 넣을 때 필요한 부모 맵이 파일에 없으면 남은 경로를 `"a.b.c"` 같은 점 리터럴 키로 삽입합니다. 앱의 중첩 조회가 그 키를 읽을 수 있는지 확인하세요. `import`나 지원 언어 목록에 새 언어를 등록해야 한다면 직접 고쳐야 합니다. Malmoi는 그 코드를 바꾸지 않습니다. Android 앱이 `resConfigs`나 `localeFilters`로 언어를 제한한다면 새 언어를 거기에 추가하세요.
