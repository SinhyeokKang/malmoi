# 지휘 계획 — 2026-10-20 감사 후속 (v1.4.3–v1.4.7)

입력: 2026-10-20 `/audit`(범위 `325ae01a~1..HEAD`) 발견 16건. 원본 리포트는 채팅에만 있으므로 항목을 아래에 옮겨 적는다.
시작 dev: `753901bc` (v1.4.7). 끝은 dev다 — `/merge`는 사용자가 따로 부른다.

## 결정 기록

| # | 결정 | 출처 |
|---|---|---|
| D1 | 범위 = 1~16 전부(⚪ 포함) | 사용자 2026-10-20 |
| D2 | T5.0(prod 표면 리포 새 탐지 회귀 확인)은 아직 안 했다 → **ego-browser로 직접 수행하는 워커 배치(B6)를 둔다** | 사용자 2026-10-20 |
| D3 | 11번(POSTMORTEM 2026-10-14 grep 기대 목록)은 고치지 않는다 | 지휘자 판단 — POSTMORTEM은 append-only이고 동작은 ARCHITECTURE §5.10.2대로다 |
| D4 | 12번은 `planLocaleChange`의 `canManage` 입력과 `forbidden` 분기를 지운다(refusal union에서 `forbidden`이 다른 곳에 쓰이면 union은 둔다) | 지휘자 판단 — 인가는 잠금·진입 판정이 이미 보고 상수 true만 들어온다. 사용자가 ⚪까지 범위로 잡았다(D1) |
| D5 | 16번(MCP 도구 이름 변경)은 코드 변경 없이 지휘자가 Release 노트 기재 여부만 확인한다 | 지휘자 판단 — 의도된 변경이다 |
| D7 | `docs/features/{mobile-strings,arb,apple-strings,android-strings}/` 제거(8번 = T5.5)를 이 지휘 세션이 맡는다 | 사용자 2026-10-20 |
| D6 | B2는 `docs/features/android-strings/tasks.md` T5.7과 같은 작업이다(태그 `malmoi-i18n-push-gitlab-v3` = `753901bc…`는 이미 원격에 있다) | 지휘자 판단 — git ls-remote 확인 |

## 항목 → 배치

| # | 등급 | 항목 | 배치 |
|---|---|---|---|
| 1 | 🔴 | `android-strings.ts` writer가 비-base 파일의 중복 키·`translatable="false"`·`@string/` 참조 슬롯을 오류 없이 건너뛰는데 전달 판정(`lib/pull/run.ts:412`, base 파일만 읽음)이 전달로 센다. 미리보기 `publish/read.ts:116`과도 어긋남 | B1 |
| 2 | 🟡 | `lib/onboarding/gitlab-ci.ts:15-18`이 `gitlab-v2`(`325ae01a`)에 고정 — GitLab에서 ARB·Apple·Android 소스의 생성 job이 v1.4.3 CLI로 exit 2. `docs/ACTIONS.md` §5 블록도 | B2 |
| 3 | 🟡 | `CLAUDE.md:245` action 참조 `@malmoi-i18n-push-v3` → 실제 `v4` | 지휘자 문서 |
| 4 | 🟡 | `CLAUDE.md:55` "야간은 이 게이트를 부르지 않는다" → `lib/import/run.ts:156`·`:312`가 경합 방어로 부른다. ARCHITECTURE §5.10.3 표현에 맞춘다 | 지휘자 문서 |
| 5 | 🟡 | `docs/PRODUCT.md:303` 편집 폐기 OWNER 경로 "셋" → 넷(언어 제거·추가 취소) | 지휘자 문서 |
| 6 | 🟡 | `lib/survey/one.ts:184-200`이 프로덕션 `selectLocaleFiles`(`lib/push/payload.ts:43`)를 안 지나고 basePath 분기·정렬을 재구현 | B3 |
| 7 | 🟡 | `lib/onboarding/base-input.ts` 테스트 0 + Android 기준 경로 규칙 세 벌(`android-strings.ts:26`·`lib/surfaces/plan.ts:13`·`base-input.ts:12`) | B4 |
| 8 | 🟡 | `docs/features/{android-strings,apple-strings,arb,mobile-strings}/` 잔존 (T5.5) | 지휘자 문서 — B2·B6 뒤 |
| 9 | ⚪ | `lib/adapters/types.ts:34·124·285·297` 수술적 목록 주석에 `android-strings` 누락 | B1 |
| 10 | ⚪ | `lib/pull/locales.ts:270`·`lib/pull/run.ts:368`의 `pathTemplate.replaceAll("{locale}")` 경로 계산 사본 | B3 |
| 11 | ⚪ | POSTMORTEM 2026-10-14 grep 기대 목록이 `apply.ts:262-276` 경로를 못 드러냄 | 처리 없음(D3) |
| 12 | ⚪ | `lib/locales/change.ts:177` `canManage: true` 상수 → `change-plan.ts:60` `forbidden` 도달 불가 | B5 |
| 13 | ⚪ | `lib/onboarding/ingest.ts:111` `assemblePushInput`의 `format`을 버림 | B5 |
| 14 | ⚪ | 소비자 없는 export: `arb-catalog.ts parseArb` · `code-dict.ts createCodeDictFile` · `yaml-catalog.ts createYamlCatalogFile` · `shared.ts templateShapeRank` · `lib/events/payload.ts`의 `IMPORT_SOURCES`·`LOCALE_CHANGE_VIAS`·`SURFACE_SCOPES` · `lib/projects/list.ts PROJECT_STATUSES` · `components/translations/workspace/locale-panel.tsx DetailHeadSkeleton`(주석이 말하는 소비자 없음) | B5 |
| 15 | ⚪ | `docs/DIRECTORY.md`에 `lib/onboarding/base-input.ts` 미등재 | 지휘자 문서 — B4 뒤 |
| 16 | ⚪ | MCP 도구 이름 변경(`preview_source_removal`→`preview_source_detach`, `remove_source`→`detach_source`) | 지휘자 확인(D5) |
| T5.0 | — | prod 표면들의 리포에 새 탐지를 돌려 기존 `adapterName`·`pathTemplate`가 1순위인지 확인 (`docs/features/android-strings/tasks.md`) | B6 |

## 배치

| 배치 | 항목 | 소유 파일 (+ 테스트) | 선행 | 워커 | 위치 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|---|
| B1 | 1, 9 | `lib/adapters/android-strings.ts`(write 경로) · `lib/adapters/types.ts` · `lib/publish/read.ts`(필요 시 미리보기 정렬) | — | Claude Opus · high (전달 불변식 판단) | 새 워크트리 | 재현 테스트 red→green · `pnpm gate --base dev` | 대기 |
| B2 | 2 | `lib/onboarding/gitlab-ci.ts` · `lib/onboarding/__tests__/gitlab-ci.test.ts` · `docs/ACTIONS.md` §5 `<!-- gitlab-ci -->` 블록 | — | Claude Sonnet · low (값 교체) | 새 워크트리 | `gitlab-ci.test.ts` · `pnpm gate --base dev` | 대기 |
| B3 | 6, 10 | `lib/survey/one.ts` · `lib/pull/locales.ts` · `lib/pull/run.ts`(368 부근 경로 계산만) | — | Claude Sonnet · medium | 새 워크트리 | survey 테스트 · `pnpm gate --base dev` | 대기 |
| B4 | 7 | `lib/onboarding/base-input.ts` · `lib/surfaces/plan.ts` · `lib/adapters/android-strings.ts:26` 부근(기준 경로 규칙) | **B1 dev 통합 뒤** | Claude Sonnet · medium | 새 워크트리 | 새 단위 테스트 · `pnpm gate --base dev` | 대기 |
| B5 | 12, 13, 14 | `lib/locales/change.ts` · `lib/locales/change-plan.ts` · `lib/onboarding/ingest.ts` · `lib/adapters/{arb-catalog,code-dict,yaml-catalog,shared}.ts`(export 키워드만) · `lib/events/payload.ts` · `lib/projects/list.ts` · `components/translations/workspace/locale-panel.tsx` | — | Claude Sonnet · low (기계적 정리) | 새 워크트리 | `pnpm gate --base dev` | 대기 |
| B6 | T5.0 | 코드 수정 없음 — 리포트 `.scratch/handoff-B6.md` | — | Claude Sonnet · medium (ego-browser 읽기 전용) | main 체크아웃 | prod 표면별 1순위 불변 표 | 대기 |
| 문서 | 3, 4, 5, 8, 15, 16 | `CLAUDE.md` · `docs/PRODUCT.md` · `docs/DIRECTORY.md` · `docs/features/*` 삭제 | 8은 B2·B6 뒤, 15는 B4 뒤 | 지휘자 | main 체크아웃 | `pnpm sync:agents:check` | 대기 |

### 파일 겹침

- B1 ↔ B4: `lib/adapters/android-strings.ts` → B4는 B1 통합 뒤에 띄운다.
- B1 ↔ B3: B1은 `lib/pull/**`를 건드리지 않는다(필요하면 미룬 항목으로 남긴다). B3는 `lib/adapters/**`·`lib/publish/**`를 건드리지 않는다.
- B5 ↔ B1: B5는 `android-strings.ts`·`types.ts`를 건드리지 않는다. `shared.ts`는 B5 소유(B1은 건드리지 않는다).
- B2 ↔ 문서: `docs/ACTIONS.md`는 B2 소유. 지휘자 문서 커밋은 ACTIONS를 건드리지 않는다.
- 사전(`messages/*`)은 어느 배치도 건드리지 않을 것으로 본다 — 건드려야 하면 워커가 멈추지 말고 미룬 항목으로 남긴다.
- 스키마 변경: 어느 배치도 허용하지 않는다.

### 런타임 검증

- B1의 (b) 항목이 있으면 모든 배치 통합 뒤 단일 QA 워커가 main 체크아웃에서 본다. 시안 대조(DS) 행 없음 — 신규 화면이 없다.
- GitLab 실물 CI green(T5.7의 수동 검증)은 프로덕션 반영 뒤 사용자 몫으로 리포트에 남긴다.

## 진행 기록

(지휘자가 갱신한다)

- Run `run_9fbd23a2331b`. 착수 dispatch: B1 `ctx_7612663ac064`(opus·high) · B2 `ctx_1f07fe4be710` · B3 `ctx_6f5699a9f462` · B5 `ctx_fa19a0527a42`(sonnet) · B6 `ctx_d66a9e899332`(sonnet·medium, main 체크아웃). 워크트리 `~/orca/workspaces/malmoi/audit-b{1,2,3,5}`.
- B6: 사용자가 ego를 재시작 → 재연결 지시 전달, B6가 인용해 응답(ego 수집은 그 전에 끝남).
- **B6 완료(T5.0)** — prod 프로젝트 4·소스 6. 새 탐지 1순위 불일치 0.
  - bugshot-2(chrome-locales·ts-dict)·malmoi(code-dict): 공개 clone으로 일치 확인. bugshot-2의 ts-dict가 2순위인 것은 v1.4.7 이전부터의 동작이고 두 리포엔 Malmoi CI가 없다.
  - bugshot-i18n-test(비공개): 지휘자가 `gh repo clone`으로 보충 — 1순위 chrome-locales·2순위 ts-dict, prod와 일치. 워크플로는 두 스텝 모두 `@malmoi-i18n-push-v1` 태그 고정이고 ts-dict 스텝은 `adapter: ts-dict`를 박아 탐지 변화의 영향이 없다.
  - ox501501/malmoi-gitlab-test(GitLab, json-catalog): 사용자가 ego에 GitLab 로그인 → 지휘자가 ego로 `main`의 `locales/{en,fr,ko}.json`을 읽어 새 탐지 실행 — 1순위 json-catalog · `locales/{locale}.json`, prod와 일치. 리포에 `.gitlab-ci.yml`이 없다(트리 전수: README + 로케일 3) — CI 소비자 아님.
  - B6 워커 release 완료.
