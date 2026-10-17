# source-row-locale-meter — design

## 1. 영향 받는 흐름

**편집 UI의 읽기만 바뀐다.** push·pull·export·Publish는 건드리지 않는다.

| 층 | 파일 | 무엇이 바뀌나 |
|---|---|---|
| 순수 | `lib/keys/view.ts` `localeProgress` | ① `percent` = 완료 + 검토 대기 ② 입력 셀이 **개수**를 든다(`count`) |
| 순수 (새) | `lib/sources/meters.ts` | `meterValue`(진행 한 행 → 막대 값) · `sourceRowMeters`(소스 하나의 행 막대 + 남은 수) · 타입 `LocaleMeterValue` |
| 조회 | `lib/keys/query.ts` `loadLocaleCounts` | 셀 행 전량 `findMany` → `groupBy(localeCode, needsReview)` 개수 |
| 조회 | `lib/sources/query.ts` `loadSources` | 기존 `translation.groupBy`의 `by`에 `localeCode`를 더하고, `locale.findMany`에 `isBase`를 더한다. 소스마다 `localeProgress` → `sourceRowMeters`로 `meters`를 싣는다 |
| 화면 | `components/locale-meter.tsx` | 입력 타입을 `LocaleMeterValue`로 좁힌다 · 루트 `<div>` → `<span>`(버튼 안 phrasing content) · 머리 주석("서버 컴포넌트다")을 공유 컴포넌트로 고친다 |
| 화면 | `components/sources/sources-screen.tsx` | 이름 칸 셋째 줄에 막대 묶음 + `+N` |
| 화면 | `components/sources/languages-card.tsx`(상세 모달 Languages 카드 — locale-add가 모달에서 분리했다) | 막대 폭을 `meterValue`로 얻고, 오른쪽 수치의 분자를 `translated + needsReview`로 바꾸고, 진행률 칸을 `w-[300px]` → `w-[200px]`로 줄인다(`@max-[850px]:w-auto flex-1`은 그대로) |
| 골격 | `app/(edit)/projects/[slug]/sources/loading.tsx` | 행 골격에 막대 줄 |
| 사전 | `messages/{en,ko,es}.tsx` | `sources.moreLanguages(n)`(`+${n}`) · `sources.moreLanguagesLabel(n)`(`${n} more languages`, n = 1이면 `1 more language`) — 시안 문구 |

## 2. 퍼센트 — 한 생산자, 한 정의

**`localeProgress`가 Sources의 유일한 퍼센트 생산자다.** 행과 모달이 같은 함수의 같은 결과에서 값을 읽으므로 "같은 수"가 구조로 보장된다. 행을 위해 `rowLocaleProgress`를 재사용하지 않는다 — 그쪽은 프로젝트 행 계약(프로젝트로 묶기·셋 제한)이고 `project-row-redesign`이 다시 짠다.

- `percent = total <= 0 ? 0 : clamp(0, 100, floor((translated + needsReview) / total * 100))` — 내림은 그대로다(902/903이 100%가 되면 안 된다). clamp도 그대로다(두 조회 사이 적재가 바뀌면 분자가 분모를 넘을 수 있다 — `sources-progress.integration.ts`의 concurrent 갈래).
- **바뀌는 것은 분자 하나다.** `translated`·`needsReview`·`untranslated` 필드의 정의는 그대로다(완료 구간과 검토 구간은 겹치지 않는다).
- orphaned 행도 같은 식이다. 모달의 orphaned 막대는 지금처럼 검토 구간을 그리지 않는다(`dimmed`) — orphaned는 행 막대에 서지 않으므로 행↔모달 대조와 무관하다.
- 모달 오른쪽 수치 `m.sources.translatedOfTotal(a, b)`의 `a`를 `translated + needsReview`로 바꾼다. 퍼센트 옆에서 `210 of 248`이 `92%`를 말하면 두 숫자가 서로 다른 비율을 말하게 된다. 문구(`X of Y`·`Y개 중 X개`·`X de Y`)는 그대로이고, 키 이름(`translatedOfTotal`)과 주석("번역된 수")만 실제 뜻과 어긋나므로 주석을 고친다(키 이름은 그대로 둔다 — 세 사전·테스트를 같이 바꿀 만큼의 이득이 없다). 검토 대기 수는 옆의 `Badge soft-amber`(`N need review`)가 계속 말한다.

## 3. 입력 셀을 개수로

`localeProgress`의 `cells`가 지금은 셀 한 개당 한 행이다(`loadLocaleCounts`가 `findMany`로 전량을 가져온다 — 59로케일 × 1,446키면 8만 행). 행 막대는 `groupBy` 개수로 받으므로, 두 호출부가 같은 함수를 쓰려면 입력 모양이 하나여야 한다.

- `cells: readonly { localeCode: string; needsReview: boolean; count: number }[]` — `count`는 필수다(선택 필드로 두고 기본 1을 주면 같은 함수에 두 모양이 생긴다).
- `loadLocaleCounts`는 같은 `where`로 `groupBy({ by: ["localeCode", "needsReview"] })`를 부르고 `count: _count._all`로 옮긴다. 왕복 수는 그대로 둘이다.
- ⚠️ `loadProjectListAggregates` 머리 주석의 "`loadLocaleCounts`를 재사용하지 않는다 — 셀을 **행으로** 전부 가져온다"가 거짓이 된다. 근거 문장을 "프로젝트 하나 전용이다"로 고친다.

## 4. 행 막대 — 순수 함수

```ts
// lib/sources/meters.ts — server-only 없음(모달이 클라이언트에서 meterValue를 부른다)
export type LocaleMeterValue = { code: string; total: number; done: number; review: number; percent: number };
export function meterValue(row: LocaleProgress): LocaleMeterValue;           // 폭 clamp는 모달의 현행 식 그대로
export function sourceRowMeters(languages: readonly LocaleProgress[]): { shown: LocaleMeterValue[]; hidden: number };
```

- `meterValue`: `done = min(total, translated)` · `review = min(max(0, total − done), needsReview)` · `percent`는 입력값 그대로. 모달의 인라인 clamp(`languages-card.tsx:170`)를 이 함수로 옮겨 두 화면의 폭이 같은 식에서 나온다.
- `sourceRowMeters`: 작업 언어만 남기고(orphaned·제거 예정 REMOVE를 뺀다 — `localeRole`, 행의 `N languages`와 같은 집합, orch D8. 순서는 `localeProgress`의 base → 코드순 그대로 — 다시 정렬하지 않는다) 앞 5개를 `shown`, 나머지 수를 `hidden`. **키가 0이면(`total === 0`) `{ shown: [], hidden: 0 }`** — 막대 줄이 서지 않는다(spec 완료 조건 5). 상한 5는 모듈 상수이고 인자가 아니다(설정 가능성 선반영 금지).
- `loadSources`는 소스마다 `sourceRowMeters(localeProgress({ locales, total: keys, cells }))`를 `meters`로 싣는다. 서버가 자르므로 RSC 페이로드는 행마다 최대 5개 + 수 하나다.

## 4.1 행 시각 (시안 [`Source Row Locale Meter.dc.html`](https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=Source+Row+Locale+Meter.dc.html), 2026-10-17 수령)

- **자리**: 이름 칸(`flex-col gap-copy-gap`) 안, 경로 줄 아래. 묶음은 `mt-2 flex flex-wrap gap-x-3 gap-y-1.5`(경로와 라벨 줄 사이 3 + 8 = 11). 시작선이 이름과 같아 640 적층에서도 따로 맞출 값이 없다. 행의 `items-center`는 그대로다.
- **`+N`**: 다섯 뒤의 평문 — `flex h-5 items-center text-xs text-muted-foreground`, 라벨 줄 높이에 위쪽 정렬, 바 자리는 비운다(배지로 만들면 또 하나의 언어로 읽힌다). 접근 이름은 `aria-label` 없이 글자를 바꿔 끼운다: `<span aria-hidden>+54</span><span className="sr-only">54 more languages</span>`.
- **실패·선택 행**: 막대를 흐리게 하지 않는다(`dimmed`는 "사라진 언어"의 뜻이다). 선택 면 전용 색을 만들지 않는다.
- **base만 있는 소스**: 막대 하나를 그대로 그린다(키가 0일 때만 줄이 없다).
- **라벨 글자**: `LocaleMeter` 라벨 줄 `text-xs`(13) 그대로 — brief의 "퍼센트 12"는 틀린 값이었다.
- **골격**: 막대 자리 **둘**, 묶음은 실물과 같은 `mt-2 flex flex-wrap gap-x-3 gap-y-1.5`, 각 자리 `w-25 flex-col gap-1.5` = 라벨 `h-4 rounded-full` + 바 `h-2 rounded-full`. ⚠️ **실물과 두께가 다르다 — 바는 두껍게(실물 4 → 8), 라벨은 얇게(실물 20 → 16)** 그려 합계 30을 실물(20 + 6 + 4)과 맞춘다. 4px 바는 골격 면에서 선으로 보여 바 자리로 읽히지 않는다(시안 프레임 9). `/projects` 골격의 `h-5`·`h-1`(실물 치수 그대로)을 복사하지 않는다. 둘이면 343 그릇에서도 한 줄이라 골격 줄 수가 폭과 무관하게 하나다. 막대가 한 줄을 넘는 소스(1280에서 6개 이상 · 375에서 3개 이상)와 키 0 소스는 도착할 때 한 줄만큼 높이가 바뀐다 — 골격이 언어 수를 모르므로 받아들인다. 줄 구조는 `SOURCE_CONTENT_STACK`·`SOURCE_STATUS_STACK`을 그대로 쓴다.
- **상세 모달 진행률 칸**: `w-[200px]`(옛 300, 2026-10-17 사용자 지시). 200에서도 퍼센트와 `229 of 248`이 한 줄에 든다.
- **상세 모달 예시 수치**: ko 완료 221 + 검토 8 = 229 / 248 → `92%` · `229 of 248`(brief의 `222 of 248`은 92%와 맞지 않았다).

## 5. `loadSources` 조회

```ts
prisma.locale.findMany({ where: { projectId, surface: { archivedAt: null } }, select: { surfaceId: true, code: true, isBase: true, orphaned: true } })
prisma.translation.groupBy({ by: ["surfaceId", "localeCode", "needsReview"], where: { projectId, surface: { archivedAt: null }, stringKey: { orphaned: false }, value: { not: "" } }, _count: { _all: true } })
```

- **`where`가 `loadLocaleCounts`와 같아야 한다**(`surfaceId` 조건만 빠진다) — 행↔모달 일치의 입력 조건이다. 지금의 `locale: { orphaned: false }` 조건은 빼고, 기존 `progress`(소스 합계)는 **살아 있는 로케일의 그룹만 더해** 지금 값을 그대로 낸다(그 필드는 화면 소비자가 없지만 이 기능이 만든 것이 아니므로 지우지 않는다).
- `localeCode`가 `by`에 더해져 결과 행이 소스당 (로케일 수 × 2)로 는다 — 왕복은 그대로 넷(`Promise.all`)이다(POSTMORTEM 2026-09-09: 비용은 행 수가 아니라 왕복이다).
- 전부 `projectId`로 좁힌다(테넌트 경계·인덱스 선두).

## 6. 조율 — `project-row-redesign`과

- `LocaleMeter`의 소비자가 지금은 `project-list.tsx` 하나다. `project-row-redesign`이 프로젝트 행에서 막대를 빼면 이 기능의 소스 행이 **유일한 소비자**가 된다. 컴포넌트는 지우지 않고 이 기능이 이어받는다.
- ⚠️ 두 문서가 같은 컴포넌트를 건드린다. 이 기능은 **입력 타입을 `LocaleMeterValue`로 좁히고 루트를 `<span>`으로 바꾼다** — `RowLocaleProgress`는 구조적으로 그 상위 타입이라 프로젝트 행이 남아 있는 동안에도 깨지지 않는다. 먼저 머지되는 쪽이 어느 것이든 다른 쪽은 재작업이 없다.
- ⚠️ `project-row-redesign`의 지금 문서(design-brief "`LocaleMeter`(소비자가 이 행 하나뿐이라 모양을 바꿔도 된다)" · tasks T6)는 막대를 뺀다는 결정 이전의 서술이다. 그 디렉터리는 다른 세션이 고치므로 **여기서 손대지 않고** 사용자에게 알린다.
- DESIGN §6.63 머리("LocaleMeter의 공유 소비자는 Projects와 Sources다")는 지금 거짓이고, 두 기능이 다 들어가면 "Sources 소스 행(§6.66)"으로 고친다 — 정본 갱신은 늦게 끝나는 쪽이 한다(tasks T9).
- `rowLocaleProgress`·`RowLocaleProgress`의 존폐는 `project-row-redesign`이 정한다. 이 기능은 둘 다 import하지 않는다.

## 7. 순수 함수로 분리 가능한 부분 (`/tdd` 대상)

1. `localeProgress` — 퍼센트 분자(완료+검토) · 내림 · clamp · 개수 입력(`count`) · 정렬 불변.
2. `meterValue` — 폭 clamp(분자 > 분모 · 검토 > 남은 칸 · 0분모).
3. `sourceRowMeters` — orphaned 제외 · 순서 보존 · 경계(0·1·5·6·59) · `hidden` · 키 0이면 빈 결과.

## 8. 스키마 · 환경변수 · 셀프 호스팅

- 스키마 변경 없음. 마이그레이션 없음.
- 새 환경변수 없음. 새 패키지 없음.
- SELF-HOSTING §3 체크리스트 해당 없음(조회 모양만 바뀐다).

## 9. 불변식 영향

**없다.** 읽기 전용 표시다 — export 결정성·blob SHA·인증 경계·병합 없음 원칙과 무관하다. 인가는 기존 그대로다(`/sources` 페이지 `requireProjectAccess`, 상세 Action `getProjectAccess`). 행이 싣는 값은 로케일 코드·개수뿐이라 EDITOR에게 새로 열리는 정보가 없다(상세 모달이 이미 EDITOR에게 같은 값을 보여 준다).

## 10. 과거 함정 (POSTMORTEM)

- **2026-09-09 — 3.3초의 원인은 함수 리전이었다**: 왕복을 늘리지 않는다. 로케일 축은 기존 `groupBy`에 `by`를 더해서 얻는다.
- **2026-09-10 — 새 `*.integration.ts`를 include에 안 더해 어느 스위트도 안 돌았다**: 행↔모달 대조는 이미 include된 `lib/keys/__tests__/sources-progress.integration.ts`에 더한다(새 디렉터리를 만들지 않는다).
- **2026-09-15 — 컨테이너 질의는 선언이 카드, 질의가 행이다**: 막대 줄의 좁은 그릇 동작은 기존 `@max-form`(카드 640)만 쓴다. 새 컨테이너를 선언하지 않는다.
- **malmoi#101 — 골격과 실물의 행 높이가 갈리면 도착 순간 튄다**: 골격에 막대 줄을 같이 넣고 `sibling-loading.test.tsx`가 센다.
- **2026-09-23 — 테마에 없는 유틸리티는 조용히 버려진다**: 막대 줄의 색은 `LocaleMeter`가 이미 쓰는 토큰만 쓴다. 새 색 이름을 만들지 않는다.
