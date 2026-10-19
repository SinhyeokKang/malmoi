# apple-strings — orch

원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 이 문서는 지휘 상태만 든다.

- 착수: 2026-10-19 · 시작 dev `166366f5`
- 끝: dev push까지. `/merge`는 부르지 않는다 — 모바일 세 스펙 합동 머지는 android-strings T5에서 한 번이다(spec 머리).
- 스키마·환경변수·패키지 변경 없음(design §7).

## 결정 기록

1. **패밀리 교차 허용** (2026-10-19 사용자 — "Codex 허가"). 구현·리뷰 워커를 Claude(Sonnet·Opus)와 Codex(`gpt-6-astra`, effort 상한 medium) 사이에서 고른다. 독립 리뷰는 구현과 다른 패밀리로 맡긴다(arb 런의 리듬 — tasks 머리).
2. **T2.0b(survey `.strings` 수집 상한)는 A가 든다** — 지휘자 판단. T2.2가 같은 `lib/survey/select.ts`를 고친다(tasks 머리의 겹침). 그래서 인코딩 경계 배치 P는 T2.0a(`lib/github.ts`) 하나다.
3. **T2.0a·T2.0c의 ARCHITECTURE 문구는 D가 든다** — 지휘자 판단(파일 소유 하나). T2.0c는 문구만 고치는 항목이라 코드가 없고, T2.0a의 §3 Publish 단계 4 예산 문구는 P가 고른 병렬 한도를 보고 써야 하므로 D의 미룬 항목이다(P 통합 뒤).
4. **xcstrings(X: T4.0–T4.3 재측정)는 A가 dev에 통합된 뒤 새 워크트리에서 시작한다** — 지휘자 판단. 손 목록·`contract.ts`·`messages/**`·`lib/pull/run.ts`가 A와 전부 겹친다.
5. **A는 docs/·README·guide/·CLAUDE.md·AGENTS.md를 건드리지 않고(예외: `docs/adapter-survey/baseline/**` — T2.3 산출물), D는 코드·`messages/**`·`docs/adapter-survey/**`를 건드리지 않는다** — 지휘자 판단(arb 결정 5와 같다).
6. **D는 1파에서 A·P와 병렬로 시작한다** — 지휘자 판단. 지원 포맷 목록·불변식 표면 목록·셀 삽입 규칙은 design이 정한 사실이다. 측정 결과(§1.9 27차)·P의 병렬 한도·가이드(사전 라벨이 dev에 들어간 뒤)·X가 design과 달라진 점은 D의 미룬 항목으로 남기고 통합 뒤 새 Dispatch(D2·D3)로 보낸다.
7. **DS 행 없음** — design-brief가 없고 새 화면 표면이 없다(spec 비목표). 화면 변화는 기존 수동 지정 목록의 라벨·예시뿐이라 레이아웃 QA도 두지 않는다.
8. **재측정(T2.3·T4.3 앞부분)은 구현 워커가 자기 워크트리에서 고정 SHA로 돈다** — 지휘자 판단(arb 결정 7). 기준선은 커밋된 `docs/adapter-survey/baseline/`이고 갱신 커밋도 그 워커가 낸다.
9. **실물(T2.4·T4.3 `/roundtrip`)은 해당 배치가 dev에 push된 뒤 main 체크아웃의 QA 워커가 한다** — 지휘자 판단. Xcode 26.6이 이 머신에 있다(`xcodebuild -version`). 폐기용 리포 `SinhyeokKang/i18n-strings-check`(private)를 새로 만들고, GitLab은 기존 `ox501501/malmoi-gitlab-test`에 UTF-16 파일을 더한다 — tasks T2.4가 이미 정했다. 프로젝트 생성·언어 추가는 MCP(같은 코어)로 한다(arb 런 — ego 세션이 로그인 OAuth를 못 지난다).

## 배치

| 배치 | 항목 | 소유 파일 | 선행 | 모델·effort | 위치 | 상태 |
|---|---|---|---|---|---|---|
| P | T2.0a UTF-16 blob 제한 병렬(+ "UTF-8만이면 blob POST 0회" 단언 유지) | `lib/github.ts` + 그 테스트 | — | Claude Sonnet 5.5 medium — 범위가 좁은 기계적 변경 | 워크트리 `apple-P` | 대기 |
| A | T2.0b → T2.1 테스트 → T2.2 구현·배선(`feat(adapters): add Apple strings adapter`, 사전 3벌은 `/translate` 모드 ①) → T2.3 고정 SHA 재측정 + 기준선 갱신 커밋 | `lib/adapters/**` · arb T1.3 손 목록 + "실측 정정" 전부(`lib/locales/**` · `lib/import/**` · `lib/onboarding/**` · `lib/onboarding-run/**` · `lib/survey/**` · `lib/cli/**` · `lib/pull/**` · `lib/publish/**` · `lib/mcp/**` · `components/sources/**` · `lib/openapi` 스냅숏 · `messages/{en,ko,es}.tsx`) · `docs/adapter-survey/baseline/**` | — | Claude Opus 5.5 high — 토크나이저·삽입 규칙·probe 예산 진입점 | 워크트리 `apple-A` | 대기 |
| D | T5.1 PRODUCT · T5.2 ARCHITECTURE(§1.9 표 제외, T2.0c 문구 포함) + CLAUDE.md 코어 원칙(`docs(CLAUDE)` + `pnpm sync:agents`) · T5.3 ACTIONS·DIRECTORY·README — 문서별 커밋 | `docs/{PRODUCT,ARCHITECTURE,ACTIONS,DIRECTORY}.md` · `README.md` · `guide/**` · `CLAUDE.md`·`AGENTS.md` | — | Claude Opus 5.5 medium — 불변식 표면 목록을 넓히는 판단 | 워크트리 `apple-D` | 대기 |
| R | P + A 독립 리뷰(리포트 전용) | 없음 | A·P | Codex `gpt-6-astra` medium — 구현과 다른 패밀리 | `apple-A` 읽기 | 대기 |
| Q1 | T2.4 `/roundtrip` — UTF-8·UTF-16 `.strings`, GitHub + GitLab base64 바이트, `xcodebuild` | 없음(리포 밖 폐기용 리포·dev DB 프로젝트 행) | P·A push | Claude Opus 5.5 medium — 실 호스트 절차가 길다 | main 체크아웃 | 대기 |
| D2 | 미룬 몫 — T2.0a 예산 문구 · §1.9 27차 `.strings` 재측정 표 · 가이드 `/guide` en·ko·es + AUTHORING 행 · A가 design과 달라진 점 | D와 같음 | P·A 통합 | D 터미널 재사용 | `apple-D` | 대기 |
| X | T4.0 서식 채록 → T4.1 테스트 → T4.2 구현·배선(`feat(adapters): add Apple xcstrings adapter`) → T4.3 앞부분 고정 SHA 재측정 + 기준선 갱신 | A와 같음 | A 통합 | Claude Opus 5.5 high — 셀 삽입 판정이 경로 선택·미리보기·토큰 해제에 걸친다 | 새 워크트리 `apple-X` | 대기 |
| RX | X 독립 리뷰 | 없음 | X | Codex `gpt-6-astra` medium | `apple-X` 읽기 | 대기 |
| Q2 | T4.3 뒷부분 `/roundtrip` — Malmoi PR 머지 뒤 Xcode로 열어 저장해도 diff 0 | Q1과 같음 | X push | Q1 터미널 재사용(컨텍스트가 차면 새 워커) | main 체크아웃 | 대기 |
| D3 | 미룬 몫 — §1.9 27차 xcstrings 표 · 가이드의 xcstrings 라벨 · X가 design과 달라진 점 | D와 같음 | X 통합 | D 터미널 재사용 | `apple-D` | 대기 |

겹침: P ↔ A 0(결정 2) · A·P ↔ D 0(결정 5) · A ↔ X 전부(결정 4 — 직렬).
1파: P ∥ A ∥ D. P·A 완료 → R → (수정 라운드) → P·A·D 통합·push → Q1 ∥ X ∥ D2. X 완료 → RX → (수정) → (Q1 인계 뒤) X·D2 통합·push → Q2 ∥ D3 → 통합·push.

tasks ↔ 배치 대조: T2.0a→P(+문구 D2) · T2.0b→A · T2.0c→D · T2.1·T2.2·T2.3→A · T2.4→Q1 · T4.0·T4.1·T4.2→X · T4.3→X(재측정)+Q2(실물) · T5.1→D · T5.2→D+D2+D3 · T5.3→D+D2+D3 · T5 공통 검증→D 게이트 + 지휘자 통합 게이트. 주인 없는 항목 0.

## 진행

- Run `run_938a8005f330`. 1파 시작(2026-10-19): A `ctx_39bb35af4e90`(`apple-A`, claude-opus-5-5 high) · P `ctx_da25b17ad8a7`(`apple-P`, claude-sonnet-5-5 medium) · D `ctx_aa191565e708`(`apple-D`, claude-opus-5-5 medium) — 세 `launch.effective`가 요청과 같다. 브리프: main `.scratch/orch-apple/`.
