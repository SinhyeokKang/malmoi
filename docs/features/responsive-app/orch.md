# responsive-app — 지휘 계획 (/orchestrate)

원본: [spec](spec.md) · [design](design.md) · [tasks](tasks.md) · [design-brief](design-brief.md) · [시안 피드백](design-feedback.md)(5차 확정 — 시안 `App Responsive.dc.html`이 대표 프레임 정본, 노트의 확정 결정이 브리프보다 우선). 이 문서는 원본을 복제하지 않고 배치·소유권·순서·상태만 든다.

- 시작: 2026-10-11, dev `27913c96`
- 끝은 dev(preview)다. `/merge`는 사용자가 따로 부른다 — 공개 단계(responsive-public)와 함께 프로덕션에 나간다(spec 출시 절). 랜딩 목업은 [responsive-mockup](../responsive-mockup/spec.md)으로 분리돼 이 런 밖이다.
- 스키마·마이그레이션·환경변수 변경 없음(design §6).

## 결정 기록

| # | 결정 | 출처 |
|---|---|---|
| O1 | 대표 프레임 = Claude Design `App Responsive.dc.html` 5차본(AT1~AT10). 확정 결정 F1·F3/R2·F4·F5·F7·F8·R1은 [design-feedback.md](design-feedback.md) 끝 절 | 2026-10-11 사용자(시안 검토 1~5차) |
| O2 | 워커는 Claude Code 패밀리만(Opus 5.5·Sonnet 5.5, effort ≤ high). Codex 교차 없음 | 지휘자 판단 — 사용자 허가 없음 |
| O3 | `components/sources/*`는 읽기·관리 모두 B3 소유 — tasks의 A3(읽기)/A5(관리) 분할을 파일 단위로 합친다. Add sources의 Files 단계 본문은 `components/onboarding/steps/files.tsx`라 B4 | 지휘자 판단 — 같은 파일을 두 배치가 고치지 않게(겹침 0) |
| O4 | `PanelHeader` 두 줄 규칙(R1)은 B1이 `components/shell/content-panel.tsx`에 **첫 커밋**으로 넣고, 지휘자가 그 커밋만 먼저 리뷰·통합한다(B1a). 자기 머리를 손으로 든 화면(번역 `workspace.tsx` h1 · `members-panel-header.tsx` 등)은 B1a가 dev에 들어간 뒤 그 규칙(같은 상수)을 소비한다 | 지휘자 판단 — 머리 규칙 하나(R1), 병렬 유지 |
| O5 | 사유 줄 프리미티브(F7)와 그 소비자(번역 화면 + Home의 Sync·Publish — `components/home/{actions,sync-button}.tsx`)·`publish-button.tsx`·`edit-loss-banner.tsx`는 B2 소유. Home **배치**(페이지·적층)는 B1 | 지휘자 판단 — 사유 줄 출처 하나(F7) |
| O6 | 새 사전 키: B2가 `responsive.backToKeys`, B4가 `responsive.viewSample`·`responsive.backToCandidates`. `messages/{en,ko,es}.tsx`는 B2 → B4 순서(B4는 B2 dev 통합 뒤 rebase하고 키를 넣는다). ko·es 초안은 워커가 넣고 ko는 `/merge` 전 사용자 일괄 검수 | 지휘자 판단 — tasks A8·CLAUDE.md 사전 규칙 |
| O7 | 앱 셸 하한 해제(A6 코드 몫 — `min-w-shell-min` 제거·`shell-layout.test.ts` 등 교체)는 B2~B4가 dev에 들어간 뒤 B1 워커가 후속 라운드(B1b)로 한다 | 지휘자 판단 — tasks A6 "A2~A5 완료 후 최종 해제", 셸 파일 소유자가 B1 |
| O8 | 좁은 폭 실측은 B1b 뒤 DS·QA에 모은다(tasks 과도기 실측 규칙). 워커는 자동 검증 + 1024·1280 실측까지 | tasks "과도기 실측"(2026-10-07 사용자) |
| O9 | `/design-sync` 배치를 둔다 — 신규 표면(서랍 AT1 · 번역 단일 판 AT6 · Files 순차 판 AT7 · 사유 줄 AT8a)은 프레임별 computed style + AX 트리, 나머지는 패턴 적용 대조 | tasks A6 · 메모리 "시안이 준비된 변경은 design-sync" |
| O10 | 사유 줄은 연결 끊김만이 아니라 꺼진 Sync·Publish의 **모든** 사유(Nothing to send · ownerOnly · 일시 잠금)에 선다 | 지휘자 판단 — spec A-05 문자 + F7 확정이 범위를 정함(B2 질문). 넓은 폭 상시 +22는 DS·QA 시각 확인 |
| O11 | Logs 행은 DOM 불변 — 좁으면 시각이 맨 윗줄, 문장은 그 아래(브리프 '문장 첫 줄'과 순서만 다름) | 지휘자 판단 — 1280 불변·`order` 0 우선(B3 질문) |
| O12 | Files 후보 경로는 말줄임 + title 유지(시안 AT7), 전문은 샘플 툴바 경로 줄바꿈으로. `client-graph.test.ts` 한 줄 추가는 B2·B4 각자 별도 커밋 | 지휘자 판단 — 시안 5차 확정 우선(B4 질문) |
| O13 | 공유 프리미티브 둘: `components/ui/list-row.tsx`의 좁은 폭 적층 옵트인 prop(행 동작 아래 줄 오른쪽, `@max-form`)은 B3(첫 소비자 Account 행, 별도 커밋) — B4의 members·mcp 행은 그 커밋이 dev에 들어간 뒤 같은 prop을 쓴다. `components/ui/dialog.tsx`의 일반 확인 DialogContent를 AT8b 형(375 좌우 16 · 본문만 스크롤 · footer flex-wrap)으로 바꾸는 것은 B2(별도 커밋, DrawerContent·CommandDialog 불변) | 지휘자 판단 — B3 질문, 손 사본 0·첫 소비자 배치 |
| O14 | B1이 `components/ui/dialog.tsx`의 `DrawerContent`에 선택 `pinned` prop(처음 `footer`로 적었으나 `api-contract.test.ts`가 금지하는 슬롯 이름이라 바꿈)(세로 행 고정 바닥)을 더한다 — 함수 안만, 별도 커밋, 공개 소비자 렌더 불변. 같은 파일의 확인 DialogContent는 B2(O13). 뒤에 통합되는 쪽이 rebase | 지휘자 판단 — B1 질문, AT1b 바닥 고정 행 |
| O15 | Projects 행은 **모든 폭에서 두 줄**(1줄 썸네일·이름/리포·배지, 2줄 미터 가로 감김) — 데스크톱 1280도 미터를 숨기지 않으려면 한 줄에 다 들어가지 않는다. 데스크톱 행 높이 +26, Projects 가이드 컷 stale(D 배치) | 지휘자 판단 — F5(미터 숨김 0)의 귀결, 폭별 배치 하나(B1 질문). 되돌리기는 컨테이너 질의 한 줄 |
| O16 | B3 리뷰 결정: D1 소스 상세 정보 격자 640 미만 한 열(시안 AT3) · D2 Logs 골격은 결과 있는 행 유지 + 주석 · D3 기존 `@max-form:order-last`(source-detail 언어 행)는 걷지 않는다 — 이 기능이 만든 것이 아니고 걷으면 1280 배치가 바뀐다 | 지휘자 판단 — 시안 노트·외과적 변경 원칙 |
| O17 | `components/account/*`·`components/preferences/*`는 B3 소유(사후 등재). B4의 members·mcp 행은 손으로 든 grid라 `ListRow stackActions`를 쓰지 않는다(O13 앞부분 실현 안 됨 — 결함 아님) | 지휘자 판단 — B3 리뷰 |

## 배치

| 배치 | tasks | 소유 파일(이 배치만 편집) | 선행 | 모델·effort | 상태 |
|---|---|---|---|---|---|
| **QA0** 기준선 | A0 남은 몫 | 없음(리포트 `.scratch/ra-qa0-baseline.md`) — main 체크아웃. 앱 1280 기준선 재실측(공개 단계 이후 회귀), 375 한 컷 관측(spec 문제 절용) | — | Sonnet 5.5 medium — 측정만 | 완료 |
| **B1** 셸·Projects·Home | A2 (+B1a 머리 규칙, +B1b 하한 해제) | `app/(edit)/layout.tsx` · `components/shell/*`(단 `attention-inbox`·`user-menu`·`header-bar`는 공개 단계 소유 형 — 바꿀 때 질문) · `components/public-shell/nav-drawer.tsx`(`useNarrowHandoff` 이관만) · `components/docs/nav-sheet.tsx`(import 경로만) · `lib/shell/*` · `components/projects/*` · `components/home/*`(`actions`·`sync-button` 제외 — O5) · `app/(edit)/projects/(list)/{page,loading}.tsx` · `app/(edit)/projects/[slug]/(home)/*` · `app/(edit)/inbox/*` · 관련 테스트(`shell-layout` · `projects-screen` · `public-shell` 등) | — | Opus 5.5 high — 셸 재마운트·포커스 이관·선호폭 보존 | 대기 |
| **B2** 번역·위험 동작 | A4 | `lib/translations/*`(새 `compact-pane.ts` 포함) · `components/translations/**` · `components/publish-button.tsx` · `components/home/{actions,sync-button}.tsx` · 새 사유 줄 프리미티브(`components/ui/` 새 파일) · `app/(edit)/projects/[slug]/surfaces/[surfaceSlug]/**` · `app/(edit)/projects/[slug]/translations/**` · `messages/*`(`backToKeys`만) · 관련 테스트(`translation-workspace*` · `translations-screen` · `a11y-reasons` · `layout.test` 등) | 머리 h1은 B1a 뒤 | Opus 5.5 high — draft·판 전환·포커스 착지 계약 | 대기 |
| **B3** Logs·Sources·Account·Preferences | A3 + Sources 관리(O3) | `components/logs/*` · `components/sources/*` · `app/(edit)/projects/[slug]/{logs,sources}/**` · `app/(edit)/projects/[slug]/surfaces/new/**`(Add sources 직접 URL) · `app/(edit)/account/**` · `app/(edit)/preferences/**` · 관련 테스트(`logs-screen` · `sibling-loading` · sources·account·preferences 테스트) | 머리 소비는 B1a 뒤 | Sonnet 5.5 high — 컨테이너 적층 치환 위주 | 대기 |
| **B4** 온보딩·Members·Settings·MCP | A5(Sources 관리 제외 — O3) | `components/onboarding/**` · 새 `lib/onboarding/files-layout.ts` · `components/members/*` · `components/settings/*` · `app/(edit)/projects/[slug]/{members,settings}/**` · `app/(edit)/mcp/**` · `components/mcp/*`(+`mcp-*` 테스트 — B4 질문으로 추가) · `app/(edit)/projects/{(list)/new,@modal}/**` · `app/(edit)/projects/new-project-modal.tsx` · `messages/*`(`viewSample`·`backToCandidates`만, B2 뒤) · 관련 테스트(`files-step-panels` · `onboarding-modal` · members·settings·mcp 테스트) | 머리 소비는 B1a 뒤 · 사전은 B2 뒤 | Opus 5.5 medium — 순수 판정 TDD + 폼 다수 | 대기 |
| **B1b** 하한 해제 | A6 코드 몫 | B1 소유 + `min-w-shell-min`을 단언하는 공유 테스트(`visual-system` · `spelling-equivalence` 등 — 앱 셸 몫만) | B2~B4 dev 통합 | B1 워커 재사용 | 대기 |
| **DS** 시안 대조 | A6 대조 | 없음 — main 체크아웃 `/design-sync`, 불일치마다 BugShot 이슈 → 소유 배치 | B1b dev | Opus 5.5 medium | 대기 |
| **QA** 런타임 | A6 실측 | 없음 — main 체크아웃 `/runtime-test`, spec 샘플링 매트릭스 · 경계 ±1 · 터치 · 성능, BugShot 이슈 | DS 수정 라운드 dev | Opus 5.5 medium | 대기 |
| **D** 사전·가이드·정본 | A8 · A8a~c | `messages/{ko,es}.tsx` 검수(`/translate` 모드 ①) · `guide/**` · `public/guide/**` · `docs/{PRODUCT,DESIGN,ARCHITECTURE,DIRECTORY}.md` · `guide/SHOOTING.md` | QA 수정 라운드 dev | Opus 5.5 medium | 대기 |

리뷰 워커는 배치마다 Opus 5.5 medium, 리포트 전용.

## 겹침과 순서

- 파동: **1** QA0(main 체크아웃 — 끝날 때까지 통합 금지) · B1 · B2 · B3 · B4 → **1.5** B1a(머리 규칙 첫 커밋) 단독 리뷰·통합 → 신호: B2·B3·B4 rebase 후 머리 소비 → **2** B2 dev 뒤 B4 사전 키 → **3** B1b → **4** DS → 수정 라운드 → **5** QA → 수정 라운드 → **6** D(가이드 촬영은 main 체크아웃 dev 서버라 QA 뒤 직렬).
- 겹침 핫스팟: `messages/*`(O6 순서) · `content-panel.tsx`(B1 단독) · `workspace.tsx`·`publish-button.tsx`(B2 단독) · `shell-layout.test.ts`(B1 → B1b 같은 워커) · `components/ui/*`(B2의 새 파일 하나 외 편집은 질문).
- QA0·DS·QA·D 촬영이 main 체크아웃에서 `pnpm dev`를 도는 동안 cherry-pick·build 금지.

## 검증 게이트

- 워커: `/ship bypass`, 11단계(`/push`) 전 정지, `pnpm gate --base dev`(파이프로 거르지 않는다), 인계 `.scratch/handoff-<batch>.md`(커밋 · 검증 결과 · 미완 · 런타임 검증 목록 (b)만).
- 지휘자 통합: main 체크아웃 cherry-pick → `pnpm gate` 끝줄 → `git push` → 그 커밋의 dev CI 결론.
- 런타임: spec 측정 판정·샘플링 규칙, A-01~A-10 항목별 증거 표.

## 진행 기록

(배치별 push 해시·라운드·미완을 여기에 갱신한다.)

Run `run_ea6cb60e2632`. 파동 1 착수 2026-10-11.

| 배치 | Dispatch | 워크트리 | 상태 |
|---|---|---|---|
| QA0 | `ctx_93db6a24a97f` | main 체크아웃 | 완료 — 1280 결함 0, 375 관측을 spec 문제 절에 반영. QA 이월: Home·Logs dev 청크 CSP 차단(간헐) 재확인 |
| B1 | `ctx_8e85ecb5897f` | `ra-b1` | B1a dev `9e26c56a`(CI success) · 본 구현 073b6bba·a9f75b34·eef68a75(gate ok) → 리뷰 `ctx_ab571e49100d` |
| B2 | `ctx_7623878d5078` | `ra-b2` | 진행 |
| B3 | `ctx_f2f02378f9aa` → fix1 `ctx_2043fc02dc5f` | `ra-b3` | 구현 edd9aef1·b309037d·87114992 · 리뷰 🔴0 🟡7 → fix1 진행 |
| B4 | `ctx_221863986e06` | `ra-b4` | 진행 |
