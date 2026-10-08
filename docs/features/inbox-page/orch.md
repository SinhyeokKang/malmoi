# inbox-page — 지휘 계획

원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 이 문서는 배치·결정·검증 증거만 기록한다(원본을 복제하지 않는다).

## 시작점·권한

- 시작 dev: `75903ee1` (origin/dev와 같음, 작업 트리 clean).
- 지휘자: Claude Code(Opus 5.5). 워커 패밀리는 **Claude Sonnet·Opus만**, effort ≤ high. 교차 허가 없음.
- 범위: T1–T7 전부. 끝은 dev push + dev CI + 런타임 QA. `/merge`·prod DB 없음.
- 스키마 변경 없음(design "스키마 변경: 없음") → `/merge` 1단계 prod `db:deploy` 대상 없음.

## 결정 기록

| ID | 결정 | 근거 |
|---|---|---|
| D1 | 제품 결정(읽음 시점·배지·View all 없음·이름 `Inbox`·Home 이관·시안 없음)은 spec 머리의 2026-10-09 사용자 확인 그대로 | 이미 사용자 결정 — 다시 묻지 않는다 |
| D2 | 정본 문서(T7: PRODUCT·ARCHITECTURE·DESIGN·DIRECTORY·CLAUDE.md)는 지휘자가 통합 단계에서 문서별 커밋으로 갱신. 워커는 인계에 수정안만 남긴다 | 지휘자 판단 — `/ship` 10단계가 정본 갱신을 `/push` 4단계(문서 신선도)로 넘기고, 지휘자가 그 단계를 수행한다(seo-geo-audit 선례) |
| D3 | LNB 사용자 구역에 항목이 늘어나므로 **셸이 든 가이드 컷 전부 재촬영** + `guide/*/translate/edit.md` `#inbox` 절 갱신(페이지·사이드바 경로) | 지휘자 판단 — SHOOTING.md "셸을 바꿨으면 컷 전체를 손으로 다시 본다" + 2026-09-30 ui-polish 선례 |
| D4 | T5 prefetch 무부작용 확인은 dev push 뒤 `https://dev.mal-moi.com`(production 빌드)에서, 워터마크는 로컬 `.env.local`의 dev DB를 읽어 전후 비교 | 지휘자 판단 — tasks T5가 "production 모드 preview"를 지정. preview가 dev DB를 본다 |
| D5 | T5(로컬 동작)와 T6(DESIGN·Home 실측 대조)은 QA 워커 하나가 main 체크아웃에서 직렬로 | dev 서버는 하나 — QA 직렬 규칙 |

## 배치·파일 소유권

| 배치 | 항목 | 소유 파일 | 선행 | 모델 / effort · 이유 | 차단 | 상태 |
|---|---|---|---|---|---|---|
| A | T1 → T2 | `lib/inbox/plan.ts` · `lib/inbox/unread-store.ts` · `lib/inbox/__tests__/{plan.test.ts,unread-store.test.ts,unread-store-hook.test.tsx}` · `app/inbox/actions.ts` · `app/inbox/__tests__/actions.test.ts` · `app/__tests__/entry-points.test.ts` | 없음 | Opus 5.5 / high — 단조 쓰기·store 계약, 같은 터미널이 C를 이어 받는다 | 필수 | ✅ dev `e6deed30..508bfba4` · 리뷰 🔴0 🟡0 · 1라운드 |
| B | T3 (커밋 1개) | `components/inbox/row-slots.tsx` · `components/shell/attention-inbox.tsx`(행 조각 치환만) · `components/home/attention-card.tsx` · `components/__tests__/inbox-row-slots.test.tsx` · Home 회귀 테스트 · 필요 시 `client-graph.test.ts` | 없음 | Sonnet 5.5 / high — 동작 불변 추출 리팩터 | 필수 | ✅ dev `cb563b23..dba3b650` · CI green · 리뷰 🔴2→fix1 · 2라운드 · 워크트리 정리 |
| C | T4 (커밋 1개) | design 표의 나머지 전부: `app/(edit)/inbox/**` · `components/inbox/{inbox-list,mark-seen}.tsx` · `attention-inbox.tsx`(store·세대) · `sidebar.tsx` · `nav-count.ts` · `lib/shell/nav.ts` · `lib/routes.ts` · `lib/auth/cookie.ts` · `messages/{en,ko,es}.tsx` · `messages/ko-privacy.tsx` · 관련 테스트 · `client-graph.test.ts` · `app-frame.tsx` 주석 | A·B dev 통합 | A 터미널 재사용(Opus 5.5 / high) — 세대 무효화·RSC 경계가 이 기능의 위험 | 필수 | 착수 |
| R | 배치별 독립 리뷰 | 읽기 전용, `.scratch/review-<batch>.md` | 각 구현 완료 | Opus 5.5 / medium — 리포트 전용 | 필수 | 대기 |
| Q | T5 + T6 | main 체크아웃, 코드 수정 없음. 결함은 BugShot | C dev push + CI green | Opus 5.5 / medium — ego-browser 실측·DB 전후 | 필수 | 대기 |
| G | 가이드 본문(`/guide`) + 셸 컷 재촬영(`/guide-shots`) | `guide/{en,ko,es}/**` · `public/guide/**` · `guide/SHOOTING.md` | Q 종료 | Opus 5.5 / medium — 세 언어 원고 + 촬영 셋업 | 필수 | 대기 |
| T7 | 정본 문서 | PRODUCT · ARCHITECTURE · DESIGN · DIRECTORY · CLAUDE.md · `docs/features/inbox-page/` 삭제 | C 통합 | 지휘자 | 필수 | 대기 |

## 파일 겹침·실행 순서

| 조합 | 겹침 | 실행 |
|---|---|---|
| A / B | 없음 (lib·app action vs components 행 조각). `client-graph.test.ts`는 B만 만질 수 있다(T1은 등재 금지) | **병렬**, 별도 워크트리 |
| C / A·B | `attention-inbox.tsx`(B) · `entry-points.test.ts`(A) · store(A) 소비 | A·B dev 통합 뒤 A 터미널에서 `git rebase dev` 후 착수 |
| Q / 통합·build | main 체크아웃 dev 서버 | QA 중 cherry-pick·build 금지 |
| G / Q | dev 서버 하나 | Q 뒤 직렬 |

전체 gate가 병렬로 돌면 테스트 timeout이 날 수 있다(seo-geo-audit 실측) — 워커는 최종 gate가 timeout 한 건으로 red면 단독으로 한 번 다시 돈다.

## 공통 검증·인계

- `/ship bypass`, 계획 원본은 tasks.md. 문서가 단계를 나눴으므로 태스크 하나씩. 임시 브랜치 = dev 등가. **11단계(`/push`) 전에 멈춤.** `git push`·`/merge`·`/sync`·`db:deploy` 금지.
- 셋업: `pnpm install && pnpm db:generate`. `.env.local` 복사 금지. 워커 게이트 `pnpm gate --base dev` 하나(출력 파이프 금지).
- 런타임 항목은 6.2단계대로 (a)는 시나리오 테스트로, 인계엔 (b)만 이유와 함께.
- 인계: `.scratch/handoff-<batch>.md` — 커밋 SHA · 정확한 gate 끝줄 · 변경 파일 · 계획과 다른 점 · 정본 수정안 · 런타임 (b). 그 뒤 `worker_done` 한 번.
- 지휘자 통합: cherry-pick → `pnpm gate` → `git push` → 그 커밋 dev CI 결론 확인. red면 다음 push 없음.

## 실행 기록

- 2026-10-09: 인테이크. 결정 D1–D5 기록, 사용자 질문 없음(전부 선례·정본이 답함).
- Run `run_d93c261009ee`. A `ctx_ce9ec8e6f3bc`(Opus high) · B `ctx_30763edb21ce`(Sonnet high) 병렬, launch effective 확인.
- B 질문: Home 소스 가드 2개(loading-parity·home-screen gap)가 옮겨진 행 마크업을 가리킴 → 두 단언만 `list-row.tsx`로 재지정 승인.
- B 리뷰(Opus medium): 🔴 R1 Logs 가드까지 덩달아 재지정(가드 상실) · R2 Home 보조줄이 ListRow `leading-normal`(19.5)로 바뀌어 골격(17.33)과 ≈2px 어긋남. fix1(`295bbea4`): Logs 가드 복구 · Home 골격 `lineHeight="normal"` + 가드 단언. 지휘자가 diff 확인.
- B 통합 게이트 1회차 timeout 2건(load 73, A 동시 게이트) → 단독 재실행 `gate: ok`. push `dba3b650` CI green.
- A 리뷰: 🔴0 🟡0 ⚪4. 통합 `gate: ok`(격리 postgres 포함). 리뷰 메모(MarkSeen은 `toISOString()` 문자열)를 brief-c에 이월.
