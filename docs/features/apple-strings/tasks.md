# apple-strings — tasks

모바일 세 스펙의 둘째다(arb → apple-strings → android-strings). 순서: 인코딩 경계(독립 배치) → `.strings` → `.xcstrings`. 배치마다 `pnpm gate` green +
학습·홀드아웃 **둘 다** 재측정(ARCHITECTURE §1.9 재측정 트리거)으로 닫는다. **`/merge`는 세 스펙이 다 끝난 뒤 한 번**이다.
모바일 코퍼스는 mobile-strings M1이 만들었고, **회귀 기준선은 커밋된 `docs/adapter-survey/baseline/`이다**(arb 뒤 — 머신을 옮겨도 같다, 비교 규칙은 그 README).
표기 규칙("검증: red"·(수동)·테스트 커밋 합치기)은 arb tasks 머리와 같다. design-brief 없음.

**arb 런에서 넘어온 것(2026-10-19, `docs/features/arb/orch.md`)** — 인테이크 때 배치 계획에 반영한다:
- 손 목록은 arb T1.3과 그 **"실측 정정"** 줄이다(놓친 MCP `add_locale` 설명도 T2.2가 고친다).
- 리뷰가 3회 돌았다(리뷰 → fix → 재리뷰 → fix). 구현과 다른 패밀리의 독립 리뷰가 진입점 결함(probe 예산·로케일 해석·합계 예산)을 잡았다 — 이 스펙도 같은 리듬을 잡아 둔다.
- 겹침: T2.0b(`lib/survey/select.ts`)와 T2.2(같은 파일 — survey 선택)가 같은 파일을 고친다. T2.0a(`lib/github.ts`)는 어댑터와 겹치지 않는다.
  문서 배치(T5)는 코드와 병렬로 시작하되 **가이드 커밋은 사전 라벨이 dev에 들어간 뒤**다(가이드 게이트가 굵은 라벨을 세 사전에서 찾는다).
- 실물(`/roundtrip`)은 ego 세션이 로그인 OAuth를 못 지나서 **프로젝트 생성·언어 추가를 MCP(같은 코어)로** 했다. `malmoi-sync-dev`는 이미 전체 리포 설치라
  새 폐기용 리포에 콘솔 단계가 없다(설치 범위를 먼저 `probeRepo`로 본다).

## 2a. 사전 작업

`.strings` 인코딩 경계는 **mobile-strings** M3이 든다 — 2026-10-19 dev에 들어갔다(design §2.2 끝 "M3로 dev에 들어간 계약").
M3 리뷰가 이 스펙으로 넘긴 것(지금은 `.strings` 어댑터가 없어 도달하지 않는다):
- [x] **T2.0a UTF-16 blob 제한 병렬** — `lib/github.ts`의 UTF-16 `POST /git/blobs`가 순차다. iTerm2(65파일) 규모에서 `maxDuration=60`(`app/api/pull/route.ts`) 안에
      들도록 제한 병렬(예: 8)과 "UTF-8만 있는 Publish는 blob POST 0회" 단언 유지, ARCHITECTURE §3 Publish 단계 4의 예산 문구 갱신.
- [x] **T2.0b survey `.strings` 수집 상한** — `lib/survey/select.ts`가 모든 `.strings`를 `FILE_BUDGET` 앞에 넣는다. 큰 iOS 리포에서 사전순 절단이 후보를 자르지 않게
      `.lproj` 그룹당 상한을 둔다(같은 파일 머리의 경고와 같은 함정).
- [x] **T2.0c 내용 예산 문구** — `checkContentBudget`(ARCHITECTURE "실제 UTF-8 수신 바이트")는 UTF-16 파일에서 디코드한 문자열의 UTF-8 길이를 센다. 원시 크기는
      트리 크기 검사가 막으므로 문구만 맞춘다.

## 2b. Apple `.strings` (`apple-strings`)

- [x] **T2.1 테스트** — 토크나이저 범위 · 이스케이프 왕복 속성 · 비정규 리터럴 미변경 · 주석/빈 줄 보존 · 주석 속 `"a" = "b";`·`//` 안의 `=`는 엔트리 아님 ·
      중복 키(나중 값이 엔트리, `duplicate-key` 보고, 가려진 앞 리터럴 미변경) · `"__proto__" = "x";`가 own property · 빈 값 쓰기(`planClearability`) ·
      CRLF · 0바이트 파일 · 퇴화 출력 왕복 · `bplist00` 매직 명시 거부(design §2.2) · `Base.lproj` 제외 · `fastlane/` 곁가지 · 진입점 `detectCandidatesAcross` 1순위 ·
      **probe 예산 시나리오**(테이블·`fastlane` 후보가 5개를 넘는 iOS 트리에서 실제 `detectFormats` + 읽은 경로 기록 reader로 `Localizable.strings`가 남는다 — design §5) ·
      `.lproj` 이름 해석(`en-GB`·`zh-Hans`·`pt-BR` raw, `Base` 제외) ·
      `create`(인코딩·BOM만 상속, 주석·기준 값 미복사, 값 있는 활성 키만) · **비기준 파일 누락 키 삽입**(기준 순서상 앞 키 뒤·없으면 끝, 이웃 줄바꿈·들여쓰기,
      기준 파일에는 삽입 안 함) · **생성 → 다른 키 번역 → 두 번째 Publish** 왕복(렌더 + `undeliverable` 분류에서 blocking 없음) · `contract.ts` 매트릭스 편입 ·
      **격리 Postgres 진입점 시나리오**(확정 → 첫 적재 → 언어 추가·제거 → Publish 미리보기·첫/둘째 바이트 — 본보기 `lib/pull/__tests__/arb-publish.integration.ts`.
      DB 행에서 멈추지 않고 바이트를 단언한다). 검증: red.
- [x] **T2.2 구현 + 배선** — arb T1.3 손 목록 + 그 "실측 정정"(`SUPPORTED_ADAPTERS`에 추가, 사전 라벨 "Apple strings file" 형 — `/translate` 모드 ①로 ko·es를 정하고,
      번역하지 않으면 `SAME_AS_EN`에 둔다). 같은 커밋에서 MCP `add_locale` 설명과 `unsupported-format` 문구의 지원 포맷 나열에 **Flutter ARB(arb가 놓침)와 Apple strings**를 넣고,
      랜딩 본문 포맷 나열(en·ko·es)도 고친다. 검증: `pnpm test` green →
      껍데기 테스트가 `.strings`를 내려받는다 → `pnpm gate` green. 커밋: `feat(adapters): add Apple strings adapter`
- [x] **T2.3 재측정** — 모바일 + 기존 2코퍼스, 전부 고정 SHA로 돈다(`--pins docs/adapter-survey/pins*.json` — 모바일은 `pins-mobile*.json`, 기준선은 커밋된 `docs/adapter-survey/baseline/` — 명령·비교는 그 README). 검증: 기존 표 회귀 0 · 기준선과 리포별 1순위 diff 0(모바일은 그 포맷이 정답인 리포만 바뀐다) · `.strings` 고정점 100% · 조용한 손실 0 · UTF-16 리포가 분모에 듦 ·
      `Base.lproj` 리포 수·`resource-limit` 거부 수 보고(arb 런에서는 smooth-app 38MB가 첫 적재 합계 10MB를 넘어 거부됐다 — 큰 iOS 리포도 같은 부류다).
      **ARB가 정답인 모바일 리포 14개의 1순위가 ARB로 남는다**(spec 완료 조건 3). 결과로 `docs/adapter-survey/baseline/`을 갱신해 커밋한다(같은 형식, README 출처 줄).
- [x] **T2.4 실물 (수동)** — `/roundtrip`(UTF-8 리포 하나 + UTF-16 리포 하나). M3의 런타임 미검증 항목(실제 GitHub·GitLab이 base64 blob/action을 저장한 바이트)을 여기서 닫는다. 전제: macOS + Xcode, 폐기용 리포. 검증: 고친 셀 외 diff 0, 인코딩·BOM 유지, Xcode 빌드 통과.
      폐기용 리포는 새로 만든다(private, 기존 넷에 Apple이 없다 — arb의 `i18n-arb-check`처럼 계약 항목을 픽스처에 심는다: 주석·중복 키·비정규 이스케이프·누락 키 삽입·UTF-16 BOM 유무).
      만든 리포는 roundtrip 전제 조건 1의 목록에 올린다. GitLab 쪽 base64 바이트는 폐기용 GitLab 프로젝트(`ox501501/malmoi-gitlab-test`)에 UTF-16 파일을 더해 본다.
      Xcode는 머신마다 확인한다(2026-10-19 한 머신에 Xcode 26.6). 없으면 `xcodebuild` 대신 `plutil -lint`로 대체하지 말고 미완으로 보고한다.

## 4. Apple `.xcstrings` (`apple-xcstrings`)

- [ ] **T4.0 서식 실측** — 실제 xcstrings 3개(코퍼스)로 Xcode 출력 서식(들여쓰기·`" : "`·키 정렬·끝 개행·빈 객체)을 골든 픽스처로 채록.
      검증: 픽스처가 원본과 바이트 같다. 커밋은 T4.2에 합친다.
- [ ] **T4.1 테스트** — `sourceLanguage` 기준 언어 · 값 치환 범위 · 없는 로케일 블록 삽입 위치·서식 · `state` 규칙 · `shouldTranslate:false`·`variations`
      보존 · **원문 셀 없는 키는 키를 기준 값으로 읽고, 기준 값 = 키면 기준 셀을 쓰지 않음 · 다르면 원문 셀 삽입 · 다음 read가 삽입 셀 값을 읽음** ·
      **셀 삽입 가능 판정**: `fr`이 다른 키에는 있고 `foo.fr`만 없을 때 경로 선택(`lib/pull/run.ts:388-401`)·미리보기(`lib/publish/read.ts:153-156`)·렌더·
      미전달 토큰 해제가 모두 "전달"로 일치(통합 테스트), ts-dict 보류는 그대로 · `__proto__` 키 · 언어 추가·제거 비지원
      (`SUPPORTED_ADAPTERS`에 없음, `write-create-unsupported`) · 비울 수 없음(불변식 3 수술적 규칙). 검증: red.
- [ ] **T4.2 구현 + 배선** — arb T1.3 손 목록 + "실측 정정"(`SUPPORTED_ADAPTERS`에는 넣지 않는다 — 그래서 `unsupported-format`·MCP `add_locale` 나열에도 넣지 않는다, 사전 라벨 "Apple String Catalog" 형).
      기준 언어는 `sourceLanguage`를 `DetectedFormat.templateLocale`로 싣는다(design §2.3). 화면 비지원 분기는
      `supportsLocaleChanges`에서 파생되므로 만들지 않는다. 검증: `pnpm test` green → 껍데기 테스트 → `pnpm gate` green.
      커밋: `feat(adapters): add Apple xcstrings adapter`
- [ ] **T4.3 재측정 + 실물 (수동)** — 재측정 검증은 T2.3과 같은 기준(기준선 갱신 포함) + 원문 셀 없는 키 비율 보고. `/roundtrip`: Malmoi PR 머지 뒤 Xcode에서 열어 저장해도
      diff 0인지까지(전제: macOS + Xcode).

## 5. 문서 (문서별 커밋)

- [ ] **T5.1 `docs(PRODUCT)`** — §0 포맷 수(arb 뒤 여섯), §2 포지셔닝 문구, §4.1 지원 포맷(arb가 더한 "Flutter ARB" 줄 옆), §7.2 언어 추가·제거 지원 포맷 목록(`xcstrings` 비지원), 비목표(`Base.lproj`).
- [ ] **T5.2 `docs(ARCHITECTURE)`** — §1.9 재측정 표·판정, 파일 인코딩 경로와 API 예산(UTF-16 blob — M3가 §3 Publish 단계 4 옆에 적었다. design의 "§3.1"은 절 번호가 어긋난 것이었다), 값 표현 표(design §3), §0 불변식 3의
      수술적 표면 목록에 `apple-strings`·`apple-xcstrings`, xcstrings 셀 삽입 규칙(ts-dict와의 차이), 키 = 원문 규칙. §1.9는 27차(26차가 arb).
      같은 커밋 밖에서 CLAUDE.md 코어 원칙 두 줄을 맞춘다(`docs(CLAUDE)`, 미러 `pnpm sync:agents`): "pull은 값을 병합하지 않는다"의 수술적 치환 목록에 두 어댑터,
      "언어도 삭제하지 않는다"의 되살림 목록에 `apple-strings`.
- [ ] **T5.3 `docs(ACTIONS)`·`docs(DIRECTORY)`·README·가이드**(`/guide` — en·ko·es 같은 커밋) — 지원 포맷 목록. ACTIONS에는 arb가 만든 `adapter` 허용값 목록이 있다 —
      두 이름을 더하고 "v3 action은 모른다" 문구를 따른다. 가이드는 `reference/formats.md`·`setup/languages.md`·`faq.md` + AUTHORING 사실 대조 행(arb D2가 고친 자리).
      **가이드 커밋은 T2.2·T4.2의 사전 라벨이 dev에 들어간 뒤.**
- 폴더 정리는 이 스펙에서 하지 않는다 — 네 폴더를 android-strings T5.5에서 함께 지운다.
- T5 공통 검증: `pnpm test`(가이드 게이트·`no-korean-ui`) green · `pnpm sync:agents:check` green.
- action·GitLab CI 원본 태그 릴리스는 이 스펙에서 하지 않는다 — android-strings T5에서 세 스펙 합동으로 처리한다(기능 머지 → 새 태그 → SHA 후속 패치).

## 확인 필요 (착수 전)

- ~~**Q5** `.xcstrings`~~ → **이 spec의 마지막 배치**(2026-10-19 사용자, design §2.3).
- ~~**Q6** UTF-16 `.strings`~~ → **이번에 지원, `.strings` 경로에만 판별, 독립 배치**(2026-10-19 사용자, design §2.2).
- ~~키 = 원문~~ → **키를 기준 값으로 읽고, 기준 값이 키와 다를 때만 원문 셀 삽입**(2026-10-19 사용자, Codex 피어 검수로 "편집 거부"를 대체, design §2.3).
- ~~누락 키·xcstrings 전달 판정·비가역 입력~~ → **비기준 파일에 삽입 · 삽입 가능 셀은 보류에서 뺌 · 명시 실패**(2026-10-19 사용자, Codex 피어 검수).
- ~~create~~ → **뼈대만 복제, 값 있는 키만**(2026-10-19 사용자, design §2.1).
- ~~`Base.lproj`~~ → **비목표 + 코퍼스 건수 보고**(2026-10-19 사용자).
- ~~스펙 분할·출시~~ → **세 스펙, 출시·태깅·머지는 한 번**(2026-10-19 사용자).
