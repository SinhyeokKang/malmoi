# project-card-tabs — orch

지휘 계획. 원본은 [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)이고 여기서 복제하지 않는다.

- 착수: 2026-10-04 · 시작 dev `a609988d`
- 범위: tasks T1~T14 전부 (T12 = 지휘자 push, T14 = 지휘자 정리). 끝은 dev — `/merge`는 부르지 않는다.

## 결정 기록

- T0(시안 v3 수령·리뷰 결정)은 2026-10-04 spec "결정"으로 닫혔다 — 인테이크에서 새로 물을 🔒 항목 없음.
- 워커 재량으로 남긴 곳(질문 없이 워커가 정하고 인계 문서에 적는다): `"unrecorded"` 갈래 문구(T1) · Sync `Synced` 종료 시각 출처(T6, design §2.2).
- **`/guide-shots`를 게이트 마지막 단계로 반드시 돈다** (2026-10-04 사용자) — tasks T13의 "바뀌었으면" 조건을 이 실행에선 쓰지 않는다. 메타 열이 보이는 컷은 전부 다시 찍는다.
- 모델 경계: Claude Code 지휘 → Sonnet·Opus만, effort ≤ high. 교차 허가 없음.

## 배치

| 배치 | 태스크 | 소유 파일 (요지) | 선행 | 모델 · effort | 출시 차단 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|---|
| **A** home-data | T1 · T2 · T6 | `lib/home/meta.ts` · `lib/home/runs.ts` · `lib/home/__tests__/*` · `lib/auth/query.ts`(대기 초대 술어 추출) · `app/(edit)/projects/[slug]/(home)/page.tsx`의 **project select·`now` 이동만**(T6) | T6 앞에 B의 T3이 dev에 있어야 한다 (`WAITING FOR B-T3`) | Opus 5.5 high — 사건 고르기 SQL·§5.7.7 후퇴 판정 | 예 | `pnpm gate --base dev` | 대기 |
| **B** publish-count | T3 · T4 · T5 | `prisma/schema.prisma` · `prisma/migrations/*` · `lib/privacy/collected.ts` · `lib/pull/**` · `lib/sync/**` · `lib/events/query.ts` · `components/logs/event-detail.tsx` · 관련 테스트 | 없음. T3 커밋을 먼저 끊어 지휘자가 dev에 선반영 | Opus 5.5 high — pull 파이프라인·결정성 인접 | 예 | `pnpm gate --base dev` (통합 스위트 트리거) | 대기 |
| **C** ui-primitives | T7a · T7b · T7c | `components/ui/segment.ts`(신규) · `segmented-control.tsx` · `tabs.tsx`(신규) · `facts.tsx` · `components/ui/__tests__/*` · `focus-ring.test.ts` 픽스처 | 없음 | Sonnet 5.5 high — 프리미티브 조립, 함정은 design §3에 다 적혀 있다 | 예 | `pnpm gate --base dev` | 대기 |
| **D** meta-column | T8 · T9 · T11 | `components/home/meta-column.tsx` · `(home)/page.tsx` · `(home)/loading.tsx` · `messages/en.tsx` · `lib/home/sync-time.ts`(고아 정리) · home 계열 테스트 · `app/__tests__/entry-points.test.ts` · 문서(DESIGN·ARCHITECTURE·DIRECTORY·PRODUCT·CLAUDE.md, 문서별 커밋) | A · B · C 전부 dev | Opus 5.5 high — 경계·접근성·문서 다수 | 예 | `pnpm gate --base dev` | 대기 |
| **Q** design-sync | T10 | 코드 수정 없음 — main 체크아웃, 결함은 BugShot → D가 수정 | D dev | Opus 5.5 high | 예 (보드 11개 전부) | 실측 표 11행 ✅ | 대기 |
| **G** guide | T13 — `/guide` 본문 + **`/guide-shots` 필수**(조건부 아님, 2026-10-04 사용자 "guide-shots도 게이트 마지막에 수행해") | `guide/**` · `public/guide/**` · `guide/SHOOTING.md` — main 체크아웃(촬영에 dev 서버) | Q 종료 | Opus 5.5 high | 예 — 마지막 게이트 | `pnpm guide:check` 인용 · 메타 열이 보이는 컷(`project-home`·`home-publish`·`home-paused` + Logs Publish 컷) 재촬영 · `pnpm test` | 대기 |

- 지휘자 몫: T3 마이그레이션의 dev DB 적용(`prisma migrate deploy` → `db:status` → anon 권한 0) · 통합 cherry-pick · `pnpm gate` · T12 push · T14 디렉터리 삭제.

## 파일 겹침 · 순서

- `messages/en.tsx`는 **D만** 만진다. A(`metaTabs`는 순수·문구 없음)·B(`changedValuesText`·`notRecordedForRun`이 이미 있다)·C는 건드리지 않는다 — 필요하면 `ask`.
- `(home)/page.tsx`: A(T6 select·`now`)와 D(T8 배선)가 겹친다 → D는 A 뒤.
- `lib/home/meta.ts`: A(T1·T2)와 D(T8 `metaRows` 제거·주석 정정)가 겹친다 → D는 A 뒤.
- A의 T6은 `SyncRun.changedValues`를 select한다 → B의 T3이 dev에 들어간 뒤 rebase.
- 순서: **웨이브 1 = A · B · C 병렬** (A는 T6 전 대기점) → B-T3 선반영 → A 재개 → A·B·C 통합 → **D** → 통합 · push → **Q** (D가 수정 라운드) → **G** → T14.

## 진행 기록

(배치별 라운드·통합 해시·검증 결과를 여기에 덧붙인다)
