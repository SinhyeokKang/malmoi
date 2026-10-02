# component-unify — tasks

순서: **재조사 → 단위 ① 토큰·정리(값 0) → 특성 테스트 → 단위 ② API 이름(축마다 커밋) → 단위 ③ 통합·신설(+이관 같은 커밋) → §6.3 교정 → 문서 → 종료.**
`[commit]`이 커밋 경계이고 **경계마다 `pnpm gate` green**(출력을 파이프로 거르지 않는다 — POSTMORTEM 2026-09-30). 라벨: **[자동]** 테스트 · **[수동]** 브라우저 레이아웃 QA.
**단위가 끝날 때마다 `/push`** — ②③은 그 앞에 `/runtime-test`(spec S10).
**신설·통합 태스크는 `hand-copies.test.ts`(design §5.1)에 자기 행을 같은 커밋에 넣고, `api-contract` 허용 목록(design §5.2)에서 자기 행을 지운다.**
**"뒤집는 테스트"는 기대 문자열만 새 값으로 바꾸지 않는다** — 상태 키·`data-tone`·슬롯 노드로 옮긴다(design §5.4).

**[수동] 레이아웃 QA 화면 목록**(모든 [수동]이 이것을 쓴다, 뷰포트 1280·1440·1890): Home · `/projects` · 번역 화면 · Sources(+상세 모달) · Logs(+이력 상세) · Settings(General·Repository·Members·MCP) · Account · 온보딩 ①–④ · 랜딩 · `/signin`.

## 0. T0 조사·결정 게이트

**조사 기준 `aed73f32`, 2026-10-02.** 선행 디렉터리 둘은 없다. S4 프리미티브 누락은 **S14 사용자 승인**으로 단위 ③(T19c–f)에 포함했다. T0은 수치·범위를 갱신한 계획 작업이며 구현 완료를 뜻하지 않는다.

- 완료한 조사: design §9 패턴 재실행, JSX AST 호출 수·width·placement, TTR 이동 참조, 선행 해소 항목 제거, 전체 배치와 겹침 행렬.
- **계획 완료**: 독립 리뷰 지적2건(T12/T13 제거 경계·T9 스피너 값0)을 수정하고 지휘자가 대조했다. 수정 뒤 `pnpm gate --base aed73f32` green(638파일/9634테스트·빌드·미러), 전체 배치 수립을 사용자에게 알렸다. 이 문서의 T0 커밋 당시 구현은 미착수였다. 이후 진행은 아래 실행 기록이 정본이다. 사용자 선택 S14·S15와 지휘자의 기존 결정 적용 D2–D7은 design §8에 반영했다.
- **TTR 보존 계약**: FilterMenu md0/sm2(`workspace.tsx:814`, `locale-panel.tsx:76`, 둘 다 align=end), DropdownMenu collisionPadding8, ListItemButton disabled hover 없음, 범위 aria-current=true/위치 location, 목록 memo와 필터 슬롯 유지. 검색 label과 placeholder를 합치지 않는다.
- **검증**: design §9 문자열 수는 주석 포함이고 UI 호출 수는 JSX 노드다. 파일 수 기준 C5 탈락(11px·1016px·850px)을 토큰으로 만들지 않는다. 미결 칸을 완료 처리하지 않는다.
- `[commit] docs(feature): component-unify refreshed inventory` — **지휘자 소유**, 본 T0 워커는 커밋·빌드·구현하지 않는다.

### 기존 세부 범위표 — 실행 경계는 아래 병렬 재편 계획이 우선

공통 게이트 **G** = 테스트 먼저 → 해당 순수/DOM 계약·사본 카나리아 → `pnpm gate --base <배치 시작 커밋>` green → 독립 리뷰 → 항목별 커밋. gate 출력은 파이프로 거르지 않는다. **T0은 수정 뒤 지휘자가 별도로 `pnpm gate --base aed73f32`를 실행해 통과했다**(638파일/9634테스트). 수정 전 baseline 결과와 구분한다.

공통 파일 **C** = `components/__tests__/hand-copies.test.ts`·`api-contract.test.ts`(T6 이후)·`visual-system.test.ts`·`focus-ring.test.ts` 중 변경 규칙의 해당 테스트, `docs/DESIGN.md` 해당 규약. 매 배치는 자기 규약 행만 소유한다. **같은 C 파일은 통합 단계에서 한 워커만 수정**한다. 독립 워크트리의 병렬 준비와 통합 순서는 아래 P1–P3 계획이 우선한다. 새 파일 경로는 계획 경로이며 현재 존재를 뜻하지 않는다.

| 배치 / 태스크 | 소유 파일(소비자는 design §4·§9의 전수 집합) | 선행 / 커밋 경계 | Codex 모델·effort / 이유 | 게이트·상태 |
|---|---|---|---|---|
| B0 T0 | 이 폴더 spec/design/tasks | 결정·독립 리뷰 후 문서1커밋 | GPT-6 Astra high / 선행 불일치·계약 정합 | 완료: 실측·결정·독립 리뷰2건 수정·지휘자 대조·gate green·전체 계획 알림 |
| B1a T1 | `app/globals.css` 기존 철자 소비자, `components/__tests__/visual-system.test.ts`, 새 동치 테스트 | B0 / T1커밋 | GPT-6.1 Sol high / 여러줄 철자·CSS 동치 | 완료 `3fcc9e11`: 15파일24곳·컴파일13테스트·gate639파일/9652테스트·Sol 독립 리뷰 통과. 비동치 예외는 §6.1 |
| B1b T2 | `globals.css`, §6.2 토큰 소비자 app/components/lib/messages, DESIGN·REGISTERED 테스트 | T1 / T2커밋 | GPT-6.1 Sol high / 값0 토큰 전수치환 | 완료 `d11f99c6`: 12토큰·232곳, CSS79쌍·merge 충돌 계약, 독립 리뷰2건 수정, gate green |
| B1c T3 | `ui/breadcrumb.tsx`, `ui/segmented-control.tsx`, `ui/avatar.tsx`, `globals.css`, `lib/__tests__/globals-css.test.ts`, invitation-email 테스트, focus-ring 테스트 | T2 / T3커밋 | GPT-6.1 Sol high / dead export·메일 값 대조 | 완료 `2c0f3ffd`: 소비자0·메일 값 보존, 독립 리뷰2건 수정, gate640파일/9795테스트+격리PG520 green |
| B1d T4 | `docs/DESIGN.md`, `app/globals.css` 주석 | T3 / 문서·주석 경계 | GPT-6.1 Sol medium / 사실 교정 | 완료 `bc535749`: DESIGN·CSS 주석만, 독립 리뷰1문장 수정, gate640파일/9795테스트 green |
| R1 리뷰·① QA | 읽기 전용 diff/스크린샷 | T4 / 커밋 없음 | GPT-6.1 Sol high 독립 리뷰 / 브라우저는 지휘자 | 완료: 6화면 1280 비교, 시각 회귀 없음. **dev push 완료 `1d5d6eae`** |
| B2 T5–T6 | primitive 계약 테스트들, `components/__tests__/api-contract.test.ts` | R1 push 완료 / T5·T6 별도 | GPT-6.1 Sol high / 계약·허용목록 그물 | T5 완료 `b9515558`: 7파일59계약·mutation7건·gate645파일/9847테스트·독립 리뷰 green. T6 완료 `993b4190`: 111행/120회·22카나리아·독립 리뷰2건 수정·gate646파일/9869테스트 green |
| B3a T7 | `ui/badge.tsx`, `ui/status-badge.tsx`, `ui/panel-card.tsx`, `lib/status/canon.ts`, `lib/events/view.ts`, `logs/result-badge.tsx`, `logs/event-detail.tsx`, Badge 소비자·C | T6 / 상태축1커밋 | GPT-6 Astra high / 결과 의미·색 예외 결합 | 완료 `17ad3852`: 41파일·상태 위반18행 해소·문구/CSS 보존·리뷰 보완·gate646파일/9951테스트+격리PG520 green |
| B3b T8 | `lib/tone.ts→hue.ts`, `ui/tone.ts`, avatar/image 소비자, client-graph 테스트 | T7 / hue축1커밋 | GPT-6.1 Sol medium / 이름 변경 | 완료 `486a9e97`: hue 개명·팔레트/CSS 보존·13허용행 해소·Unicode mutation 보강·gate647파일/9965테스트+격리PG520 green |
| B3c T9 | `ui/button.tsx`, `ui/alert.tsx`, `ui/skeleton.tsx`, 스피너 전달 `ui/file-input.tsx`·`reconnect-button.tsx`, 해당 호출부(특히 publish/workspace), C | T8 / 크기축1커밋 | GPT-6.1 Sol high / 크기·busy 렌더 계약 | 완료 `447c34da`: 42파일·spinner14/16·icon24/28/32/36·Skeleton70호출 보존·gate647파일/9991테스트 green |
| B3d T10 | `ui/input.tsx`, `ui/select.tsx`, `components/search-input.tsx`, design §9 폭 호출부, C | T9 / 폭축1커밋 | GPT-6.1 Sol high / responsive 폭 보존 | 완료 `92fdd6a6`: 34파일·27필드/검색3소비자 폭·래퍼 보존·37허용행 해소·gate648파일/10038테스트 green |
| B3e T11 | `ui/modal.tsx`, dialog/row-card/form-group/segmented-control/image-tile, 해당 슬롯 호출부, C | T10 / 슬롯 등 축별커밋 | GPT-6.1 Sol high / 포커스·슬롯 경계 | G, ② 허용목록 규약행0 |
| R2 리뷰·② QA | 읽기 전용 전체 이름 변경 | T11 / 커밋 없음 | GPT-6.1 Sol high / 결합 회귀 | 전체 화면·포털·기능 QA 후 지휘자 /push |
| B4 T12 | `ui/panel-card.tsx`·`ui/row-card.tsx`의 Card/행 export→`ui/card.tsx`(EmptyRowCard·BannerLine은 row-card에 유지), export별 소비자, mcp token/connected·members·projects·home, C | R2 / Card1커밋 | GPT-6 Astra high / 헤더선·슬롯·자식 결합 | G, 선1개·notice 유무 |
| B5 T13 | `ui/empty-state.tsx`, T12가 남긴 `ui/row-card.tsx` EmptyRowCard→EmptyState/NoMatch, page13/card2/inset6 및 workspace 목록, C | T12, D2a / Empty1커밋 | GPT-6.1 Sol high / RSC·빈상태 형 | G, placement 전수·서버경계 |
| B6 T14 | `ui/modal.tsx`→large-modal, WizardFooter, `onboarding/modal.tsx`, modal7소비자, logs event-dialog, C | T13 / Modal1커밋 | GPT-6 Astra high / trap·busy·복귀 | G, 소비자7+event-dialog QA |
| B7a T15 | `ui/button.tsx`, 새 `ui/link.tsx`, direct/cn/상수 buttonClass 링크·DOC_LINK 소비자, C | T14 / 링크1커밋 | GPT-6.1 Sol high / href·onNavigate·a11y | G, AST 스캔·링 |
| B7b T16 | 새 ui/list-row, `ui/list-item.tsx`, 카드5형·정적2형·workspace key/tree, C | T15, D2b / 행1커밋 | GPT-6 Astra high / li·memo·포커스 | G, 5000키 Profiler 비교 |
| B7c T17 | 새 ui/select-row, `onboarding/steps/{naming,repo,files}.tsx`, `mcp/token-grant-fields.tsx`, C | T16 / 선택행1커밋 | GPT-6.1 Sol high / roving·비동기 확장 | G, 화살표 중 branch load0 |
| B8 T18 | 새 ui/popover, `workspace.tsx` TreeOverlay, focus-ring·C | T17 / Popover1커밋 | GPT-6.1 Sol high / portal·밖클릭·Escape | G, 재열림0·복귀 |
| B9a T19 | project-thumbnail·invite/project-card·settings/general-card, search-input→ui, onboarding/copy-button→ui, skeleton와 소비자, C | T18 / 프리미티브별 커밋 | GPT-6.1 Sol high / 이동·export 계약 | G, 옛 import0·radius 보존 |
| B9b T19a | ui/input/select/새 field-trigger, filter-menu/log-filters, search-input·tree/repo/switcher, readonly소비자, globals.css, **messages/en.tsx**, C | T19, D1/D4/D5 / 필드1커밋 | GPT-6 Astra high / 입력·IME·Radix | G, X/Escape·align·충돌여백 |
| B9c T19b | ui/input/textarea/select/field-trigger/button/checkbox/radio, focus-ring·DESIGN | T19a, D7 / 링1커밋 | GPT-6.1 Sol high / invalid·checked 우선순위 | G, 테두리형 렌더·Tab QA |
| B10a T19c | locale-meter·source-detail-modal→새 ui/meter, C | T19b / Meter1커밋 | GPT-6.1 Sol medium / 공유함수 이동 | G, 비율·dimmed 계약 |
| B10b T19d | ui/copy-button·새 secret-field, onboarding/result·settings/push-token-panel·mcp/token-modal, C | T19c / Secret1커밋 | GPT-6.1 Sol high / 복사실패·공개값 | G, copy/실패선택·원문은 fixture만 |
| B10c T19e | 새 ui/facts, home/meta-column·mcp/token-card·connected-apps-card·logs/event-detail·source-detail-modal, C | T19d / Facts1커밋 | GPT-6.1 Sol high / dl/th·폭·라벨 | G, 의미론·96/120/104 보존 |
| B10d T19f | 새 ui/error-state, edit/logs 오류·셸 not-found 둘, root-fallback/error/not-found 대조, C | T19e, D6 / Error1커밋 | GPT-6.1 Sol high / RSC·retry·낭독 | G, 오류≠빈상태·루트껍데기 보존 |
| B11 T20 | 남은 승인 §6.3 행(BannerLine 선 등)와 C | T19f, D3 / 교정별 커밋 | GPT-6.1 Sol high / 결정표 잔여만 | G, 표밖 변경0 |
| R3 리뷰·③ QA | 읽기 전용 전체 통합 | T20 / 커밋 없음 | GPT-6.1 Sol high / 화면·결합 검증 | 3뷰포트·극단값·포털 후 지휘자 /push |
| B12 T21 | DESIGN/DIRECTORY/global-search 문서, loading glob 테스트; CLAUDE·mirror는 지휘자 창구 | R3 / 문서별커밋 | GPT-6.1 Sol medium / 정본 반영 | 문서대조+G, 원본정책 준수 |
| B13 T22 | feature 폴더 삭제만 | T21·전단위 push/QA / 종료커밋 | GPT-6.1 Sol medium / 종료 정리 | G, 결론 정본 승격 후 삭제 |

**배치 파일 겹침 행렬**(해당 파일 편집은 아래 통합 토큰으로 직렬화):

| 공유 파일/집합 | 소유 배치들 | 직렬화 이유 |
|---|---|---|
| globals.css·DESIGN·visual-system | B1a–d, B3, B4–B12 | 토큰/규약 기준이 후행의 입력 |
| hand-copies·api-contract·focus-ring | B2–B11 | 한 허용목록/카나리아 파일을 여러 워커가 갱신 |
| **messages/en.tsx** | B1b(토큰 문자열 있다면), B9b(지우기 이름), B3a(새 상태 문구가 불가피하면 지휘자 승인 후) | 사전 공유; 기존 문구 변경을 허용하지 않음 |
| **workspace.tsx**·key-list·tree-panel·locale-panel | B1a/b, B3a/c/d/e, B5, B7a/b, B8, B9a/b | TTR 범위·검색·포커스 계약 공유 |
| **publish-button.tsx** | B1a/b, B3a/c/e, B6, B7a | modal·button·badge 이름과 슬롯 겹침 |
| panel-card/row-card·home·mcp·members | B1, B3a/e, B4, B5, B7b, B10c, B11 | 헤더선·행·빈상태·Facts 동시 소유 불가 |
| input/select/search-input·repo.tsx | B3d, B7c, B9a/b/c | width→이동→필드→링 순서 |
| onboarding/copy-button·token-modal | B9a, B10b | 이동된 export를 후행 SecretField가 소비 |
| source-detail-modal·locale-meter | B1, B6, B10a/c | 치수·Meter·Facts의 부모 파일 공유 |

### 병렬 재편 — 사용자 요청 2026-10-02

사용자 “워크트리 체크아웃으로 병렬 실행 가능하게 배치좀 뭉칠 수 있니?”에 따라 **T11E 다음부터 독립 워크트리 3개, 큰 구현 커밋 3개**로 실행한다. 위 B4–B10d 표는 세부 범위/검증 목록이며 직렬 선행·프리미티브별 커밋 경계는 이 계획으로 대체한다. 완료한 T0–T11의 기록과 제품 범위는 바꾸지 않는다.

| 새 배치 | 포함 태스크 / 내부 순서 | 모델 | 병렬 준비 소유권 | 통합 진입 조건 |
|---|---|---|---|---|
| P1 카드·목록 | T12 → T13 → T16 → T19e | GPT-6 Astra high | Card/EmptyState/ListRow/Facts, row-card/panel-card/list-item 및 전용 테스트 | T11E 완료 기준에서 시작. R2 동안 자체 체크아웃만 변경; dev 반영은 R2 종료 뒤 |
| P2 모달·링크 | T14 → T15 → T18 → T19c → T19f | GPT-6.1 Sol high | LargeModal/WizardFooter/Link/Popover/Meter/ErrorState와 modal/button/locale-meter 및 전용 테스트 | 공유 소비자·공통 테스트·DESIGN 편집 전 P1 dev 반영을 기다리고 rebase |
| P3 입력·선택 | T17 → T19 → T19a → T19b → T19d | GPT-6.1 Sol high | SelectRow/ProjectThumbnail/SearchInput/CopyButton/Skeleton/FieldTrigger/SecretField, input/select/textarea/checkbox/radio 및 전용 테스트 | 공유 소비자·공통 테스트·DESIGN 편집 전 P2 dev 반영을 기다리고 rebase. Button/Link 링은 이 단계에서만 변경 |

- **두 단계 소유권:** 세 워커가 자기 프리미티브와 새 전용 테스트를 동시에 준비한다. 기존 app/feature 소비자와 공유 테스트(C 및 기존 소비자 테스트), DESIGN은 **P1 → P2 → P3 통합 토큰** 소유자만 편집한다. P2/P3는 독립 준비를 마치면 대기하고, 앞 배치가 dev에 들어온 뒤 미커밋 변경을 안전하게 보존하여 `git rebase dev`하고 통합한다. 다른 워커의 결과를 추측해 소비자 API를 미리 바꾸지 않는다.
- **구체적 겹침 처리:** workspace/key/tree/locale 및 home/mcp/members/logs/source-detail 소비자는 위 순서로 이관한다. source-detail은 P1 Facts 뒤 P2 Modal/Meter, onboarding/token은 P2 Modal 뒤 P3 Select/Copy/Secret, ButtonLink는 P2 뒤 P3 링이다. P1 ListRow는 현행 링크 계약을 보존하며 P2가 최종 Link 소비를 이관한다. 컴포넌트 간 선행이 새로 발견되면 독립 범위를 계속 작업하면서 해당 부분만 대기한다.
- **커밋·검증 묶음:** 작은 태스크마다 전체 빌드를 반복하지 않는다. 태스크별 의미 있는 red/green·사본 카나리아·현재 경로 mutation은 유지하고, 실제 소비자/공통 게이트/문서를 모두 이관한 **P 배치마다 전체 `pnpm gate --base <통합 시작 dev SHA>` + 독립 리뷰 → 신설과 이관을 함께 1커밋**한다. 임시 준비만 커밋하여 dev에 올리지 않는다. 통합 충돌은 담당 워커가 해결하고 변경 후 재검증한다.
- **리소스:** 워커는 전부 Codex. 동시에 구현 워커 최대3명이고 무거운 전체 gate/build는 한 번에1개만 실행한다. 대기 워커 슬롯은 독립 리뷰에 재사용할 수 있다. 단위② R2 브라우저 QA와 새 워크트리 구현은 병렬 가능하나 QA 중 root dev cherry-pick/build는 금지한다.
- **마무리:** P1–P3 뒤 T20 잔여 승인 교정 → **T21 정본 문서** → 전체 통합 gate/R3 3뷰포트 QA → 단위③ dev push → T22 종료(폴더 삭제·최종 gate·커밋·dev push)까지 계속한다. `/push` 문서 신선도 규칙을 지키고 중복 gate를 줄이기 위해 T21 문서를 R3 앞으로 옮겼다. T21 loading glob 테스트는 P3가 맡는다. 프로덕션/main과 환경·비밀값은 건드리지 않는다. 독립 워크트리는 tracked clean 및 dev에 모든 커밋 반영을 확인한 뒤 정리한다.


**원격 경계**: 2026-10-02 사용자 “push 허용”·“멈추지말고 계속 진행해”에 따라 **Codex 지휘자가 단위별 게이트·QA 후 dev push까지 수행하고 다음 단위로 계속 진행한다.** 구현 워커는 로컬 커밋까지만 맡고 원격 쓰기는 지휘자 한 창구다. 프로덕션/main·DB·비밀값 변경 없음. QA는 Codex가 제공된 브라우저 기능으로 직접 수행 가능한 항목만 측정하며, 런타임 접근이 없으면 미검증으로 남긴다.

## 다음 세션 인계 — 2026-10-02 20:40 KST

**미완: P3 최종 검증·독립 리뷰·커밋/통합, T20 최종 대조, T21 정본 반영, R3 브라우저 QA, 단위③ push, T22 종료.** 전체 약80%는 작업량 추정이며 테스트 커버리지 수치가 아니다. 사용자의 이번 지시는 **이 tasks.md만 즉시 갱신·로컬 커밋**이다. 이 체크포인트는 전체 기능 완료나 추가 push를 뜻하지 않는다.

### 최신 실행 방식 변경 — 사용자 2026-10-02

**“병렬 배치 이번턴 끝나고 걷어들이고 직렬 세션으로 전환”** 지시를 우선한다. **새 병렬 배치·새 워커·재사용 dispatch를 만들지 않는다.** 현재 P3 구현은 진행 중인 이관/검증 단계만 마치고 모든 mutation을 복원한 뒤 exact manifest·인계·남은 일을 저장하여 대기하도록 통지했다. 현재 Astra 리뷰도 이미 승인된 읽기 전용 검토 결과와 미검토 범위를 저장해 회수 대기하도록 통지했다. **아직 회수/종료 완료가 아니다.**

다음 세션은 기존 두 dispatch의 마지막 결과를 먼저 회수하고 실제 작업 파일/증거를 보존한다. 미완을 완료로 처리하지 말고 스킬의 명시적 인계/settlement 절차로 현재 배치를 닫은 뒤 **단일 직렬 세션**으로 P3 잔여 검증·리뷰·통합부터 이어간다. 아래 원래 순서의 “리뷰와 gate 병행” 및 병렬 worker 재사용은 이 최신 지시로 대체한다. 전체 기능 범위·dev push 권한·검증 게이트는 유지한다. 현재 워커 파일을 root로 옮길 때에는 무커밋 diff/new files를 먼저 보존하고, 임시 테스트 변조가 모두 복원되었는지 확인한다.

### 병렬 재개 — 최종 사용자 지시 2026-10-02 20:47 KST

사용자가 토큰 리셋 확인 뒤 **“걍 병렬로 가자”**로 직렬 전환을 철회했다. 위 직렬 전환/새 병렬 금지 지침은 더는 유효하지 않으며, **P3 구현과 독립 리뷰를 병렬로 계속한다.** 이미 종료한 P2 워커를 다시 띄울 필요는 없다. 기존 두 워커는 lifecycle 상태를 확인해 active면 이어가고, 이미 worker_done한 경우 새 task/dispatch로 같은 터미널을 재사용한다. 종료된 dispatch 권한을 재사용하지 않는다.

**작은 커밋과 매 커밋 tasks.md 갱신 지시는 그대로 유효하다.** 아래 정책의 직렬 실행/새 병렬 금지 문구만 이 최신 병렬 재개 지시로 대체한다. 무거운 전체 gate/build는 동시에1개, 파일 수정 소유자는1명 원칙을 유지한다. 이 체크포인트는 실행 방식 변경만 기록하며 P3 최종 승인이나 push가 아니다.

### 작은 커밋과 실행 기록 — 최신 사용자 지시

**“커밋은 계획보다 더 잘게 쪼개야 돼. 멈출 수도 있음”**, **“커밋할 때 tasks.md 갱신도 잊지말고”**를 우선한다. 남은 P3의 단일 큰 커밋 계획은 폐기한다. 이미 확정된 P1/P2 이력은 재작성하지 않는다. 아래 정책은 앞의 배치1커밋 규칙과 뒤의 전체 gate 이후 단일 COMMIT 순서를 대체한다.

- 현재 워커의 진행 단계와 인계를 회수한 뒤 **직렬로**, 독립적으로 되돌리고 검증할 수 있는 최소 단위마다 로컬 커밋한다. 새 병렬 워커/배치는 만들지 않는다.
- 분할 초안: ProjectThumbnail 이동 → Skeleton line/loading 상태 → CopyButton 이동 → SecretField 소비자 → SelectRow 소비자 → repo 명시 확정/onScan·Next 회귀 → FieldTrigger 소비자 → Input/SearchInput 슬롯·clear/IME → 테두리형 포커스 링. 실제 의존성에 따라 순서는 조정하되 무관한 축을 다시 큰 커밋으로 묶지 않는다. 강하게 결합된 API·실소비자·해당 테스트는 함께 넣는다.
- **매 커밋에 이 tasks.md의 실행 기록 갱신도 함께 포함한다.** 완료/미완 항목, 해당 커밋 범위, 실제 검사 결과, 아직 안 돈 전체 gate/QA, 다음 작업을 적는다. 자기 커밋 SHA는 사전에 알 수 없으므로 현재 기록의 SHA는 git log로 찾고 다음 커밋에서 앞 checkpoint SHA를 연결한다. 이를 위해 자기 SHA를 넣는 amend 반복은 하지 않는다.
- 커밋별 관련 테스트/typecheck는 **분리된 실제 커밋 내용**으로 확인한다. 큰 dirty tree의 통과 결과를 일부 stage한 커밋의 검증으로 주장하지 않는다. 공유 테스트·검사기·문서도 해당 변경분만 나누고, 뒤 구현을 앞 커밋이 미리 요구하지 않게 한다.
- 작은 로컬 커밋은 중단 대비 checkpoint일 수 있다. 검증 범위를 명시하며, 최종 누적 전체 gate·독립 리뷰·QA 전에는 기능 완료나 dev push로 취급하지 않는다. 전체 build를 작은 커밋마다 반복할 필요는 없다.
- 중단 전 마지막 커밋과 남은 dirty/new 파일 목록·원본 diff·인계를 보존하고 테스트 mutation은 복원한다. 분할 전에 현재 변경 전체를 안전하게 보존한다. 비밀값·생성물은 커밋하지 않는다. English commit message와 Codex trailer를 유지한다.
- 현재 구현 워커에는 위 단일 큰 커밋 취소와 분할 인계 준비를 전달했다(`msg_933eea16a23b`). 실제 분할 커밋·전체 gate는 아직 수행하지 않았다.

### 확정 상태

| 항목 | 상태 / 증거 |
|---|---|
| root 체크아웃 | `/Users/sinhyeok/code/malmoi`, **dev**. 체크포인트 직전 HEAD `150d221c4b70369831b46428551aea873a6202b1`, tracked clean. 이 문서 커밋은 그 위에 놓인다. main은 건드리지 않았다 |
| 원격 | 마지막 dev push `e289289e87e456c843123ad16ff1f8f55aa62c81`; [CI 36993216714](https://github.com/SinhyeokKang/malmoi/actions/runs/36993216714) 정확한 SHA의 success 확인. P1/P2는 아직 로컬만 통합 |
| 단위② / R2 | 완료. root gate exit0:651파일/10126테스트 + 격리 PostgreSQL31파일/520테스트 + typecheck/build/미러. Chromium17상태×3폭=51PNG 시각 검사. `.scratch/component-unify-r2-qa.md`, `.scratch/component-unify/r2/`, `r2-gate.log`, `r2-gate.exit` |
| P1 | **완료·통합**. 워커 `fa1f0b828a5afc01f872afdfc84d8faef302b60c` → root `591fb58a3936ce5d4e38048b2c489c5e8e90a776`. 70경로 독립 리뷰0건, 최종 gate653파일/10151테스트+기존 opt-in profiler1skip, build/미러 exit0. Sources chevron 간격/위치 회귀와 기존 계정 구조 테스트 수정 재검증 완료 |
| P2 | **완료·통합**. 워커 `e1db2f6038e76d912913415cbeec6746d81eddd6` → root `150d221c4b70369831b46428551aea873a6202b1`. 67경로 manifest `b7f4edb9ace1924fc79e5ac3d41f08cdfab09ae1b9a6d1cdf593115493a809c9`, 독립 리뷰0건. 최종 gate657파일/10210테스트+기존 profiler1skip, build/미러 exit0; PG 미선택. 첫 gate22실패는 기존 테스트7파일 이관으로 수정했고 최종 재실행 통과 |
| P3 | **진행 중·미커밋**. 정확한 통합 base `150d221c4b70369831b46428551aea873a6202b1`로 stash(새 파일 포함)→rebase→복원 충돌 없이 완료. 실제 소비자 이관, 관련110검사/typecheck0, repo 화살표 조회0·명시 확정8검사 통과 보고. 실제 옛 사본8종·loading 소스 제거 mutation 실패를 관측했으나 **최종 STABLE/전체 gate/전체 리뷰는 아직 미수령**. 임시 mutation 중인 파일을 최종 변경으로 취급하지 않는다 |
| 문서 초안 | P2의 DIRECTORY 초안 별도 태스크 완료·수용. `.scratch/component-unify/t21-drafts/t21-DIRECTORY-draft.md`, SHA `0b637e8f444f662c8182c3c53987acfe6ba80e878132b9ecbc30de8b40f18c57`. P3 행은 provisional이며 최종 코드 대조 뒤 적용. global-search3문서·CLAUDE 초안도 같은 폴더; CLAUDE의 `FINAL_UI_COUNT`는 최종 실측으로 바꿔야 한다 |
| 정리 | P2 터미널은 worker-release로 종료·전사 보존, worktree는 clean/`git cherry dev`의 +0 확인 후 Orca로 삭제 완료. 인계/로그는 root `.scratch/component-unify/{p1-evidence,p2-evidence,handoff-p1.md,handoff-p2.md,p1-review.md,p2-review.md}`에 보존 |

### 살아 있는 Orca 작업 — 중복 워커를 띄우지 않는다

Run **`run_0e44db2882ac`**, 기존 coordinator **`term_dd1b2d61-f22d-4409-8977-7d06c32ba323`**. 새 세션은 먼저 `orchestration` 스킬과 live runtime의 태스크/dispatch/메시지를 확인하고 기존 Run의 인계 절차를 따른다. 종료된 것으로 추정해 재시작하거나 무작정 reset하지 않는다.

| 소유자 | 워크트리 / 모델 | task / dispatch / terminal |
|---|---|---|
| P3 구현 | `/Users/sinhyeok/orca/workspaces/malmoi/component-unify-p3`, branch `SinhyeokKang/component-unify-p3`, Codex GPT-6.1 Sol high | `task_f191f68071af` / `ctx_917330f3503a` / `term_19e5295f-860f-4041-8321-b5df384b5b33` |
| P3 독립 리뷰·T20 | `/Users/sinhyeok/orca/workspaces/malmoi/component-unify-p1`, Codex GPT-6 Astra high, **읽기 전용** | `task_c5a6bfbff251` / `ctx_7e927548190e` / `term_3502e1bc-eba0-4269-9586-d5b6d4eb8807` |

- P3는 최종 STABLE 전에 고정된 production subset을 먼저 보내 리뷰를 병행하도록 지시받았다. naming/files/token-grant3소비자+Radio 폭/실제 Tab 검증(early9)과 projects-search/filter-menu2소비자(early3)는 이미 독립 리뷰0건이다. 최종 전체 파일 검증을 대체하지는 않는다.
- P3 handoff: 워커 `.scratch/handoff-component-unify-p3.md`, 증거 `.scratch/component-unify-p3/`. 리뷰: P1 워커 `.scratch/p3-final-review.md`. root 브리프는 `.scratch/component-unify/brief-p3.md`, `brief-p3-final-review.md`, 소유권은 `parallel-worker-rules.md`, 상세 일지는 `coordinator.md`.
- P3 전체 gate는 아직 허가하지 않았다. **최종 바이트 고정 → 독립 리뷰와 gate를 병행 → 둘 다 통과 후 COMMIT → root cherry-pick**. 무거운 gate/build는 동시에1개. 구현/테스트 수정은 계속 P3 워커 소유다.
- 현재 P3 pane의 최초 readiness 실패 resource holder는 `ctx_45e9e58a4671`이다. runtime에 reclaimable로 보여도 **같은 pane의 현재 P3가 실행 중이므로 release하지 않는다**. 실제 settlement 뒤 live receipt에 따라 정리한다.
- `worker_done`는 해당 task/dispatch의 실제 결과로 처리한다. 수용 후 즉시 다음 태스크에 재사용하거나 `worker-release`하고 delivery ACK. 단순 heartbeat/timeout은 완료나 실패가 아니다. 이 문서만 보고 active 워커를 종료하지 않는다.

### 이어서 실행할 순서

1. **P3 인계 수령·리뷰.** 최종 manifest의 변경/신규/삭제 집합과 각 해시를 실제 base150d221c diff와 비교한다. API 허용 부채0, 옛 실제 코드8종의 유효 TSX(parseDiagnostics0) mutation, 검사기 무력화 red/복원 green, loading.tsx glob8/8 및 실제 소스 제거 red를 확인한다. repo `detail=0` 접근성 클릭·Enter/Space 확정1회, 파일 Preview/Include 분리, readonly/invalid/checked 링 우선순위, copy 반복2초·실패 선택을 보존해야 한다. 기존 테스트 이관이 단언 약화인지 리뷰한다.
2. **P3 전체 gate·커밋·통합.** `pnpm gate --base 150d221c4b70369831b46428551aea873a6202b1`의 실제 exit0/전체 로그, 독립 리뷰0건, 동일 최종 바이트를 확인한 뒤 English+Codex trailer 커밋을 root dev에 cherry-pick한다. 이번 tasks 체크포인트는 P3 소유 파일과 겹치지 않는다. QA 서버가 돌 때 cherry-pick/build 금지.
3. **T20·T21.** 승인된 design§6.3 잔여 표와 최종 diff를 대조한다(사전 조사에서는 추가 delta 없음; 임의 cleanup을 만들지 않는다). 최종 코드 기준 DESIGN/DIRECTORY/CLAUDE/global-search를 대조·문서별 커밋. 원본 CLAUDE 수정 후 `pnpm sync:agents`, 생성된 AGENTS 직접 편집 금지. `t21-doc-checklist.md`·`t21-canonical-doc-proposal.md`·초안을 사용한다.
4. **root 최종 gate → R3.** 최종 코드+문서에 전체 gate 후 HEAD 고정, `.scratch/component-unify/r3-qa-plan.md`대로1280/1440/1890×900 측정. 기존 **Ego TaskSpace22 / p1** 재사용(아직 finish하지 않음), 현재 root dev 서버 없음. 캡처 helper `.scratch/component-unify/r3/capture.mjs`. 실제 버그는 BugShot 흐름으로 기록하고 P3에 수정 라우팅한다.
5. **단위③ dev push.** QA 뒤 서버 종료, `.next/dev`만 정리하고 generated next-env 복원. gate 뒤 tracked 바이트가 같으면 불필요한 전체 gate 반복 없이 문서 신선도/guide check 확인 후 허용된 dev push, 정확한 SHA의 CI 확인. main/prod는 금지.
6. **T22.** 영구 결론·한계·후속을 정본/종료 보고로 승격했는지 확인하고 이 feature 폴더를 삭제, 필수 최종 gate 후 `docs: close component-unify` 커밋/dev push. active worker settlement/증거 보존/clean/+0 확인 후 Orca cleanup, TaskSpace22 finish는 성공 시 한 번만.

### 최종 문서·QA에서 놓치지 말 것

- 실제 P1은 `ui/empty-state.tsx`의 **NoMatch(action: ReactElement 필수)**, `ui/facts.tsx`의 **Fact**다. global-search의 출구 선택화는 미래 D5a로 남긴다. `PanelFacts`/`BannerLine`, `ui/tone.ts`/`ui/focus.ts`는 남아 있다.
- P2 LargeModal은 `LARGE_MODAL_PANEL`/`LARGE_MODAL_OVERLAY`, 필수 actions, WizardFooter 별도다. Button **asChild 없음**. 일반 ButtonLink에 자동 Next pending을 더하지 않았다. 정확한 Privacy mailto1곳 예외만 허용하며 사전 파일 전체 면제 아님.
- DESIGN Meter 정밀 교정: Sources 막대의 done/review clamp는 **source-detail-modal 안**, 표시 percent의 clamp/floor는 **lib/keys/view localeProgress**다. LocaleMeter는 done/review 비율을 나누고 공급된 percent를 표시한다.
- R3 Popover는1280에서 **shell sidebar** 리사이저를320으로 넓혀 실제 트리를 접고 트리거로 연다(React 로컬 상태; reload복원). **translation divider는 저장되므로 건드리지 않는다.** MCP 초기 토큰 폼은 실제 소스에서 발급이 submit에만 있음을 재확인 후 열 수 있지만 **Create/Rotate 확인·원문 표시·폐기 금지**.
- R2는 Safari/AT·실제 쓰기 busy·온보딩4·TreeOverlay 미검증. R3에서 가능한 범위만 추가하고 나머지는 솔직히 남긴다. 온보딩 라우트 닫힘 후 BODY 포커스는 기존 정책으로 확인했으며 새 회귀로 만들지 않는다. public landing/signin은 인증 리다이렉트로 R2 미측정.
- 최신 `guide:check`는 **stale25컷49건**(이전39건은 과거 기록). 재촬영 후속이며 게이트 실패는 아니다. 스키마/마이그레이션 변경 없음, prod db:deploy 불필요. `.env.local` 읽기·복사·편집, 공유 DB 업무 데이터 쓰기, main/prod 작업은 하지 않는다.

## 실행 기록 — 2026-10-02

- **단위 ① T1–T4 및 R1 완료, dev 반영 `1d5d6eae`.** T0 `b731533a` → T1 `3fcc9e11` → 동치 경계 문서 `9239b351` → T2 `d11f99c6` → T3 `2c0f3ffd` → T4 `bc535749`. 구현·문서·독립 리뷰 워커는 전부 Codex이며, T1–T4는 Sol(high/high/high/medium)로 수행했다.
- 각 구현 경계의 전체 gate·독립 리뷰를 통과했다. 최종 코드 검증은 640파일/9795테스트, T3 자동 격리 PostgreSQL 31파일/520테스트, typecheck·build·미러 green. T2의 tailwind-merge 별칭 등록과 색 스캐너 접두 누락, T3의 메일 색 파서/hex 누락을 회귀 테스트로 고정했다.
- **1280×900 R1**: Home·Projects·Translations·Sources·Logs·Settings를 T0와 대조했다. Home/Logs/Sources는 픽셀 차이0, Projects5·Translations4·Settings24픽셀의 미세 렌더링 차이만 남았다. Home/Logs/Settings의 267/406/157개 보이는 HTML 요소 좌표와 계산된 CSS 14속성은 전부 같았다. 승인 밖 레이아웃·색 변화는 발견하지 않았다.
- 최초 촬영 뒤 브라우저 스크롤바 모드가 달라져, Home/Logs/Settings는 동일 T0 SHA를 임시 디렉터리에서 같은 브라우저·Webpack dev 조건으로 재촬영했다. 상대 시간 문구·개발 도구 렌더링 표시는 안정 상태에서 구분했다. 환경 파일 복사·프로젝트 데이터 변경 없이 검증했고 서버·임시 디렉터리·브라우저 공간을 정리했다.
- 상세 로컬 증거: `.scratch/component-unify-r1-qa.md`, `.scratch/component-unify/{before,after,baseline-current-browser,after-current-browser}/`, `dom-comparison.json`. 각 배치 인계서는 `.scratch/handoff-component-unify-b1{a,b,c,d}.md`다.
- **단위 ② T5–T11 완료, R2 Chromium 17화면/상태 × 3뷰포트(51장) 검사 완료. 단위 ③ P1–P3 병렬 진행, T21/T22·Safari/AT·쓰기 상태·온보딩4는 미완/미검증.** 단위 ① push 직전 `pnpm gate` exit 0(640파일/9795테스트·격리 PostgreSQL 31파일/520테스트·build·미러)을 확인했다. `aed73f32..1d5d6eae`를 dev에 푸시했으며 CI run은 `36964622111`이다(푸시 시점 queued). `pnpm guide:check`: `stale 25컷 (39건)` — 후속 재촬영 경고. 스키마·마이그레이션 변경 없음.

- **T5·T6 계약 그물 완료.** T5 `b9515558`은 현재 프리미티브 59계약과 7개 mutation을 고정했다. T6 `993b4190`은 실제 위반 111행/120회와 해소 태스크를 기록했다. 독립 리뷰에서 발견한 상태 6건 누락·로컬 크기 타입 별칭 검출 공백을 수정했고, 22카나리아·실제 Note 허용행 삭제 red/동일 바이트 복원 green·전체 gate646파일/9869테스트·typecheck·build·미러 exit0을 통과했다. 태스크 경계 명시는 `90cc5218`이며, T7은 이 커밋을 기준으로 시작한다.

- **T7 상태 통합 완료 `17ad3852`.** Badge 모양 이름과 의미 상태를 분리하고 Logs·표면 결과·PanelRow·Note·직접 상태 배지5곳을 같은 상태 정본으로 이관했다. Logs의 회색 성공·Failed 낱말과 기존 CSS·슬롯을 보존했다. 기존 API 기대값4건과 독립 리뷰의 Note 조건식 스캐너 공백을 수정했으며, 최종 gate646파일/9951테스트·격리 PostgreSQL31파일/520테스트·typecheck·build·미러 exit0 및 독립 리뷰0건을 확인했다. 실제 브라우저·AT 검증은 R2에 남아 있다.

- **T8 hue 개명 완료 `486a9e97`.** 색상 결정 잎과 실제 소비자·메일 상수의 이름만 바꾸고 팔레트·해시·CSS·hex를 보존했다. 독립 리뷰에서 Unicode 회귀 테스트를 보강해 실제 UTF16 mutation 실패를 확인했으며, 최종 gate647파일/9965테스트·격리 PostgreSQL31파일/520테스트·build·미러 exit0 및 미해결 지적0건을 확인했다. ARCHITECTURE와 push 문서의 잎 경로도 갱신했다.

- **T9 크기 API 통합 완료 `447c34da`.** Button 아이콘·스피너, Alert, SkeletonLine과 실제 소비자를 새 이름으로 이관했다. 기존 14/16px 스피너·24/28/32/36px 아이콘 버튼·SkeletonLine70호출의 치수를 보존했고, 담당 허용행15개를 해소했다. 독립 리뷰의 옛 API 검출 카나리아를 보강한 뒤 최종 gate647파일/9991테스트·typecheck·build·미러 exit0 및 미해결 지적0건을 확인했다.

- **T10 폭 API 통합 완료 `92fdd6a6`.** Input·SelectTrigger·SearchInput의 실제 폭·단위·반응형 래퍼와 기존 ref/disabled/asChild/IME 계약을 보존하고 담당 허용행37개를 해소했다. 테스트 우선 red 이후 관련464테스트·6검출분기 mutation을 확인했으며, 최종 gate648파일/10038테스트·build·미러 exit0와 독립 리뷰0건을 통과했다. 실제 브라우저 반응형 배치 검증은 R2에 남아 있다.

- **T11A 진행 상태 API 통합 완료 `009da5f4`.** Modal busy와 세 Button 소비자의 중복 분기를 정리하고 인증 진입점 세 곳의 여섯 provider 아이콘을 단일 로딩 glyph로 보존했다. 관련261테스트·실제 provider 표식 제거6실패/복원·검출분기 mutation을 확인했으며 전체 gate649파일/10053테스트·build·미러 exit0와 독립 리뷰0건을 통과했다. T11B–E와 실제 브라우저 검증은 남아 있다.

- **T11B 슬롯 API 통합 완료 `8aad2cc0`.** Dialog·Modal·Panel·Entity·Segment와 실제 소비자를 이관하고 담당 허용행7개를 해소했다. 관련180테스트·소비자404테스트와 검출분기/실제 래퍼·잠금 변이를 검증했으며 전체 gate649파일/10097테스트·build·미러 exit0 및 독립 리뷰0건을 확인했다. 기존 DOM 순서·조건부 래퍼·CSS·포커스·이벤트를 보존했다.

- **T11C 접근성 API 통합 완료 `e03e692e`.** RowCardList·SegmentedControl의 표준 ARIA 이름과 FormGroup8곳의 실제 Input/SelectTrigger 설명 연결을 통일하고 담당 허용행3개를 해소했다. 관련178·소비자220테스트와 ID 처리/검출분기 변이를 검증했다. 첫 게이트의 Members 옛 prop 기대값2건을 같은 제목 연결 계약으로 이관한 뒤 최종 gate650파일/10107테스트·build·미러 exit0와 독립 리뷰0건을 통과했다.

- **T11D className API 통합 완료 `0f5eb846`.** Modal·Radio의 실제 루트 className과 ImageTile fallback 슬롯을 실제 소비자까지 이관하고 담당 허용행3개를 해소했다. 관련119·소비자358테스트와5변이를 검증했고, Radix Slot 사용처는 실제 장식 DOM fixture로 포커스 게이트에 등록했다. 공유 이미지 훅·Avatar와 기존 크기·투명 배경·키보드/ref 계약을 보존했으며 최종 gate651파일/10121테스트·build·미러 exit0 및 독립 리뷰0건을 확인했다.

- **T11E 완료 `4b430b96`.** BannerLine 기존 tone을 data-tone으로 노출하고 T7–T11 담당 허용행을 모두 해소했다(후속10행 유지). 관련124테스트·검출분기/표식 제거 변이를 확인했으며 전체 gate651파일/10126테스트·build·미러 exit0와 독립 리뷰0건을 통과했다.
- **R2 실행 기록.** `042d9c8b`에서 Projects/Home/Translations/Sources/Logs/Members/Settings/MCP/Account 및 모달·온보딩1–3을1280/1440/1890으로 관측했다. 51장 시각 검사·문서 폭/모달 경계에서 회귀 없음. 검색 빈 상태와 주요 모달 Tab/Escape/트리거 복귀를 확인했다. 로그인 세션으로 랜딩/signin은 Projects로 이동하며 Safari/AT·쓰기 busy·온보딩4·TreeOverlay는 미검증이다. 온보딩 닫기 후 BODY 포커스는 P2가 기존 route-close 정책과 일치함을 확인했다. 근거 `.scratch/component-unify-r2-qa.md`. 단위② 최종 게이트·push 진행 중.

## 단위 ① 토큰 · 정리 — 값 변화 0

- **T1** 철자 접기(design §6.1 — 모든 알파 선·링과 고정4px 제외). 먼저 **동치 테스트**(design §5.3 — `tailwindcss` `compile`로 옛·새 철자 쌍의 CSS 변수 해석 뒤 선언 동일; 색 반올림·px/rem 가정 금지)를 쓰고, 그다음 접는다.
  - `visual-system.test.ts`에 "같은 값 두 철자 0"(짝 없는 `/5`·`/6` 허용) + 카나리아.
  - 뒤집는 테스트: `mcp-connected-apps.test.tsx` · `projects-screen.test.ts` · `projects-cards.test.tsx` · `privacy-doc.test.tsx` · `b5-layout-wrap.test.tsx` · `visual-system.test.ts`.
  검증 [자동]: 동치 테스트 green(검증된 쌍 전부) · 비동치 예외의 반증 테스트 · 예외 밖 옛 철자 0 스캔 · `pnpm gate` green.
- **T2** 토큰 신설(design §6.2 확정 목록). 순서: `@theme`에 토큰 → 소비자 교체 → 죽은 클래스 스캔(POSTMORTEM 2026-09-23). DESIGN §2 토큰 표·§6.2 등재·`REGISTERED`·§6.3 링크 색·§6.8 무채 계단을 **같은 커밋**에서 고친다.
  검증 [자동]: 확정 토큰 값의 raw 사용 0(`lib`·`messages` 포함, 접두 `border-t-`·`placeholder-`·`caret-`·`accent-`) · `@theme`에 없는 클래스 0 · 동치 테스트에 토큰 쌍 추가 green.
- **T3** 소비자 0 삭제(C4) · 이메일 hex 대조.
  - 지운다: `Breadcrumb` · `SegmentedLinks` · `Avatar shape="square"` · `@theme` 색 7개와 `:root` 짝(`globals-css.test.ts` 양방향 등록).
  - hex 대조(design §5.3 — hsl→hex, `#262626` 예외 목록, `TONE_HEX` 포함, `message.test.ts` 옆).
  - 뒤집는 테스트: `focus-ring.test.ts`(`SegmentedLinks` 렌더 · `toHaveLength(3)`).
  - ⚠️ `lib/__tests__/`·`lib/invitation-email/`을 건드려 `pnpm gate`가 postgres 스위트를 붙인다(`scripts/gate-plan.ts:27`).
  검증 [자동]: 주석·테스트 제외 생산 AST에서 정확한 Breadcrumb/SegmentedLinks binding·Avatar shape 소비자 0(SEO의 BreadcrumbList는 별개) · `globals-css.test.ts` 남은 토큰마다 소비자 ≥1 · hex 대조 green.
- **T4** 문서 교정 중 값과 무관한 것(design §6.4 DESIGN 체크리스트·줄 교정, `globals.css` 주석 `#e2e8f0` 세 줄·"66곳").
  검증 [수동]: design §6.4의 DESIGN·`globals.css` 항목을 한 줄씩 코드와 대조해 전부 ✓.
  `[commit]` T1·T2·T3·T4 각각 — `refactor(tokens): …` / `docs(DESIGN): …`
- **단위 ① 끝**: [수동] 1280 전후 스크린샷(화면 목록 앞 여섯, 기준 SHA = T0 커밋) 동일 → `/push`.

## 단위 ② API 이름 — 값 변화 0, §3 축마다 커밋

- **T5** 특성 테스트(design §5.4) — Select · Input · Textarea · Radio · ListItemButton · BannerLine · EmptyRowCard · EmptyState · Badge variant 전수 · Button(size·variant·busy/loading·스피너 14/16px)의 **현재** 동작을 고정.
  같은 기본 md·danger·busy의 `archive-card.tsx:112`(override 14px)와 `member-list.tsx:379`(기본 16px)를 짝으로 고정하고, loading 형도 포함한다. T9에서 호출 API만 바꾸고 이 치수 기대값은 유지한다.
  검증 [자동]: 새 테스트 green · 각 파일에 뮤테이션 1회(프리미티브 클래스 한 곳을 바꾸면 red) 기록.
  `[commit] test(ui): pin current primitive contracts before the rename`
- **T6** `api-contract.test.ts`(design §5.2) — 규칙 = §3 행, 허용 목록 = 지금 위반 × 해소 태스크. green으로 시작.
  검증 [자동]: 허용 목록 항목 수 = design §3 "지금 어긋난 곳" 항목 수 · 허용 목록에서 한 줄 지우면 red(카나리아).
  `[commit] test(ui): primitive naming contract with an allowlist of current violations`
- **T7** 상태 색(S6) — `EventResult`·surface status → `StateKey` 순수 함수(테스트 먼저) · ResultBadge 매핑 삭제 → `StatusBadge`(SourceStatus의 배치/시각 래퍼는 유지) · PanelRow `statusTone` · Badge 상태 이름 → design §3의 모양/색 프리셋 이름. Logs 내부 Note의 `neutral`은 같은 형의 `muted`로 바꾼다. 실상태 Badge 5호출(MCP `Expired` 2 · Logs `Archived` 1 · Sources `Waiting to apply`/`Removed from repository` 2)도 StatusBadge로 옮긴다. 개수·역할·로케일·Base/You/Most keys는 모양 축이며, 국기·sr 문구를 결합한 orphaned LocaleBadge는 기존 계약을 유지한다.
  뒤집는 테스트: `status-badge.test.tsx` · `a11y-reasons.test.tsx` · `logs-screen.test.ts` · `screens.test.ts` · canon `StateVariant` 타입 대조 테스트.
  검증 [자동]: 변환 함수 단위 테스트(키 전수) · 매핑 사본 0 스캔 · `client-graph.test.ts` 갱신 green · 허용 목록 상태 색 행 0.
- **T8** hue 개명(Y7) — `lib/tone.ts` → `lib/hue.ts`, `toneFill` → `hueFill`, `canon.ts` 주석.
  뒤집는 테스트: `project-row.test.tsx` · `project-thumbnail.test.tsx` · `client-graph.test.ts`(`CLIENT_LIB_FILES`).
  검증 [자동]: `rg -n "toneFill|toneOf|lib/tone" app components lib` 0 · `pnpm typecheck`.
- **T9** 크기 — Button `size="icon-xs|sm|md|lg"`(24·28·32·36) + **`spinnerSize="sm|md"`(14/16px, 기본 `md`=16px)** · Alert의 기존 `size="default|compact"`를 `md|sm` 이름으로만 정리 · SkeletonLine `text=` → `size`.
  `spinnerSize`는 Button `size`와 독립이다. 현재 14px override만 `sm`으로 옮기고 기본 16px은 유지한다. 조상 selector(`panelClassName`·div·fieldset)가 덮던 자식 Button도 빠짐없이 이관하며, 실수요 래퍼 FileInput·ReconnectButton에만 전달 prop을 연다.
  뒤집는 테스트: `sync-button` · `count-badge.test.tsx` · `account-card.test.tsx` · T5의 스피너 짝 계약.
  검증 [자동]: `[&_.animate-spin]:size-` 0 · 아이콘 버튼 손 크기(`size-6|size-7|size-8|size-9` + Button) 0 스캔 · 특성 테스트(T5)의 호출부만 새 API로 전환해 14/16px 기대값 불변 · spinnerSize 생략=16px · loading/busy 두 경로 검증.
- **T10** 폭 — 입력류 `width` prop(design §3 값 목록).
  뒤집는 테스트: `search-input.test.tsx` · `projects-screen.test.ts` · `entry-points.test.ts` · `translations-screen.test.ts`.
  검증 [자동]: Input·SelectTrigger·SearchInput 호출부 `className`의 `w-`·`max-w-`·`min-w-` 0 스캔.
- **T11** 진행 · 슬롯 · a11y 철자 · className 이름 · rest props(실수요 자리) · `data-tone`(tone 가진 프리미티브).
  뒤집는 테스트: `onboarding-modal.test.tsx`(`nextPending`·`headerAction`·`footer`) · `members-screen.test.ts` · `focus-ring.test.ts` 해당 행.
  검증 [자동]: T7–T11 소유 허용 목록 행 0 · `pnpm typecheck`. `Modal.headerAction`은 명시된 삭제 태스크 T14까지 남긴다. `RowCardList.labelledBy`는 T11에서 `aria-labelledby`로 바꾸고, T12의 컴포넌트 교체와 구분한다. 전체 허용 목록 0(spec 완료 조건 4)은 design §5.2대로 단위 ③ 종료 때 확인한다.
  T11은 진행(A) → 슬롯(B) → native aria·FormGroup(C) → className(D) → data-tone(E) 다섯 축으로 나누며, 각 축마다 독립 리뷰·전체 gate·커밋을 둔다. T10 뒤 허용행28개 중 T11 소유18개를 해소하면 T14 1·T15 2·T16 1·T19a 6의 **10개**가 남는다. Modal Next의 기존 native disabled/loading, 실제 provider glyph 교체, 설명 id 병합과 이미지 폴백의 투명 배경 계약을 보존한다.
  `[commit]` T7–T11 각각 — `refactor(ui): …`
- **단위 ② 끝**: `/runtime-test`(화면 목록 전수 — 이름만 바뀌었으므로 기능 회귀 확인) → `/push`.

## 단위 ③ 통합 · 신설 — 이관 같은 커밋, 값 변화는 design §6.3 표만

각 태스크 검증 공통 [자동]: 프리미티브 렌더 테스트 + `hand-copies.test.ts` 자기 행(사본 0 · 하한 · 양성 카나리아 · 뮤테이션) + 허용 목록 자기 행 0.
각 태스크 공통 [수동]: design §6.3의 자기 행을 화면 목록에서 확인 — **표에 없는 변화 0**. 기준 SHA = 단위 ② 마지막 커밋.

- **T12** Card(C1) — 머리 슬롯 합집합(+`badge`) · `CardRows`/`CardList`. 소비자는 **export별로 센다**(design §4 Card 행).
  임시 인계: 새 Card/행 컨테이너는 `components/ui/card.tsx`로 옮기고 **EmptyRowCard는 `components/ui/row-card.tsx`에서 계속 export**한다. 빈형 소비자8호출/7파일은 기존 import를 유지하며 혼합 import만 분리한다. BannerLine도 남으므로 row-card 파일 전체 삭제 금지. T12 handoff에 이 경로·소비자 목록·빈형 선 보정 상태를 적어 T13에 넘긴다.
  뒤집는 테스트: `card-head.test.ts` · `visual-system.test.ts` · `members-screen.test.ts` · `panel-card` · `card-lines` · `projects-cards` · `mcp-connected-apps` · `members-cards:360-387` · `member-row:142` · `mcp-token:148,419`.
  검증 [자동]: 주석·테스트 제외 production AST에서 정확한 `PanelCard`·`RowCard`·`PanelRows`·`RowCardList`·`RowCardItem` export/import binding·JSX 사용 0(별칭 추적); PanelRow·PanelFacts·BannerLine·EmptyRowCard는 이 제거 목록에서 제외 · notice 있음/없음 두 상태 × `connected-apps-card` · `token-card` · `member-list` · `pending-invitations` 선 개수 단언. [수동] 카드 전수(Card 소비자 + 손 머리 현재 스캔 목록) 머리 선 1개.
- **T13** EmptyState `placement`(+`EmptyRowCard` 흡수) · NoMatch.
  T12가 남긴 `components/ui/row-card.tsx`의 EmptyRowCard와 소비자8호출/7파일을 이관한 뒤 **이 태스크에서만 EmptyRowCard export를 제거**한다. BannerLine의 경로는 유지한다. 임시 빈형 선 보정은 새 Card/EmptyState 조합에서 선1개를 확인한 뒤 제거한다.
  뒤집는 테스트: `empty-state` · `screens.test.ts`.
  검증 [자동]: production AST의 정확한 EmptyRowCard export/import binding·JSX 사용 0(별칭 추적, 주석·테스트 제외) · placement 형마다 렌더 테스트(실소비자 있는 형만) · 서버 소비자 파일에 `"use client"` 0 유지 · `pnpm build`(RSC 직렬화 — gate 안).
- **T14** LargeModal(C2) — 개명 · `WizardFooter`(showBack·onBack·next*) · `headerAction` 삭제 · `event-dialog` 치수 상수 공유(`100svh`는 이미 완료).
  뒤집는 테스트: `components/onboarding/modal.tsx:2`(재수출) · `onboarding-modal.test.tsx` · `modal-initial-focus.test.tsx` · `focus-ring.test.ts` · `visual-system.test.ts`.
  검증 [자동]: `step` 전환 → 본문 포커스·낭독 단언 유지 · 바닥 `busy` 전환 포커스 fixup(POSTMORTEM 2026-09-20·09-24). [수동] 포커스 복귀 — LargeModal 소비자 7곳 + `event-dialog`, 열고 닫은 뒤 트리거로 복귀.
- **T15** ButtonLink `external`·`newTab` · Link(인라인). NewProjectButton·NewProjectIcon의 진행 삼항도 ButtonLink 이관에 포함하고 서버 부모·`useLinkStatus` 자손 경계를 보존한다.
  검증 [자동]: `<a className={buttonClass…}>`·상수 우회(`FOOTER_LINK`) 0(여러 줄 JSX 포함) · 인라인 파랑 링크가 전부 `Link` · 포커스 링 스캔(`focus-ring.test.ts`) 확장.
- **T16** ListRow(C6) — 누르는 행 5 · 정적 2 · 두 줄 본문 · Button 행 2 · `ListItemButton`. RowChevron의 진행 삼항은 이 행 이관에서 처리하며 서버 부모와 `useLinkStatus` 잎 경계를 보존한다. DropdownMenuItem인 SignOutItem의 진행 표시는 이 규약의 대상이 아니다(파일 전체 면제는 금지).
  뒤집는 테스트: `focus-ring.test.ts` · `translation-workspace-render.test.tsx`(`@/components/ui/list-item` mock · memo 렌더 수) · `project-row.test.tsx` · `sources-screen` · `logs-screen.test.ts`.
  검증 [자동]: 두 줄 본문 1·2번째 노드 단언(POSTMORTEM 2026-09-16) · 행 래퍼 id 포커스 복귀(`logs/page.tsx` event-row 래퍼 · `logs-card.tsx:47`) 유지 · `attention-card.tsx` :first-child>a 선택자 유지.
  [수동] `key-list` 전후 렌더 측정(5,000키 픽스처, React Profiler 커밋 시간 — 기준 대비 악화 시 멈춤) · 번역 화면 행 높이.
- **T17** SelectRow(radio|checkbox · `expand` · `aside`). 검증 [자동]: 네 소비자 렌더 · radio 화살표 이동 · repo 목록 화살표 훑기에서 브랜치 로드 호출 수(선택 확정 때만) · `token-grant-fields` 역할 트리.
- **T18** Popover(Radix, Y4) — CLAUDE.md 수정은 T21 지휘자에게 인계, "Radix 여섯" · `focus-ring.test.ts RADIX_FIXTURES` 갱신.
  검증 [자동]: 열린 채 토글 누름 → 닫힘 유지(재열림 0) · 바깥 클릭 시 트리거로 포커스 미복귀 · Esc 시 복귀. [수동] 번역 화면에서 열고 닫기.
- **T19** ProjectThumbnail · SearchInput(공통 정의 이동, ProjectSearch 래퍼 유지) · CopyButton 이동 · Skeleton(`SkeletonLine` 흡수, 기본 radius4px와 명시 radius 보존).
  검증 [자동]: 각 행 사본 0 · `components/onboarding/copy-button` 경로 import 0.
- **T19a** 필드 셋(design §4.1, S12) — FieldTrigger(`SelectTrigger` + 필터 트리거 둘) · `Input` `size`(md36/sm32/xs28)·`variant="bare"`·`icon`·`clearable` · 읽기 전용 형 · `globals.css` 기본 지우기 끔 · SearchInput 지우기 = `onSearch("")`(Escape는 S15 확정 동작) · 지우기 이름 사전 키(`messages/en.tsx`).
  테스트 먼저: SearchInput 지우기 → `onSearch("")` 1회 · 조합 중 아님 · 즉시 필터형은 `onChange("")` · 지우기 버튼은 값이 빌 때 사라진다 · FieldTrigger `active`·`size`·`asChild` 자식 하나(Slot).
  뒤집는 테스트: `search-input.test.tsx` · `project-switcher.test.tsx` · `disabled-pairing.test.ts`(SelectTrigger `aria-disabled` 짝) · FilterMenu·log-filters를 렌더하는 `translations-screen.test.ts`·`logs-*` · `focus-ring.test.ts`(project-switcher의 `ring-0` 면제가 `bare`로 옮겨 간다).
  검증 [자동]: `hand-copies.test.ts`에 필터 트리거 손 클래스(`inline-flex h-9 … rounded-md border`) · 검색 글리프 절대 배치(`absolute top-* left-*` + `Search`) · 호출부 `Input`의 `h-*`·`text-xs`·`border-0` 0 · `rg -n "search-cancel-button" app/globals.css` 1.
  [수동] 번역 화면·/projects·온보딩 repo·트리 필터에서 값 입력 → 지우기 모양·위치가 같고 크롬·사파리에 브라우저 x가 없다 · 필터 트리거와 Select의 형 비교(Sources 추가 모달 · Logs md · 번역 목록/언어 패널 sm)에서 높이·테두리·글리프 일치.
- **T19b** 포커스 링 테두리형(design §4.2, S13) — 대상 일곱(Input · Textarea · SelectTrigger/FieldTrigger · Button `default` · ButtonLink `default` · Checkbox · Radio). DESIGN §7 링 셋 문장을 같은 커밋에서 고친다.
  테스트 먼저: `focus-ring.test.ts` `RING` 둘(테두리형 넷 / 무테형 셋) — 렌더 클래스에 `border` 유틸이 있으면 테두리형을 요구 · 카나리아(테두리형에 `ring-2`만 남기면 red) · invalid Input 포커스 클래스에 `border-destructive`·`ring-destructive`.
  검증 [자동]: 위 테스트 green · 동치 테스트(design §5.3)로 `border-ring` = `--ring` 값 확인. [수동] Tab으로 화면 목록의 필드·default 버튼·체크박스·라디오를 훑어 회색 테두리가 파랑 띠 안에 끼지 않는다 · 오류 필드 포커스가 빨강 한 띠.
  `[commit]` T12–T19b 프리미티브마다 하나 — `feat(ui): …` / `refactor(ui): …` / `fix(ui): focus ring takes over the border on bordered controls`
- **T19c** Meter(S14) — `MeterBar`를 ui/meter로 이동, LocaleMeter·source-detail-modal을 같은 커밋에서 이관. 검증 [자동]: done/review/dimmed 렌더 및 접근성 장식 계약 보존.
- **T19d** SecretField(S14) — TokenField·MCP 값칸과 복사 버튼 형 통합, 기존 소비자3 이관(push text-xs·MCP text-sm/select-all 보존). 검증 [자동]: 복사 성공/실패·fallback 선택·읽기 전용·접근 이름. 실제 토큰을 열거나 저장하지 않고 테스트 fixture만 사용.
- **T19e** Facts(S14) — Home·MCP·Logs·Sources의 실사본 통합. label neutral-400(Y5), 현재96/120/104폭·stacked형·dl/th 의미론 보존. 검증 [자동]: 접근 역할과 슬롯 노드; [수동]: 긴 값·좁은 컨테이너.
- **T19f** ErrorState/404(S14) — edit·logs 오류와 셸404, 루트 RootFallback 경계·h1/24, 셸 p/18 보존; 404에는 alert를 붙이지 않는다. `retry` 계약 유지, `role=alert`는 Y-a 승인에 따라 추가. 검증 [자동]: 오류/빈상태 구별·재시도 콜백·RSC.
  `[commit]` T19c–f 각각 — 신설과 소비자 이관·사본 카나리아를 같은 커밋에.
- **T20** design §6.3 남은 행(통합에 딸리지 않은 것 — token-grant-fields 역할 · 링 없는 링크 · BannerLine 선 등 — Facts는 T19e가 전담).
  검증 [수동]: 화면 목록 × 3 뷰포트 — 바뀐 자리가 §6.3 행과 1:1.
  `[commit] fix(ui): …`
- [x] **T20a — Geist 우선 폰트** (2026-10-02 사용자 추가): sans 폰트 스택을 **Geist → Pretendard Variable → 기존 시스템 폴백** 순서로 바꾼다. Geist가 지원하지 않는 글리프는 Pretendard Variable로 폴백한다. Pretendard Variable의 기존 자사 호스트 동적 서브셋과 생성/로딩 경로는 유지한다. monospace 스택은 대상이 아니다.
  범위: `app/globals.css`의 `--font-sans`, `app/layout.tsx`의 실제 폰트 로딩 및 필요한 최소 폰트 자산/설정. 구현 후보는 `next/font/local`의 루트 `--font-geist` 변수 → Pretendard Variable → 기존 시스템 폴백이다. 공식 v1.7.2 WOFF2를 고정하고 swap/preload 및 `adjustFontFallback: false`로 실제 로드하며 자동 Arial이 Pretendard 앞에 끼지 않게 한다. 기존 의존성 버전을 임의로 올리지 않는다.
  순서/소유권: **P3의 globals.css 변경을 통합한 뒤 별도 작은 커밋**으로 수행한다. T21의 DESIGN/CLAUDE/DIRECTORY 폰트 설명과 R3는 이 최종 폰트 구성을 기준으로 한다. 기존 시각 보존 범위에 대한 사용자 승인 추가이며, 글자 폭 차이를 이유로 무관한 컴포넌트 치수를 임의로 바꾸지 않는다.
  검증 [자동]: 폰트 스택 순서·실제 로딩 연결·Pretendard 폴백 유지 계약을 먼저 테스트하고 관련 검사/typecheck 및 최종 누적 gate를 통과한다. [브라우저]: 폰트 로드 완료 후 영문/숫자의 Geist 사용과 한글의 Pretendard Variable 폴백을 확인하고, 1280/1440/1890에서 버튼·표·모달·긴 문장의 줄바꿈/넘침을 검사한다. 폰트 미로드 상태를 완료 스크린샷으로 쓰지 않는다.
  `[commit] feat(ui): prefer Geist with Pretendard Variable fallback` — 이 tasks.md의 범위·검증·남은 작업 갱신을 함께 포함한다. **구현·관련 자동 검사·독립 소스 리뷰 완료 및 작은 소스 체크포인트 COMMIT 승인; 지휘자 실제 브라우저/최종 게이트 검증은 대기 중이다.**
- **단위 ③ 끝**: `/runtime-test` — 픽스처 보관 프로젝트 · 오류 경계(`error.tsx` 유도) · 검색 0건(Logs·/projects·온보딩 repo·번역) · 포털은 트리거를 눌러 연다(Popover · LargeModal · event-dialog) · 키보드 Tab으로 필드·트리거 포커스 링(S13) → `/push`.

## F. 문서 · 종료

- **T21** 문서(design §6.4 나머지) — DESIGN §2.1·§6.625·§8(API 규약 표) · CLAUDE.md 변경안(UI 행 개수 · Radix 목록 · 작업 원칙 예외 한 줄 — 원본 편집은 지휘자 창구) · DIRECTORY · global-search 문서 대조(design §6.4 — 산출물 이름) · sr 상태 줄 glob 테스트.
  검증 [수동]: design §6.4 목록 전부 ✓ · [자동] sr 상태 줄 테스트 green(`loading.tsx` 8/8).
  `[commit]` 문서별 — `docs(DESIGN): …` · `docs(CLAUDE): …` · `docs(DIRECTORY): …` · `docs(feature): global-search matches component-unify names`
- **T22** 기능 종료 — 결론을 정본으로 올렸는지 확인하고 디렉터리 삭제.
  검증 [자동]: `pnpm gate` green · `test ! -d docs/features/component-unify`.
  `[commit] docs: close component-unify`

## 후속

- `/guide-shots`(모양이 바뀐 컷 — `pnpm guide:check` 출력 기준).
- 보관 표시 모양(C3) — 제품 판정 후 별도 기능.

## T0 재확인한 테스트 앵커

숫자만 옮긴 과거 참조는 제거했다. 아래는 현재 `rg -n 'it\(|describe\(' components/__tests__/…`로 확인한 계약 시작점이며 구현자는 그 파일 전체를 읽는다.

| 경계 | 현재 앵커 | 확인 계약 |
|---|---|---|
| SearchInput | `components/__tests__/search-input.test.tsx:15,26,34` | 제출 후 추가 입력·응답·바깥 URL 동기화 |
| 번역 검색 | `components/__tests__/translations-screen.test.ts:272` | 공통 SearchInput·IME |
| 포커스/SegmentedLinks | `components/__tests__/focus-ring.test.ts:232,243` | 네 태그 렌더 링·세그먼트/내비 링크 |
| Logs 껍데기·Facts·링크 | `components/__tests__/logs-screen.test.ts:179,208,232` | 1024·라벨색·푸터 buttonClass |
| 멤버 제목 | `components/__tests__/members-screen.test.ts:69` | id+포커스 착지 |

그 밖 T1–T21에 열거한 테스트 파일은 존재를 재확인하고 파일 단위로 유지했다. 옛 행 번호를 새 테스트 위치로 가장하지 않는다. 신규 SearchInput X/Escape·FieldTrigger·S14 계약은 아직 없으며 해당 태스크가 먼저 작성한다.

## P3 작은 체크포인트 — 2026-10-02

- Thumbnail 후보: ui ProjectThumbnail과 실제 소비자7곳(목록/Home/스위처/사이드바/랜딩/초대/설정), xs/sm/md/lg geometry·투명 이미지·폴백·URL 재시도, 이전 모듈 제거 및 실제 base150 사본 카나리아를 같은 작은 커밋에 묶는다.
- 독립 리뷰: Thumbnail 및 Skeleton/loading 각각 0 findings 승인. 이 항목은 Thumbnail만 포함한다.
- 검증: Thumbnail 단독 트리 관련11파일 실행은 290 passed / 구경로1 failed, 경로 이관 뒤 projects-screen 단독69/69 passed로 수정 확인(한 번의291 all-green 실행이 아님), typecheck exit0 · diff check exit0. 전체 P3 첫 gate는 테스트6실패(exit1); 빌드/미러 미실행이며 최종 누적 gate·잔여6체크포인트·R3·T20a/T21/T22는 미완이다.

- Skeleton/loading 후보: Thumbnail 체크포인트 `9a5b4625821277c176c7d79ab0a9a5418da9dac5` 뒤에 size 줄 모드와 실제 8개 loading·locale skeleton·설정 카드를 이관하고 SkeletonLine export를 제거한다. 기본 radius4 및 명시 radius·U+200B/0.8em·숨지 않은 sr-only 상태 줄1개를 유지한다.
- Skeleton 단독 RED: 새 블록/줄 렌더 검사가 이전 구현에서 실패했다. 해당 작은 트리 관련12파일/303테스트와 typecheck exit0. 실제 퇴역 Skeleton 소스·loading status 삭제·검사기 제거는 각각 RED, 소스 복원 후 검사기/loading 계약 GREEN.
- 남은 리뷰: 선택되지 않은 MCP Scope에서 root+label 3% hover가 겹치고 선택된 All 배경 소유자도 달라진다는 추가 발견은 뒤의 SelectRow 체크포인트에서 고친다. 전체 P3 gate·R3/T20a/T21/T22는 계속 미완이다.

- SelectRow 후보: Skeleton 체크포인트 `b8e7ce3d0dbd06535f1e28f19a93770e1c09d47c` 뒤에 네 실제 소비자, radio/checkbox·expand·aside·native ul/li/group, unavailable scope Tab 사유·동작 차단, repo 화살표 훑기/Space/Enter/detail0 확정 및 미확정 Next 차단을 묶는다. 아직 커밋/독립 최종 승인은 미완이다.
- 실제 Scope hover 추가 회귀는 RED 뒤 단일 라벨 alpha와 All 라벨/Chosen 확장 부모 배경 소유자를 복원한다. Input 슬롯·Copy/Secret·FieldTrigger·테두리 링은 뒤 체크포인트에 남긴다.

- SelectRow 검증: Scope 중첩 hover/All 배경 소유자 RED 후 수정, 실제 DOM 및 컴파일 CSS로 라벨 한 겹3%/All 라벨 muted/Chosen 확장 부모 muted를 확인했다. 관련11파일 실행은317 passed / 신규 Slot 픽스처 누락1 failed; SelectRow의 위임된 Checkbox+aside Button 렌더 픽스처를 추가한 후 focus-ring·Scope CSS22/22 passed. 최종 typecheck exit0.
- 실제 퇴역 SelectRow source·중첩 hover 재주입·All 부모 배경 회귀·검사기 제거가 각각 RED, 복원 후 hand-copy/Scope 계약 GREEN. 이19경로 작은 후보의 독립 리뷰0 findings와 명시적 COMMIT 승인을 받았으며 전체 누적 gate·나머지5체크포인트는 미완이다.

- Input/Search 후보: 앞 체크포인트의 네 SelectRow 소비자/Scope 단일 hover는 보존한다. Input md36/sm32/xs28·bare·icon·clearable·readOnly, SearchInput ui 이동 및 실제 URL/제출/즉시검색 소비자, 이름 있는 X·native clear 제거와 API 부채6→0을 같은 작은 후보로 묶는다. 테두리 링 전환은 아직 기존ring2이며 마지막 체크포인트에서 수행한다.
- 검증/독립 리뷰/COMMIT 대기; FieldTrigger·Copy·Secret·테두리 링과 누적 gate/R3/T20a/T21/T22는 미완이다.

- Input/Search 검증: 이전 트리 dedicated fields6 failed/1 passed, 실제 ProjectSearch 지우기/Escape2 failed/1 passed로 RED. 구현 후 관련16파일473테스트·typecheck exit0. 테두리 링은 기존ring2를 유지했다.
- 실제 base150 Input/Search 소스를 현재 경로에 넣어 parse0/RED, 추가 unrelated Input X·Escape 삭제·native clear 재노출·hand/API 검사기 제거 각각 RED; 복원 후 관련 검사 GREEN. 구 SearchInput 모듈 제거와 API 부채0, 닫기 X 예외는 정확한 Input clear 분기/이름/크기/한 자식만 허용한다. Input/Search25경로 독립 리뷰0 findings 및 명시적 COMMIT 승인을 받았다. 전체 gate는 미완이다.

- FieldTrigger 후보: Input/Search 체크포인트 `7d1f85d352edca82098d35cc648d40cb74a17313` 뒤에 Select 및 Logs/번역 필터 형을 공유한다. md36/sm28·asChild 자식1·native/ref·진행 중 pointer/click/keyboard 차단·기존 end/collision8 및 열림 글리프를 보존한다. 기존ring2이며 invalid/checked 우선순위와 border-ring/ring1은 마지막 체크포인트에 남긴다.
- 실제 작은 FilterMenu의 열림 글리프 계약을 이전 트리에서 RED로 확인했다. 관련 검사/typecheck·사본/검사기 무력화 mutation·독립 리뷰 및 명시적 COMMIT은 현재 후보에서 이어서 확인한다. Copy/Secret 및 최종 gate/R3/T20a/T21/T22는 미완이다.

- FieldTrigger 검증: 실제 FilterMenu 열림 글리프 RED 후 관련14파일466테스트 및 typecheck exit0. 실제 base150 FieldTrigger 사본·native/ref/guard 전달 제거·열림 글리프 제거·검사기 무력화가 각각 RED, 소스 복원 후 관련 검사 GREEN.
- 새로운 FieldTrigger와 위임 Select/SelectRow도 실제 포커스 컨트롤 픽스처로 검사한다. 정상/오류 포커스의 기존ring2는 이번 작은 후보에서 그대로이며 최종 R1 invalid 우선순위 및 ring1 전환은 마지막 링 후보에서 적용한다. FieldTrigger13경로 독립 리뷰0 findings 및 명시적 COMMIT 승인을 받았다.

- Copy 후보: UI CopyButton과 Source/Events/Connected apps/MCP 복사 import, CodeBlock code형 및 LocalePanel CopyLink link형을 같은 작은 후보에 이관한다. code는 text-only/상시 live/반복2초 reset, link는 기존 접근 이름/선택된 읽기전용 fallback을 유지한다.
- 기존 TokenField export만 onboarding/copy-button.tsx에 임시 유지하고 새 UI CopyButton을 사용한다(새 임시 API 없음). 그 파일의 TokenField-only import2곳과 제거는 바로 다음 Secret 후보 소유다. 따라서 전체 구모듈 import0 판정만 다음 후보까지 보류하며 Copy 손사본/실소비자 하한/actual 카나리아는 지금 검사한다. 기존ring2 유지, 실제 fixture 값만 사용한다.
- 독립 리뷰/COMMIT과 최종 gate는 미완이다.

- Copy 검증: 이전 CopyButton에서 새 variant/오류 계약4 failed 및 missing clipboard uncaught1error로 RED. 구현 후 관련14파일479테스트/typecheck exit0. 이후 fresh rejection/sync-throw 테스트2개를 더해 오류 fallback 콜백도 정확히1회 확인했다. 첫 추가 테스트는 userEvent의 clipboard 모의 덮기를 잡아 순서를 바로잡았고 초기 로그를 별도 보존했다.
- 실제 base150 CopyLink 소스·반복 live 비우기 삭제·링크 fallback 선택 삭제·검사기 제거 각각 RED. 올바른 clipboard 설정 뒤 catch 삭제도 실제 RED, 복원 후 hand-copy/Copy/CodeBlock3파일117테스트 GREEN 및 복원된 최종 typecheck exit0. 전체 P3 gate는 아직 미완이며 Copy14경로 독립 리뷰0 findings 및 명시적 COMMIT 승인을 받았다.

- Secret 후보: 기존 TokenField와 MCP code칸을 실제 소비자3곳에서 읽기전용 Input+CopyButton으로 이관한다. push36/text-xs와 MCP36/text-sm/select-all 및 사전 접근 이름을 유지하고 복사 실패 시 값 전체 선택을 확인한다. 실제 토큰은 보지 않고 fixture만 쓴다.
- 이전 Copy 후보가 남긴 TokenField-only compatibility 모듈/두 import를 여기서 제거한다. Copy/Secret 구모듈·TokenField export/import 사본0 및 모든 hand-copy 행/최종 API 부채0을 전수 검사한다. 기존ring2 유지; 독립 리뷰/COMMIT 및 최종 gate/R3/T20a/T21/T22는 미완이다.

- Secret 검증: 이전 실제 ResultStep/PushTokenPanel의 읽기전용 native input 계약 RED 후 관련10파일351테스트 및 typecheck exit0. 모든8행 검사/추가 alias5 카나리아도 GREEN이다. 실제 base150 Secret 사본·실패 시 선택/포커스·readOnly 제거·검사기 무력화가 각각 RED, 복원 후 hand-copy/Copy·Secret/TokenField3파일 계약 GREEN 및 최종 typecheck exit0.
- Secret13경로 후보를 고정해 독립 리뷰와 명시적 COMMIT을 기다린다. 마지막 테두리 링/invalid Select 우선순위와 최종 누적 gate 및 지휘자 R3/T20a/T21/T22는 미완이다.

- Secret13경로 독립 리뷰0 findings 및 명시적 COMMIT7 승인을 받았다. 관련10파일351 GREEN/복원3파일124 GREEN/최종 alias 포함 hand-copy110 GREEN/최종 typecheck exit0이며 마지막 테두리 링 및 전체 누적 gate는 다음 후보에서 검증한다.

- 테두리 링 후보: Secret 체크포인트 뒤 Input/Textarea/FieldTrigger(실제 Select 위임)/Button·ButtonLink default/Checkbox/Radio의 border-ring+ring1, 무테 ring2와 checked·invalid 우선순위를 묶는다. 초기 독립 리뷰의 실제 invalid Select 포커스 회귀도 이 후보에서 고친다. 렌더된 폭 유틸 분류/위임 컨트롤·CSS 동치 계약을 먼저 RED로 확인한다.
- 기존 소비자/Scope 한 겹 hover/Copy 실패 및 전체8행+alias 사본 카나리아를 보존한다. 독립 리뷰/COMMIT 및 최종 누적 gate와 지휘자 R3/T20a/T21/T22는 미완이다.

- 테두리 링 검증: 이전 트리3파일8 failed/26 passed RED 뒤 관련11파일191테스트 GREEN/typecheck exit0/diff check exit0. 실제 Input ring1→2·FieldTrigger invalid 포커스 우선순위 삭제·Checkbox checked 우선순위 삭제·hasRing 검사기 무력화가 각각 RED, 복원 후4파일37테스트 GREEN. 정상 Select 위임 픽스처와 실제 invalid Select 포커스 및 CSS destructive 우선순위를 함께 확인했다.
- 링18경로 최종 후보를 고정한다. 독립 리뷰/명시적 COMMIT8과 승인된 base150d221c 누적 full gate를 이어서 진행하며 초기 full gate exit1 로그를 보존한다. T20a/R3/T21/T22는 지휘자 잔여 작업이다.

- P3 최종 승인: 전체92 논리 경로 독립 Astra 리뷰0 findings, 고정된 링18경로 명시적 COMMIT8 승인 및 리뷰 전후 drift0을 확인했다.
- 실제 누적 `pnpm gate --base 150d221c4b70369831b46428551aea873a6202b1` exit0: db:generate → typecheck → test(666파일 통과/1스킵,10345테스트 통과/1스킵) → build(25페이지) → sync:agents:check. 실제 계획상 격리 PostgreSQL 대상 없음. 초기 실패 로그를 보존했고 최종 후보의 모든 코드/테스트/문서 바이트는 게이트 뒤 그대로다.
- 남은 일: 지휘자의 R3 실브라우저·뷰포트 QA, T20a Geist 및 대비 판정, T21 나머지 정본 문서/미러, T22 기능 종료와 dev 통합/푸시. P3는 Pretendard를 유지했고 원격 쓰기를 하지 않는다.

## T20a Geist 작은 후보 — 2026-10-02

- 기준: 깨끗한 accepted P3 `c5665ff7b44f20582290f9ba210b4dbf3b2f9851` 위 별도 작은 후보. Geist 정방향 가변 WOFF2 한 파일(69,760bytes, weight100–900)과 원본 SIL OFL1.1/출처·SHA 설명을 `app/fonts/geist/`에 둔다. 공식 tag v1.7.2 commit `a73329da8fc62afc917f796555202e4997f79b7c`, 파일 SHA `2ffebe993e969069a9789d15164b7715d42491b5835516c5e3b935d5f81b05f1`.
- 실제 Next 로컬 로더가 WOFF2를 읽고 자사 호스트 CSS/swap/preload를 생성하며 자동 Arial 폴백이 없는지 검사한다. 파일의 Latin/숫자 및100–900 가변 축, Hangul 미지원도 실제 cmap으로 검사한다. 루트 변수와 sans 순서, 기존 Pretendard 동적 서브셋 link/predev/prebuild·시스템 폴백/mono를 유지한다. 기존 connection/CSP 동작과 의존성 버전은 바꾸지 않는다.
- 최초 테스트의 TypeScript7 직접 파서 수집 오류는 별도 초기 로그로 보존하고 저장소 기존 ts-morph 파서로 바로잡았다. 이후 실제 기준 코드에서4계약 RED를 확인했고 구현 후 관련3파일25테스트 GREEN/typecheck exit0이다. 실제 순서 역전·루트 변수 삭제·자동 Arial 삽입 각 RED, 복원 후3파일25 GREEN.
- 고정 후보7경로 독립 Astra 소스 리뷰0 findings 및 명시적 COMMIT 승인을 받았다. 공식 폰트/라이선스 바이트 동치와 baseline/mutation RED·25 GREEN/typecheck를 독립 확인했다. 지휘자의 실제 영문/숫자 Geist·한글 Pretendard 폴백 및3뷰포트 QA와 최종 누적 gate가 남아 T20a 완료 체크는 아직 보류한다. 코드 치수·monospace·기존 생성/로드 경로·환경파일/원격은 변경하지 않았다.

## 추가 요청 — 런타임 공통 하네스 (2026-10-02)

- 사용자 요청으로 `/push`·`/merge`·`/sync`·`/orchestrate` 및 브라우저 관련 명령의 Codex 제외를 제거한다. 모든22개 원본 명령을 Codex 스킬로 생성하며 `/ship`도 dev push까지 동일한 게이트를 따른다. 프로덕션 `/merge` 별도 호출·브랜치/소유권/CI/DB/lease 경계는 유지한다.
- 지휘자가 Codex면 Sol·Astra, Claude Code면 Sonnet·Opus만 호출한다. 구현·리뷰·QA·재사용·수정 라운드 모두 적용하며 사용자 명시 허가 없이 패밀리를 교차하지 않는다.
- Codex의 `design-sync`는 사용자에게 로컬 핸드오프 경로(README·HTML·참조 자산)를 요청한다. 제공된 경로는 다시 요구하지 않는다. DesignSync나 Claude 워커로 대체하지 않고 `ego-browser`로 실측한다. 브라우저 QA·가이드 촬영은 실제 도구 연결 여부로 판단한다.
- 검증: 미러 생성기의 새 통합 테스트를 기존 구현에서 누락된 push 미러로 RED 확인 후 수정했다. 생성/드리프트/read-only check/사용자 스킬 보존6테스트·typecheck·22개 스킬 형식 검증·미러 검사 통과. 전체 `pnpm test`는 exit1: 666파일/10349테스트 통과, 1파일/1테스트 실패, 1스킵. 실패는 앞선 Geist의 `app/layout.tsx`를 import하는 SEO 테스트에서 `next/font/local`이 Vitest 함수가 아닌 문제이며 T20a 워커에 수정 배정했다. 하네스 독립 리뷰의 공통 모델 경계·QA 권한 분기 지적2건을 수정했고 재검토 결과 추가 findings0이다.
- 이 변경은 하네스 전용이다. Geist 코드 통합(dev `d073963e`) 이후 실제 폰트/3뷰포트 R3·T21 문서·최종 gate·dev push·T22는 계속 미완이다.

## T21 정본 문서 체크포인트 — 2026-10-02

- CLAUDE: 실제 `components/ui/*.tsx` 43개와 Radix Popover 포함7종, 기존 프리미티브 우선 조립/실재 사본 이관 경계, Geist 우선·Pretendard 폴백/자산 소유권을 정본에 반영한다. 기존 런타임 공통 하네스와 모델 패밀리 정책은 보존한다. AGENTS 미러를 재생성하고 일치 검사를 수행한다.
- T20a SEO 수정안은 독립 Astra 검토0 findings로 승인되어 Sol에 작은 커밋을 지시했다. 전체 gate·실제 폰트/3뷰포트 QA·나머지 T21 정본·T22/dev push는 아직 미완이다.

### T20a SEO 테스트 회귀 보정

- 지휘자의 전체 테스트에서 `app/__tests__/seo-metadata.test.ts`의 layout import가 `next/font/local` 빌드 전용 호출 때문에 실패했다. 소스 체크포인트 `a0eded37`에서 실제로1 failed/11 passed RED를 재현했다. 앞의 소스 리뷰·관련25 GREEN이 전체 스위트 통과였던 것으로 바꾸지 않는다.
- SEO 테스트 파일에만 Next가 빌드 중 제공하는 폰트 결과를 모의한다. 기존 metadata 단언과 프로덕션 폰트/레이아웃·실제 Next 로더/cmap 검사는 그대로 유지한다. 전역 Vitest 설정이나 하네스 파일을 바꾸지 않는다.
- 관련 SEO/보안 헤더/실제 폰트/글로벌 CSS4파일50테스트 GREEN 및 typecheck exit0. 테스트·이 tasks.md 두 경로 후보의 독립 리뷰/명시적 COMMIT을 기다린다. 지휘자의 실제 폰트 사용/3뷰포트와 최종 누적 gate가 남아 T20a 완료 체크는 보류한다.

- 지휘자 통합: 위 두 경로 후보는 Astra 소스 리뷰0 findings 이후 워커 `c40c1273`으로 커밋됐다. root의 하네스/T21 이력을 모두 보존해 tasks 추가 부분만 병합했고 SEO 테스트 바이트는 승인된 SHA 그대로다. 최종 커밋 audit·누적 gate·R3는 계속 미완이다.


## R3 전체 검증 실행 체크포인트 — 2026-10-02

- root `97962138` 고정 상태에서 누적 `pnpm gate` 실제 exit0: generate/typecheck/667파일·10350테스트 통과(각1스킵)/build/mirror. dev DB status up to date. SEO 전체 테스트 회귀도 해소됐다.
- R3 실제 Chromium: Projects/Home/Translations/Sources/Logs/Members/Settings/MCP/Account와 대형 모달·온보딩1–3 등20상태를1280/1440/1890×900에서 확인했다. 기본60장 + 트리 팝오버·안정된 포커스·오류 입력3장, 총63장 육안 확인. DOM 가로 넘침·중복ID·끊긴 aria 참조0; 확인된 회귀0.
- 실제 영문 textarea Geist35glyphs·숫자907 Geist3glyphs·한글 textarea Pretendard11+Geist14glyphs를 CDP로 확인했다. Astra가 소스/자산/실제 로드/3뷰포트 근거를 대조해 T20a를 승인했다.
- 검색 제출/지우기, 필터 빈 결과, repo 임시 선택→명시 확정, Preview/Include 분리, 포털 Tab/Escape/복귀, 트리 같은 토글/바깥클릭, Sources28px/좁은8px,36px필드·16px지시자와1px동색링을 실측했다. 잘못된 주소의 빨간 border/ring 및 제출 차단도 실제 관측했다. repo Input의 Escape 모달 닫기는 변경 전 동작이며 SearchInput의 Escape 지우기 계약과 구분한다.
- 미검증: Safari/보조기술, 보관/zero-membership 픽스처, error.tsx 의도적 유도, 온보딩4, 실제 쓰기/진행/provider인증/시크릿 표시, 비로그인 랜딩. IME는 자동 계약 증거뿐이다. 이 제한을 전체 런타임 PASS로 바꾸지 않는다.
- 실제 초대·프로젝트 생성·토큰 발급/회전·번역 저장은 하지 않았다. TaskSpace22를 한 번 종료하고 dev서버70496을 정지했다. 생성된 next-env 경로 변경만 복원하고 .next/dev를 정리했다.
- 남은 일: T21 DESIGN/DIRECTORY/global-search 정본 반영·독립 리뷰 → 최종 gate/dev push → T22 종료/증거 보존·최종 gate/dev push·워커 정리. 런타임 증거 `.scratch/component-unify-r3-qa.md`; 원본 PNG/JSON은 `.scratch/component-unify/r3/`에만 보관한다.


### T21 DIRECTORY 정본 승격

- 실제43개 UI 모듈의 새/이동 경로와 잔존 PanelFacts/BannerLine, Card/Fact/ListRow/LargeModal/Popover/SelectRow/필드·검색·복사·토큰·Meter 책임을 반영했다. 루트 Geist 로더/추적 WOFF2와 Pretendard 생성물을 구분한다.
- Sol의 읽기 전용 사실 검토에서 Geist 누락·StatusBadge/IconTile 입력 구분을 교정했다. globals.css의 옛 secondary/ListItemButton 주석은 이미 P3에서 교정됐으므로 다시 고치지 않았다. T20a는 실제 font/R3·Astra 승인으로 완료 체크했다.
- 문서 diff 검사는 통과했다. DESIGN/global-search 정본·최종 gate/dev push/T22는 아직 미완이다. 가이드 측정은 `stale 25컷 (50건)`이며 후속 재촬영 경고로 남긴다.


### T21 DESIGN 정본 승격

- Geist→Pretendard 폴백, Radix7종, 최종 ListRow/타일/검색 경로와 ImageTile 조립, Sources Meter 폭/표시 percent의 서로 다른 소유권을 반영했다. 퇴역 ListItemButton의 중복 현행 행을 제거하고 기존 결정 배경·수치를 보존한다.
- §8.1에 공용11축 API 규약과 실제 사본/카나리아 검사 경계를 승격했다. Sol이 지적한 IconTile의 전체 StateTone과 BannerLine/Logs Note의 부분집합을 구별했다. FieldButton·NoMatch의 미래 기능을 미리 구현하지 않는다.
- diff 검사 통과. 최종 독립 문서 리뷰/global-search 정본·배포 HEAD gate/dev push/T22가 남았다.

- T21 global-search spec: 삭제될 feature 설계 대신 DESIGN §8/실제 LargeModal 상수를 참조하고 NoMatch 필수 action 계약과 미래 출구 없는 형의 작업 경계를 대조했다. 이번 커밋은 이 문서와 component-unify 실행 기록만 포함한다. 최종 독립 리뷰·gate/push/T22는 미완이다.

- T21 global-search design: 삭제될 feature 설계 대신 DESIGN §8/실제 LargeModal 상수를 참조하고 NoMatch 필수 action 계약과 미래 출구 없는 형의 작업 경계를 대조했다. 이번 커밋은 이 문서와 component-unify 실행 기록만 포함한다. 최종 독립 리뷰·gate/push/T22는 미완이다.

- T21 global-search tasks: 삭제될 feature 설계 대신 DESIGN §8/실제 LargeModal 상수를 참조하고 NoMatch 필수 action 계약과 미래 출구 없는 형의 작업 경계를 대조했다. 이번 커밋은 이 문서와 component-unify 실행 기록만 포함한다. 최종 독립 리뷰·gate/push/T22는 미완이다.

- T21 독립 리뷰 추가 교정: DESIGN의 옛 SkeletonLine·외부 링크 raw a 금지 설명·온보딩 token code칩 설명을 현재 Skeleton/외부 ButtonLink/SecretField로 고쳤다. 관련 코드 주석2곳은 Sol에 맡겼다. 배포 게이트는 문서 교정 통지를 받아 의도적으로 중단(exit130)했으며 실패/통과로 세지 않는다. 교정 통합 후 최종 gate를 다시 실행한다.

- T21 global-search 추가 대조: ProjectThumbnail의 계획상 size16을 실제 심볼 API size="xs"(16px)로 고쳤다. Sol이 T20 승인표22행/38소스의 최종 이행을 읽기 전용으로 확인했고 잔여 구현 delta0이다. 추가 제품 변경을 만들지 않는다.

- T21 DIRECTORY 추가 대조: ProjectThumbnail xs의 radius4와 sm/md/lg의 radius8을 명시해 현재 SIZE 맵과 맞췄다. 문서 diff 검사 통과, 주석 교정·최종 gate는 미완이다.
