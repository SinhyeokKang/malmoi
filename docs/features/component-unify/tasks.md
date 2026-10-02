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

### 전체 배치 계획 — 전부 Codex, 모델 선택은 사용자 위임

공통 게이트 **G** = 테스트 먼저 → 해당 순수/DOM 계약·사본 카나리아 → `pnpm gate --base <배치 시작 커밋>` green → 독립 리뷰 → 항목별 커밋. gate 출력은 파이프로 거르지 않는다. **T0은 수정 뒤 지휘자가 별도로 `pnpm gate --base aed73f32`를 실행해 통과했다**(638파일/9634테스트). 수정 전 baseline 결과와 구분한다.

공통 파일 **C** = `components/__tests__/hand-copies.test.ts`·`api-contract.test.ts`(T6 이후)·`visual-system.test.ts`·`focus-ring.test.ts` 중 변경 규칙의 해당 테스트, `docs/DESIGN.md` 해당 규약. 매 배치는 자기 규약 행만 소유한다. **같은 C 파일을 수정하는 배치는 동시 편집 금지**이며 아래 실행 순서대로 handoff·리뷰 후 다음 편집을 시작한다. 새 파일 경로는 계획 경로이며 현재 존재를 뜻하지 않는다.

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
| B3b T8 | `lib/tone.ts→hue.ts`, `ui/tone.ts`, avatar/image 소비자, client-graph 테스트 | T7 / hue축1커밋 | GPT-6.1 Sol medium / 이름 변경 | G, 옛 import0 |
| B3c T9 | `ui/button.tsx`, `ui/alert.tsx`, `ui/skeleton.tsx`, 스피너 전달 `ui/file-input.tsx`·`reconnect-button.tsx`, 해당 호출부(특히 publish/workspace), C | T8 / 크기축1커밋 | GPT-6.1 Sol high / 크기·busy 렌더 계약 | G, spinnerSize 14/16·기본16 보존, 값0 |
| B3d T10 | `ui/input.tsx`, `ui/select.tsx`, `components/search-input.tsx`, design §9 폭 호출부, C | T9 / 폭축1커밋 | GPT-6.1 Sol high / responsive 폭 보존 | G, 래퍼 포함 값0 |
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

**배치 파일 겹침 행렬**(동일 셀 그룹들은 병렬 금지):

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

**병렬 허용은 읽기 전용 독립 리뷰/인벤토리뿐**이다. 실제 코드 배치는 공유 파일이 많아 위 순서로 직렬화한다. 워커는 같은 체크아웃을 쓰고 새 워크트리는 사용자 지시나 실충돌이 있을 때만 만든다. 모델은 전부 Codex다. **2026-10-02 사용자 “Sol도 좀 쓰셈” 반영: 기본은 GPT-6.1 Sol medium/high이며 일반 구현·독립 리뷰·QA도 Sol high다. Astra high는 B0 계획·B3a 상태 매핑·B4 Card·B6 LargeModal·B7b 번역 ListRow·B9b 필드 통합에만 한정한다.**

**원격 경계**: 2026-10-02 사용자 “push 허용”·“멈추지말고 계속 진행해”에 따라 **Codex 지휘자가 단위별 게이트·QA 후 dev push까지 수행하고 다음 단위로 계속 진행한다.** 구현 워커는 로컬 커밋까지만 맡고 원격 쓰기는 지휘자 한 창구다. 프로덕션/main·DB·비밀값 변경 없음. QA는 Codex가 제공된 브라우저 기능으로 직접 수행 가능한 항목만 측정하며, 런타임 접근이 없으면 미검증으로 남긴다.

## 실행 기록 — 2026-10-02

- **단위 ① T1–T4 및 R1 완료, dev 반영 `1d5d6eae`.** T0 `b731533a` → T1 `3fcc9e11` → 동치 경계 문서 `9239b351` → T2 `d11f99c6` → T3 `2c0f3ffd` → T4 `bc535749`. 구현·문서·독립 리뷰 워커는 전부 Codex이며, T1–T4는 Sol(high/high/high/medium)로 수행했다.
- 각 구현 경계의 전체 gate·독립 리뷰를 통과했다. 최종 코드 검증은 640파일/9795테스트, T3 자동 격리 PostgreSQL 31파일/520테스트, typecheck·build·미러 green. T2의 tailwind-merge 별칭 등록과 색 스캐너 접두 누락, T3의 메일 색 파서/hex 누락을 회귀 테스트로 고정했다.
- **1280×900 R1**: Home·Projects·Translations·Sources·Logs·Settings를 T0와 대조했다. Home/Logs/Sources는 픽셀 차이0, Projects5·Translations4·Settings24픽셀의 미세 렌더링 차이만 남았다. Home/Logs/Settings의 267/406/157개 보이는 HTML 요소 좌표와 계산된 CSS 14속성은 전부 같았다. 승인 밖 레이아웃·색 변화는 발견하지 않았다.
- 최초 촬영 뒤 브라우저 스크롤바 모드가 달라져, Home/Logs/Settings는 동일 T0 SHA를 임시 디렉터리에서 같은 브라우저·Webpack dev 조건으로 재촬영했다. 상대 시간 문구·개발 도구 렌더링 표시는 안정 상태에서 구분했다. 환경 파일 복사·프로젝트 데이터 변경 없이 검증했고 서버·임시 디렉터리·브라우저 공간을 정리했다.
- 상세 로컬 증거: `.scratch/component-unify-r1-qa.md`, `.scratch/component-unify/{before,after,baseline-current-browser,after-current-browser}/`, `dom-comparison.json`. 각 배치 인계서는 `.scratch/handoff-component-unify-b1{a,b,c,d}.md`다.
- **단위 ② T5–T7 완료, T8 진행. T8 이후·단위 ③·T21/T22 및 전체 화면·3뷰포트·Safari 검증은 미완/미검증.** 단위 ① push 직전 `pnpm gate` exit 0(640파일/9795테스트·격리 PostgreSQL 31파일/520테스트·build·미러)을 확인했다. `aed73f32..1d5d6eae`를 dev에 푸시했으며 CI run은 `36964622111`이다(푸시 시점 queued). `pnpm guide:check`: `stale 25컷 (39건)` — 후속 재촬영 경고. 스키마·마이그레이션 변경 없음.

- **T5·T6 계약 그물 완료.** T5 `b9515558`은 현재 프리미티브 59계약과 7개 mutation을 고정했다. T6 `993b4190`은 실제 위반 111행/120회와 해소 태스크를 기록했다. 독립 리뷰에서 발견한 상태 6건 누락·로컬 크기 타입 별칭 검출 공백을 수정했고, 22카나리아·실제 Note 허용행 삭제 red/동일 바이트 복원 green·전체 gate646파일/9869테스트·typecheck·build·미러 exit0을 통과했다. 태스크 경계 명시는 `90cc5218`이며, T7은 이 커밋을 기준으로 시작한다.

- **T7 상태 통합 완료 `17ad3852`.** Badge 모양 이름과 의미 상태를 분리하고 Logs·표면 결과·PanelRow·Note·직접 상태 배지5곳을 같은 상태 정본으로 이관했다. Logs의 회색 성공·Failed 낱말과 기존 CSS·슬롯을 보존했다. 기존 API 기대값4건과 독립 리뷰의 Note 조건식 스캐너 공백을 수정했으며, 최종 gate646파일/9951테스트·격리 PostgreSQL31파일/520테스트·typecheck·build·미러 exit0 및 독립 리뷰0건을 확인했다. 실제 브라우저·AT 검증은 R2에 남아 있다.

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
