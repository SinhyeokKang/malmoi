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
- **D 완료** — 문서별 커밋 6개(`aa7e016a` PRODUCT · `cef50790` ARCHITECTURE(새 §1.37, 불변식 2·4 확장) · `5b27d9d9` CLAUDE+AGENTS · `6d073887` ACTIONS · `41b6a57a` DIRECTORY · `9d752aec` README), `gate: ok`(16328). 지휘자가 불변식 문구 diff를 직접 읽음 — "키마다 출처 하나·고르는 코드 없음" 근거 유지. 미룬 5개 → D2(가이드 en·ko·es + AUTHORING 행 · §1.9 표·§1 어댑터 표 "덮는 대상" 칸 · `contract.ts` 예외 행 대조 · §1.1 "다섯 어댑터" 문장 · DIRECTORY 테스트 파일 이름). D 터미널 retain.
- **A 완료** — 커밋 3개(`ee504bf3` feat add · `4b8a3449` feat wire · `ab009199` refactor — `/code-review` 🔴1: `l10n.yaml`을 거르기 대신 순서로), dev `69518daf` 위 rebase, `gate: ok`(16386 + 격리 914). T1.4 고정 SHA: 학습·홀드아웃 1순위 diff 0 · `metrics` 바이트 동일(원자료 차이 2리포는 ARB 무관 — 기준선 뒤 dev의 인코딩 변경) · 모바일 ARB 1순위 10/10 · 4/4 · ARB 고정점 100% · 조용한 손실 0 · `resource-limit` 1(smooth-app 38MB > 첫 적재 10MB 예산 — 공용 규칙, 손대지 않음). 원자료 `.scratch/orch-arb/survey-A/`. 계획과 다른 점 9개 → R이 판정. 사본 `handoffs/handoff-A.md`.
- **결정 10: 비-base 파일에서 그 언어 번역이 없는 키의 `@key`는 키가 살아 있으면(orphaned 아님) 원본 바이트 그대로 남긴다** (2026-10-19 사용자). design §2 규칙 그대로면 첫 Publish가 fluffychat `@key` 5,251 · smooth-app 2,574개를 지운다(Weblate류가 전 언어에 복제). 버리는 것은 orphaned·표면에 없는 키의 `@key`뿐이다. design §2·ARCHITECTURE §1.37 문구는 D2가 고친다.
- **결정 11: 첫 Publish의 그 밖 정규화(빈 줄 제거 · 혼합 들여쓰기 통일 · 비-base를 base 키 순서로 · 끝 개행 · 빈 값 제거)는 허용한다** — 지휘자 판단(json-catalog 등 기존 재생성 어댑터가 이미 하는 표현 정규화와 같은 부류이고, 셀 밖 의미 변화가 없다). spec 완료 조건 1의 문구는 D2가 고친다.
- A-fix1 `ctx_6ece85c04583`(A 터미널 재사용, 결정 10) ∥ R `ctx_af0c96c3bcc9`(codex gpt-6-astra medium, A의 첫 세 커밋만, 결정 10·11은 결함으로 치지 않게 알림).
- **R 완료** — 🔴0 · 🟡5(R1 `l10n.yaml` 대상이 probe 상한 밖이면 탈락 · R2 `en_gb.arb`가 `gb`로 갈림 · R3 `template-arb-file` 기준 언어 미구현 · R4 비-base 정렬이 `@@*` 상대 순서를 뒤집음 · R5 확정→적재→언어 추가·제거→Publish 시나리오 부재) · ⚪(`contract.ts` 표에 비문자열 원본 보존 예외). 병합 없음 위반 없음, 기존 129리포 SHA·1순위·metrics 일치 재확인. 사본 `handoffs/review-A.md`. R 해제.
- **결정 12: R이 "사용자 결정"으로 올린 셋(R2·R3·R4)은 계획대로 구현한다** — 지휘자 판단(리뷰 권고도 같고, design §2·raw 코드 정책이 이미 답한다 — 범위 축소가 아니다). A-fix2 브리프 `brief-A-fix2.md`, fix1 완료 뒤 보낸다.
- A-fix1 질문 → **결정 13: 표면에 같은 이름의 키가 없는 `@x`(smooth-app의 `"@Introduction screen": {}` 같은 섹션 주석)는 `@@*`처럼 원본 위치에 바이트 그대로 나른다. 버리는 것은 orphaned 키의 `@key`뿐이다** — 지휘자 판단(결정 10의 취지 — 리포가 요청하지 않은 첫 Publish 삭제를 만들지 않는다 — 를 같은 부류에 적용한 것이고, 출처가 원본 하나라 병합이 아니다). 결과로 fluffychat의 낡은 `@key` 280개(키가 base에 없음)도 첫 적재에서는 남는다.
- **A-fix1 완료** — `71c3ebe5`(dev `c3d21227` 위 rebase): 렌더가 이미 읽은 키에서 `WriteInput.untranslated`(비-base)·`orphaned`를 넘긴다 — 값이 아니라 키의 생사라 견줘 고르는 코드가 없다(지휘자가 diff 확인). 첫 Publish `@key` 제거 fluffychat 5,251→0 · smooth-app 2,705→0 · ARB 14리포 전부 0, 손실 0, 고정점 100%, `resource-limit` 1 그대로. `gate: ok`(16390 + 격리 914).
- A-fix2 `ctx_ac5c9ea7b237`(R1–R5 + ⚪, A 터미널 재사용).
- **A-fix2 완료** — 커밋 5개(`0144d8c0` R4 `@@*` 상대 순서 + ⚪5 · `b922b36c` R2 형제 증거로 로케일 분리 · `2ed207a7` R3 `DetectedFormat.templateLocale` · `cd4dc48e` R1 `l10n.yaml` 먼저 읽고 설정 대상을 probe 예산 안으로 · `842fddb0` R5 격리 Postgres 시나리오 확정→첫 적재→언어 추가·제거→Publish 바이트). 고정 SHA 학습·홀드아웃 1순위 diff 0 · metrics 바이트 동일 · 모바일 ARB 1순위 14/14 · 고정점 20/20 · 손실 0 · `resource-limit` 1. `gate: ok`(16401 + 격리 918). A 터미널 retain.
- 수정이 탐지 진입점에 걸쳐 수정분만 재검증 R2 `ctx_6f1ffc25938a`(codex gpt-6-astra medium, `ab009199..HEAD`).
- **R2 완료** — 🔴0 · 🟡3(Y1 `l10n.yaml` 선행 읽기가 합계 10MB 예산을 두 번 새로 시작 · Y2 스모크가 설정을 예산 검사 밖에서 읽음 · Y3 형제 점수가 같은 디렉터리의 `app_*`·bare 파일군을 하나로 합침) · ⚪ `types.ts` 주석. R1–R5·⚪5 해소 확인, 병합 없음 위반 없음. 사본 `handoffs/review-A2.md`. R2 해제.
- A-fix3 `ctx_06a53e364a67`(Y1–Y3 + ⚪).
- **A-fix3 완료** — 커밋 4개(`dd9beb52` Y3 접두사·bare 파일군 분리, 템플릿을 증거로 · `68e4f055` Y1 `readFiles(prior)`로 설정과 표본을 한 예산으로 · `edddcecb` Y2 스모크도 같은 예산 · `22cd4e9f` 주석). 고정 SHA 1순위 diff 0 · metrics 동일 · 모바일 출력 fix2와 바이트 동일. `gate: ok`(16406 + 격리 918). 지휘자가 Y1 diff를 직접 보고 재리뷰 없이 통합(설정 크기를 한 번 더 묻는 것은 사소).
- **A dev 통합** — 13커밋 cherry-pick(`..3683232b`). main `pnpm gate` → `gate: ok`. tasks T1.1–T1.4 체크.
- **D dev 통합** — Q가 main 체크아웃을 쓰기 전이라 문서 6커밋을 앞당겨 cherry-pick(`..32c54bbd`). 결정 8의 "D 통합은 Q 뒤"는 Q가 main을 쓰는 동안만의 제약이다. D2(미룬 5개 + 결정 10·11·13 문구)는 Q와 병렬로 워크트리에서 한다.
- **push** `1edbb640..1afa0dca`(A + D).
- Q `ctx_bf2e91e3e9ce`(main 체크아웃, claude-opus-5-5 medium — Flutter brew 설치 · `SinhyeokKang/i18n-arb-check` private 생성 · App 설치 대상 추가는 사용자에게 묻는다) ∥ D2 `ctx_e10266d7180f`(D 터미널 재사용). A 터미널은 Q 결함용으로 retain. Q가 main을 쓰는 동안 cherry-pick·build 금지.
- **D2 완료** — 커밋 4개(`8be4dfaf` ARCHITECTURE 26차 재측정 표·§1.37 결정 10/11/13 반영 · `69a401a6` DIRECTORY · `20168855` spec/design 결정 기록 · `974cd8c4` 가이드 en·ko·es + AUTHORING), `gate: ok`(16406). 통합은 Q 뒤(main 사용 중). D 터미널 해제, 워크트리는 통합 뒤 정리.
- `1afa0dca` dev CI success(run 39213321642).
- **Q 완료** — 결함 0. 새 폐기용 리포 `SinhyeokKang/i18n-arb-check`(private, Flutter 3.47.7 brew cask)로 프로젝트 `rt-arb`(MCP) 왕복: Publish #1 PR +3/−3 = 셀 2 + 허용 정규화(`@greeting`을 키 뒤로) 하나, `@key`·`@@*`·섹션 주석 바이트 보존 · ko 미번역 키의 `@farewell` 유지 · ja `@@locale` 미추가 · Publish #2 PR +1/−1 셀만 · es 추가(PR #3, `@@locale` es, `@key` 없음)·제거(PR #4) · 원격 blob = 로컬 렌더 해시 · 재pull upToDate · `flutter gen-l10n`·`flutter analyze` 매번 통과. **대체 둘**: 언어 추가·토큰 발급을 화면이 아닌 같은 코어(MCP·`planApiTokenIssue`)로 했다 — ego 세션이 로그인 OAuth를 못 지난다. CI 방향 스킵(v3 action이 `arb-catalog`를 모른다 — 합동 릴리스 전). dev DB: `rt-arb` 생성 후 보관, MCP 토큰 발급·삭제. `malmoi-sync-dev`는 이미 전체 리포 설치라 콘솔 추가가 필요 없었다(Q가 질문을 철회). 사본 `handoffs/handoff-Q.md`. Q 해제.
- 문서 신선도: `09b6c22f` roundtrip 전제 조건 1에 `i18n-arb-check`. ⚠️ 남김: roundtrip 2·4단계의 `/api/pull` 응답 서술(`status:"skipped",reason:"no-edits"` 배열)이 지금 응답(`{results:[{action:"skip",outcome:"upToDate"}]}`)과 다르다 — nightly-sync 이후 드리프트, arb 무관이라 `/doc-check` 후보.
- **D2 dev 통합** — 4커밋 cherry-pick(`..93730536`). tasks T1.5·T5.1–T5.3 체크 — 체크 안 된 항목 0.
