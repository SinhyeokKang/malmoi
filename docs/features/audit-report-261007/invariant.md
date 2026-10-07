# Invariant 정적 감사 — 2026-10-07

실행 검증은 미완이다. 사용자 지시에 따라 테스트·typecheck·빌드·adapter-survey·실제 GitHub/DB 왕복을 실행하지 않았으며, 아래 판정은 소스와 테스트 본문을 대조한 정적 결론이다. 코드·문서·설정·Git 상태는 변경하지 않고 이 보고서만 작성했다.

- 기준 및 시작 HEAD: `bc8b204f18fa1aa88a0423e28f0789876f1fbf54` 일치. 작업 중 다시 확인한 HEAD도 동일, `git status --short` 비어 있음.
- 적용: `.agents/skills/source-command-audit/SKILL.md`, `CLAUDE.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/POSTMORTEM.md`. 오래된 스킬의 shadcn 제외·시각 기반 스킵·pending 단독 보호 설명은 적용하지 않았다. 현 정본의 리포 소유 UI, pending 토큰·열린 PR·publish-raced를 기준으로 했다.
- 범위: 최근 diff가 아닌 `lib/adapters`, `lib/pull`, `lib/publish`, `lib/push`, `lib/survey`, `lib/scan`, `lib/githash.ts`, `lib/github.ts` 전체 구현 및 관련 테스트·생산자·소비자.
- 병렬 탐색: Codex 하위 에이전트 3개(adapters / pull_git / push_survey), 부모는 전달 경계 및 재발 검사 통합.
- 발견: **🔴 1 · 🟡 5 · ⚪ 0 = 6건**. 재발 계보가 명확한 항목은 #1, #2, #5이며, #6도 미확인과 실패 혼동 계보다. 과거 실사고 재발 여부를 운영 환경에서 확인했다는 뜻은 아니다.

## 발견

### 1. 🔴 [invariant] ts-dict가 마지막 shorthand에 가려진 리터럴을 수정하고 전달 확인한다

**근거:** `lib/adapters/ts-dict.ts:82`는 `PropertyAssignment` 외 속성을 무시한다. `:251`의 read 중복 제거와 `:349`의 writer 마지막 자리 선택은 그 필터를 지난 리터럴만 본다. 실제 JavaScript의 마지막 속성이 shorthand이면 앞의 리터럴은 실행값이 아니다.

```ts
const a = 'runtime';
const en = { a: 'hidden', a };
const ko = { a: '원문' };
```

**실패 시나리오:** 위 파일을 `ns/x.ts`, `ts-dict`, `ns/*.ts`로 적재하면 en.a를 `hidden`으로 읽는다. en.a를 `edited`로 저장하고 Publish하면 앞의 `a: 'hidden'`만 `a: 'edited'`로 바뀌고 마지막 shorthand는 남아 실제 en.a는 계속 `runtime`이다. `readSlotFiles`도 동일한 adapter.read를 사용하므로 정상 키 자리로 인식한다(`lib/pull/undeliverable.ts:73`). `planDelivery`는 자리와 빈값만 검사하고 비어 있지 않은 이 편집을 delivered로 남긴다(`lib/pull/run.ts:247`, `:264`). `runPull:451` → `lib/pull/load.ts:296`의 CAS 확인으로 pending 토큰이 해제된다. 실제 요청한 값이 적용되지 않았는데 성공과 전달 기준이 남는다.

**기존 테스트 공백:** `lib/adapters/__tests__/ts-dict.test.ts:420`의 중복 fixture는 양쪽 모두 문자열 리터럴이다. adapter.read와 writer가 같은 잘못된 필터를 쓰므로 자기 왕복 비교도 정상으로 읽을 수 있다. `syntaxError`는 문법 진단이며 대상 리포의 의미 타입 검사를 대신하지 않는다. run층도 런타임 객체 해석을 따로 하지 않는다.

**기준:** ARCHITECTURE §0.9·§1의 실제 마지막 속성 계약. POSTMORTEM 「2026-10-07 — 파일 쓰기 성공과 요청한 값 전달을 같은 것으로 셌다」에서 code-dict에 닫은 방어가 ts-dict에는 없다.

수정 방향: 마지막 이름 있는 속성을 먼저 확정한 뒤 read/write가 같은 실제 자리를 사용하도록 한다.

### 2. 🟡 [invariant] Git 심볼릭 링크를 일반 로케일 blob으로 받아 일반 파일로 덮어쓴다

**근거:** `lib/github.ts:389`와 `lib/pull/client.ts:16`은 심링크를 제외한다고 선언하지만, `github.ts:390`은 `type === "blob"`만 확인하고 `:392`에서 mode를 버린다. Git 심링크는 mode `120000`인 blob이며 내용은 링크 대상 경로다(설치된 `@octokit/openapi-types`의 `types.d.ts` Git tree mode 설명에서도 확인). `lib/pull/payload.ts:73`은 출력 mode를 항상 `100644`로 만든다.

**실패 시나리오:** 기존 json-catalog의 활성 fr 로케일에 편집 토큰이 남은 동안 코드에서 `locales/fr.json`을 `en.json`을 가리키는 심링크로 바꾼다. 자동 적재는 편집 때문에 보류된다. cron 또는 미리보기 없이 실행한 Publish가 링크 blob 내용 `en.json`을 원본으로 읽는다. 비-base 경로에는 base 원본 파싱 차단이 없고(`lib/pull/render.ts:164`), `json-catalog.ts:326`은 원본 구조 파싱 실패를 빈 구조로 접어 DB 값으로 JSON을 재생성한다. 트리 쓰기는 기존 심링크를 `100644` 일반 파일로 교체한다. 링크로 공유하던 파일 구조가 경고 없이 사라진다. base 파일에는 파싱 거부가 있어 이 시나리오는 **비-base 재생성 파일**에 한정한다.

**기존 테스트 공백:** fake Git tree는 path/sha만 들며 mode 축이 없다. `lib/pull/__tests__/payload.test.ts`는 `100644` 자체를 기대해 입력 파일 종류 보존 여부를 묻지 않는다. 실제 API 왕복은 이번 감사에서 미실행이다.

**기준:** 심링크 제외라는 실제 GitClient 계약, POSTMORTEM 「2026-09-09 — 주석이 방어를 서술하고 코드는 안 했다 (`catch`는 오류일 때만 돈다)」의 재발.

수정 방향: tree mode를 보존해 지원하지 않는 파일 종류를 쓰기 전에 명시적으로 거부한다(필터로만 없애면 신규 파일로 다시 생성할 수 있음).

### 3. 🟡 [invariant] 스캐너 상태 문자열과 사용자 문자열이 충돌해 정상 참조를 누락한다

**근거:** `lib/scan/ast.ts:213`의 namespace 함수와 `:196`의 boundName은 실제 문자열과 오류 센티널을 같은 string으로 반환한다. 호출자는 `:147`에서 `"unresolved"`, `:160`에서 `"unsupported"`를 오류로 간주한다.

**실패 시나리오:** 정상 import 아래 `const t = useTranslations("unresolved"); t("title")`는 `unresolved.title`을 내야 하지만 namespace 오류로 버린다. `const unsupported = useTranslations("hero"); unsupported("title")`도 정상 식별자인데 바인딩 오류로 버린다. 사용처 정보만 누락되며 키·번역 값 적재는 망가지지 않는다.

**기존 테스트 공백:** `lib/scan/__tests__/hook-wrapper.test.ts`는 동적 namespace와 지원하지 않는 구조분해를 검사하지만 센티널과 같은 정상 리터럴·지역 이름을 입력하지 않는다. string union은 두 의미를 구별하지 못한다.

**기준:** ARCHITECTURE §4.0의 리터럴 namespace·직접 대입 지원 계약.

수정 방향: 데이터와 상태를 분리하는 판별 union을 사용한다.

### 4. 🟡 [invariant] 일반 매개변수 shadowing을 무시해 남의 함수를 번역 사용처로 센다

**근거:** `lib/scan/ast.ts:88`은 import 이름 문자열만 비교하고, `:230`의 `bindingFor`는 훅에서 얻은 바인딩끼리만 범위를 비교한다. 내부 함수의 일반 매개변수나 일반 변수 선언은 차단 바인딩에 들어가지 않는다.

```ts
import { useTranslations } from 'next-intl';
function outer() {
  const t = useTranslations('hero');
  function inner(t: (x: string) => string) { return t('title'); }
}
```

**실패 시나리오:** inner의 t는 호출자가 주는 다른 함수지만 외부 훅 범위 안이라는 이유로 `hero.title` 참조가 된다. 직접 import한 t를 매개변수 t가 가리는 형태도 동일하다. 번역 화면에 무관한 코드 링크가 표시된다.

**기존 테스트 공백:** `hook-wrapper.test.ts:208`은 훅 바인딩 범위 밖 sibling 함수만 검사한다. 외부 훅 범위 안에서 매개변수가 가리는 입력은 없다.

**기준:** ARCHITECTURE §4.0·§4.1의 스코프 인식 및 이름만으로 래퍼를 매칭하지 않는 계약.

수정 방향: 호출 식별자의 실제 lexical binding을 확인하거나 일반 선언도 shadow 경계에 포함한다.

### 5. 🟡 [invariant] 현재 writer가 보존하는 점 키 구조를 survey가 여전히 손실 원인으로 센다

**근거:** `lib/survey/json-shape.ts:41`은 점 리터럴 키와 중첩의 공존이 구조 변경을 일으킨다고 정의하고 `:104`는 공존 여부만으로 `dottedWithNested`를 켠다. `lib/survey/summarize.ts:273`은 이 flag가 있으면 `diff.clean` 분모에서 제외한다. 현재 writer는 원본 실제 경로를 `originalStructure`로 수집하고 `segmentsOf`가 우선 사용한다(`lib/adapters/json-catalog.ts:263`, `:265`, `:314`). ARCHITECTURE §1.9 24차도 이 수정 뒤 기존 siyuan 손실이 사라졌다고 기록한다.

**실패 시나리오:** 충돌 없는 독립적인 점 리터럴 키와 중첩 키를 가진 20키 이상 JSON을 정상 원본으로 전달한다. writer가 해당 구조를 보존해 diff가 0이어도 survey는 '점 키 구조 변경 원인 있음'으로 분류하고 clean 분모에서 뺀다. raw diff·의미 비교 결과 자체가 틀린다는 주장은 아니다. 원본 경로가 없는 신규 파일 등 실제 손실 가능성이 남은 경우와, 이미 보존되는 원본 관측치를 구분하지 못하는 측정 의미 드리프트다.

**기존 테스트 공백:** `lib/survey/__tests__/json-shape.test.ts`의 점 키 공존 테스트는 예전 flag=true를 고정한다. 현재 writer의 출력과 clean 분모의 의미를 함께 대조하는 검사가 없다.

**기준:** POSTMORTEM 「2026-09-03 — 고쳐 놓고도 지표가 낡아서 \"성공\"을 \"실패\"로 읽었다」의 '수정된 축은 원인에서 관측치로 옮긴다' 규칙.

수정 방향: 단순 원본 관측과 실제 구조 손실 원인을 분리해 clean 분모 정의에 맞춘다.

### 6. 🟡 [invariant] 미판정 리포를 미지원 포맷 오탐으로 확정 집계한다

**근거:** `lib/survey/summarize.ts:199`의 `byRepo.get(s.repo)?.correctCatalogPath == null`은 명시적 미지원(null)과 판정 레코드 부재(undefined)를 같이 잡는다. `:289`는 이를 `misdetect.withCandidate` 분자에 더한다. 같은 모듈의 format 표는 판정 존재 여부를 확인하고 리포 표는 미판정으로 표시하므로 출력 간 의미가 갈린다.

**실패 시나리오:** 후보를 정상 탐지한 새 리포 하나와 빈 verdict 목록을 `summarize`에 전달하면 `misdetect.withCandidate`는 1/1(100% 오탐)이 된다. 실제로는 사람이 아직 판정하지 않았을 뿐이며 다른 표는 ❔로 표시한다. 새 코퍼스를 조사할 때 JSON 집계는 품질 실패라고 잘못 말한다.

**기존 테스트 공백:** `lib/survey/__tests__/summarize.test.ts:158`은 동일한 입력을 만들지만 `misdetect.supported.of === 0`과 `unjudged`만 검사한다. 오판되는 `withCandidate`를 단언하지 않는다.

**기준:** 측정 불가·판정 부재를 실패/성공으로 접지 않는 ARCHITECTURE §1.9와 POSTMORTEM 09/02·09/03 지표 계보.

수정 방향: 명시적인 null verdict만 미지원 오탐으로 세고 미판정은 별도로 유지한다.

## 교차 검증 결과

| 경계 | 확인 근거 | 판정 |
|---|---|---|
| 재생성 정렬 | `shared.ts`의 `<` 비교·`orderedEntries`, chrome/json 호출 | order=0 유지, 동률 키 비교, orphan·빈값 필터 및 writeEmpty 관문 유지 |
| 수술적 표현 | ts/code `quoteLiteral`·원본 quote, YAML range 치환 | 원본 무편집 바이트 경로 존재; #1 제외 추가 확정 위반 없음 |
| base 키 집합 | `render.ts:96` baseOwnedByOriginal, `json-catalog.ts:265` segmentsOf | 원본 전용 키 보존·DB 전용 키 제외·원본 순서·현재 실제 경로 유지 |
| 순서 4홉 | `load.ts:86,129` → `render.ts:57` → `plan.ts:168` → `plan.ts:217` | sortIndex가 order까지 0을 잃지 않음 |
| 메타데이터 4홉 | `load.ts:89,99,138` → RenderKey.cells → rowsForLocale → buildWriteEntries | description과 placeholders 전달, JSON null/SQL NULL 구분 유지 |
| push 생산·저장 | `payload.ts:138,148` → PushPayload → planPush → apply UNNEST | 단일 생산자, order 변환 및 배열 열 연결 정적 확인 |
| SHA·Git 전략 | `githash.ts:18`, `payload.ts:72,101`, `run.ts:414,423,428,443` | UTF-8 바이트 길이, base_tree·base parent·force·owner:branch PR 재사용·skip 마커 유지; 파일 종류 #2 별도 |
| 전달 확인 | `run.ts:344,451`, `load.ts:255,296`, `undeliverable.ts` | warning 전 중단, 보류 좌표 제외, CAS·캡처값 기준 유지; 실제 자리 판정 #1 별도 |
| 빈값 | `save.ts:73`, `run.ts:233,277`, `publish/read.ts:130` | base sourceText도 빈 surgical clear 거부, 미리보기/실행 planDelivery 공유 |
| 자동 적재 경합 | `route.ts:87,263`, `apply.ts:151,157`, `nightly/run.ts:78,114`, `import/run.ts:106`, `load.ts:241` | committed 경로는 pending+열린 PR+publish-raced·null 포함 재대조·잠금 안 표식 단조 증가 확인. **no-changes는 완료 표식 미전진 결함**: [principle.md 발견 3](principle.md#3--principle-no-changes-전달-확인이-자동-적재-경합-표식을-전진시키지-않아-편집이-다시-덮인다) 참조, 중복 집계 제외 |
| survey 실행 경로 | `survey/one.ts`의 `renderLocaleFiles` | 프로덕션 렌더·writeErrors 재사용. 지표 분류 #5·#6 별도 |

## POSTMORTEM 전수 독서 및 재검 방식

`rg -c '^### 20' docs/POSTMORTEM.md` 결과는 **143개 날짜 헤딩**이다. 문서는 2,706줄이며 처음의 대량 cat은 잘려 완독 근거에서 제외했다. 이후 범위를 나눠 원문을 읽었다: adapters 1–680, pull_git 681–1360(1380까지 중첩), push_survey 1361–2040, 부모 2041–2706. 부모 출력에서 생긴 두 잘림은 2450–2478 및 2581–2606을 별도 재독해 보완했다. 2040 헤딩과 겹친 구간도 확인했다. UI·인증·운영 전용 항목은 invariant 재발 검색 대상에서 제외했고, 공통 실패 유형은 담당 코드에 적용했다.

아래는 해당 차원 재발 검사 로그다. 명령은 실행한 정적 검색을 기록한다. “재발 없음”은 해당 검색과 소스 대조에서의 결론이며, 테스트 또는 운영 실측 통과를 뜻하지 않는다. 파이프 대신 rg 표현식으로 같은 검색을 수행한 항목과 현재 경로로 바꾼 항목은 그렇게 기록했다.

### 어댑터 재발 검사

| POSTMORTEM 항목 헤딩 | 실행 명령 | 근거·판정 |
|---|---|---|
| 2026-09-02 — 구분자가 데이터에도 있어서 중첩 복원이 값을 조용히 삼켰다 | `rg -n 'split\("\."\)\|join\("\."\)\|SEP\|function (locate\|resolveLast\|findScalar\|insertPath\|insert)\b\|nestedByPath\|segmentsOf\|duplicateCount\|key-shadowed' lib/adapters/*.ts lib/survey/one.ts`의 각 대안 검색 | code/YAML locate 공유, JSON 실제 세그먼트·key-shadowed. 09/17 및 10/07 수정 유지. 지표 원인 분류 #5 별도 |
| 2026-09-02 — 순위 픽스가 자기 단위 테스트만 통과하고 실제 경로에서는 죽어 있었다 | `rg -n 'liftAncestors\|rankTemplateCandidates\|compareTemplates\|detectCandidates\|rankCandidates' lib/adapters/*.ts`의 각 대안 검색 | index 최종 순위도 liftAncestors 통과. 재발 없음 |
| 2026-09-02 — 학습 코퍼스의 오탐 0.0%가 처음 보는 리포에서 40%였다 | 위 탐지 검색·탐지 구현 독서 | 홀드아웃 실측은 금지되어 미완. 정적 결과를 일반화 성능으로 주장하지 않음 |
| 2026-09-03 — 주석이 "명시 지정은 동작한다"고 단언했고, 그걸 검사하는 테스트의 **이름만** 그랬다 | `rg -n '동작한다\|계속 쓴다\|그대로다' lib/adapters/__tests__ -g '*.test.ts'`의 각 대안 검색 | detect-relax의 실제 detectFormatWith 호출 확인. 재발 없음 |
| 2026-09-03 — 값이 맞으면 통과하는 검증이 스타일 손실을 못 봤다 (인용 부호) | `rg -n 'replaceWithText\(JSON.stringify\|initializer: JSON.stringify\|addPropertyAssignment\|doc\.toString\|setIn\(' lib/adapters -g '*.ts' -g '!**/__tests__/**'`의 각 대안 검색 | 해당 실행 호출 0. quoteLiteral/quoteOf와 YAML range 치환 유지 |
| 같은 헤딩의 2026-09-16 YAML 재발 | `rg -n '값 고정점' .claude/commands/roundtrip.md` | 현행 roundtrip의 값/바이트 구분 확인. 폐기된 l10n-roundtrip 경로·옛 4건 고정치를 적용하지 않음. 실제 roundtrip 미완 |
| 2026-09-04 — 표현 축 하나를 원인 카운터에 이름이 없어서 설계가 못 봤다 (슬래시 이스케이프) | `rg -n 'ByPath\[\|observe[A-Z]\w*\(\|escape\|indent\|compact' lib/adapters/json-style.ts lib/adapters/json-catalog.ts lib/adapters/chrome-locales.ts`의 각 대안 검색 | 문자열 스캐너 slash 관측 및 직렬화 반영. 원본 한 줄 내부 여백은 알려진 한계 |
| 2026-09-07 — 방어선 셋이 "검사한다"고 주장한 것을 검사하지 못했고, 전부 green이었다 | `rg -n 'matchAll\(' lib/adapters/__tests__ -g '*.test.ts'`; `cat lib/adapters/__tests__/write-contract.test.ts` | 다섯 어댑터 WriteInput 명명 계약 및 검사기의 부정 fixture 확인 |
| 2026-09-08 — `?? 폴백`이 프로토타입 키를 못 막아 문자열 자리에 **함수**가 왔다 | 프로토타입 조회·대입 rg 및 `rowsForLocale` 독서 | nestedByPath·cells own-property 검사 확인. 재발 없음 |
| 2026-09-08 — 도달 불가한 오류 갈래를 겨냥한 테스트가 1년치 green이었다 — 단언이 보간된 키만 봤다 | `rg -n 'message\.includes\(\|\.message\)\.toMatch\(' lib/adapters/__tests__ -g '*.test.ts'`의 각 대안 검색 | code-dict 테스트는 오류 code와 key를 함께 단언. 재발 없음 |
| 2026-09-09 — 프로토타입 키의 **조회** 자리만 닫고 **대입** 자리 다섯을 1년 가까이 남겨 뒀다 | `rg -n '\[(e\.key\|key\|name\|head\|seg\|k)\] *=' lib/adapters -g '*.ts' -g '!**/__tests__/**'`의 각 대안 검색 | chrome/JSON 출력·중첩·재조립 null-prototype 확인 |
| 2026-09-10 — YAML 자원 제한이 문자열을 구조로 읽어 우회와 오탐을 함께 만들었다 | `rg -n 'quote\|parseDocument\|new Parser' lib/onboarding/budget.ts lib/adapters/*.ts`의 각 대안 검색 | YAML Lexer/Parser.stack 및 parseDocument 경로 확인 |
| 2026-09-16 — YAML range 치환의 같은 위치와 바깥 빈 줄이 값을 바꿨다 | `rg -n 'replacements\.sort\|chomp ===\|source\.slice\(end\)' lib/adapters -g '*.ts' -g '!**/__tests__/**'`의 각 대안 검색 | keep-chomp·동일 위치 치환/삽입 순서 존재. 실행 미완 |
| 2026-09-16 — 삽입 키의 인용 부호만 맞추고 들여쓰기와 끝 쉼표를 놓쳤다 (2026-09-03 표현 보존 결함 재발) | `rg -n 'PLAIN_NAME\|optionalName\|quoteName\|dominantQuote\|valueLiterals\|applyTextChanges' lib/adapters -g '*.ts' -g '!**/__tests__/**'`의 각 대안 검색 | code-dict 형제 들여쓰기·쉼표·선택적 키 인용·AST 재획득·값 리터럴 다수결 유지 |
| 2026-09-29 — 중첩 JSON 표면의 빈 `{}` 로케일 파일에 번역이 최상위 점 키로 나갔다 | 위 ByPath/observe 검색 | 빈 객체 관측 생략 및 옛 false 폐기, nested 표면 폴백 확인 |
| 2026-10-03 — 단일 언어 탐지를 열자 조상 승격이 설정 파일을 정본보다 앞세웠다 | 위 liftAncestors 검색 | 단일 조상이 다중 언어 후보를 승격으로 누르지 못함. 코퍼스 미완 |
| 2026-10-07 — 파일 쓰기 성공과 요청한 값 전달을 같은 것으로 셌다 | `rg -n 'writeEmpty\|propertyNamed\|write-empty-unsupported\|planClearability' lib/adapters lib/pull/run.ts lib/keys/save.ts`의 각 대안 검색; ts-dict pairs 독서 | code-dict shorthand·빈값 방어 확인. **ts-dict 형제 경로 재발 #1** |

### 적재·전달·측정 재발 검사

| POSTMORTEM 항목 헤딩 | 실행 명령 | 근거·판정 |
|---|---|---|
| 2026-08-31 — 모듈 로드 시점에 환경변수를 요구해 CI가 red | `rg -n 'requireEnv\(' lib/github.ts`; env/requireEnv 검색을 lib/push·scan·survey 및 CLI에 수행 | Git createApp 함수 내부만 사용, 담당 CLI/코어의 해당 최상위 평가 없음 |
| 2026-08-31 — process.exit()이 파이프 stdout을 잘라먹고, exitCode로 바꾸니 조기 종료가 사라짐 | `rg -n 'process\.exit\(' scripts/scan.ts scripts/push-local.ts scripts/adapter-survey.ts scripts/ingest.ts` | 대량 출력 뒤 자연 종료·exitCode. 남은 exit는 사전 오류. 파이프 실측 미완 |
| 2026-08-31 — 외부 계약 페이로드를 리터럴로 조립해 필수 필드가 늘어도 컴파일러가 침묵했다 | z.infer/buildPushPayload 검색(lib/push·scripts/push-local·onboarding/ingest·import/surface); `rg -n 'base_tree\|parents:\|createPr' lib/pull/payload.ts lib/pull/run.ts`의 대안 검색 | PushPayloadType 생산자 한 곳, CLI/서버 호출, Git 요청 typed payload 실제 사용 |
| 2026-09-01 — 라이브러리가 이미 하는 인코딩을 또 해서 조용한 404를 만들었다 | `rg -n 'encodeURIComponent\|encodeURI\(\|%2F' lib/github.ts lib/pull --glob '*.ts' --glob '!**/__tests__/**'`의 대안 검색 | ref 원문 전달, 인코딩 문자열은 주석. 재발 없음 |
| 2026-09-02 — 껍데기가 파일을 안 골라 어댑터가 "존재하지 않았다" | writeStrategy/multi-locale 검색(lib/pull/render·plan, lib/survey, scripts/ingest·push-local) | layout은 경로·반복, 전략은 원본 부재 처리. select가 포맷 경로를 고르고 모든 writer에 원본 공급 |
| 2026-09-02 — `pnpm <script> --json \| jq`는 이 리포에서 한 번도 동작한 적이 없다 | `rg -n 'pnpm .*--json.*\|' docs .claude/commands scripts -g '!POSTMORTEM.md'` | 잘못된 호출의 경고 주석만 검색됨. 실제 파이프 검증은 미완 |
| 2026-09-02 — 지표 하나가 반년째 구조적으로 0이었고, 그 사실을 단위 테스트가 가려 줬다 | `rg -n 'const \{ [a-z]' scripts/adapter-survey.ts scripts/push-local.ts lib/survey/run.ts`; sortIndex/order/placeholders 4홉 검색 | survey/run이 configFiles·truncated 수신, types→one→summarize 연결. pull 순서/메타 필드도 연결 |
| 2026-09-03 — 고쳐 놓고도 지표가 낡아서 "성공"을 "실패"로 읽었다 | Causes/Errors/Skips 검색(lib/survey/types), dottedWithNested/clean 검색(lib/survey/summarize·관련 테스트) | **재발 #5**. 원본 관측치가 계속 diff 원인 분모를 좁힘 |
| 2026-09-03 — 실패한 조회를 "없음"으로 읽어 경고가 존재하지 않는 것과 구별되지 않았다 | 셸 오류 삼킴 검색(.github·scripts); planOpenPrGate/publish-raced 검색(app/api/push/route·nightly/run·import/run) | PR 조회 실패는 보류. survey 미등록을 미지원으로 읽는 동일 혼동 #6 |
| 2026-09-04 — 완료 조건에 "방향만 게이트"를 걸었는데 그 방향을 잴 수단이 없었다 | 방향만/내려간다/개선된다 검색(docs/features/*/spec.md) | 현행 매칭 0. byAdapter·비base diff·hunk 출력 배선 존재. 코퍼스 실측 미완 |
| 2026-09-05 — 검증은 했는데 검증한 값을 저장하지 않아 두 주소가 갈릴 뻔했다 | sortIndex/description/placeholders 검색(lib/push/payload·plan·apply, lib/pull/load·render·plan) | 이 차원에서는 검증·변환한 필드가 저장 및 writer 입력까지 유지. 인증 원문 경계는 다른 도메인 |
| 2026-09-05 — 테스트 가짜가 실제 제약보다 관대해서 결함 하나를 원리적으로 못 봤다 | fake-client·run·flow 테스트 본문과 schema 대조 | Git fake는 failOn·누락 요청 throw 존재. **mode 모델링 공백 #2**. 실제 PG 제약 검증 미완 |
| 2026-09-09 — 일회용 허가를 "다음 push에서 비운다"로 구현해, 흔한 경로에서 기능이 조용히 무력화됐다 | null 해제 검색(lib/push/apply·lib/pull/load) | baseChanged일 때 선언 소비, 자기 실행권 표시 종료, 전달 ACK는 token CAS. 재발 없음 |
| 2026-09-09 — 번역자가 셀 하나를 비우면 키가 사라질 수 있었다, 그리고 되돌린 편집이 PR에 남아 있었다 | isBase/writeEmpty 검색(lib/pull/plan·render); findOpenPr/updateRefForce 검색(lib/pull/run) | base 폴백·writeEmpty·no-changes stale ref 원복 확인. #1 이외 새 전달 위반 없음 |
| 2026-09-09 — 검증이 **탐지** 경로에만 있었고 **적재** 경로에 없어, 페이로드가 리포 경로를 정했다 | replaceAll/isPathSafe/isLocaleShaped 검색(lib/pull/plan); PushPayload·LocaleCode 독서 | push 스키마·저장된 행을 읽는 pull 양쪽 안전성·모양·경로 검사 |
| 2026-09-09 — 주석이 방어를 서술하고 코드는 안 했다 (`catch`는 오류일 때만 돈다) | statSync/lstatSync/withFileTypes/entry.type/entry.mode 검색(lib/cli/walk·scripts/adapter-survey·lib/github), `rg -n 'statSync\(' lib/survey scripts/adapter-survey.ts` | 디스크 survey lstat 방어 존재. **Git tree mode 누락 재발 #2** |
| 2026-09-09 — 주석이 이유를 정확히 적었는데 **재는 자**가 어긋나 거부가 500이 됐다 | byteLength/length 검색(lib/githash·pull/plan·load), push/auth·json-bounds 독서 | SHA UTF-8 Buffer 길이, 인증 digest 고정 길이, JSON TextEncoder 바이트. 재발 없음 |
| 2026-09-13 — 원격 신호 하나의 실패가 워커 풀의 동시 제한을 풀었다 | `rg -n 'Promise.all\(' lib/pull lib/publish --glob '*.ts' --glob '!**/__tests__/**'` | chunk reject 후 전체 중단, catch에서 슬롯을 풀고 다음 chunk를 시작하지 않음 |
| 2026-09-13 — 임포트 종료의 소유권과 실패 캐시 무효화가 빠졌다 | lastImportStartedAt/lastImportToken/repositoryImportToken/finishImportRun/markImportStarted 검색(lib/import·projects·push); RUNNING/FOR UPDATE/revision 검색(lib/pull/load·run) | 종료 표시는 자기 토큰 조건, 전달 확인은 실행·context 검증. 캐시 UI 전수는 다른 도메인, 실제 경합 미완 |
| 2026-09-14 — 접근성 방어선 셋을 세웠는데 셋 다 지워도 green이었다 (뮤테이션이 세 번 교정했다) | `rg -n 'ensureUserToken\|\?\..*\.not\.' lib/pull lib/push lib/publish -g '*.ts'`의 대안 검색 | optional 부정 단언 4곳은 앞에서 긍정 값/호출 존재를 단언(render 216·225, run 762, load 71). 해당 공회전 재발 없음. UI 자체는 다른 도메인 |
| 2026-09-14 — 확인 Dialog의 유일한 논거가 반대 방향으로 거짓이었다 | ensureUserToken 검색(lib/pull·push·publish·survey·scan) | 사용자 연결 토큰을 전달 파이프라인이 쓰는 자리 0. installation 경계 유지 |
| 2026-09-14 — nullable 경계 추가만으로 옛 upsert의 소유권 충돌이 사라지지 않는다 | ON CONFLICT/unnest 검색(lib/push/apply) | Locale 3열 경계·Translation keyId/localeCode conflict target이 현 스키마와 대응. PG 미완 |
| 2026-09-14 — TransactionClient를 런타임 속성으로 구별해 첫 적재가 자기 잠금을 기다렸다 | transaction 속성/in 검색(lib/push·surfaces) | applyPush/applyPushInTransaction 명시 분리, 경고 주석 외 런타임 판별 없음 |
| 2026-09-14 — 컬럼을 뗀 마이그레이션이 스모크 스크립트를 죽였고, typecheck가 `select`를 안 본다 | select/project/translationSurface 검색 및 scripts/smoke-github.ts 45–88 독서 | Project.defaultSurface.select에 포맷, locale 조회도 해당 표면 제한. `smoke-db.ts`는 없어서 검사 제외 |
| 2026-09-14 — 내가 쓴 "바이트가 같다" 테스트가 자기 자신과 비교해 공허했다 | bare/빈 줄/toBe/toEqual 검색(lib/onboarding/__tests__/workflow.test.ts), 관련 본문 독서 | 187행 이후 독립 빈 줄 단언 존재. 같은 함수 두 번 호출은 결정성 테스트로 분리. 재발 없음 |
| 2026-09-14 — 설정 YAML이 확정 어댑터를 생략해 CI가 다른 포맷을 보냈다 | workflow/renderSurfaceWorkflowStep/adapterName 검색(lib/onboarding/workflow·projects/actions) | 특정 ts-dict만 싣는 조건 없음. 설정·온보딩 생성자 전체 UI 왕복은 미완 |
| 2026-09-15 — 읽힌 엔트리 0개를 정상 빈 카탈로그로 판정하면 기존 키를 전부 고아로 만든다 | errors.length/entries.length/verifyEmptyCatalog/adapterErrorKind 검색(lib/import·onboarding·surfaces·push) | 진짜 빈 catalog 확인, 불완전 적재 suppressOrphan. 실행 미완 |
| 2026-09-15 — 설정 변경으로 Sync 적용을 거부한 뒤 자기 진행 표시가 남았다 | 종료 토큰 검색(lib/import·projects·push) | finally가 자기 실행·표면 토큰으로 정리. 재발 없음 |
| 2026-09-15 — 컬럼을 더하며 쓰는 자리를 전수로 안 세서 종료 경로 다섯 중 둘에만 붙었다 | `rg -n 'importOutcomeFields\|lastImportError:\|lastImportFailedAt' lib/projects lib/import lib/push -g '!**/__tests__/**'`의 대안 검색 | 공통 종료 필드 생산자 사용, 외부 실패 보고 예외도 시각 포함 |
| 2026-09-16 — 부분 실패 결과가 "임포트가 끝나지 않았다"고 말했다 (끝났고 18키가 들어갔다) | adapterErrorKind/errors.length/lastImportError 검색 및 import/result·surface 독서 | failure/unmanaged 분리와 부분 적재 반환 존재. UI 문구·실물 전달은 다른 도메인/미완 |
| 2026-09-16 — Publish 미리보기가 로케일을 무시하고 첫 파일을 골랐다 | currentFiles/find/locale/paths 검색(lib/publish/read·preview), read.ts 101–112 독서 | locale+key로 match 후 정확히 한 경로만 선택, 첫 파일 폴백 없음 |
| 2026-09-17 — 번역 PR을 merge commit으로 머지하면 루프 마커가 사라져 push가 DB를 덮었다 | `rg --hidden -n 'head_commit' .github lib docs --glob '!docs/POSTMORTEM.md' --glob '!docs/features/**'`; `rg -n 'gh pr merge' .claude/commands` | 커밋·PR 제목·재사용 보강 및 소비자 셋 일치. roundtrip은 merge 방식 인자. 실제 머지 미완 |
| 2026-09-18 — 관계 필터 count가 대량 적재 직후 5.5초였다 (Prisma LEFT JOIN × 낡은 통계) | count/findMany pendingWhere 검색(lib·app), protection/where 전문 독서 | 토큰-only count 0이면 관계 조인 생략. EXPLAIN/성능은 미완; key-list 재발은 다른 도메인 |
| 2026-09-20 — 활동 판정은 통과했지만 조회·렌더·적재 연결에서 사실이 달라졌다 | pendingEdits/finishedAt/PROJECT_WIDE/before 검색(lib/events·components/logs·app); import 결과 공급 경로 | `@project-wide` 구분, 실제 결과 집계 배선. 로그 DOM·DB 전수는 다른 도메인/미완 |
| 2026-09-24 — 비리터럴 값 하나로 904키가 다 들어간 소스가 "Last sync failed"가 됐다 | `rg -n 'errors\.length' lib/onboarding lib/import lib/surfaces lib/push -g '!**/__tests__/**'`; adapterErrorKind 검색 | 실패/unmanaged/warning을 거른 뒤 길이 사용. 정상 비관리 항목 일괄 실패 재발 없음 |
| 2026-09-24 — chrome `"placeholders": null`이 push→pull 왕복에서 사라졌다 (Prisma가 JSON null과 SQL NULL을 같게 읽는다) | Json?/jsonb_typeof/placeholders 검색(prisma/schema·pull/load·push/apply) | JSON null 쓰기 보존, 읽기 좌표 별도 수집·복원. 실제 PG 왕복 미완 |
| 2026-09-27 — 경로 **안전**만 검사해 경로가 **옳은지**를 안 봤고, 토큰을 받는 사람이 리포에 쓸 수 있는지도 안 봤다 (sec-audit-3 발견 1) | `rg -n 'isPathSafe(Locale\|RepoPath)\(' lib app -g '!**/__tests__/**'`의 대안 검색 | push·pull 안전성+모양 동시 검사. 토큰 발급 인가는 boundary 담당 |
| 2026-09-27 — base 파일을 못 읽어 거부된 야간 Publish가 Logs에 "Nothing to send"로 섰다 | withheld/warnings 비교 검색(lib/events/query) | eventResult:248·resultWhere:366이 withheld·warnings·reconfirm 모두 notSent로 처리 |
| 2026-10-02 — 테스트가 전부 통과했는데 PR CI가 `EnvironmentTeardownError`로 red였다 — 게이트 재시도가 진짜 결함을 가렸다 (PR #171) | setTimeout/Promise.race 검색(lib/pull·push·관련 API 테스트·github-wait·fast-github-wait); fast-github-wait import 검색 | 두 API 테스트 모두 공유 helper로 교체됨. 이 감사에서는 게이트 재시도/테스트 자체 미실행 |
| 2026-10-07 — 허용된 CI 경합이 재Publish 뒤 PR의 복구본까지 지울 수 있었다 | lastPublishedAt/applyProtectedPush/runAutomationImport 검색(lib/push/apply·nightly/run·import/run·app/api/push/route); lastPublishedAt/Math.max/FOR UPDATE 검색(lib/pull/load) | committed 경로에 CI/야간 사전 캡처와 잠금 후 null 포함 대조·publish-raced·완료 시각 단조 증가 존재. **no-changes 전달 확인은 표식을 전진시키지 않음: principle.md 발견 3 재발**, 이 보고서 발견 수에는 중복 제외. 경합 실험 미완 |

## 검사 파일 목록

아래 목록은 전체 또는 관련 부분을 읽은 파일과 재발 검색 대상 파일을 구분한다. 목록에 포함됐다는 것이 그 파일의 모든 테스트를 실행했거나 모든 줄을 완독했다는 뜻은 아니다. 패턴을 실제 경로로 확장한 중복 제외 파일 수는 171개다.

### 구현 본문 감사

```text
lib/githash.ts
lib/github.ts
lib/adapters/types.ts
lib/adapters/shared.ts
lib/adapters/index.ts
lib/adapters/glob.ts
lib/adapters/quote-style.ts
lib/adapters/json-style.ts
lib/adapters/chrome-locales.ts
lib/adapters/json-catalog.ts
lib/adapters/yaml-catalog.ts
lib/adapters/code-dict.ts
lib/adapters/ts-dict.ts
lib/pull/run.ts
lib/pull/plan.ts
lib/pull/targets.ts
lib/pull/render.ts
lib/pull/surfaces.ts
lib/pull/client.ts
lib/pull/ref-slug.ts
lib/pull/branch-name.ts
lib/pull/load.ts
lib/pull/sync-branch.ts
lib/pull/trigger.ts
lib/pull/payload.ts
lib/pull/changed-values.ts
lib/pull/undeliverable.ts
lib/pull/message.ts
lib/publish/preview.ts
lib/publish/plan.ts
lib/publish/fingerprint.ts
lib/publish/warnings.ts
lib/publish/load-preview.ts
lib/publish/words.ts
lib/publish/diff.ts
lib/publish/read.ts
lib/push/payload.ts
lib/push/assemble.ts
lib/push/plan.ts
lib/push/guard.ts
lib/push/apply.ts
lib/push/auth.ts
lib/push/token.ts
lib/push/json-bounds.ts
lib/push/surface-refusal.ts
lib/scan/index.ts
lib/scan/ast.ts
lib/scan/wrapper.ts
lib/scan/types.ts
lib/survey/one.ts
lib/survey/run.ts
lib/survey/select.ts
lib/survey/merge.ts
lib/survey/types.ts
lib/survey/stats.ts
lib/survey/json-shape.ts
lib/survey/ts-shape.ts
lib/survey/diff.ts
lib/survey/summarize.ts
lib/protection/where.ts
```

### 테스트 본문 또는 관련 부분 감사

```text
lib/adapters/__tests__/contract.ts
lib/adapters/__tests__/ts-dict.test.ts
lib/adapters/__tests__/code-dict.test.ts
lib/adapters/__tests__/write-contract.test.ts
lib/adapters/__tests__/detect-relax.test.ts
lib/pull/__tests__/delivery-verified.test.ts
lib/pull/__tests__/delivery-plan.test.ts
lib/pull/__tests__/fake-client.ts
lib/pull/__tests__/payload.test.ts
lib/pull/__tests__/entry-order.test.ts
lib/pull/__tests__/order-wiring.test.ts
lib/pull/__tests__/render.test.ts
lib/pull/__tests__/run.test.ts
lib/pull/__tests__/load.test.ts
lib/push/__tests__/order-fields.test.ts
lib/push/__tests__/flow.test.ts
lib/scan/__tests__/ast.test.ts
lib/scan/__tests__/hook-wrapper.test.ts
lib/survey/__tests__/render-parity.test.ts
lib/survey/__tests__/json-shape.test.ts
lib/survey/__tests__/summarize.test.ts
lib/github-connect/__tests__/repository-client.test.ts
lib/__tests__/githash.test.ts
lib/onboarding/__tests__/workflow.test.ts
```

### 교차 참조·재발 검색

```text
lib/pull/__tests__/branch-name.test.ts
lib/pull/__tests__/changed-values.test.ts
lib/pull/__tests__/client.test.ts
lib/pull/__tests__/delivery-invalidation-sources.test.ts
lib/pull/__tests__/delivery-plan.test.ts
lib/pull/__tests__/delivery-verified.test.ts
lib/pull/__tests__/delivery-wiring.test.ts
lib/pull/__tests__/deps-contract.test.ts
lib/pull/__tests__/entry-order.test.ts
lib/pull/__tests__/error-codes.test.ts
lib/pull/__tests__/fake-client.ts
lib/pull/__tests__/load.test.ts
lib/pull/__tests__/message.test.ts
lib/pull/__tests__/order-wiring.test.ts
lib/pull/__tests__/payload.test.ts
lib/pull/__tests__/plan.test.ts
lib/pull/__tests__/render-strategy.test.ts
lib/pull/__tests__/render.test.ts
lib/pull/__tests__/run.test.ts
lib/pull/__tests__/skip-marker.test.ts
lib/pull/__tests__/surfaces.test.ts
lib/pull/__tests__/sync-branch-consumers.test.ts
lib/pull/__tests__/sync-branch-name.test.ts
lib/pull/__tests__/sync-branch.test.ts
lib/pull/__tests__/targets.test.ts
lib/pull/__tests__/trigger.test.ts
lib/pull/__tests__/undeliverable.test.ts
lib/pull/__tests__/withheld-revertable.test.ts
lib/publish/__tests__/fingerprint.test.ts
lib/publish/__tests__/plan.test.ts
lib/publish/__tests__/read.test.ts
lib/publish/__tests__/warnings.test.ts
lib/__tests__/github-app.test.ts
lib/__tests__/github-branches.test.ts
lib/__tests__/github-probe.test.ts
lib/__tests__/github-wait.test.ts
lib/adapters/__tests__/contract.test.ts
lib/adapters/__tests__/ordered-entries.test.ts
lib/adapters/__tests__/bom.test.ts
lib/adapters/__tests__/yaml-catalog.test.ts
lib/adapters/__tests__/json-style.test.ts
lib/adapters/__tests__/detect-candidates.test.ts
lib/adapters/__tests__/read-order.test.ts
lib/adapters/__tests__/key-order-golden.test.ts
lib/push/__tests__/assemble.test.ts
lib/push/__tests__/plan.test.ts
lib/push/__tests__/guard.test.ts
lib/scan/__tests__/scan.test.ts
lib/keys/save.ts
lib/import/run.ts
lib/import/surface.ts
lib/import/empty.ts
lib/import/automation.ts
lib/import/plan.ts
lib/import/result.ts
lib/import/surface-status.ts
lib/onboarding/budget.ts
lib/onboarding/ingest.ts
lib/onboarding/workflow.ts
lib/onboarding/message.ts
lib/onboarding/detect.ts
lib/surfaces/create.ts
lib/projects/import-status.ts
lib/projects/import-status-store.ts
lib/nightly/run.ts
lib/cli/walk.ts
lib/events/query.ts
lib/events/filter.ts
lib/events/__tests__/query.integration.ts
lib/events/__tests__/filter.test.ts
components/logs/log-filters.tsx
lib/github-wait.ts
lib/__tests__/fast-github-wait.ts
app/api/push/route.ts
app/api/__tests__/pull-nightly.test.ts
app/api/__tests__/push-open-pr.test.ts
app/(edit)/projects/actions.ts
lib/onboarding-run/add.ts
lib/pull/plan.ts
lib/keys/view.ts
lib/locale-code.ts
scripts/push-local.ts
scripts/scan.ts
scripts/ingest.ts
scripts/adapter-survey.ts
scripts/smoke-github.ts
.github/actions/malmoi-i18n-push/action.yml
prisma/schema.prisma
.claude/commands/roundtrip.md
.claude/commands/merge.md
.agents/skills/source-command-audit/SKILL.md
CLAUDE.md
docs/PRODUCT.md
docs/ARCHITECTURE.md
docs/POSTMORTEM.md
docs/ACTIONS.md
node_modules/.pnpm/@octokit+openapi-types@29.0.1/node_modules/@octokit/openapi-types/types.d.ts
```

광역 `rg lib app docs scripts .claude/commands`는 이 목록보다 넓은 후보군을 검색했지만 모든 hit를 상세 감사한 것으로 세지 않는다. 옛 `lib/pull/entries.ts`, `docs/ADAPTER-COVERAGE.md`, `scripts/smoke-db.ts`는 존재하지 않아 근거에서 제외하고 현재 `pull/plan.ts`, ARCHITECTURE, smoke-github를 사용했다.

## 미완 검증

- 각 실패 시나리오의 테스트 추가·실행, TypeScript·빌드, 실제 GitHub 브랜치/PR 왕복 및 대상 리포 런타임 해석.
- 실 DB의 UNNEST·CAS·경합·JSON null 왕복과 ANALYZE 전후 실행 계획·성능.
- 어댑터 학습/홀드아웃 코퍼스 재측정 및 survey 수치 재산출.
- UI 상태·Logs·MCP 응답의 실물 표시와 이 invariant 도메인 밖 인증·PII·운영·시각 재발 검사.

위 검증은 요청의 정적 감사 금지 범위 때문에 수행하지 않았다. 기존 테스트가 현재 통과한다고 주장하지 않는다. 발견이 없는 계약도 운영 안전성 전체를 인증하는 결론이 아니다.
