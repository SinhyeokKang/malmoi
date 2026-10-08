# 지원 파일 형식

Malmoi는 JSON·YAML 카탈로그, Chrome 확장 프로그램 메시지, TypeScript·JavaScript 코드 사전을 읽고 씁니다.

## 지원 형식 {#formats}

지원 형식은 JSON 카탈로그, YAML 카탈로그, Chrome 확장 프로그램 메시지, 언어마다 하나씩인 코드 사전, 모든 언어를 담은 코드 사전 하나입니다. 언어가 하나만 있어도 번역을 추가하기 전에 원문 편집을 시작할 수 있습니다.

| 형식 | 경로 예시 |
| --- | --- |
| **JSON 카탈로그** | `src/locales/{locale}.json` |
| **YAML 카탈로그** | `config/locales/{locale}.yml` |
| **Chrome 확장 프로그램 메시지** | `_locales/{locale}/messages.json` |
| **코드 사전(언어별 파일)** | `src/locales/{locale}.ts` |
| **코드 사전(모든 언어를 한 파일에)** | `src/i18n/namespaces/*.ts` |

`{locale}`은 `en` 같은 언어 코드를 뜻하고, `*`는 그 디렉터리 안의 파일 이름 한 부분과 일치합니다.

JSON 카탈로그는 언어 이름인 `.json` 파일, `client.{locale}.json` 같은 접두사 파일, `{locale}/common.json` 같은 언어 디렉터리를 지원합니다. YAML 카탈로그는 언어 이름이나 접두사가 붙은 `.yml`·`.yaml` 파일을 지원합니다. Chrome 확장 프로그램 메시지의 경로는 `_locales/{locale}/messages.json`입니다.

언어별 코드 사전은 `.ts`, `.tsx`, `.js`, `.mjs`를 지원합니다. 모든 언어를 한 파일에 둔 코드 사전은 `.ts`와 `.tsx`만 지원합니다.

## 파일 구조 보존 {#file-structure}

YAML 카탈로그와 코드 사전는 주석, 빈 줄, 키 순서를 유지합니다. JSON 카탈로그와 Chrome 확장 프로그램 메시지는 파일 표현(들여쓰기, 한 줄 컨테이너, 이스케이프, 필드 순서)을 유지합니다.

값은 Malmoi에서 오고, 구조나 표현은 기존 파일에서 옵니다.
