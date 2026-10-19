# arb — orch

원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 이 문서는 지휘 상태만 든다.

- 착수: 2026-10-19 · 시작 dev `1edbb640`(= origin/dev)
- 끝: dev push까지. `/merge`는 부르지 않는다 — 모바일 세 스펙 합동 머지는 android-strings T5에서 한 번이다(spec 머리).
- 스키마·환경변수·패키지 변경 없음(design §7).

## 결정 기록

1. **패밀리 교차 허용** (2026-10-19 사용자 — "Codex 허가"). 구현·리뷰 워커를 Claude(Sonnet·Opus)와 Codex(`gpt-6-astra`, effort 상한 medium) 사이에서 고른다. 독립 리뷰는 구현과 다른 패밀리로 맡긴다.
2. **T1.5는 Flutter SDK를 brew로 설치하고 폐기용 리포를 새로 만든다** (2026-10-19 사용자). 기존 폐기용 리포 셋에 ARB가 없고 이 머신에 Flutter가 없다. 새 리포는 사용자 계정의 private 리포이고 `malmoi-sync-dev` 설치 대상에 넣는 것은 콘솔이라 사용자 손이 한 번 필요하다 — Q가 그 지점에서 묻는다. 만든 리포는 roundtrip 전제 조건 1의 목록에 올린다(D의 문서 몫이 아니라 Q 인계 → 지휘자 커밋).
3. **T1.1–T1.4는 워커 A 하나가 직렬로 한다** — 지휘자 판단. 테스트·구현·껍데기 배선·재측정이 같은 파일(`lib/adapters/**`·`contract.ts`)을 잇달아 고쳐 나눌 수 없다.
4. **문서(T5) 워커 D는 1파에서 A와 병렬로 시작한다** — 지휘자 판단. 지원 포맷 목록·포지셔닝·가이드는 design이 이미 정한 사실이라 코드를 기다리지 않는다. A의 결과에 기대는 몫(ARCHITECTURE §1.9 재측정 표·판정, `contract.ts` 예외 행의 실제 문구 대조)은 D가 미룬 항목으로 남기고, A 통합 뒤 새 Dispatch로 보낸다.
5. **A는 docs/·README·guide/·CLAUDE.md를 건드리지 않고, D는 코드·`messages/**`를 건드리지 않는다** — 지휘자 판단(겹침 0). `contract.ts` 머리 주석 표의 예외 행은 코드라 A, ARCHITECTURE의 같은 근거 서술은 D다.
6. **DS 행 없음** — design-brief가 없고 새 화면 표면이 없다(spec 비목표). 화면 변화는 기존 수동 지정 목록의 라벨·예시뿐이라 레이아웃 QA도 두지 않는다. 가이드 영향은 T5.3(D, `/guide`).
7. **T1.4 재측정은 A가 자기 워크트리에서 고정 SHA로 돈다** — 지휘자 판단. 기준선은 main 체크아웃 `.scratch/adapter-survey-baseline/`(`learning-1.json`·`heldout-1.json`·`mobile-*.json`)이고 핀은 `docs/adapter-survey/pins*.json`이다.
8. **T1.5(Q)는 A가 dev에 push된 뒤 main 체크아웃에서 한다** — QA 동안 cherry-pick·build를 하지 않으므로 D의 통합은 Q 인계 뒤다.

## 배치

| 배치 | 항목 | 소유 파일 | 선행 | 모델·effort | 위치 | 상태 |
|---|---|---|---|---|---|---|
| A | T1.1 테스트 → T1.2 구현(`feat(adapters): add ARB catalog adapter`) → T1.3 껍데기 배선(`feat(adapters): wire the ARB adapter`, 사전 3벌은 `/translate` 모드 ①) → T1.4 고정 SHA 재측정(커밋 없음) | `lib/adapters/**` · T1.3 손 목록 전부(`lib/locales/add-plan.ts` · `lib/import/empty.ts` · `lib/onboarding/**` · `lib/survey/select.ts`(+테스트) · `lib/cli/gitlab-ci-input.ts` · `components/sources/sources-screen.tsx` · `lib/openapi` 스냅숏 · `messages/{en,ko,es}.tsx`) | — | Claude Opus 5.5 high — 불변식 예외(원본에서 나르는 `@key`)와 typecheck가 못 잡는 손 목록 전수 | 워크트리 `arb-A` | 대기 |
| D | T5.1 PRODUCT · T5.2 ARCHITECTURE(§1.9 표 제외) + CLAUDE.md 코어 원칙(`docs(CLAUDE)` + `pnpm sync:agents`) · T5.3 ACTIONS·DIRECTORY·README·가이드(`/guide` en·ko·es 한 커밋) — 문서별 커밋 | `docs/{PRODUCT,ARCHITECTURE,ACTIONS,DIRECTORY}.md` · `README.md` · `guide/**` · `CLAUDE.md`·`AGENTS.md` | — (§1.9 표는 A 통합 뒤 D2) | Claude Opus 5.5 medium — 불변식 문구를 넓히는 판단이 있다 | 워크트리 `arb-D` | 대기 |
| R | A 독립 리뷰(리포트 전용) | 없음 | A | Codex `gpt-6-astra` medium — 구현과 다른 패밀리 | `arb-A` 읽기 | 대기 |
| D2 | T5.2 남은 몫 — §1.9 재측정 표·판정, `contract.ts` 예외 행 근거 대조 | D와 같음 | A 통합 | D 터미널 재사용 | `arb-D` | 대기 |
| Q | T1.5 `/roundtrip` — Flutter brew 설치 · 폐기용 리포 생성 · 첫/둘째 Publish diff · `flutter gen-l10n` | 없음(리포 밖 폐기용 리포·dev DB 프로젝트 행) | A push | Claude Opus 5.5 medium — 실 호스트 절차가 길다 | main 체크아웃 | 대기 |

겹침: A ↔ D 0(결정 5). 1파: A ∥ D. A 완료 → R → (수정 라운드) → A 통합·push → Q 시작 + D2 보냄. Q 인계 → D 통합·push.

tasks ↔ 배치 대조: T1.1·T1.2·T1.3·T1.4→A · T1.5→Q · T5.1→D · T5.2→D+D2 · T5.3→D · T5 공통 검증→D 게이트 + 지휘자 통합 게이트. 주인 없는 항목 0.

## 진행

- Run `run_c66777ef86a4`. 1파 시작(2026-10-19): A `ctx_8c9849397b06`(워크트리 `arb-A`, claude-opus-5-5 high) · D `ctx_4bc57256ee52`(`arb-D`, claude-opus-5-5 medium) — 두 `launch.effective`가 요청과 같다. 브리프: main `.scratch/orch-arb/`.
- D 질문(가이드 굵은 라벨이 A의 사전 키를 요구) → **결정 9: ARB 사전 라벨은 en·ko·es 모두 `Flutter ARB`, 예시 `lib/l10n/app_{locale}.arb`, 가이드 커밋은 D2로 미룬다** — 지휘자 판단(제품명이라 번역하지 않는다, 기존 라벨 형). A에게 전달했고 A가 라벨을 인용해 확인했다(랜딩 본문 포맷 목록 `messages/en.tsx:689`도 A 몫).
