# mobile-strings — orch

원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 이 문서는 지휘 상태만 든다.

- 착수: 2026-10-19 · 시작 dev `3b0af99e`(= origin/dev)
- 끝: dev push까지. `/merge`는 부르지 않는다 — 이 기능의 `/merge`는 android-strings T5에서 세 어댑터 스펙과 한 번이다.
- 스키마 변경 있음(M2b `TranslationSurface.basePath`) → dev DB 적용은 지휘자, prod `db:deploy`는 그 `/merge` 1단계.

## 결정 기록

1. **패밀리 교차 허용** (2026-10-19 사용자 — "패밀리 교차 허용. 필요하다면 Codex 사용해"). 범위: 구현·리뷰 워커 모두 Claude(Sonnet·Opus)와 Codex(`gpt-6-astra`, effort 상한 medium) 사이에서 고를 수 있다. 독립 리뷰는 구현과 다른 패밀리로 맡긴다 — 같은 모델의 맹점을 줄인다.
2. **M0 SHA 고정 핀 파일은 `docs/adapter-survey/`에 커밋한다** — 지휘자 판단. 기준선 보고서는 `.scratch/`(커밋 없음)이지만 핀이 없으면 다른 머신·뒤 스펙의 재측정이 같은 SHA로 돌 수 없다. 그 디렉터리는 원래 `pnpm adapter-survey`가 읽는 살아 있는 입력이다. 핀의 형식(목록 줄 `owner/repo@sha` 또는 별도 파일)은 A가 고르고 리뷰가 판정한다.
3. **기준선 보고서는 main 체크아웃의 `.scratch/adapter-survey-baseline/`에 둔다** — 지휘자 판단. 워크트리의 `.scratch/`는 정리 때 함께 사라지고, B·C가 회귀 비교에 같은 파일을 읽어야 한다.
4. **M1 정답 판정은 워커(Opus)가 원문을 읽고 한다** — 지휘자 판단. tasks의 "사람이 원문을 보고 판정"은 탐지기 출력을 정답으로 삼지 말라는 뜻이고 23차 관행도 같다. 판정 JSON은 `/merge` 전 사용자 검수 대상으로 리포트에 남긴다.
5. **M2와 M3는 직렬, 단 M3의 순수 잎은 앞당긴다** — 지휘자 판단. 두 배치가 `lib/adapters/types.ts`·`lib/pull/plan.ts`·`scripts/ingest.ts`·`scripts/format.ts`·`lib/survey/`를 같이 고친다. C는 겹치지 않는 몫(M3a 테스트 + `lib/file-encoding.ts` + `lib/githash.ts`)만 먼저 하고, 배선(M3b)은 B가 dev에 들어간 뒤 새 Dispatch로 받는다.
6. **`lib/survey/`는 A(M0)가 먼저 소유한다** — B의 survey 다섯 줄·C의 `run.ts:63` NUL 스킵 교체는 A가 dev에 들어간 뒤로 미룬다(인계의 "미룬 항목").
7. **M1 후보는 다시 모은다** — 지휘자 판단. 10-19 보급률 표본(1,397개)의 원 리포 목록이 리포·`.scratch` 어디에도 남지 않았다. D가 spec에 적힌 같은 기준(스타 구간·2026-04 이후 push·fork·보관 제외)으로 `gh` 검색해 보유 기준 비슷한 규모로 모으고, 검색식과 실제 수를 `repos.md`에 남긴다.
8. **M3는 계획대로 완전 왕복** (2026-10-19 사용자). M1에서 정답 카탈로그가 UTF-16인 리포가 0개였지만(판별+명시 실패로 축소를 추천했다), design §3대로 읽기·쓰기·바이트 `blobSha`·GitHub blobs·GitLab base64까지 간다.
9. **되살림 판정은 basePath를 보지 않는다** (2026-10-19 사용자, RB Y3). 템플릿·어댑터가 같으면 옛 행(id·slug·번역·이력)을 되살리고 basePath는 재탐지값으로 덮는다 — design §2의 plan-revival 줄은 B-fix1이 고친다.
10. **잘못된 UTF-8은 모든 로케일 경로에서 명시 실패, 단 적재·Publish 대상으로 고른 파일에만** (2026-10-19 사용자, RC R1). 기존 "못 읽은 파일" 장치(CLI `failures`→audit #7 red+보고 · 서버 `readFiles` 대조 · writer-warnings)로 흘린다 — 무관한 예제 파일은 그 후보만 떨어진다. dev의 손실 디코드(U+FFFD 적재·원본 덮기)로 되돌리지 않는다.
11. DS 행 없음 — design-brief·화면 변경이 없다(spec 비목표). 가이드 영향 없음. 런타임 QA는 인계의 (b) 목록이 생길 때만 둔다 — survey 재측정이 이 기능의 실물 검증이다.

## 배치

| 배치 | 항목 | 소유 파일 | 선행 | 모델·effort | 위치 | 상태 |
|---|---|---|---|---|---|---|
| A | M0 survey SHA 고정 배선(커밋 `feat(survey): pin corpus repos to recorded commits`) + 학습·홀드아웃 기준선 보고서 2회 | `lib/survey/**` · `scripts/adapter-survey.ts` · `docs/adapter-survey/` 핀 파일 | — | Claude Sonnet 5.5 medium — 범위가 좁고 기계적이다 | 워크트리 | 대기 |
| B | M2a 테스트 → M2b 마이그레이션 SQL(DB 없이 `migrate diff`) → M2c 배선 | `prisma/schema.prisma` · `prisma/migrations/<new>` · design §2의 `lib/`·`scripts/`·`app/` 서버 자리 · `lib/adapters/types.ts`(`DetectedFormat`) · `lib/push/` · 관련 테스트 | — (survey 다섯 줄만 A 뒤) | Claude Opus 5.5 high — 30곳 가까운 자리 전수와 불변식 판단 | 워크트리 | 대기 |
| C1 | M3a 테스트 + 순수 잎(`decodeFileBytes`·`encodeFileContent`·`blobSha(bytes)`) | `lib/file-encoding.ts`(+테스트) · `lib/githash.ts`(+테스트) · M3 소스 테스트 | — | Codex `gpt-6-astra` medium — 바이트 경계 판단, 패밀리 분산 | 워크트리 | 대기 |
| C2 | M3b 배선(리더 넷 · survey NUL 스킵 · GitHub blobs · GitLab base64 · `blobSha` 호출자 · 인코딩 상속) | `lib/github.ts` · `lib/gitlab/plan.ts` · `scripts/format.ts` · `lib/survey/run.ts` · `lib/pull/plan.ts` · `scripts/ingest.ts` · `lib/adapters/types.ts`(`AdapterFile`) | B dev 통합 · A dev 통합 | C1과 같은 터미널 재사용 | C 워크트리 | 대기 |
| D | M1 모바일 코퍼스(`repos-mobile*.txt` · 판정 JSON · 세 건수) | `docs/adapter-survey/repos-mobile*.txt` · `verdicts-mobile*.json` · `repos.md`의 모바일 절 | A dev 통합(핀 형식) | Claude Opus 5.5 medium — 원문 판정 | 워크트리 | 대기 |
| RA | A 리뷰 | 없음 | A | Codex `gpt-6-astra` medium | A 워크트리 읽기 | 대기 |
| RB | B 리뷰 | 없음 | B | Codex `gpt-6-astra` medium | B 워크트리 읽기 | 대기 |
| RC | C1+C2 리뷰 | 없음 | C2 | Claude Opus 5.5 high | C 워크트리 읽기 | 대기 |
| S | 후속 스펙 갱신 — 이 런에서 바뀐 결정·실측을 `docs/features/{arb,apple-strings,android-strings}/`에 스펙별 커밋으로 반영(핀 재측정·모바일 코퍼스 실측·되살림 규칙·수동 지정·UTF-8 명시 실패·RC 이관 셋·B 미룬 항목·검수 7묶음) | 그 세 폴더 | C 통합 | 지휘자 | main | 완료 |

겹침: A↔B·C는 `lib/survey/`(결정 6), B↔C는 결정 5의 파일들, A↔D는 `docs/adapter-survey/`(D는 A 뒤). 1파: A ∥ B ∥ C1. A 통합 → D 시작 + B·C에 survey 몫 전달. B 통합·push → C2.

push 순서: A 통합 뒤 push(M0) → B 통합 뒤 push(M2, tasks "자체 `/push`") → C 통합 뒤 push(M3). D는 문서라 다음 push에 얹는다.

tasks ↔ 배치 대조: M0→A · M1→D · M2a·M2b·M2c→B(M2b dev DB 적용은 지휘자) · M3a→C1 · M3b→C2 · 문서 절(정본 승격·폴더 정리)→범위 밖(각 어댑터 스펙 T5). 주인 없는 항목 0. 후속 스펙 반영→S(2026-10-19 사용자).

## 진행

- Run `run_eb594cbd815a`. 1파 시작(2026-10-19): A `ctx_adc4bec078e5`(워크트리 `ms-A`, claude-sonnet-5-5 medium) · B `ctx_11411e92fe49`(`ms-B`, claude-opus-5-5 high) · C1 `ctx_7ee58adca952`(`ms-C`, codex gpt-6-astra medium) — 세 `launch.effective`가 요청과 같다. 브리프: main `.scratch/orch-mobile-strings/`.
- **A 완료** — 커밋 3개(`dc9e766d` test · `3a6e07dd` feat · `881df52a` 핀 파일), `gate: ok`(16166 passed). 핀은 사이드카 `docs/adapter-survey/pins.json`(학습 109)·`pins-heldout.json`(홀드아웃 20) + CLI `--pins`·`--write-pins`. 기준선 4개 보고서는 clone 실패 0이고, 1·2회차가 `ms`만 빼고 바이트까지 같다. 25차 대비 차이: 학습 오탐 0→1(상류 포맷 이동), `diff.clean` 42→41(추정). A가 `/code-review`·`/refactor`를 자체 점검으로 대신했다 → RA가 판정한다. 문서 드리프트(`--pins`)는 통합 때 문서별 커밋. A 터미널은 수정 라운드용으로 retain.
- RA 시작 `ctx_9af75db61041`(codex gpt-6-astra medium, ms-A 읽기 전용).
- 공통 규칙 추가(2026-10-19 사용자): `rm`에 빈 변수 경로 금지 — bypass에서도 확인 창이 떠 자동 거부까지 A가 2분 멈췄다.
- **RA 완료** — 🔴1(고정 리포의 checkout 실패가 성공·핀으로 기록) · 🟡2(테스트가 고정 커밋 본문을 안 읽음 · `--pins` 문서 넷 누락), 사용자 결정 없음. 사본: `handoffs/review-A.md`. RA 해제.
- **A-fix1 완료** — 커밋 7개(`cff0c2b7`..`2d6b4f43`): checkout 실패를 고정 여부와 무관하게 `failure`로, 실제 로컬 git 테스트, 문서 넷(CLAUDE+AGENTS·ARCHITECTURE·repos.md·DIRECTORY). 이번엔 실제 `/code-review`(🔴0·🟡0·⚪1)·`/refactor`를 돌렸다. 성공 경로가 안 바뀌어 기준선은 유효. 지휘자가 diff를 보고 재리뷰 없이 통합.
- **A dev 통합** — 10커밋 cherry-pick(`..78e447c1`). main 체크아웃 `pnpm gate` 1차는 `api-contract.test.ts` 두 건 5s 타임아웃(부하 평균 121 — 다른 워커 게이트 동시 실행, 단독 재실행 54/54 통과)으로 red였고, 2차 `gate: ok`(16172 passed). tasks M0 체크.
- **push** `3b0af99e..c46880fb`(M0). A 워크트리·터미널 정리.
- D 시작 `ctx_9abe3a7004aa`(`ms-D`, claude-opus-5-5 medium).
- **B 완료** — 커밋 3개(`84133c37` test · `545c7cfc` 마이그레이션(오프라인 생성, dev DB 미적용) · `441d4049` 배선), `gate: ok`(16239 + 격리 909). 고정 SHA survey 학습·홀드아웃 1순위 diff 0, `ms` 외 JSON 동일. 계획과 다른 점 7개(경로 함수 서명 확장 · 지문은 basePath 있을 때만 튜플에 덧붙임 · 되살림 판정은 basePath 무시 · 온보딩 pick이 basePath를 실음 · 수동 지정은 basePath 없음 · 가짜 DB 행 · 409 본문) → RB가 판정. B 터미널 retain.
- RB 시작 `ctx_5be45de722d2`(codex gpt-6-astra medium, 첫 세 커밋만). 같은 때 B에게 미룬 survey 다섯 자리를 새 Dispatch `ctx_632a76c10979`로 보냄(A가 dev에 있어 rebase 후 진행, 새 커밋만).
- **D 완료·통합** — `a94f594f` cherry-pick, main `gate: ok`. 리포 60(학습 48 · 홀드아웃 12), 보유 ARB 14 · Apple 34 · Android 30(Flutter 앱의 생태계 중복). 세 건수: **UTF-16 `.strings` 6리포 — 전부 벤더·샘플·템플릿, 정답 카탈로그가 UTF-16인 리포 0** · `Base.lproj/Localizable.strings` 1 · xcstrings 원문 셀 없는 키 21.7%(2,218/10,237). clone 실패 0. 계획과 다른 점: 리포 검색+트리 정규식(코드 검색은 stars·pushed 필터 불가), 다국어 묶음 있는 리포 위주 추출(시드 20261019). **`/merge` 전 사용자 검수 판정 7묶음**은 `handoffs/handoff-D.md` "사용자 검수가 필요한 판정". D 워크트리 정리. tasks M1 체크. (지휘자가 판정을 직접 읽었고 독립 리뷰는 두지 않았다 — 문서·데이터뿐이고 정답 판정은 사용자 검수 대상이다.)
- **RB 완료** — 🔴1(`probeTargets`가 없는 `values-en/` 치환 경로를 대상에 넣어 `IngestBudgetError` — 실 함수로 재현) · 🟡3(진입점 시나리오 테스트 부족 · ACTIONS/DIRECTORY/MCP 계약 문서 누락 · 되살림 규칙 변경은 사용자 결정) · ⚪(MCP 생성 응답의 `basePath: null`). 사본 `handoffs/review-B.md`. RB 해제. B-fix1 브리프 작성 — B-survey가 끝나면 보낸다.
- **B-survey 완료** — `lib/survey/one.ts` 다섯 자리를 파일 안 helper `surveyLocalePath` 하나로 모음(소스 테스트 `count: 1, branched`), gate ok, 고정 survey 1순위 diff 0.
- **B-fix1 완료** — 새 커밋 7개: R1(`probeTargets`가 basePath 후보에서 트리에 있는 경로만, basePath도 트리 확인 — 자체 `/code-review`가 하나 더 찾음) · Y1 진입점 시나리오(변조 basePath 거부·쓰기 0, stub 재탐지 성공 고리) · Y3 회귀 테스트 + design §2 · Y2 문서(ACTIONS·DIRECTORY·ARCHITECTURE §6.45.5) · 생성 응답에서 null basePath 생략. gate ok(16256 + 격리 914). 지휘자가 R1 diff를 직접 보고 재리뷰 없이 통합. 남은 것: android-strings T3 실 어댑터 시나리오·T3.2b 화면 자리.
- **B dev 통합** — 12커밋 cherry-pick(`..b531e727`). dev DB `prisma migrate deploy` → `20261019120000_add_translation_surface_base_path` 적용, `db:status` up to date, anon·authenticated `public` USAGE·CREATE 네 칸 false, `basePath` nullable 확인. main `pnpm gate` → `gate: ok`(16256 + 격리 914). tasks M2a·M2b·M2c 체크.
- **push** `c46880fb..9c803572`(M2). B 워크트리·터미널 정리. C2 보냄 `ctx_704d779248e8`(C 터미널 재사용, dev rebase 후).
- C2 범위 알림: `RepoReader.blob`/`GitClient.getBlobText`가 문자열만 돌려줘 공통 인터페이스·`lib/import/read.ts`·`lib/pull/run.ts`·`lib/publish/read.ts`·fake-client·smoke까지 고친다(필수 배선, 화면 변경 없음) — 지휘자 수용.
- C2 알림: `lib/survey/select.ts`에 `.strings` 수집을 더했다(없으면 모바일 코퍼스에서 UTF-16 디코드를 잴 수 없다). 모바일 60리포 clone 실패 0, 바이너리 `.strings`(CodenameOne·Lifeslice)는 `parse-failed`로 명시 거부. ⚠️ select 변경은 기존 코퍼스 1순위 diff 0 확인과 RC 판정 대상.
- **C2 완료** — 커밋 3개(`f6973b21` test · `1298c1c7` feat · `41c0dd48` docs) + rebase된 C1 둘(`15a4ccfa`·`12a83990`). gate ok(16321 + 격리 914). 기존 학습 109·홀드아웃 20 top-1 diff 0(i18n-ally 예제의 잘못된 UTF-8 두 파일이 파일별 실패로 새로 기록되지만 선택 결과는 같다). 모바일 60 clone 실패 0. M1의 UTF-16 후보 241파일: 바이트 왕복 219 성공, 22는 `bplist00` 바이너리 plist(M1 휴리스틱이 후보로 센 것) → 명시 실패. ⚠️ 동작 변화: `.strings` 밖 로케일 파일의 잘못된 UTF-8도 이제 손실 디코드가 아니라 `parse-failed`(design §3대로) → RC 판정. (b): 실제 GitHub/GitLab UTF-16 왕복 — `.strings` 어댑터가 없어 앱 경로로는 apple-strings 전까지 못 잰다. C 터미널 retain.
- RC 시작 `ctx_3e6272c805f3`(claude-opus-5-5 high).
- **RC 완료** — 🔴1(`LocaleFileParseError`가 기존 실패 장치를 우회해 처리되지 않은 예외로 나간다 — CLI push가 `reportFailure` 없이 죽고(무관한 표본이어도), 온보딩 탐지 전체 장애, 미리보기 Try again, 야간 매일 예외. i18n-ally 모양 트리로 재현. survey만 파일별로 잡아 top-1 diff 0이 이를 가렸다) · 🟡3(ARCHITECTURE가 아직 "`POST /git/blobs` 안 부름" · GitLab `path=""` 기본값 · survey `failure`가 핀 기록에서 리포를 뺌) · ⚪8. 사본 `handoffs/review-C.md`. RC 해제. 사용자 결정 → 결정 10.
- C-fix1 보냄 `ctx_4698d430bf27` — R1·Y1–3·⚪1/2/4/5, ⚪3/6/7은 apple-strings로 넘김, `--verdicts` 붙인 고정 survey 재측정.
- **C-fix1 완료** — 커밋 3개(`b9df2e87` test · `ea11c814` fix · `5f4bbd87` docs), gate ok(16328 + 격리 914). `--verdicts` 포함 고정 survey 학습 109·홀드아웃 20 top-1 diff 0, 탐지·오탐·정답 순위 지표 기준선과 같음. ⚪3/6/7·실제 호스트 왕복은 apple-strings로 넘김. 🔴이 진입점 여럿에 걸쳐 수정분만 독립 재검증 RC2 `ctx_0c184b2823db`(codex gpt-6-astra medium) 시작. C 터미널 retain.
- **RC2 통과** — 신규 🔴·🟡 0(관련 15파일 393테스트·첫 적재 오프라인 검증). 한계: 실제 호스트·DB 포함 야간 전체 실행은 안 함(공용 실행·경고 경로 테스트로 확인). 사본 `handoffs/review-C2.md`. RC2 해제.
- **C dev 통합** — 8커밋 cherry-pick(`..82bd2e84`). main `pnpm gate` → `gate: ok`(16328 + 격리 914). tasks M3a·M3b 체크.
- **push** `9c803572..8dccc13c`(M3).
- **S 완료** — 스펙별 커밋: `dfcad51b` arb(M1 실측·핀 재측정) · `fae80efd` apple-strings(M3 계약·UTF-8 명시 실패 결정·RC 이관 T2.0a–c·`bplist00` 거부·T2.4가 실제 호스트 UTF-16 왕복을 닫음·API 예산 절 번호) · `e2d89a05` android-strings(M2 계약·되살림 결정·수동 지정 basePath 유도는 T3.2b 신규·실 어댑터 공급 고리 테스트·화면 자리와 표시 전용 select·composeResources 결정 시점·T5.6 검수) · `367c0f51` adapter-survey(M3 뒤 디코드 결과 · 검수 대기 판정 절 — handoff-D의 목록을 정본으로 옮김).
