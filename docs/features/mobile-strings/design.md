# mobile-strings — design

## 0. 범위·원칙 대조

- 사용자에게 보이는 변화가 없는 **코어 사전 작업**이다. 세 어댑터 스펙(arb → apple-strings → android-strings)이 이 위에 선다.
- **불변식 1·2(병합 없음)**: 값의 출처를 바꾸지 않는다. `basePath`는 경로이고, 인코딩은 I/O 경계의 표현이다.
- **불변식 4(결정성)**: §3 — `blobSha`를 인코딩한 바이트로 잰다. 기존 UTF-8 파일은 바이트·SHA가 그대로다.
- ⚠️ **소비자 없는 선반영처럼 보이는 지점**: `basePath`를 채우는 어댑터(android-strings)와 UTF-16 `.strings`를 읽는 어댑터(apple-strings)가 아직 없다.
  세 스펙이 **한 번에 출시**되므로(결정 2026-10-19 사용자) 프로덕션에 소비자 없이 나가는 기간은 없다. 그때까지 동작은 테스트 픽스처로 고정한다.
  사용자 결정(2026-10-19 — "mobile-strings로 코어 깔고, ARB > apple > android 순")에 따라 코어를 앞당긴 것이다.
- 출시: `/merge`는 세 어댑터 스펙까지 dev에 들어간 뒤 한 번이다(android-strings T5).

## 1. 기준선·코퍼스

- 기준선: survey는 매번 외부 리포의 최신 HEAD를 clone하고 지운다(`lib/survey/run.ts:31·37·51·75`). 상류 변경만으로 리포별 1순위가 바뀌어
  "기존 리포 1순위 불변"을 판정할 수 없다. 그래서 기준선 때 **리포별 SHA를 기록하고 이후 재측정이 같은 SHA로 돌게** 한다. 25차 표(ARCHITECTURE §1.9)는
  집계값뿐이고, 새 기준선과의 차이는 상류 변경으로 따로 설명한다. 새 기준선이 세 스펙 모든 재측정의 회귀 비교 기준이다.
- 모바일 코퍼스: 보유 기준 ARB 9 · Apple 35 · Android 24 리포. Android 정답은 템플릿과 `basePath`의 쌍이다. UTF-16 `.strings`·`Base.lproj`·xcstrings 원문 셀
  없는 키의 건수가 뒤 스펙의 결정 근거로 쓰인다.

## 2. 기준 언어 경로 — `basePath` 컬럼

기준 언어 파일은 `values/strings.xml`이라 `{locale}` 치환으로 표현되지 않는다. `pathTemplate.replaceAll("{locale}", code)`가 `lib/` 비테스트
소스 **22줄**에 흩어져 있다(2026-10-19 grep `replace(All)?("{locale}"`).

- **(결정 2026-10-19 사용자, `/feature-review`에서 재확인) Android base만 별도 필드** — `DetectedFormat.basePath`(탐지가 관측한 base 파일 경로, 예
  `app/src/main/res/values/strings.xml`)와 additive 컬럼 `TranslationSurface.basePath String?`. 다른 어댑터는 항상 null이다.
  기존 22줄의 `{locale}` 치환은 그대로 두고, **base 로케일 경로가 들어가는 자리를** `basePath ?? 치환`으로 분기한다.
- ⚠️ 22줄 대부분은 "모든 로케일" 루프이고 그 안에 기준 언어가 들어 있다 — 기준 언어 전용 자리만 고치면 빠진다. 분기가 필요한 자리는
  리뷰(2026-10-19 CTO)가 찾은 아래 목록이고, M2a가 grep으로 확정해 소스 테스트가 센다(**basePath 표면에서 base 경로를 치환으로 만드는 자리가
  남으면 red**). 하나라도 빠지면 기준 경로가 `values-en/strings.xml`로 계산된다 — import는 `base-locale-missing`, Publish 미리보기는
  `PreviewBaseFileMissing`, 최악은 Publish가 없던 `values-en/`에 새 파일을 만든다.
  - **읽는 자리(경로 계산)**: `resolveLocalePaths`(`lib/pull/plan.ts:143` — 호출자 6곳 + Publish 미리보기 `lib/publish/read.ts:94`) ·
    `selectLocaleFiles`(`lib/push/payload.ts:45`) · `templatePaths`·`localeOfTemplatePath`(`lib/onboarding/confirm.ts:22-49` — 기대는 쪽
    `lib/import/surface.ts:33`·`lib/import/locales.ts:18`·`lib/onboarding-run/add.ts:86`·`lib/import/empty.ts`, 온보딩 샘플 확인 `planConfirmedFormat`) ·
    `probeTargets`(`lib/onboarding/detect.ts:48`) · `verifySamples`(`lib/adapters/shared.ts:365`) · `loadCandidateSample`(`app/(edit)/projects/actions.ts:535`) ·
    `lib/projects/remote-plan.ts:39`(빠지면 가장 흔한 변경인 `values/strings.xml` 편집이 0으로 집계된다) · `foreignPaths`·`surfacePaths`
    (`lib/pull/locales.ts:80`·`lib/locales/change.ts:138` — 빠지면 다중 표면 겹침을 놓친다) · `planLocalePublish`의 `path-conflict`(basePath도 소유 경로) ·
    `observeLocaleFiles`(`lib/pull/locales.ts:241`) · `scripts/ingest.ts:122` · survey 다섯 줄(`lib/survey/one.ts:438` 등) ·
    화면 `components/onboarding/steps/base-locales.tsx:171`(③ 근거 경로) · ③ `naming.info`(`naming.tsx:66`·`new-project.tsx:700-702`) ·
    Sources "Path pattern"(`source-detail-modal.tsx:128`·`sources-screen.tsx:144`) — **화면 자리는 표시 문구가 함께 바뀌므로 android-strings T3.2b가 든다.**
    M2는 `lib/`·`scripts/`·`app/` 서버 자리까지다.
  - **쓰는 자리(컬럼 기록)**: `applyPush`(`lib/push/apply.ts:465`) · 소스 추가(`lib/surfaces/create.ts:100-114`) · 온보딩 생성(`lib/onboarding-run/create.ts:306`) ·
    제거된 소스 재추가 첫 적재(§5.9 — 재탐지값으로 갱신) · MCP `attach_source` 계열 — POSTMORTEM 2026-09-15(쓰는 자리를 전수로 안 셌다).
  - **지문·대조에 드는 자리**: `lib/locales/fingerprint.ts:36` · `lib/publish/fingerprint.ts:43` · `lib/protection/fingerprint.ts:55` ·
    `lib/translations/context.ts:44` · 야간 CAS(`lib/nightly/run.ts:183-187`) · 온보딩 서명(`lib/onboarding/sample-confirmation.ts:11`) ·
    `lib/mcp/confirm.ts:41` · `plan-revival`(`lib/surfaces/plan-revival.ts:16`)의 일치 판정.
- 외부 계약: CLI가 리포에서 다시 탐지하므로 `basePath`도 CLI 탐지가 내고 `checkFormat` 비교 항목에 든다 — 등록된 값과 다르면
  `format mismatch`(경로 이전과 같은 취급). action 입력은 늘리지 않는다(`path-template`만으로 후보를 고르고 basePath는 그 후보에 딸려 온다).
  ⚠️ 옛 CLI가 `basePath` 없이 보낸 페이로드가 기존 4포맷 표면에서 `format mismatch`가 되지 않아야 한다(null 대 undefined).
- 경로 안전: `basePath`에도 `isPathSafeRepoPath`를 push 스키마·`resolveLocalePaths` 두 경계에서 건다(POSTMORTEM 2026-09-09).
- 언어 제거: 삭제 경로는 `localeFilePath(template)`이 정하고 기준 언어는 `change-plan.ts:87-89`가 거부하므로 `values/strings.xml`은 지금 구조상 안전하다.
  `basePath` 도입 뒤에도 그 성질을 회귀 테스트로 고정한다(REMOVE가 `basePath`를 delete로 만들지 않음, `values-en/`과 `values/`가 공존하고 base가 en인 경우).
- 마이그레이션: nullable 컬럼 추가 하나라 버전을 건너뛴 업그레이드에서도 안전하다(SELF-HOSTING §3). `/db`가 dev(`/push` 전) → `/merge` 1단계가
  prod(`pnpm db:deploy` + prod `has_schema_privilege` false). `prisma/migrations/`·`lib/pull/`·`lib/locales/`는 gate-plan의 격리 postgres 스위트 트리거다
  (`scripts/gate-plan.ts:81`) — 그 배치의 `pnpm gate`가 더 오래 돈다.
- (기각) 22줄을 `localePath` 하나로 모으기 — 분기가 한 곳이지만 이관 범위가 넓다(사용자 선택).
- (기각) `values-{locale}` → `values` 유도로 컬럼 없애기 — 리뷰 제안, 사용자가 컬럼 유지를 골랐다(2026-10-19).
- (기각) 디렉터리 이름 전체를 로케일 코드로(`values-ko`) — `isLocaleShaped`(`lib/locale-code.ts`)가 거부한다. 보안 경계를 풀어야 한다.
- (기각) `values{locale}` + 코드 `-ko`·`""` — 빈 코드가 `isPathSafeLocale`에 걸린다.

## 3. `.strings` 파일 인코딩 경로

지금 블롭은 무조건 UTF-8로 읽고 쓴다.

- 읽기: GitHub `lib/github.ts:322·409` · GitLab `lib/gitlab/plan.ts:93` · CLI(push:local·CI) `scripts/format.ts:25` `fileProbe`의 `readFileSync(…, "utf8")` ·
  survey `lib/survey/run.ts:63`(NUL 바이트 파일을 **건너뛴다** — 그대로 두면 UTF-16을 한 번도 재지 않고 완료 조건이 green이 된다).
  ⚠️ `lib/cli/walk.ts`는 사용처 스캔(`refs`) 소스를 읽는 곳이라 대상이 아니다.
- 쓰기: GitHub은 트리 API에 내용을 인라인으로 싣는다(`lib/github.ts:415-418` `buildTreePayload`) · GitLab commit `encoding: "text"`(`lib/gitlab/plan.ts:20`).
- 해시: `lib/githash.ts` `blobSha(content)`(UTF-8 바이트로 잰다). 호출자 `lib/pull/plan.ts:266` · `scripts/ingest.ts:147`, 테스트 `contract.test.ts:226`(git hash-object 일치).

UTF-16 파일을 그대로 두면 깨진 문자열을 파싱하고(CI push는 strict 덮어쓰기라 DB 값이 오염된다), 쓴 파일은 UTF-8로 바뀌어 **파일 전체가 diff**가 된다.

- **범위: 경로가 `.strings`로 끝나는 파일에만 UTF-16 판별을 건다**(결정 2026-10-19 사용자). 리더는 어댑터를 몰라도 경로로 판정할 수 있고,
  기존 4포맷 파일의 회귀 면적이 0이다. 그 밖의 파일은 지금처럼 UTF-8이다.
- 순수 함수 둘: `decodeFileBytes(path, bytes) → { content, encoding }`(`.strings`면 BOM 우선, BOM 없으면 NUL 바이트 패턴으로 UTF-16 판별, 그 밖은 UTF-8)와
  `encodeFileContent(content, encoding) → bytes`(원본 BOM 유무 포함). `encoding`은 `"utf-8" | "utf-16le" | "utf-16le-bom" | "utf-16be" | "utf-16be-bom"`.
  ⚠️ 지금 UTF-8 BOM은 문자열 안의 `﻿`로 어댑터가 다룬다(`json-style.ts:57-62·142`·B7a) — **기존 동작을 바꾸지 않도록** UTF-8은 지금처럼 BOM을
  문자열에 남긴다. `encodeFileContent(s, "utf-8")`은 `Buffer.from(s, "utf8")`와 바이트까지 같아야 한다(테스트 이름으로 고정).
- **유효한 인코딩만 왕복을 보장한다.** UTF-16 판별 신호가 없는 입력(BOM 없는 짧은 ASCII 등)은 지금처럼 UTF-8이다. UTF-16 신호는 있는데
  무손실로 디코드되지 않는 입력(BOM + 짝 없는 서로게이트 `FF FE 00 D8`, BOM 뒤 홀수 바이트 길이)과 유효하지 않은 UTF-8은 **명시 실패**로 적재·쓰기를
  막는다(`parse-failed` 부류) — UTF-8로 대신 읽으면 U+FFFD로 바뀌어 원본 바이트·`blobSha` 보존과 동시에 성립할 수 없다(Codex 피어 검수, 2026-10-19 사용자).
- `AdapterFile`에 `encoding?`(없으면 UTF-8)을 싣는다. 리더 넷(GitHub ×2·GitLab·`scripts/format.ts`)과 survey가 `decodeFileBytes`를 지나고, 렌더 출력은
  그 파일의 원본 인코딩을 물려받는다(새 파일은 기준 언어 파일 인코딩 — 불변식 4의 "표현은 기준 언어 파일 하나에서만 빌린다").
- 쓰기: GitHub은 UTF-16 파일만 `POST /git/blobs`(base64)로 blob을 먼저 만들고 트리에서 sha로 참조한다 — **UTF-16 파일 하나당 API 호출 하나가 늘어난다**
  (ARCHITECTURE §3.1 API 예산에 기록). GitLab은 그 파일만 `encoding: "base64"`. **`blobSha`는 인코딩한 바이트로 잰다** — 문자열로 재면
  변경 감지(`lib/pull/plan.ts:266`)가 매번 "변경됨"을 뱉는다(불변식 4·CLAUDE.md "export는 결정적"). 변경 없는 UTF-16 파일은 API 호출 0이다.
- 어댑터는 문자열만 본다 — 인코딩은 I/O 경계의 일이다.
- 결정성 테스트: 모든 인코딩에서 `encode(decode(b)) === b`, 같은 DB + 같은 원본 → 같은 바이트 · 같은 `blobSha`.

## 4. 순수 함수 (= `/tdd` 진입점)

| 함수 | 위치(안) | 계약 |
|---|---|---|
| survey SHA 고정 | `lib/survey/` | 같은 SHA 입력 → 리포별 같은 보고서 |
| `baseFilePath(format, baseLocale)` | `lib/adapters/shared.ts` 인근 | `basePath ?? 치환` — base 경로가 들어가는 자리 전용 |
| `decodeFileBytes` / `encodeFileContent` | `lib/file-encoding.ts`(잎) | `.strings`만 UTF-16 판별, 5 인코딩 왕복, UTF-8 바이트 불변, 비가역 입력 명시 실패 |
| `blobSha(bytes)` | `lib/githash.ts` | 인코딩한 바이트로 잰다, UTF-8 문자열 입력과 같은 값 |

## 5. 스키마 · 환경변수 · 패키지

- 스키마: **additive 하나** — `TranslationSurface.basePath String?`. 마이그레이션은 §2.
- 환경변수·패키지: 없음.

## 6. 과거 함정 (POSTMORTEM)

- 2026-09-02 껍데기가 파일을 안 골랐다 — survey의 NUL 스킵(§3)이 같은 부류다.
- 2026-09-09 검증이 한쪽 경로에만 있었다 — `basePath` 경로 안전을 두 경계에, 인코딩 판별을 웹·CI 리더 모두에.
- 2026-09-15 컬럼을 더하며 쓰는 자리를 전수로 안 셌다 — §2 쓰는 자리 목록.
