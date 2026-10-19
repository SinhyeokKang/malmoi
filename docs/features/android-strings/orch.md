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
14. **값 표현 보완(design §3): DB·화면 값에서 `<…>`는 언제나 진짜 자식 태그다. 글자 `<`는 DB 값에 `&lt;` 그대로 둔다(`&lt;`·`&#60;`·`&#x3C;`를 풀지 않는다)** (2026-10-19 사용자, RE U1). 엔티티를 다 풀면 파일의 `&lt;b&gt;`(Html.fromHtml용 글자)와 자식 태그 `<b>`가 같은 DB 문자열이 되어, 셀을 고친 Publish가 글자↔태그를 뒤집고 저장 검증도 둘을 못 가린다. 나머지 엔티티(`&amp;` 등)의 표현은 A가 고정점 계약 안에서 정하고 인계에 문법을 적는다. 태그를 시작하지 못하는 `<`가 든 Android 셀 저장은 E가 거부한다.
15. **기준 값이 태그 열로 파싱되지 않으면 태그 불일치 비교를 건너뛴다(쓸 수 있는가만 본다)** — 지휘자 판단(RE U2 → E-fix2 질문으로 갱신: 처음엔 토큰 멀티셋 비교였다). 결정 21로 깨진 기준은 저장으로 더 생기지 않아 옛 데이터에만 남는 경로이고, 멀티셋 비교는 `&lt;`로 쓴 글자를 태그와 등치하는 규칙을 새로 요구했다.
16. **NewPipe의 `shared/src/commonMain/composeResources/values-{locale}/strings.xml`(110로케일)은 정답(`alsoValid`)으로 판정한다** — 지휘자 판단(결정 2로 composeResources가 범위에 들어왔고, 그 리포의 실제 공유 문자열 집합이다. 순위 신호(로케일 수)를 그 한 리포 때문에 바꾸지 않는다). 판정 JSON 갱신은 A의 수정 라운드, `/merge` 전 사용자 검수 대상(`repos.md` "검수 대기 판정")에 올린다.
17. **E의 저장 판정은 A의 태그 문법(`lib/adapters/android-strings.ts`의 `TAG`)과 같은 규칙이어야 한다** — 지휘자 판단. 지금 E는 태그 이름에 `\p{L}`을 받아 `<한글>`을 태그로 통과시키고 A의 인코더는 그 셀을 `write-parse-failed`로 낸다 — 저장은 되는데 Publish가 실패한다. A 통합 뒤 E가 rebase해 같은 판정을 쓴다(E-fix2).
18. **새 언어 파일 생성·누락 키 삽입은 기준 파일 `<string>`의 `formatted` 속성을 바이트 그대로 나른다** (2026-10-19 사용자, R Y1). 값은 DB에서만 온다. 코드가 소유한 키 메타데이터이고 DB에 짝이 없어 키마다 출처가 하나다(arb `@key`와 같은 부류 — 병합 아님). 빼면 `%s %d` 같은 값의 새 파일이 aapt2 빌드 오류다. 기존 create 결정("뼈대만 + 값 있는 키만")을 이 한 속성만큼 넓힌다.
19. **A는 B와 함께 push한다 — B가 dev에 들어가기 전에는 push하지 않는다** — 지휘자 판단(R R3, 리뷰 권고). A만 배포되면 온보딩이 `values-*` 코드를 Android 기준으로 확정해 `values/`를 다른 언어로 조용히 적재한다(R 재현: de → English). 임시 서버 가드보다 배포 묶음이 단순하다. A·E·D·로그인 KV 수정은 로컬 dev에 통합해 두고, B 통합 뒤 한 번에 push한다.
20. **`android/security-certification-resources`의 새 단일 언어 후보는 보고 대상 오탐이다** — 지휘자 판단(apple 결정 12와 같은 기준: 정답을 빼앗지 않았고 `-`가 후보로 바뀐 것). spec 완료 조건 3 문구는 D2가 apple과 같이 맞춘다.
21. **쓸 수 있는가(`androidValueTags` 통과)는 모든 Android 셀 저장에 건다 — 기준 언어 셀 포함. 태그 불일치 비교(결정 13·15)는 비기준 셀에만 건다** — 지휘자 판단(E-fix2 질문). 저장은 됐는데 Publish가 `write-parse-failed`로 막히는 값을 만들지 않는 것이 결정 17의 요지다. 기준 셀 편집도 검사하지 않으면 깨진 기준이 생겨 결정 15 폴백이 상시 경로가 된다. 결정 15의 목적(영구 저장 불가 없음)은 글자 `<`를 `&lt;`로 쓰면 저장된다는 것으로 지킨다.
22. **태그 속성 값의 XML 금지 문자(U+0001·U+FFFE 등)는 이번에 막지 않고 알려진 한계로 적는다** — 지휘자 판단(A-fix2 범위 밖 메모). 우리 파서·재파싱은 통과하고 aapt2가 거부할 수 있는 드문 입력이다. 결과는 대상 리포 빌드 red로 드러나 조용한 손실이 아니다. D2가 ARCHITECTURE 한계 목록에 적는다.
23. **Android 소스의 라벨·slug는 모듈 디렉터리다(`app`·`settings`·`stripe-core`·`shared`) — `src/<set>`·`res`·`composeResources`를 건너뛴다** — 지휘자 판단(RBC Y2). design §3.2가 "Android 소스 둘을 같은 라벨로 접지 않는다"를 요구했고, slug는 URL·워크플로 job·MCP의 영구 식별자라 prod에 Android 표면이 없는 지금만 바꿀 수 있다. 다른 어댑터 라벨은 그대로다.
24. **Sources 상세의 Android 기준 언어는 읽기 전용 값 + 안내 문장이다(언어 선택·저장 컨트롤을 두지 않는다)** — 지휘자 판단(RBC 결정 2). design §2.4가 변경을 거부로 정했으니 언제나 실패하는 컨트롤을 두지 않는다. 서버 거부(`android-base-fixed`)는 그대로 그물로 남긴다.
25. **`values/`와 `values-<기준 코드>/`가 함께 있는 리포는 관측 코드 중복 거부를 유지한다** — 지휘자 판단(RBC W1, stripe 3ds2sdk). 같은 코드 행 둘을 허용하는 변경은 범위가 크다. 거부 문구(Y3)가 그 상황을 말하게 한다.
26. **RBC Y1(서버 적재가 `values-car`·`values-de-land`를 언어로 싣는다)은 B가 같은 push 안에서 고친다** — 지휘자 판단. A 영역 결함이지만 B가 R3로 같은 경로(`confirm.ts`·`lib/import/**`)를 소유 중이라 겹침이 없다. Y5(Android 코드 술어 손 사본)는 C가 잎 모듈로 옮겨 어댑터와 공유한다.

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
- **D 완료** — 문서별 커밋 7개(`e5a20985..da523cc1`: PRODUCT 아홉째 포맷·§7.2 · ARCHITECTURE 새 §1.46(M2에 없던 `basePath` 계약 요약 포함) · CLAUDE+AGENTS · ACTIONS · DIRECTORY · README · 자체 수정), `gate: ok`(16736). 지휘자가 CLAUDE.md diff를 직접 읽음 — 목록 추가 + 스택 표 한 행. 라벨 "Android strings file"은 A 확인 대기. 로컬 dev에 cherry-pick(push는 A와 함께). D 터미널 retain, 미룬 몫은 D2. 사본 `handoffs/handoff-D.md`.
- E 질문 → 결정 13.
- **E 완료** — `20ab754e` test · `01077aa4` feat(판정 `lib/keys/android-inline-tags.ts`, 코어 `saveKeysLocked`가 잠금 뒤 이미 읽던 `adapterName`을 넘긴다 — 추가 질의 없음, 비기준 언어의 바뀐 셀만, `cannot-clear` 우선). `gate: ok`(16769 + 격리 932). E 터미널 retain. RE `ctx_c51c7b176fdb`(claude-opus-5-5 high).
- **RE 완료** — 🔴1(R1 기준 값이 잘 닫히지 않으면 그 키의 비기준 저장이 영구히 막힌다 — 디코딩 도메인에서 파일 `&lt;br&gt;`가 `<br>`가 되는 탓) · 🟡2(Y1 번역 글자 `<`가 태그로 읽혀 거부 · Y2 진입점 테스트 공백) · ⚪4. 결정 13·키 단위 원자성·두 껍데기·병합 없음 확인. 사본 `handoffs/review-E.md`. RE 해제.
- 결정 14(사용자)·15. A에게 결정 14 전달(`msg-A-d14.md`, send + 터미널 입력) — A 터미널에서 그 파일을 읽은 것을 확인. E-fix1 `ctx_64d86ab24675`(E 터미널 재사용 — R1·Y1·Y2 + 결정 14).

- **E-fix1 완료** — `cc7e160a` test · `90afe459` fix(새 코드 `inline-markup-invalid` — 태그를 시작하지 못하는 `<`, 결정 14 · 기준 파싱 실패 시 토큰 멀티셋 비교, 결정 15 · 두 키 배치 원자성·다른 셀 기존 불일치·R1 회귀 진입점 테스트). `gate: ok`(16789 + 격리 932). 지휘자가 판정·코어 diff를 직접 보고 재리뷰 없이 수용 — A의 최종 엔티티 문법이 나오면 E 판정과 맞는지 통합 전에 대조한다. E 터미널 retain.
- **A 완료** — `d72e5ed9` feat · `3b6fb97c` fix(같은 offset 삽입 병합 — `/code-review`) · `f52d0252` 기준선. `gate: ok`(16974 + 격리 937). `@xml-tools/parser` 1.0.12 exact(16진 문자 참조 렉싱 결함 — 엔티티는 원문에서 푼다), aapt2 2.20 채록 67건. 결정 14 값 문법을 인계에 명시(`&lt;` 유지 · `&amp;`는 `lt;`·`amp;` 앞에서만). 고정 SHA: 학습·홀드아웃 1순위·metrics 바이트 동일 · 모바일 Android 정답 19 중 18이 1순위 정답(NewPipe는 composeResources 먼저 — 결정 16 · open-u60-pro는 iOS alsoValid 유지, Android 3순위) · 고정점 100% · 손실 0 · `resource-limit` 0 · 중복 `name` 0(결정 8 ask 불필요) · Flutter 셸 6리포 전부 ARB 유지(`isFlutterShell`을 `android/`에 걸었다 — 결정 7) · 오탐 1(`android/security-certification-resources` 단일 언어 후보 — 보고 대상). ⚠️ 미룬 것: create_project/add_sources basePath 진입점 갈래·기준 코드 주입은 B(T3.2b) — **A만 dev에 있는 동안 온보딩이 `values-*` 코드를 Android 기준으로 고른다**(R이 판정). 계획과 다른 점 10개 → R. A 터미널 retain. 사본 `handoffs/handoff-A.md`.
- 결정 16·17. R `ctx_549ef47db323`(codex gpt-6-astra medium).
- **R 완료** — 🔴3(R1 스팬 경계 공백이 aapt2와 달라 새 값도 다르게 전달 · R2 잘못된 태그(속성의 맨 `&`·중복 속성·끝 태그 속성)를 XML에 그대로 쓰고 성공 · R3 A 단독 배포에서 기준 언어 오적재) · 🟡3(Y1 `formatted=false` 유실 · Y2 Compose 값 의미 미채록 · Y3 멀티 모듈 probe 예산 시나리오 부재) · ⚪2(인계 표 낡음 · 주석). 계획과 다른 점 8 거부(R1), 1·2·3 조건부, 나머지 수용. 병합 없음 위반 없음, 삽입 144조합 고정점 확인. 사본 `handoffs/review-A.md`. R 해제.
- 결정 18(사용자)·19·20. A-fix1 `ctx_f7eeff1c0424`(A 터미널 재사용 — R1·R2·Y1·Y2·W1·W2 + 결정 16 판정 JSON). R3 공급 고리·Y3는 B 몫. A 컨텍스트 73%.

- **A·E 로컬 dev 통합(push 보류 — 결정 19)** — A 3커밋 + E 4커밋 cherry-pick(`18bee163..6afc8253`), main `pnpm gate` → `gate: ok`. 로그인 KV 점 애니메이션 수정(`1129b2f3` fix · `7a01da6f` DESIGN — 사용자 별도 요청, 지휘자가 직접 TDD)도 같은 로컬 dev에 있다.
- 2파 시작(A-fix1과 병렬 — B·C는 `lib/adapters/**`·`detect.ts:21` 주석을 건드리지 않는다): B `ctx_821a3d946c2e`(`android-B`, codex gpt-6-astra medium — R3 공급 고리·Y3 포함) · C `ctx_beed5b8fe6c1`(`android-C`, codex gpt-6-astra medium).
- B 질문 셋(소유 표 밖 진입점 4파일 · 자기 테스트 기대값 정정 · MCP는 새 인자 없이 기존 `baseLocale` 필드 재사용) — 모두 지휘자 승인.
- **C 완료** — `e64e4f7d` test · `bdc438c4` feat(Android 프리셋 `r` 철자·레거시 표 · `judgeAdd` 거부 · 웹·MCP 진입점). 대상 214 · 격리 67 · typecheck green. ⚠️ 워커 gate 두 번 `FAILED at test` — 무관한 `app/__tests__/seo-metadata.test.ts` 홈 메타데이터 5초 타임아웃(5018ms, 워커 셋 동시 부하). 지휘자가 C 워크트리에서 그 파일만 단독 실행 → 14/14 green. 통합 게이트로 최종 판정. C 터미널 retain.
- **A-fix1 완료** — `fea13c85` fix(R1 스팬 경계에서 aapt2가 공백 접기·따옴표 구간을 모두 재시작 — 인코더가 스팬 사이 구간마다 감싼다, aapt2 재컴파일 29건 일치 · R2 `androidValueTags` 엄격 문법 + 쓰기·create 뒤 파일 전체 재파싱, 미리보기는 writer-warnings·Git 쓰기 0·전달 확인 0 · 결정 18 `formatted` 복사 · Y2 실제 Compose 1.12.2 변환기 채록 — 접기 없음·따옴표 글자 그대로, composeResources 경로만 그 방언) · `e10d96e7` 주석 · `3e8970ab`·`a6421c6b` 결정 16 판정·기준선. `gate: ok`(17086 + 격리 938, 부하성 타임아웃 1회 재실행 green). 고정 SHA 네 코퍼스 1순위 불변, 모바일 오탐 3/40→2/40(NewPipe 판정), Android 정답 19/19 수용. 로컬 dev에 cherry-pick. A 터미널 retain.
- R2 `ctx_6e0dfe6f5d16`(codex gpt-6-astra medium, `f52d0252..` 수정분만 — 값 의미가 크게 바뀌었다) ∥ E-fix2 `ctx_1a7b4b6fa08a`(E 터미널 재사용, 결정 17 — `androidValueTags` 공유).
- **R2 완료** — 🔴1(R2-1 조상 디렉터리 이름으로 방언을 골라 `composeResources/…/res/values-*`가 Compose 의미로 읽힌다) · 🟡2(R2-2 Compose에서 치환하지 않은 이스케이프가 태그 경계를 옮겨 왕복이 깨진다 · R2-3 태그 문법이 NBSP 등 XML 밖 공백을 받아 키 없는 실패로 넘어간다). R1·R2·결정 18·Y2 일반 경로·W1/W2 해소 확인, 병합 없음 위반 없음, 네 코퍼스 1순위 차이 0, 20,000키 1.86MB write 369–459ms. 사본 `handoffs/review-A2.md`. R2 해제.
- A 터미널 컨텍스트 85% → 해제. A-fix2 `ctx_8eacfa0ee409`(새 워커, `android-A`, claude-opus-5-5 high — R2-1·R2-2·R2-3).
- **B 완료** — `3bd8ea75`·`37e250d1`·`8a4839d9`(Android 기준 언어 코드를 웹 ③·Add sources·수동 지정·MCP(기존 `baseLocale` 필드)·CLI(`--base` 필수)·재적재에 연결, `planBaseLocaleChange` 거부, basePath 표시, `values/`만 있는 소스의 언어 수 누락 자체 수정). `gate: ok`(17042 + 격리 939). B 터미널 retain. RBC `ctx_f5445ef59a87`(claude-opus-5-5 high, B+C).
- **A-fix2 완료** — `322b5716` test · `f29723ba` fix(R2-1 방언은 `values-*` 바로 앞 리소스 디렉터리로 · R2-2 Compose 치환하지 않은 매치의 경계를 제자리로, 두 방언 태그 왕복 2,000값 생성 테스트 · R2-3 태그 공백 = XML S만, NBSP 태그는 키 붙은 `write-parse-failed`). `gate: ok` 첫 실행(17164 + 격리 940). 재측정 생략(세 변경 모두 1순위·metrics를 못 움직인다 — 코퍼스의 compose 템플릿이 전부 `composeResources/`로 끝난다). 지휘자가 diff 확인 후 재리뷰 없이 로컬 dev cherry-pick. 결정 22. A 터미널 retain.

- **E-fix2 완료** — `6bec5b58` test · `7a7d0145` fix(저장 판정이 A의 `androidValueTags`를 쓴다 — 결정 17·21, 결정 15 갱신) · `c78fdd01` test(옛 잘못된 기준 값은 DB에 직접 심는다). `gate: ok`(17154 + 격리 938). cherry-pick 때 A-fix2와 `android-strings-publish.integration.ts`가 충돌 — 지휘자는 풀지 않고 abort, E-fix3 `ctx_bfebfe3db39b`(E 터미널 재사용 — rebase 후 두 의도 모두 보존).
- **RBC 완료** — 🔴0 · 🟡5(Y1 서버 적재가 Android 비언어 한정자를 언어로 · Y2 Android 라벨·slug가 전부 `res` · Y3 `androidInvalid` 문구가 화면에 없는 목록을 가리킨다 · Y4 basePath 표시·응답 테스트 0, `DISPLAY_ONLY` 낡음, 재추가 시나리오가 DB 행에서 멈춤 · Y5 C의 Android 코드 술어가 손 사본) · ⚪8. R3 아홉 경로 모두 닫힘, Y3(A 리뷰) 닫힘, 병합 없음 위반 없음. 사본 `handoffs/review-BC.md`. RBC 해제. 결정 23–26.

- C 로컬 dev cherry-pick(`c4c7ed2a`·`85f1c917`, 충돌 없음). C-fix1 `ctx_62f567288168`(C 터미널 — Y5·W7·W8) ∥ B-fix1 `ctx_9b92bcb5873f`(B 터미널 — Y1–Y4·결정 23–26·W3–W5, 마지막에 dev rebase).
- **E-fix3 완료·로컬 통합** — rebase 후 두 의도 보존(`ac022b13`·`bd24e609`·`1f9c2960`), `gate: ok`(17178 + 격리 940). E 터미널 retain.
- C-fix1 진행 중 — 격리 게이트에서 무관한 `translation-list-performance.integration.ts` 30초 타임아웃(부하) 1회, 재실행 예정.
- **B-fix1 완료·로컬 통합** — `7b645f29` test · `b2f6a6f5` fix(RBC Y1–Y4·결정 23–26·W3–W5), `gate: ok`(17216 + 격리 947, 소스 스캔 부하 타임아웃 1회 재실행 green). B 5커밋 cherry-pick 충돌 없음. B 터미널 retain.
- **C-fix1 완료·로컬 통합** — `5cf7dabc`·`e1a87f15`·`5a4e1d4b`(Android 코드 술어를 잎 `lib/locale-code.ts`로 · 레거시 국기 · 생성 파일 정확 바이트), `gate: ok`(17197 + 격리 945, 성능 테스트 부하 타임아웃 1회 재실행 green). C 터미널 retain.
- **통합 게이트(main 단독)** — A·A-fix1·A-fix2·B·B-fix1·C·C-fix1·D·E·E-fix1–3 + 로그인 KV 수정 → `gate: ok`(격리 postgres 포함). tasks T3.0d·T3.1·T3.2·T3.2c·T3.4 체크(T3.2b·T3.3은 수동 확인이 Q 몫이라 남긴다).

- **push** `d37f166d..87a71d51`(A·B·C·D·E 전부 + 수정 라운드 + 로그인 KV 수정 `1129b2f3`·`7a01da6f`). CI run 39279101921 success(러너 대기 ~30분 뒤).
- 3파: Q `ctx_94dc0d689582`(main 체크아웃, claude-opus-5-5 medium — `/runtime-test` 뒤 `/roundtrip` T3.5, SDK brew 설치 · `i18n-android-check` 생성) ∥ D2 `ctx_88997b607343`(D 터미널 재사용). Q가 main을 쓰는 동안 cherry-pick·build 금지. A·B·C·E 터미널은 Q 결함용으로 retain.
- **D2 완료** — 문서별 커밋 8개(`7b304226..ff35fc3f`: ARCHITECTURE 28차 재측정·§1.46 재작성 · CLAUDE+AGENTS 파서 함정 셋 · PRODUCT · ACTIONS · DIRECTORY · README · spec/design · 가이드 en·ko·es + AUTHORING), `gate: ok`(17233). 브리프 밖으로 CLAUDE.md "pull은 값을 병합하지 않는다"와 ARCHITECTURE 불변식 2·4에 `formatted` 나르기 한 문장 — 지휘자가 diff를 읽고 수용(결정 18이 arb `@key`와 같은 부류로 정했다). 통합은 Q가 main을 놓은 뒤(가이드는 앱이 서빙한다). D 터미널 retain(Q 결과가 문서와 다르면 D3).
- Q 결함 **#306**(온보딩 ② Android 후보 미리보기가 "Still working"에 멈춘다 — 빈 `baseLocale` 키, `values/`만 있는 후보는 영원히) → B-fix2 `ctx_690e73bc7aec`(B 터미널, 착수 확인).
- **B-fix2 완료** — `fb0d26c4` test · `59b2a26d` fix(Refs #306 — Android 기준 파일 즉시 미리보기 · "1 language" 단수), `gate: ok`(17238 + 격리 947). 통합은 Q가 main을 놓은 뒤, 재확인은 Q 몫. B 터미널 retain.
- Q `/runtime-test` 끝(roundtrip 진행). 결함 **#307**(Languages 카드의 Android 기준 행 제거 사유가 "다른 기준 언어를 먼저 고르라"고 한다 — 결정 24와 모순) → B-fix3 `ctx_669f9de51c54`.
- **B-fix3 완료** — `6db5dc4b` test · `0505b4db` fix(Refs #307), `gate: ok`(17241 + 격리 947). 통합은 Q 뒤.
- **Q 완료** — `/runtime-test` 결함 2(#306·#307, BugShot — 이미지 없이: ego 캡처 타임아웃) · T3.5 `/roundtrip` green: 새 폐기용 리포 `SinhyeokKang/i18n-android-check`(private) PR #1–#5(squash·merge·rebase) 매번 `assembleDebug` green, aapt2 값 = DB, 순 diff = 고친 셀 3, `values/strings.xml` 바이트 동일 · GitLab MR !31(트리 blob = `/raw` = 렌더). ⚠️ 남김: GitLab Publish 142.6초(1파일 — Q1b의 같은 크기는 7초, 오류·재시도 흔적 없음, 원인 미확정) · CI 방향 스킵(v4·gitlab-v3 태그 전) · `temurin@21` cask가 sudo를 요구해 pkg를 `~/.local`에 풀어 썼다. 관찰(이슈 아님): 저장 거부는 한 번에 한 종류만 · MCP 거부 문구 구두점(기존 `cannot-clear`와 같은 형) · 새 파일에서 기준 첫 키가 파일 끝에 삽입된다(design 규칙대로) · `resConfigs`로 좁힌 앱은 `pt-rBR`이 조용히 빠진다(결정 10 문서화). dev DB: `rt-android`·`rt-gl-android` 생성 후 보관. 사본 `handoffs/handoff-Q.md`. Q 터미널 retain(재확인용).
- **D2·B-fix2·B-fix3 통합** — 12커밋 cherry-pick + roundtrip 전제 조건 1에 `i18n-android-check`(+ 미러). main `pnpm gate` → `gate: ok`. tasks T3.3·T3.5 체크(T3.2b는 #306 재확인 뒤).

- **push** `87a71d51..c67d5e08`(D2 · B-fix2 #306 · B-fix3 #307 · roundtrip 전제 조건). CI run 39286391253. Q2 `ctx_018a53daaae7`(Q 터미널 재사용 — #306·#307 재확인 후 닫기). 워크트리 `android-A`·`-C`·`-E` 정리(cherry `+` 0), 워커 해제. 남은 것: B·D·Q 터미널.
- `c67d5e08` dev CI success(run 39286391253). Q2: #306 온보딩은 해소, **Add sources에서 재현**(`add-sources-modal.tsx`가 빈 `baseLocale`을 그대로 쓴다 — B-fix2가 온보딩만 고쳤다) → B-fix4 `ctx_6f1cd46fd645`.
