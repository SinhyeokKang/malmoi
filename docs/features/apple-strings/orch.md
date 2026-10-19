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
- **D 완료** — 문서별 커밋 10개(자체 리뷰 수정 3 + 사용자 요청 README 배지 정리 `679373ec`: formats 배지 제거, release · license · price · MCP · self-hosting 순), `gate: ok`(16406). 새 ARCHITECTURE §1.45. 지휘자가 CLAUDE.md 코어 원칙 diff를 직접 읽음 — 목록 추가뿐. 로컬 dev에 cherry-pick(push는 A와 함께 — xcstrings 서술이 코드보다 앞선다). 미룬 몫 → D2·D3: §3 단계 4 예산 문구(P) · §1.9 27차 · 가이드 · A/X 차이(특히 `duplicate-key` 갈래가 warning이면 오류 갈래 표·ACTIONS red/green 표, DIRECTORY 테스트 경로, 셀 삽입 판정 함수 이름). D 터미널 retain. 사본 `handoffs/handoff-D.md`.
- **P 완료** — `41e1e17e` perf(github): 한도 8 워커 풀, 결과는 입력 인덱스 자리(트리 순서 결정적), 실패 시 새 요청 중단 + 같은 오류로 전체 실패, UTF-8만이면 blob POST 0회 유지. 테스트 3건, `gate: ok`. 한도 근거(호출당 ~0.5s)는 가정 — 65파일 실소요는 Q1 몫. 리뷰는 R이 A와 함께. P 터미널 retain. 사본 `handoffs/handoff-P.md`.
- A 질문 → **결정 10: `apple-strings` 중복 키는 `duplicate-property`(warning, CI green)다** — 지휘자 판단(code-dict·ts-dict와 같은 근거: Apple은 나중 값이 이기고 write도 그 리터럴만 고쳐 잃는 값이 없다. design §2.1은 "보고"였지 실패가 아니었다). 정답 리포 PayForMe(중복 2)·CodenameOne(18)이 `duplicate-key`면 대상 CI가 영구 red다. design §2.1·ARCHITECTURE 오류 갈래 표·ACTIONS red/green 표는 D2.
- **A 완료** — 커밋 6개(`9189f31c` survey `.lproj` 그룹당 상한 12 · `f906673d` feat add · `f22b0163` refactor · `5b550677` Flutter 셸·샘플·번들 강등 · `7a31c227` 중복 키 경고(결정 10) · `9959e9ad` 기준선 갱신), `gate: ok`(16493 + 격리 922). 고정 SHA: 학습·홀드아웃 1순위 diff 0·metrics 바이트 동일 · ARB 14/14 유지 · `.strings` 정답 7/8(Telegram-iOS 2순위) · 고정점 100% · 손실 0 · `resource-limit` 0 · 삽입이 기존 바이트를 건드리지 않은 파일 130/130. ⚠️ 정답이 `.strings`가 아닌 8리포가 `-`/오탐 → Apple 1순위(정답을 빼앗은 리포 0 — xcstrings 정답 3은 X가, Android 정답 2(open-u60-pro·EasyWatermark)는 android-strings가 이겨야 한다). 계획과 다른 점 8개 → R이 판정. A 터미널 retain. 사본 `handoffs/handoff-A.md`.
- R `ctx_1432a8841915`(codex gpt-6-astra medium, A 6커밋 + P `41e1e17e`).
- **R 완료** — 🔴1(R1 `\u`·bare `\U`·`\400`을 Apple 파서와 다르게 디코드 — 키도 틀리게 적재) · 🟡5(Y1 CRLF 줄 주석 뒤 삽입이 CR/LF를 가름 · Y2 EOF 같은 offset 삽입 두 개 · Y3 비Apple 정답 5리포의 1순위 변경이 완료 조건 3 문구 위반 · Y4 첫 적재 시나리오가 DB 행에서 멈춤 · Y5 Flutter 2패스 테스트가 강등 분기를 안 밟음). P 차단 결함 없음(주석의 "60초를 넘긴다" 단정은 D2가 "가정"으로). 계획과 다른 점 1–8 전부 수용. 사본 `handoffs/review-A.md`. R 해제.
- **결정 11: `es_419`·`zh-Hant-TW`는 공용 `looksLikeLocale` 한계로 문서화하고 이 스펙에서 넓히지 않는다** — 지휘자 판단(기존 어댑터·locale-add·chrome-codes와 같은 판정, 공용 정책 확장은 범위 밖). 문서는 D2.
- A-fix1 `ctx_d9f2f948b036`(A 터미널 재사용 — R1·Y1·Y2·Y4·Y5). Y3은 사용자 결정 대기.
- **결정 12: 완료 조건 3을 "정답을 빼앗지 않는다 — `-`·오탐이 새 후보로 바뀐 것은 보고 대상"으로 완화한다** (2026-10-19 사용자). R Y3의 5리포(CodenameOne · google-api-objectivec · swift-package-manager · open-u60-pro · EasyWatermark)는 통과로 보고하고, Android 정답 둘(open-u60-pro·EasyWatermark)은 android-strings가 이겨야 할 항목으로 그 스펙에 넘긴다(런 마무리 때). spec 문구는 D2.
- **A-fix1 완료** — 커밋 3개(`6bd30d91` R1 디코더를 plutil 의미로 — 소문자 `\u`는 그대로, bare `\U`는 NUL, 8진은 NeXTSTEP 바이트 표(plutil 채록 128개), 짝 없는 서로게이트는 파일 명시 실패, 키·값 고정값 41개 · `56b07b58` Y1·Y2 · `8ca90f12` Y4·Y5 — 강등을 끄면 red 확인). `gate: ok`(16582 + 격리 923). 고정 SHA 네 코퍼스 1순위 diff 0·metrics 동일 → 기준선 커밋 그대로. 디코더가 의미를 크게 바꿔 수정분만 재리뷰 R2 `ctx_4bfde992eb4e`(codex gpt-6-astra medium, `9959e9ad..HEAD`).
- **R2 완료** — 🔴1(R2-1 8진 `\401`–`\775` 253개를 NUL로 오독 — Apple은 하위 8비트로 줄여 NeXTSTEP 표로 읽는다, 키·값 506건) · 🟡1(R2-2 표현 불가 리터럴의 진입점 회귀 테스트 부재 — 동작 자체는 fail-closed로 맞다). Y1·Y2·Y4·Y5 해소, 그 밖 이스케이프 1,316회·인코더 206회 Apple과 일치. 사본 `handoffs/review-A2.md`. R2 해제.
- A-fix2 `ctx_c30f87ada05a`(R2-1·R2-2). 수정이 좁고 기대값이 plutil 채록 표라 재리뷰 없이 지휘자가 diff·표 출처를 본다.
- **A-fix2 완료** — `250c3e1b` R2-1(8진 하위 8비트 → ASCII/NeXTSTEP, plutil 채록 512개를 키·값으로 단언) · `7b4676ef` R2-2(짝 없는 서로게이트: 렌더 `write-parse-failed` 그 파일만 · 미리보기 blocked · 실행 writer-warnings · Git 쓰기 0 · `push-local` exit 1 + `/api/push/failure` `parse-failed`, 템플릿 밖 대조는 막지 않음). `gate: ok`(16586 + 격리 925). 지휘자가 plutil 무작위 40개를 따로 채록해 디코더와 대조 — 불일치 0.
- **P·A dev 통합** — 14커밋 cherry-pick(`364b03fc..96f2711e`). main `pnpm gate` → `gate: ok`(격리 postgres 포함). tasks T2.0a–T2.3 체크(T2.0c는 D 문구).
- **push** `166366f5..e8d9b97c`(P + A + D + README 배지). P 워크트리·브랜치 정리, P 해제.
- 2파 시작: X `ctx_c1617a9a9844`(새 워크트리 `apple-X`, claude-opus-5-5 high — A 터미널은 컨텍스트가 찼고 Q1 결함용으로 남긴다) · Q1 `ctx_2cd29204845e`(main 체크아웃, claude-opus-5-5 medium — 폐기용 리포 `SinhyeokKang/i18n-strings-check` 생성 + GitLab `ox501501/malmoi-gitlab-test`에 UTF-16 파일) · D2 `ctx_a3c5956caef3`(D 터미널 재사용 — 시작 영수증은 `outcome_unknown`이었지만 터미널이 브리프 작업 중인 것을 확인). Q1이 main을 쓰는 동안 cherry-pick·build 금지.
- `e8d9b97c` dev CI success(run 39232996535).
- **D2 완료** — 문서별 커밋 6개(`f68406cc` ARCHITECTURE 27차 `.strings` 표·결정 10–12·이스케이프 의미·병렬 blob(0.5s 가정) · `3bb4f10c` ACTIONS · `3c81b969` DIRECTORY · `8def6c5a` PRODUCT · `d25997e8` spec/design · `9fa7673d` 가이드 en·ko·es + AUTHORING — `.strings`만), `gate: ok`(16589). 통합은 Q1 뒤(가이드는 앱이 서빙한다 — QA 중 HMR). D 터미널 retain, 미룬 몫은 D3. `lib/github.ts` 주석의 "60초를 넘긴다" 단정은 코드라 A-fix3 `ctx_065fa2355ca2`(A 터미널 재사용, 문구만).
- **A-fix3 완료** — `75fe70b4` chore(github): 주석을 "넘길 위험 · 0.5s는 가정"으로(동작 변화 없음), `gate: ok`. 통합은 Q1 뒤 D2와 함께. A 터미널 retain(Q1 결함용).
- Q1 escalation(차단 아님) → **결정 13: `apple-strings` 언어 추가·제거는 지원을 유지하고 문서화한다 — Xcode 프로젝트(`project.pbxproj`)에 그 `.lproj`를 등록·제거하는 것은 개발자 몫** (2026-10-19 사용자). 실측: 추가한 `fr.lproj`는 pbxproj에 등록하기 전엔 앱에 실리지 않고, 등록된 언어를 제거하면 PR이 파일만 지워 `xcodebuild`가 'Build input file cannot be found'로 실패한다. code-dict의 "앱 코드에서 언어를 등록" 규칙과 같다(Xcode 16 폴더 동기화 그룹은 예외일 수 있다). 가이드·README·PRODUCT §7.2 문구는 D3.
- **Q1 완료** — 새 폐기용 리포 `SinhyeokKang/i18n-strings-check`(private, Xcode 26.6 macOS 앱)로 GitHub 왕복 PR 5개 squash 머지: 셀 밖 hunk 0 · BOM·CRLF·인코딩 유지(UTF-16LE+BOM, UTF-16BE 무BOM) · 원격 blob = 머지 파일 = 로컬 렌더 해시 · `.stringsdict`·`Base.lproj` 그대로 · 중복 키는 뒤 리터럴만 · 누락 키 삽입(가운데·EOF) · `xcodebuild` green(fr 제거 뒤만 red — 결정 13). blob 한도 8은 바뀐 UTF-16 파일 1–2개라 측정 불가(Publish 9.5–11.4s, UTF-16 추가 비용 잡음 안). 사본 `handoffs/handoff-Q1.md`. Q1 터미널 retain(GitLab 재검증용).
- 🔴 **Q1 결함 D1: GitLab JSON blob·files API가 UTF-16 파일을 UTF-8+BOM으로 변환해 준다** — 원본은 `/repository/blobs/:sha/raw`만 준다. `lib/gitlab/client.ts` `readBlobText`가 JSON 엔드포인트라 편집 0에도 변경이 생기고 Publish가 파일 전체를 UTF-8+BOM으로 바꾼다(MR !29, 머지 안 하고 닫음). M3 계약 결함(mobile-strings) — 단위 테스트의 가짜 GitLab이 원본 바이트를 줬다. A-fix4 `ctx_587f37915af6`(A 터미널 재사용, `/raw`로 읽기 + 실제 GitLab 동작을 흉내 내는 가짜). POSTMORTEM 후보.
- **D2 + A-fix3 dev 통합** — Q1이 main을 놓은 뒤 7커밋 cherry-pick(`4095b32f..1030d6e9`). 문서 신선도: `d9f46e4a` roundtrip 전제 조건 1에 `i18n-strings-check`(+ 미러).
