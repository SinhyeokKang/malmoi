# android-strings — orch

원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 이 문서는 지휘 상태만 든다.

- 착수: 2026-10-19 · 시작 dev `d37f166d`(= origin/dev)
- 끝: dev push까지. `/merge`는 부르지 않는다 — 모바일 세 스펙 합동 머지(T5.6)와 그 앞뒤 T5.0·T5.1·T5.7·T5.5는 사용자가 부르는 `/merge` 단계다(결정 9).
- 스키마·환경변수 변경 없음. 패키지 하나(`@xml-tools/parser`, design §7) — SELF-HOSTING §3 체크리스트는 A가 지난다.

## 결정 기록

1. **패밀리 교차 허용 — Astra를 적극적으로 쓴다** (2026-10-19 사용자 — "Codex 허가. astra 좀 더 적극적으로 사용해도 괜찮아"). 구현·리뷰 워커를 Claude(Sonnet·Opus)와 Codex(`gpt-6-astra`, effort 상한 medium) 사이에서 고른다. 앞 두 런은 Astra를 리뷰에만 썼고, 이번엔 화면·저장 배치(B·C·E) 구현도 Astra가 맡는다. 독립 리뷰는 구현과 다른 패밀리다.
2. **Compose Multiplatform `composeResources/values-{locale}/strings.xml`을 범위에 넣는다** (2026-10-19 사용자). T3.4가 "착수 전 정한다"고 남긴 항목이다. A가 탐지·`basePath`·진입점 테스트·재측정 범위에 넣는다(모바일 코퍼스 Meshtastic). 한정자 규칙이 `res/`와 다른 곳은 A가 실측해 인계의 "계획과 다른 점"에 적는다.
3. **T3.5는 JDK·Android SDK를 brew로 설치하고 폐기용 리포를 새로 만든다** (2026-10-19 사용자). `temurin@21` cask + `android-commandlinetools` cask → `sdkmanager`로 platform·build-tools. 새 리포 `SinhyeokKang/i18n-android-check`(private) — `malmoi-sync-dev` 설치 대상 추가는 콘솔이라 Q가 그 지점에서 묻는다. 만든 리포는 roundtrip 전제 조건 1의 목록에 올린다(Q 인계 → 지휘자 커밋).
4. **T3.3 인라인 태그 판정은 새 파일 `lib/keys/android-inline-tags.ts`에 둔다** — 지휘자 판단. design §6은 어댑터 파일을 적었지만, 그러면 E가 A의 `lib/adapters/**`와 겹쳐 1파 병렬이 깨진다. 판정은 순수 문자열 함수라 어댑터 토크나이저에 기대지 않는다. design §6 문구는 D2가 고친다.
5. **`planBaseLocaleChange`의 Android 거부(T3.2c 앞부분)는 B가 든다** — 지휘자 판단. 함수가 `lib/onboarding/base-locale.ts`에 있고 B가 같은 파일(기준 언어 입력)을 고친다. C는 T3.2c 나머지(프리셋 철자·`judgeAdd`)를 든다.
6. **`messages/{en,ko,es}.tsx`는 절 단위로 나눠 병렬을 허용한다** — 지휘자 판단. 세 사전은 거의 모든 배치가 건드리지만, 이번 배치들의 절이 서로 떨어져 있다: A = 포맷 라벨·수동 지정 목록·`unsupported-format`·랜딩 포맷 나열 · E = `translations.workspace.footer.*` · B = 온보딩 ③·Add sources·Sources Path pattern·기준 언어 변경 거부 문구 · C = 언어 추가 Dialog. 다른 배치의 절은 건드리지 않는다. cherry-pick 충돌이 나면 지휘자가 풀지 않고 뒤 배치 워커가 `git rebase dev`로 푼다.
7. **Flutter 셸 강등(`isFlutterShell`)을 `android/`에 걸지는 A가 T3.1에서 테스트로 정한다** — 지휘자 판단. 판정 기준은 spec 완료 조건 3(ARB·Apple 정답 리포의 1순위 불변)이고 재측정이 증거다.
8. **중복 `name`은 design대로 `duplicate-key` 실패다. 단 A가 코퍼스에서 정답 리포의 중복 수를 센다** — 지휘자 판단. Apple은 플랫폼이 중복을 받아(나중 값 승리) 경고로 낮췄지만(apple 결정 10), aapt2는 같은 리소스의 중복을 빌드 오류로 낸다 — 대상 리포 빌드가 이미 red인 입력이다. 정답 리포에 중복이 있으면(빌드가 받는 형이라는 뜻) A가 `ask`로 올린다.
9. **T5.0·T5.1·T5.5·T5.6·T5.7은 이 런 밖이다** — 지휘자 판단. 지휘자는 `/merge`를 부르지 않고(prod 표면 조회인 T5.0도 prod DB를 겨누는 워커 지시 금지에 걸린다), 태그·SHA 후속 패치·폴더 삭제는 그 머지 뒤 순서다(design §8). 이 런은 T5.2–T5.4 문서까지 하고, 리포트에 `/merge` 준비물로 남긴다.
10. **`resConfigs`·`localeFilters`로 언어를 좁힌 앱의 언어 추가는 개발자 몫으로 문서화한다** — 지휘자 판단(apple 결정 13 — `project.pbxproj` 등록 — 과 같은 부류). D가 문구를 쓰고 Q가 실물에서 확인한다.
11. **DS 행 없음** — design-brief가 없고 시안 핸드오프가 없다(spec 비목표 — ③ 입력은 기존 프리미티브 조립). 화면 변화(③·Add sources 입력, Sources base 줄, 저장 거부 Alert, 언어 추가 프리셋)는 Q의 `/runtime-test` 항목으로 본다.
12. **Q는 단일 워커다** — `/runtime-test`(T3.2b·T3.3 수동 항목) 뒤 `/roundtrip`(T3.5)을 한 터미널에서 잇는다(ego 세션 공유).
13. **인라인 태그 비교 기준은 기준 언어 셀의 저장 후 값이다(같은 저장의 base 변경 포함, 비면 `sourceText` 폴백)** — 지휘자 판단(E 질문). design §3.1 "비교 기준이 그 셀이다"가 답한다.

## 배치

| 배치 | 항목 | 소유 파일 | 선행 | 모델·effort | 위치 | 상태 |
|---|---|---|---|---|---|---|
| A | T3.0d 파서 실측 → T3.1 테스트 → T3.2 구현·배선(`feat(adapters): add Android strings adapter`, 사전은 `/translate` 모드 ①) → T3.4 고정 SHA 재측정 + 기준선 갱신 커밋. 결정 2·7·8 | `lib/adapters/**` · arb T1.3 손 목록 + "실측 정정"(`lib/locales/add-plan.ts`(`SUPPORTED_ADAPTERS`만) · `lib/import/**` · `lib/onboarding-run/**` · `lib/onboarding/language-name.ts` · `lib/keys/flag.ts` · text-direction · `lib/survey/**` · `lib/pull/**` · `lib/publish/**` · `lib/mcp/tools/locales.ts`(설명) · `lib/openapi` 스냅숏 · `messages/**`의 A 절) · `package.json`·lockfile · `docs/adapter-survey/baseline/**` | — | Claude Opus 5.5 high — 토크나이저·삽입·이스케이프 의미·probe 예산·불변식 | 워크트리 `android-A` | 대기 |
| E | T3.3 저장 검증 — 판정 `lib/keys/android-inline-tags.ts`(결정 4) + `lib/keys/save.ts` 코어(`KeySavePlan` 새 코드) + 웹(`workspace.tsx` footer Alert·`aria-invalid`) + MCP(`lib/mcp/batch.ts`·`lib/mcp/tools/translations.ts` 영어 응답) + 사전 E 절. 어댑터 이름 비교는 문자열(`"android-strings"`)로 — A의 `AdapterName` 추가를 기다리지 않는다 | 위 파일 + 그 테스트 | — | Codex `gpt-6-astra` medium — 범위가 닫힌 코어·껍데기 배선(결정 1) | 워크트리 `android-E` | 대기 |
| D | T5.2 PRODUCT · T5.3 ARCHITECTURE(§1.9 표 제외) + CLAUDE.md 코어 원칙·스택 표(`docs(CLAUDE)` + `pnpm sync:agents`) · T5.4 ACTIONS·DIRECTORY·README(가이드 제외) — 문서별 커밋. 결정 10 문구 | `docs/{PRODUCT,ARCHITECTURE,ACTIONS,DIRECTORY}.md` · `README.md` · `CLAUDE.md`·`AGENTS.md` | — | Claude Opus 5.5 medium — 불변식 표면 목록을 넓히는 판단 | 워크트리 `android-D` | 대기 |
| R | A 독립 리뷰(리포트 전용) | 없음 | A | Codex `gpt-6-astra` medium — 구현과 다른 패밀리 | `android-A` 읽기 | 대기 |
| RE | E 독립 리뷰 | 없음 | E | Claude Opus 5.5 high — 구현과 다른 패밀리 | `android-E` 읽기 | 대기 |
| B | T3.2b 기준 언어 코드 입력(온보딩 ③·Add sources·수동 지정 `basePath` 유도·CLI `--base` 필수·생성 워크플로 `base-locale`·Sources base 줄·MCP 소스 목록·`lib/sources/query.ts`) + T3.2c의 `planBaseLocaleChange` 거부(결정 5) + 사전 B 절 | `lib/onboarding/**`(language-name 제외) · `components/onboarding/**` · `components/sources/{add-sources-modal,source-detail-modal,sources-screen}.tsx` · `lib/cli/**` · `lib/push/payload.ts` · `lib/mcp/tools/{project,onboarding,sources}.ts` · `lib/sources/**` · `lib/settings/message.ts` | A 통합 | Codex `gpt-6-astra` medium — 자리가 많지만 판정은 design이 정했다(결정 1) | 새 워크트리 `android-B` | 대기 |
| C | T3.2c 나머지 — Android 프리셋 `r` 철자·레거시 표(`he→iw`·`id→in`·`yi→ji`) · `judgeAdd`의 `r` 없는 지역 거부(웹·MCP 공통) · 언어 추가 Dialog + 사전 C 절 | `lib/locales/{presets,add-plan}.ts`(+테스트) · `components/sources/add-locale-dialog.tsx` | A 통합 | Codex `gpt-6-astra` medium — 좁은 순수 판정 | 새 워크트리 `android-C`(E 터미널이 비었으면 재사용) | 대기 |
| RBC | B + C 독립 리뷰 | 없음 | B·C | Claude Opus 5.5 high | `android-B`·`android-C` 읽기 | 대기 |
| Q | `/runtime-test`(③ 입력 · Add sources 입력 — `values/`만 있는 소스 추가, 제거 후 재추가 복구 · Sources base 줄 · 저장 거부 표시 · 언어 추가 프리셋) → T3.5 `/roundtrip`(SDK 설치·`i18n-android-check` 생성·`assembleDebug`, GitHub + GitLab) | 없음(리포 밖 폐기용 리포·dev DB 프로젝트 행) | A·B·C·E push | Claude Opus 5.5 medium — 실 호스트 절차가 길다 | main 체크아웃 | 대기 |
| D2 | 미룬 몫 — ARCHITECTURE §1.9 재측정 표 · 가이드 `/guide` en·ko·es + AUTHORING 행(라벨이 dev에 들어간 뒤) · 배치들이 design과 달라진 점(결정 4 포함) · spec/design 결정 기록 | D와 같음 + `guide/**` · `docs/features/android-strings/{spec,design}.md` | A·B·C·E 통합 | D 터미널 재사용 | `android-D` | 대기 |

겹침: A ↔ E는 사전만(결정 6), A·E ↔ D 0, A ↔ B·C는 손 목록 전부(직렬), B ↔ C는 사전만(결정 5·6).
1파: A ∥ E ∥ D. E 완료 → RE → (수정). A 완료 → R → (수정) → A·E·D 통합·push → 2파 B ∥ C. B·C 완료 → RBC → (수정) → 통합·push → Q ∥ D2. Q 인계 → D2 통합·push.

tasks ↔ 배치 대조: T3.0d·T3.1·T3.2·T3.4→A · T3.2b→B(+수동 Q) · T3.2c→B(`planBaseLocaleChange`)+C · T3.3→E(+수동 Q) · T3.5→Q · T5.2·T5.3·T5.4→D+D2 · T5.0·T5.1·T5.5·T5.6·T5.7→런 밖 `/merge` 단계(결정 9) · T5 공통 검증→D 게이트 + 지휘자 통합 게이트. 주인 없는 항목 0.

## 진행

- Run `run_5dd3cac02b8d`. 1파 시작(2026-10-19): A `ctx_71ce4ee6b0c2`(`android-A`, claude-opus-5-5 high) · E `ctx_ede863319b6b`(`android-E`, codex gpt-6-astra medium) · D `ctx_507e691701cf`(`android-D`, claude-opus-5-5 medium) — 세 `launch.effective`가 요청과 같다. 브리프: main `.scratch/orch-android/`.
