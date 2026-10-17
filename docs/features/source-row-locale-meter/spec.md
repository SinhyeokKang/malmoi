# source-row-locale-meter — spec

> 2026-10-15 착수. Sources 화면(`/projects/:slug/sources`)의 **소스 행**에 로케일별 진행 막대(`LocaleMeter`)를 단다.
> 짝 기능: `project-row-redesign`이 `/projects` 프로젝트 행에서 막대를 뺀다(그 문서가 다룬다). 이 스펙은 소스 행에 다는 쪽만 맡는다 — 조율은 design.md §6.

## 사용자

**번역 편집자가 먼저다.** 편집자의 질문은 "이 소스의 어느 언어가 밀렸나"다. 지금 Sources 목록에서 그 답을 보려면 소스마다 상세 모달을 열어야 한다.
개발자(OWNER)도 같은 행을 보지만 개발자의 질문(적재 상태)은 행의 상태 배지가 이미 답한다 — 막대는 그것을 바꾸지 않는다.

## 문제 (관측된 사실)

1. **로케일 진행이 프로젝트 행에 있어서 깨진다.** `rowLocaleProgress`(`lib/projects/list.ts:341`)가 (소스, 로케일) 쌍을 프로젝트 행에 담고 앞 3개로 잘라, 둘째 소스가 밀려나고 두 소스의 `ko`를 구별할 수 없다(`project-row-redesign` spec 문제 1). (소스, 로케일) 단위 데이터가 들어갈 자리는 소스 행이다(2026-10-15 사용자).
2. **Sources 목록 행이 진행을 말하지 않는다.** `loadSources`(`lib/sources/query.ts:36`)는 소스별 키 수·언어 수만 행에 싣는다. 로케일별 진행은 상세 모달 Languages 카드(`components/sources/languages-card.tsx`)에만 있다.
3. **같은 사실의 퍼센트가 화면마다 다르다.** 프로젝트 행 막대는 `floor((done + review) / total)`(DESIGN §6.63)인데 Sources 상세는 `floor(done / total)`(`localeProgress` — `lib/keys/view.ts:141`, DESIGN §6.66 "percent는 완료만")다. 같은 언어가 목록에서 92%, 상세에서 84%로 보인다. 막대를 소스 행으로 옮기면 이 둘이 **한 화면**에 함께 선다.

## 결정 (2026-10-15 사용자)

| 질문 | 결정 |
|---|---|
| 퍼센트 정의 | **완료 + 검토 대기**로 통일한다 — 상세 모달도 바꾼다(§6.63 규칙을 Sources 상세까지 넓힌다) |
| 잘림 | **최대 5 + `+N`** |
| 정렬·base | **base 맨 앞 → 코드순** — 상세 모달의 언어 순서 그대로(orphaned만 뺀다) |
| 상세 진행률 칸 폭 | **300 → 200** (2026-10-17 사용자 지시) — locale-add 뒤 행 오른쪽에 [Remove language]·[Open]이 서면서 상태 칸이 가장 좁아졌다. 줄인 100은 상태 칸(`flex-1`)으로 간다. 850 미만의 `w-auto flex-1` 규칙은 그대로다 |
| 시안 | **design-brief.md를 만든다** — Claude Design 시안을 받은 뒤 구현한다. 2026-10-17 수령: [`Source Row Locale Meter.dc.html`](https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=Source+Row+Locale+Meter.dc.html), 행 시각은 design §4.1 |

## 완료 조건 (검증 가능한 문장)

1. **소스 행마다 그 소스의 살아 있는 로케일 막대가 선다** — orphaned 로케일은 빠지고, 순서는 상세 모달 Languages 카드의 비-orphaned 행 순서와 같다(base 맨 앞 → 코드순). 순수 함수 테스트가 고정한다.
2. **행 막대와 상세 모달의 수가 같다** — 같은 소스·같은 로케일의 `percent`·완료 폭·검토 폭이 두 화면에서 같다. 두 화면이 **같은 생산자**(`localeProgress`)의 값을 쓴다. 격리 PostgreSQL 테스트가 `loadSources`의 행 값과 `loadSource`의 `languages`를 같은 DB 상태에서 대조한다.
3. **퍼센트는 완료 + 검토 대기다** — `localeProgress`의 `percent`가 `floor((translated + needsReview) / total * 100)`(0분모는 0, 100 clamp)이고, 상세 모달의 오른쪽 수치(`m.sources.translatedOfTotal`)도 같은 분자를 쓴다(`222 of 248` 옆에 `89%` — 둘이 같은 비율을 말한다). 단위 테스트가 내림(902+0/903 → 99)·검토 포함(84+8 → 92)·clamp를 센다.
4. **최대 5개이고 남은 수가 보인다** — 살아 있는 로케일이 6개 이상이면 앞 5개 + `+N`(N = 나머지 수)이 선다. `+N`의 접근 이름은 `N more languages`다. 서버가 자르고 행마다 5개 + N만 직렬화한다(RSC 페이로드 — `rowLocaleProgress` 주석과 같은 이유). 단위 테스트(경계 5·6·59)와 DOM 테스트.
5. **셀 것이 없으면 막대 줄이 없다** — 키가 0인 소스(첫 적재 전·첫 적재 실패·적재 중)는 막대도 문장도 그리지 않는다. 상태 배지가 이미 그 상태를 말하고, 빈 막대는 "0% 번역됨"으로 읽힌다(§6.63 "0% 바 금지"와 같은 계약). 적재 이후 실패(`failed-after`)는 데이터가 있으므로 막대가 남는다. DOM 테스트.
6. **왕복 수가 늘지 않는다** — `loadSources`의 쿼리는 지금처럼 `Promise.all` 한 묶음 넷이고, 로케일별 집계는 기존 `translation.groupBy`의 `by`에 `localeCode`를 더해서 얻는다. 단위 테스트(mock 호출 수)가 센다.
7. **시안과 같다** — Claude Design 시안을 받고 `/design-sync` 실측 일치·리뷰 지적 0.
8. **기존 행 계약을 지킨다** — 행 전체가 `ListRow as="button"`(상세 모달 열기)이고, 상태 칸·경로 줄·그릇 640 적층(`row-layout.ts`)·선택 면이 그대로다. 로딩 골격(`sources/loading.tsx`)이 막대 줄을 같이 그려 도착 순간 행 높이가 튀지 않는다(`sibling-loading.test.tsx`).

## 비목표

- **프로젝트 행에서 막대 빼기** — `project-row-redesign`이 한다.
- **`LocaleMeter`의 모양 변경** — 폭 100·라벨 줄(국기+코드 배지 · 퍼센트)·바 4px를 그대로 쓴다. 시안이 바꾸자고 하면 그때 판단한다.
- **상세 모달의 재배치** — 퍼센트 정의, 오른쪽 수치의 분자, 진행률 칸 폭(300 → 200, 2026-10-17 사용자 지시)만 바뀐다. 카드 구조·검토 배지·orphaned 스트립은 그대로다.
- **소스 단위 합계 막대**(소스 전체 진행 하나) — 로케일별 막대가 그 일을 한다. `loadSources`의 기존 `progress` 필드(완료만, 화면 소비자 없음)는 손대지 않는다.
- **막대 클릭으로 그 언어의 번역 화면 열기** — 행은 버튼 하나(상세 모달)다. 언어별 이동은 모달의 [Open]이 한다.
- **보관(제거)된 소스** — `loadSources`가 `archivedAt: null`로 거르므로 행이 없다.
- **실시간 갱신** — 요청 시점 값이다.
