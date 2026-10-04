# 지원 파일 형식

Malmoi가 읽고 쓸 수 있는 번역 파일 형식을 확인합니다.

## 지원 형식 {#formats}

지원 형식은 JSON 카탈로그, YAML 카탈로그, Chrome 확장 프로그램 메시지, 언어마다 하나씩인 코드 사전, 모든 언어를 담은 코드 사전 하나입니다. 언어가 하나만 있어도 번역을 추가하기 전에 원문 편집을 시작할 수 있습니다.

| 형식 | 경로 예시 |
| --- | --- |
| **JSON 카탈로그** | `src/locales/{locale}.json` |
| **YAML 카탈로그** | `config/locales/{locale}.yml` |
| **Chrome 확장 프로그램 메시지** | `_locales/{locale}/messages.json` |
| **코드 사전(언어마다 파일 하나)** | `src/locales/{locale}.ts` |
| **코드 사전(모든 언어가 파일 하나에)** | `src/i18n/namespaces/*.ts` |

`{locale}`은 `en` 같은 언어 코드를 뜻하고, `*`는 그 디렉터리 안의 파일 이름 한 부분과 일치합니다.

## 파일 구조 보존 {#file-structure}

YAML 카탈로그와 코드 사전는 주석, 빈 줄, 키 순서를 유지합니다. JSON 카탈로그와 Chrome 확장 프로그램 메시지는 파일 표현(들여쓰기, 한 줄 컨테이너, 이스케이프, 필드 순서)을 유지합니다.

값은 Malmoi에서 오고, 구조나 표현은 기존 파일에서 옵니다.
