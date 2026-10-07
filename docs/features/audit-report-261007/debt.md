# Debt 정적 감사 — 2026-10-07

## 기준·제약

- 시작 HEAD와 감사 기준 `origin/dev`: `bc8b204f18fa1aa88a0423e28f0789876f1fbf54`. 시작 및 중간 `git rev-parse HEAD` 일치, 작업 트리 추적 변경 없음.
- 최근 diff에 제한하지 않고 lib, app, components, scripts, 정본 문서·README·env·feature tasks를 조사했다. Codex 하위 탐색 에이전트 3개(lib-health / app-scripts / docs-gap)를 병렬 활용했다.
- `source-command-audit` 적용. 오래된 skill의 shadcn 생성물 설명과 pending-only 설명은 사용하지 않았다. `components/ui`는 리포 소유이며 import·계약만 확인하고 내부 스타일은 제외했다. 자동 적재는 pending·PR·publish-raced 현재 구현을 기준으로 판단했다.
- 코드·설정·문서 수정, 빌드, typecheck, 테스트, 커밋, push, 브라우저, 원격 DB 검증을 수행하지 않았다. 이 보고서만 작성했다. 아래 “유지”는 정적 방어 형태 확인이며 런타임 통과를 뜻하지 않는다.

## 발견

총 8건: 🔴 1건 · 🟡 5건 · ⚪ 2건. 실제 런타임 재현은 수행하지 않았으며 각 항목에 정적 실패 경로와 검증 한계를 적었다.

### 1. 🔴 보류된 옛 CI job 재실행 안내가 머지된 번역을 다시 덮는 경로를 권한다

- 근거: `lib/cli/push-response.ts:20`, `:22`, `:25`는 pr-check-failed·publish-raced·pending-edits에 “Re-run this job”을 안내한다. `docs/ACTIONS.md:234`, `:236`도 재실행을 권하지만, 같은 문서 `:235`는 PR 머지 뒤 옛 job 재실행이 strict 덮어쓰기를 일으키므로 금지한다고 명시한다.
- 실패 시나리오: 마지막 적재 A 뒤 커밋 B의 CI가 pending 등으로 보류된다. 편집을 Publish한 P가 머지되고 마커로 P의 push 적재는 건너뛴다. 안내를 따라 B job을 재실행하면 pending=0·PR 없음이고 시작 전 Publish 시각과 잠금 안 시각도 같아 publish-raced가 아니다. `lib/push/guard.ts:133`의 순서 검사는 마지막 **적재** 시각 A와 B만 비교해 통과하며, B의 옛 번역이 strict 적재된다. 이후 재Publish는 되돌아간 DB 값으로 PR을 만들 수 있다.
- 경계: 임의의 옛 커밋 push를 전부 금지하라는 지적이 아니라, 이미 문서가 인정한 위험 경로를 제품 안내가 권한다는 결함이다. 현재 소스 및 CLI 호출 경로에 대한 정적 증명이다. v3 action 발행·사용 여부와 실제 원격 재현은 확인하지 않았다.
- 기존 테스트 공백: `lib/cli/__tests__/push-response.test.ts`는 사유·exit code·warning 유무만 검사하고 안내대로 재실행한 뒤의 상태를 잇지 않는다. `publish-raced`는 **그 요청 도중** Publish 완료만 보호하므로 이 순차 시나리오를 막지 않는다.
- 제안: 보류 경고와 ACTIONS의 재개 안내를 최신 push 또는 야간 적재로 통일한다.

### 2. 🟡 PostgreSQL 테스트가 검증하는 구현 경로가 로컬 게이트 트리거에서 빠졌다

- 근거: `scripts/gate-plan.ts:25`의 projects 목록과 `:57`의 credentials 목록. projects는 `app/(edit)/projects/actions.ts`, `app/(edit)/projects/[slug]/settings/actions.ts`, `app/(edit)/projects/[slug]/sources/actions.ts`, `app/invite/actions.ts`, `app/search/actions.ts`, `app/api/push/failure/route.ts`를 포함하지 않는다. credentials는 `lib/account-connect/`, `lib/login-link/`, `lib/session-revocation/`를 포함하지 않는다.
- 실제 연결: `lib/events/__tests__/locked-access.integration.ts:44`부터 앞의 Project/Settings/Sources Action을 import한다. `lib/invitation-email/__tests__/invitation.integration.ts:10`은 초대 수락 Action, `lib/keys/__tests__/search.integration.ts:5`는 검색 Action을 부른다. `lib/keys/__tests__/source-remove.integration.ts:305`는 push/failure Route를 부른다. `lib/credentials/__tests__/postgres.integration.ts:2`–`:28`은 자격증명 껍데기를 import하고 `:473`–`:479`에서 동시 세션 회수·단일 소비를 단언한다.
- 실패 시나리오: 위 Action 또는 자격증명 구현만 바꾸면 `planGate([그 경로])`가 PG 스위트를 전부 생략한다. 잠금 대기 중 권한 철회·수락 경합 등 mock으로 검증하지 못하는 회귀가 해당 PG 검증 없이 dev에 갈 수 있다. 실제 회귀가 현재 발생했다는 주장은 아니다.
- 기존 테스트 공백: `scripts/__tests__/gate-plan.test.ts:67`은 테스트 **위치**인 include 디렉터리만 대조한다. 구현과 테스트가 다른 디렉터리인 경우는 목록에서 빠져도 통과한다. 일반 `vitest.config.ts:36` include는 `.test.*`이며 `.integration.ts`를 수집하지 않고 CI도 `pnpm test`만 호출한다.
- 회고 재발: POSTMORTEM 2026-09-10 “스위트는 애초에 안 돌아간다”, 2026-10-07 “비동기 경계와 검증 트리거가 구현의 끝까지 닿지 않았다”의 같은 구조다.
- 제안: 두 PG 스위트가 직접 검증하는 구현 경로를 트리거와 단독 경로 테스트에 포함한다.

### 3. 🟡 MCP list_keys가 반환하는 일치 위치가 Unicode 소문자 확장 후 어긋난다

- 근거: `lib/keys/translation-list.ts:234`–`:242`는 `text.toLowerCase().indexOf(needle)`를 원문 `text`의 `start`로 반환하며 번역값도 `:255`–`:257`에서 같다. `lib/mcp/tools/keys.ts:44`는 `keys: page.rows`로 이를 외부에 그대로 반환한다.
- 실패 시나리오: 원문/키 `İabc`, 검색어 `a`. 소문자 문자열 `i\u0307abc`의 위치는 2지만 원문에서 `a`는 1이고 2는 `b`다. ASCII `a` 검색이므로 DB의 터키어 대소문자 규칙에 의존하지 않는다.
- 기존 테스트 공백: `lib/keys/__tests__/translation-list.integration.ts:254`–`:266`은 ASCII·한글만 사용해 소문자화 길이가 늘지 않는다. `lib/search/highlight.ts:4`는 이미 역매핑을 구현하지만 이 경로는 공유하지 않는다.
- 회고 재발: 2026-09-13 “소문자화한 위치로 원래 이름을 잘라 검색 강조가 어긋났다”.
- 제안: 원문 위치 역매핑을 공유하고 MCP 반환값까지 확장 문자 입력을 고정한다.

### 4. 🟡 문서 신선도 트리거의 코어 목록에서 실제 lib 디렉터리 15개가 빠졌다

- 근거: `.claude/commands/push.md:113`의 ARCHITECTURE 후보 목록과 `docs/ARCHITECTURE.md:3`의 목록은 서로 같지만 실제 디렉터리를 다 포함하지 않는다. 명시 규칙은 새 lib 디렉터리를 추가하라는 것이다.
- 누락: `lib/changelog/`, `lib/color-scheme/`, `lib/device-cookies/`, `lib/guide/`, `lib/inbox/`, `lib/landing/`, `lib/mcp/`, `lib/nightly/`, `lib/oauth-server/`, `lib/oauth/`, `lib/onboarding-run/`, `lib/operator/`, `lib/public-doc/`, `lib/seo/`, `lib/status/`.
- 실패 시나리오: 기존 `lib/nightly/plan.ts`나 `lib/inbox/query.ts`의 동작만 고치는 경우 파일 추가·이동 트리거도 없고, 열거된 코어 변경 트리거도 없어 관련 ARCHITECTURE 절 검사가 후보에서 빠질 수 있다. 두 사본이 같은지만 비교해서는 실제 모듈 누락을 못 잡는다.
- 기존 검사 공백: 미러 게이트는 원본/미러 동일성만 검사한다. 두 정본 목록이 함께 낡은 경우를 검증하지 않는다.
- 제안: 실제 디렉터리와 코어 트리거 목록의 대응을 정리한다.

### 5. 🟡 PRODUCT가 System 기본값을 구현된 기능과 비범위로 동시에 분류한다

- 근거: `docs/PRODUCT.md:391`은 기본 System과 계정→쿠키→system을 확정하지만 `:443` 비범위에 “System 기본값”이 남았다. `lib/color-scheme/scheme.ts:30`은 실제로 system을 폴백한다.
- 실패 시나리오: 신규 테마 작업이 §4.2를 따라 현재 기본값을 범위 밖으로 오판한다. 사용자는 정본의 비범위 목록을 판단 근거로 쓰도록 지시되어 있어 운영상 혼동을 만든다.
- 기존 테스트 공백: 테마 판정 테스트는 실제 system 반환을 검사하고 PRODUCT 본문의 상반된 정책을 검사하지 않는다.
- 제안: §4.2의 옛 System 기본값 제외를 제거한다.

### 6. 🟡 자동 적재 보류의 상위 설명이 publish-raced 이전 계약에 머물러 있다

- 근거: `CLAUDE.md:34`와 `docs/ARCHITECTURE.md:35`, `:1632`는 입력이 미전달 수와 PR 여부 둘이고 둘 다 비면 strict 적재한다고 단언한다. 같은 ARCHITECTURE `:902`, `:1643` 및 `lib/push/apply.ts:157`, `lib/import/run.ts:106`은 lastPublishedAt 변경을 셋째 보류 근거로 사용한다.
- 실패 시나리오: 회귀 수정이나 새로운 자동 적재 경로 구현이 상위 불변식 설명만 따라 timestamp 경합 방어를 생략할 수 있다. 현재 코드의 경합 방어가 빠졌다는 지적은 아니다.
- 기존 테스트 공백: CI/야간 경합 테스트는 코드 동작을 검증하고 세 문서 문장의 완전성을 검증하지 않는다.
- 같은 절 `docs/ARCHITECTURE.md:1636`의 보류 사유 “넷”도 `lib/events/payload.ts:78` 및 아래 표의 다섯(pending-edits/open-pr/pr-check-failed/publish-raced/too-large)과 어긋난다.
- 제안: 사전 판정 둘과 잠금 안 Publish 완료 표식 재검을 상위 설명에 함께 적고 사유 개수를 맞춘다.

### 7. ⚪ ARCHITECTURE가 삭제된 쿠키 속성 모듈을 아직 가리킨다

- 근거: `docs/ARCHITECTURE.md:2959`는 `lib/color-scheme/cookie-spec.ts`를 가리킨 뒤 다음 줄에 `lib/device-cookies/spec.ts`를 중복 연결한다. 앞 파일은 존재하지 않고 후자의 `deviceCookieSpec`이 실제 공유 구현이다.
- 실패 시나리오: 문서가 가리킨 옛 경로를 열어 계약을 확인할 수 없다. 실행 동작 영향은 없다.
- 기존 검사 공백: 미러·타입 검사는 Markdown의 inline 코드 경로 존재를 검사하지 않는다.
- 제안: 오래된 경로 조각을 걷는다.

### 8. ⚪ 웹 번역 검색은 화면에서 쓰지 않는 match 조각을 추가 조회·직렬화한다

- 근거: `lib/keys/translation-list.ts:220`은 검색 시 `matchesFor`를 무조건 호출하고 `:249`의 별도 SQL로 번역값을 읽는다. `components/translations/workspace/key-list.tsx:123`–`:160`은 원문·키·상태만 렌더하고 match를 읽지 않는다. MCP는 이 필드를 실제 반환하므로 전역 dead field가 아니다.
- 발생 시나리오: 키/원문이 아닌 번역값 검색에서 웹이 추가 SQL과 match.text 직렬화를 수행하지만 UI 결과에는 쓰이지 않는다. 체감 시간의 크기는 측정하지 않았다.
- 기존 테스트 공백: translation-list 통합 테스트와 성능 테스트는 match 생산을 요구하지만 웹 소비를 검사하지 않는다.
- 제안: MCP 계약을 유지하면서 웹 조회에 불필요한 일치 조각 생산을 생략할지 정리한다.


## POSTMORTEM 143개 항목별 검사 기록

143개 절을 분담해 전부 읽었다. 아래 명령은 실제 정적 검색/파일 읽기의 요약이며 패턴 사이 슬래시는 정규식 대안 표기를 줄인 것이다. 검색 사실이 전체 의미 검증 통과를 뜻하지 않는다. 런타임·브라우저·PostgreSQL·테스트·빌드는 실행하지 않았으며 부분 검증 한계는 행마다 남겼다.

| PM 줄·헤딩 | 검사 명령·소스 근거 | 판정·검증 한계 |
|---|---|---|
| 21: 2026-08-31 — 모듈 로드 시점에 환경변수를 요구해 CI가 red | rg requireEnv lib; read prisma.config.ts | Lazy access/conditional datasource exists; clean build not run. |
| 48: 2026-08-31 — process.exit()이 파이프 stdout을 잘라먹고, exitCode로 바꾸니 조기 종료가 사라짐 | rg process.exit scripts | Normal large output uses exitCode; pipe not executed. |
| 65: 2026-08-31 — 레이아웃 인증 검사가 데이터 노출을 막지 못했다 | rg if.*!session app | Remaining sessionToken branches and test comments distinguished. |
| 82: 2026-08-31 — 외부 계약 페이로드를 리터럴로 조립해 필수 필드가 늘어도 컴파일러가 침묵했다 | rg z.infer lib; rg buildPushPayload scripts/push-local.ts | Central producer exists; all producers not fully compared. |
| 98: 2026-09-01 — 라이브러리가 이미 하는 인코딩을 또 해서 조용한 404를 만들었다 | rg encodeURIComponent lib | Browser URL builders distinguished from Octokit arguments. |
| 124: 2026-09-02 — 구분자가 데이터에도 있어서 중첩 복원이 값을 조용히 삼켰다 | rg locate/resolveLast/findScalar/insertPath lib/adapters | Path and duplicate guards inspected; corpus not executed. |
| 149: 2026-09-02 — 껍데기가 파일을 안 골라 어댑터가 "존재하지 않았다" | rg writeStrategy/multi-locale lib | Surgical original input verified; roundtrip not run. |
| 166: 2026-09-02 — `pnpm <script> --json &#124; jq`는 이 리포에서 한 번도 동작한 적이 없다 | rg -- --json.*jq docs/ACTIONS.md CLAUDE.md scripts .claude/commands | Warning text distinguished from executable pipes. |
| 185: 2026-09-02 — 순위 픽스가 자기 단위 테스트만 통과하고 실제 경로에서는 죽어 있었다 | rg liftAncestors/rankTemplateCandidates/compareTemplates lib/adapters | Shared ranking exists; full corpus comparison not performed. |
| 200: 2026-09-02 — 학습 코퍼스의 오탐 0.0%가 처음 보는 리포에서 40%였다 | read ARCHITECTURE training/holdout sections | Populations distinguished; no measurement. |
| 215: 2026-09-02 — 지표 하나가 반년째 구조적으로 0이었고, 그 사실을 단위 테스트가 가려 줬다 | rg configFiles/const.*lower scripts lib/survey | Consumers found; full field semantics incomplete. |
| 230: 2026-09-03 — 주석이 "명시 지정은 동작한다"고 단언했고, 그걸 검사하는 테스트의 **이름만** 그랬다 | rg detectFormatWith lib/onboarding/detect.ts | Actual detector call exists; no execution. |
| 247: 2026-09-03 — 고쳐 놓고도 지표가 낡아서 "성공"을 "실패"로 읽었다 | rg Causes/Errors/Skips lib/survey scripts | Outcome dimensions distinguished; survey not executed. |
| 264: 2026-09-03 — 빌드가 생성물을 안 만들었고, 게이트 둘이 각자 다른 이유로 가려 줬다 | read package.json .github/workflows/ci.yml .npmrc prisma.config.ts | Generation/font gates exist; clean build not run. |
| 282: 2026-09-03 — 실패한 조회를 "없음"으로 읽어 경고가 존재하지 않는 것과 구별되지 않았다 | rg 2>/dev/null or &#124;&#124;true .github scripts | Comments distinguished; live permissions not checked. |
| 305: 2026-09-03 — 값이 맞으면 통과하는 검증이 스타일 손실을 못 봤다 (인용 부호) | rg doc.toString/setIn/applyTextChanges/dominantQuote/valueLiterals lib/adapters; read roundtrip skill | Surgical formatting and fixed-point procedure exist; roundtrip not run. |
| 327: 2026-09-04 — 완료 조건에 "방향만 게이트"를 걸었는데 그 방향을 잴 수단이 없었다 | rg direction-only claims docs/features/*/spec.md | No matching vague claim; not complete specification validation. |
| 341: 2026-09-04 — 표현 축 하나를 원인 카운터에 이름이 없어서 설계가 못 봤다 (슬래시 이스케이프) | rg escape/indent/compact lib/adapters/json-style.ts | Representation dimensions exist; exhaustive formats not run. |
| 355: 2026-09-05 — 검증은 했는데 검증한 값을 저장하지 않아 두 주소가 갈릴 뻔했다 | Full section read only; no independent debt search | INCOMPLETE: reconcile boundary/principle/invariant audit; not a clean finding. |
| 370: 2026-09-05 — 테스트 가짜가 실제 제약보다 관대해서 결함 하나를 원리적으로 못 봤다 | rg unique prisma/schema.prisma; rg P2002 lib | Constraint/error candidates searched; full mapping incomplete. |
| 387: 2026-09-05 — 경고는 문서에 있었는데 배선이 지키지 않았고, 부하가 낮아 오래 안 드러났다 | read .env.example docs/OPERATIONS.md | Pooler ports/templates checked; secrets/live environment not inspected. |
| 428: 2026-09-05 — 라우트를 옮겼는데 링크 생성기가 옛 경로를 하드코딩해 사이드바가 전부 404였다 | rg redirect/routes app; read app/__tests__/entry-points.test.ts | Generators/receivers inspected; all URL roundtrips not run. |
| 446: 2026-09-06 — 실패 사유를 쿼리로 넘겨놓고 읽는 쪽을 안 만들어 거부가 통째로 무음이었다 | rg redirect/routes app; read app/__tests__/entry-points.test.ts | Generators/receivers inspected; all URL roundtrips not run. |
| 485: 2026-09-06 — 리다이렉트 횟수로 검증해서 전면 장애를 "정상"으로 읽었다 | read lib/auth/session.ts lib/github-connect/health.ts | Failure classification exists; no live session/credentials checks. |
| 508: 2026-09-06 — 인가는 지났는데 조회를 그 사용자로 좁히지 않아 남의 GitHub 계정이 화면에 뜰 뻔했다 | rg prisma.account/session/user app lib auth.ts | Production candidates collected; independent complete boundary audit not done. |
| 524: 2026-09-06 — GitHub App 개인키를 하나 지웠더니 네 곳이 동시에 끊겼고, 증상은 "App이 설치돼 있지 않다"였다 | read lib/auth/session.ts lib/github-connect/health.ts | Failure classification exists; no live session/credentials checks. |
| 541: 2026-09-07 — 클라이언트 번들에 7.2MB가 들어갔고, 확인이 잘못된 패턴을 grep해서 "안전"으로 읽었다 | rg keys/view app components | Two server-page consumers; bundle not built. |
| 591: 2026-09-07 — `revalidatePath`가 방금 받은 적재 결과 문구를 씻어냈다 (불변식 9가 사용자에게 안 닿았다) | rg setResult.*idle/setStatus.*idle components | Submit/user resets distinguished from effect reset. |
| 626: 2026-09-07 — 컬럼의 **의미**가 바뀌었는데 렌더는 그대로여서 번역자에게 cuid가 보였다 ([malmoi#3](https://github.com/SinhyeokKang/malmoi/issues/3)) | rg maskEmail/emailLabel/loadActors/actorLabel app components | Masked actor path exists; collision runtime not run. |
| 643: 2026-09-07 — 방어선 셋이 "검사한다"고 주장한 것을 검사하지 못했고, 전부 green이었다 | rg matchAll/test/exec adapter tests; read write-contract.test.ts | namedWriteInput/meta checks exist; all regex semantics incomplete. |
| 661: 2026-09-08 — `?? 폴백`이 프로토타입 키를 못 막아 문자열 자리에 **함수**가 왔다 | rg Object.create/null-prototype/asError lib app components | Safe maps inspected, no app/components as Error; all assignments incomplete. |
| 680: 2026-09-08 — 라이브러리가 요구하는 조상 provider를 프리미티브가 계약에 안 넣어 "접기"가 셸을 죽였다 | rg radix-ui components/ui | Import/consumer contracts only; internal styling excluded. |
| 698: 2026-09-08 — 제출 버튼이 없는 `<form>`이라 검색창의 Enter가 조용히 무효였다 | rg form/submit/SubmitButton/ProviderButton app components | Form ownership distinguished; browser submit not run. |
| 720: 2026-09-08 — 실패한 Publish 뒤의 `router.refresh()`가 방금 만든 오류 문구를 씻고 로그인 화면으로 데려갔다 | rg router.refresh app components | Failure and success refresh distinguished; network runtime not run. |
| 750: 2026-09-08 — 도달 불가한 오류 갈래를 겨냥한 테스트가 1년치 green이었다 — 단언이 보간된 키만 봤다 | rg message.includes/message.*toMatch lib tests | scan literal diagnostic check is intentional; complete reachability not checked. |
| 765: 2026-09-08 — 접어 둔 진단이 개행을 잃었고, 고친 뒤에도 절반만 고쳐진 채 새 검사가 green이었다 | rg text-mono/whitespace-pre-wrap onboarding sync-result publish-button | Literal whitespace consumers inspected. |
| 782: 2026-09-09 — 마스킹한 이메일이 두 초대를 같은 행으로 만들었고, 되돌릴 수 없는 버튼이 그 위에 있었다 ([malmoi#18](https://github.com/SinhyeokKang/malmoi/issues/18)) | rg maskEmail/emailLabel/loadActors/actorLabel app components | Masked actor path exists; collision runtime not run. |
| 798: 2026-09-09 — 앱 층 인가를 촘촘히 만들었는데 DB가 인터넷에 열려 있었다 (Supabase advisor가 알려줬다) | read db skill OPERATIONS schema | USAGE/ACL procedure exists; live DB not queried. |
| 825: 2026-09-09 — 일회용 허가를 "다음 push에서 비운다"로 구현해, 흔한 경로에서 기능이 조용히 무력화됐다 | Full section read only; no independent debt search | INCOMPLETE: reconcile boundary/principle/invariant audit; not a clean finding. |
| 848: 2026-09-09 — 번역자가 셀 하나를 비우면 키가 사라질 수 있었다, 그리고 되돌린 편집이 PR에 남아 있었다 | Full section read only; no independent debt search | INCOMPLETE: reconcile boundary/principle/invariant audit; not a clean finding. |
| 866: 2026-09-09 — 화면을 라우트 밖으로 옮겼는데 그 화면을 무효화하던 경로가 따라가지 않았다 | rg revalidatePath/readiness app lib | Connection/settings/layout refresh exists; all readers incomplete. |
| 913: 2026-09-09 — 프리미티브가 `asChild` 자식 옆에 형제를 붙여, 프로젝트 스위처를 **한 번 열면** 셸이 죽었다 | rg DialogTrigger/asChild components; read Slottable tests | Busy consumer contract exists; real input interaction not checked. |
| 935: 2026-09-09 — 실측이 고정 3.3초를 "순차 DB 왕복"으로 진단했고, 원인은 함수가 지구 반대편에서 돌던 것이었다 | read vercel.json; rg hnd1 docs | hnd1 configured; deployment not measured. |
| 949: 2026-09-09 — 프로토타입 키의 **조회** 자리만 닫고 **대입** 자리 다섯을 1년 가까이 남겨 뒀다 | rg Object.create/null-prototype/asError lib app components | Safe maps inspected, no app/components as Error; all assignments incomplete. |
| 966: 2026-09-09 — 검증이 **탐지** 경로에만 있었고 **적재** 경로에 없어, 페이로드가 리포 경로를 정했다 | Full section read only; no independent debt search | INCOMPLETE: reconcile boundary/principle/invariant audit; not a clean finding. |
| 983: 2026-09-09 — 주석이 방어를 서술하고 코드는 안 했다 (`catch`는 오류일 때만 돈다) | rg statSync/lstatSync/isSymbolicLink lib scripts | Walker skips symlinks; filesystem attack not simulated. |
| 998: 2026-09-09 — 문서가 단언한 통제가 배선되지 않아, 마스킹이 화장품이었다 | rg email/token/secret lib/keys lib/search; rg actorLabel app | Server mask path exists; actual RSC payload not captured. |
| 1015: 2026-09-09 — 주석이 이유를 정확히 적었는데 **재는 자**가 어긋나 거부가 500이 됐다 | Full section read only; no independent debt search | INCOMPLETE: reconcile boundary/principle/invariant audit; not a clean finding. |
| 1032: 2026-09-10 — YAML 자원 제한이 문자열을 구조로 읽어 우회와 오탐을 함께 만들었다 | Full section read only; no independent debt search | INCOMPLETE: reconcile boundary/principle/invariant audit; not a clean finding. |
| 1046: 2026-09-10 — 초대 만료 조건이 있어도 취소 전 조회의 권한이 살아남았다 | rg expiresAt.*gt/acceptedAt.*null app/invite | Fresh consume guard exists; DB race not run. |
| 1060: 2026-09-10 — DB URL의 겉보기 대상과 드라이버가 접속할 대상이 달랐다 | Full section read only; no independent debt search | INCOMPLETE: reconcile boundary/principle/invariant audit; not a clean finding. |
| 1068: 2026-09-10 — 일회용 자격증명을 소비한 뒤에야 저장 키 오류가 드러났다 | rg validateTokenWriteKey/refreshUserToken/exchangeCode lib/github-connect | Write-key check before refresh; OAuth not run. |
| 1076: 2026-09-10 — 재인증 목적이 사라진 OAuth callback이 일반 가입을 실행했다 | Full section read only; no independent debt search | INCOMPLETE: reconcile boundary/principle/invariant audit; not a clean finding. |
| 1086: 2026-09-10 — `pnpm test`가 2553 green인데 단언 하나가 거짓이었다 — 그 스위트는 애초에 안 돌아간다 | read gate-plan and tests/vitest configs/integration imports; rg arrayBuffer/absoluteDeadline oauth-server | Finding 2: PG gate misses implementation paths; metadata body/deadline guard exists. |
| 1108: 2026-09-10 — 테스트가 green이었던 이유가 둘 다 우연이었다 (SVG 치수 · 단언이 지운 좁힘) | rg next/font/canvas/public app components; read vitest.config.ts | SVG stub exists; runtime image layout not checked. |
| 1137: 2026-09-11 — 게이트 셋과 소스 스캔 여섯이 green인데 번역 입력이 28px였다 (malmoi#33) | rg width/shrink-0/overflow components/translations | Width candidates searched; computed layout not measured. |
| 1170: 2026-09-12 — 저장 중 서버 값을 수신 처리했지만 실패 후 취소 기준은 옛 값이었다 | rg setServerValue/setSaved.*initialValue components; read draft.ts | Old pattern absent; draft module exists; runtime sequence not checked. |
| 1184: 2026-09-12 — 필터 툴바만 잠가 칩이 이전 쿼리를 다시 제출할 수 있었다 | rg router.push.*translations/onNavigate components | Shared navigation path exists; pending interaction not run. |
| 1197: 2026-09-12 — rowSpan으로 커진 행에서 내부 div의 세로선이 끊겼다 | rg rowSpan/key-group components | Old implementation replaced by workspace; actual table not rendered. |
| 1210: 2026-09-12 — 테스트가 만든 `NextRequest`는 복사되고 런타임이 준 것은 던졌다 | rg newNextRequest lib/login-link; read http.ts | Current URL+init wiring checked against current contract. |
| 1235: 2026-09-12 — OAuth 오류 화면이 초대 복귀 지점을 표시하지 않았다 | rg destFromCallbackUrl/callback-url/pages auth.ts signin invite login-link | Callback wiring exists; OAuth roundtrip not run. |
| 1254: 2026-09-13 — 🔁 모달로 이관한 상태가 이전 파일 검증과 늦은 응답을 재사용했다 | rg useEffect/sampleKey/requireUser onboarding app | Candidates searched; all late responses not analyzed. |
| 1262: 2026-09-13 — 샘플 검증 테스트가 실제 트리에 없는 경로만 공격해 순서와 예산 위반을 놓쳤다 | rg planConfirmedFormat/templatePaths/verifySampleConfirmation/readFiles lib app | Confirmation boundaries exist; exhaustive input check incomplete. |
| 1270: 2026-09-13 — Radix 이관이 테스트를 실시간 지연에 묶어 전체 실행만 간헐 red가 됐다 | rg userEvent.setup/vi.setConfig DOM tests | Timing candidates searched; tests not run. |
| 1278: 2026-09-13 — 원격 신호 하나의 실패가 워커 풀의 동시 제한을 풀었다 | rg Promise.all/allSettled lib | projects/remote uses allSettled; full async graph incomplete. |
| 1286: 2026-09-13 — 임포트 종료의 소유권과 실패 캐시 무효화가 빠졌다 | rg lastImportStartedAt/surfaceToken/finish lib/import lib/status | Own lease/surface completion guard exists; race not run. |
| 1294: 2026-09-13 — 소문자화한 위치로 원래 이름을 잘라 검색 강조가 어긋났다 | read translation-list.ts highlight.ts translation-list.integration.ts | Finding 3: folded Unicode offsets reused against original string. |
| 1302: 2026-09-13 — 모달 딥링크가 배경 목록의 원격 조회를 다시 기다렸다 | rg NewProject/new-project app components | Standalone/intercepted entry exists; frames not measured. |
| 1310: 2026-09-13 — 이미지 쓰기 키 오류를 외부 업로드 뒤에 발견했다 | rg validateWriteKey/putImage/console/stage account credentials scripts | Pre-write validation exists; upload not run. |
| 1325: 2026-09-13 — 일회용 연결 요청을 락 전에 읽어 재사용 결과가 달라졌다 | Full section read only; no independent debt search | INCOMPLETE: reconcile boundary/principle/invariant audit; not a clean finding. |
| 1352: 2026-09-14 — 접근성 방어선 셋을 세웠는데 셋 다 지워도 green이었다 (뮤테이션이 세 번 교정했다) | read pull render/run/import/nightly tests | Positive preconditions found; all negative assertions not reviewed. |
| 1429: 2026-09-14 — 프리미티브의 여백 하나가 그 슬롯을 안 쓰는 소비자에게만 깨졌다 | rg DialogContent components | Consumer list inspected; styles excluded; visual review incomplete. |
| 1463: 2026-09-14 — 확인 Dialog의 유일한 논거가 반대 방향으로 거짓이었다 | rg will-stop/no-longer/until messages | Copy candidates searched; all locales incomplete. |
| 1501: 2026-09-14 — 닫은 알림이 같은 주소로 돌아온 두 번째 실패에서 무음이었다 | rg onDismiss/router.replace/redirect account; read dismissible-alert.tsx | Dismiss wiring exists; repeated-failure render not run. |
| 1534: 2026-09-14 — 낡은 Prisma 클라이언트가 로그인만 죽였고, 삼킨 catch 둘이 원인을 두 단계 감췄다 | read credentials/access.ts storage.ts command.ts | Credential branch logs exist; stale dev process not simulated. |
| 1575: 2026-09-14 — nullable 경계 추가만으로 옛 upsert의 소유권 충돌이 사라지지 않는다 | Full section read only; no independent debt search | INCOMPLETE: reconcile boundary/principle/invariant audit; not a clean finding. |
| 1590: 2026-09-14 — 표면 복합 FK 추가 뒤 새 프로젝트 생성이 Project.id NULL로 실패했다 | rg project.create lib app | onboarding-run/create is production producer. |
| 1598: 2026-09-14 — TransactionClient를 런타임 속성으로 구별해 첫 적재가 자기 잠금을 기다렸다 | rg transaction property checks lib | Executable old property check not found; race not run. |
| 1606: 2026-09-14 — 컬럼을 뗀 마이그레이션이 스모크 스크립트를 죽였고, typecheck가 `select`를 안 본다 | read scripts prisma-select-columns test | Gate exists for scripts; app/lib full schema check incomplete. |
| 1625: 2026-09-14 — 내가 쓴 "바이트가 같다" 테스트가 자기 자신과 비교해 공허했다 | rg bare/blank-line/renderWorkflowYaml workflow.test.ts | Exact empty line and consecutive-line assertions exist. |
| 1640: 2026-09-14 — 거부 문구가 화면에 없는 버튼 이름을 가리켰다 | rg ReconnectGitHub messages | Copy candidates exist; every render condition not checked. |
| 1656: 2026-09-14 — fieldset 비활성만으로 Radix Portal의 언어 선택을 잠그지 못했다 | rg fieldset/Select/disabled onboarding naming/files | Direct disabled/child wiring exists; interactions not run. |
| 1664: 2026-09-14 — 다중 선택 화면의 "무엇을 읽는가" 안내가 첫 경로만 들었다 | rg surfaces[0]/candidates[0]/pathTemplate fallback app components lib | Candidates searched; multi-surface DOM not run. |
| 1680: 2026-09-14 — 설정 YAML이 확정 어댑터를 생략해 CI가 다른 포맷을 보냈다 | rg renderWorkflowYaml lib app scripts | Shared renderer used; YAML not executed. |
| 1688: 2026-09-15 — 비활성 primary가 호출부에 따라 다른 형으로 보였다 | rg disabled opacity/aria-disabled/background app components | Consumer contract candidates inspected; input runtime not checked. |
| 1696: 2026-09-15 — Settings → Projects 전환 중 콘텐츠 패널 폭 분할 | read shell-panels.tsx content-panel.tsx | Grid/isolate present; frames not measured. |
| 1707: 2026-09-15 — 🔁 형제 프리미티브 둘을 함께 옮기며 **한쪽 소비자만 셌다** (2026-09-14의 재발) | rg scrollbar/SearchTrigger/search-trigger app components | Consumers searched; visual slots not compared. |
| 1744: 2026-09-15 — 읽힌 엔트리 0개를 정상 빈 카탈로그로 판정하면 기존 키를 전부 고아로 만든다 | Full section read only; no independent debt search | INCOMPLETE: reconcile boundary/principle/invariant audit; not a clean finding. |
| 1752: 2026-09-15 — 설정 변경으로 Sync 적용을 거부한 뒤 자기 진행 표시가 남았다 | rg lastImportStartedAt/surfaceToken/finish lib/import lib/status | Own lease/surface completion guard exists; race not run. |
| 1760: 2026-09-15 — `needsReview`와 `updatedBy`를 같은 행에서 찾아 화면 문구가 영영 안 뜰 뻔했다 | rg needsReview/updatedBy lib/push/apply.ts lib/import/run.ts | Author NULL and review axis separated; all states incomplete. |
| 1789: 2026-09-15 — 컬럼을 더하며 쓰는 자리를 전수로 안 세서 종료 경로 다섯 중 둘에만 붙었다 | rg lastImportError lib | Pre-failure status write distinguished; no confirmed new stale completion write. |
| 1814: 2026-09-15 — 시안 없이 만든 화면이 네 곳에서 어긋났고 테스트 4,039개가 전부 green이었다 | rg rounded-xl/section/empty app components | Candidates searched; all branches/viewports incomplete. |
| 1860: 2026-09-15 — 상태로 좁힌 링크가 네임스페이스로도 좁혀져 0건에 착지했다 | rg linkFor/search-state app components lib | Shared URL helper exists; full filter combinations incomplete. |
| 1878: 2026-09-15 — 2026-09-08의 재발 방지 grep이 "한 곳뿐"이라 적힌 채 두 곳이 됐다 | rg router.refresh app components | Failure and success refresh distinguished; network runtime not run. |
| 1911: 2026-09-15 — 자기 자신을 컨테이너로 물은 쿼리가 "아직 임계값이 아닌가 보다"로 읽혔다 | rg --files container-query | Contract test exists; computed container layout not checked. |
| 1933: 2026-09-16 — YAML range 치환의 같은 위치와 바깥 빈 줄이 값을 바꿨다 | rg chomp/suffix/replacements/sort yaml-catalog.ts | Keep and tie-break logic inspected; byte roundtrip not run. |
| 1942: 2026-09-16 — 부분 실패 결과가 "임포트가 끝나지 않았다"고 말했다 (끝났고 18키가 들어갔다) | read components/home/sync-result.tsx | Reason-specific partial result/literal whitespace inspected. |
| 1975: 2026-09-16 — Publish 미리보기가 로케일을 무시하고 첫 파일을 골랐다 | rg sampleLocale/samplePath/sampleOrder onboarding onboarding-run | Sample-order use found; all locale candidates not verified. |
| 1984: 2026-09-16 — 삽입 키의 인용 부호만 맞추고 들여쓰기와 끝 쉼표를 놓쳤다 (2026-09-03 표현 보존 결함 재발) | rg doc.toString/setIn/applyTextChanges/dominantQuote/valueLiterals lib/adapters; read roundtrip skill | Surgical formatting and fixed-point procedure exist; roundtrip not run. |
| 2000: 2026-09-16 — 같은 요청의 `Promise.all`이 토큰 회전을 둘로 겹쳤고, 내가 단 주석이 그것을 "안전하다"고 정당화했다 | rg ensureUserToken app lib | Consumers searched; full request network graph incomplete. |
| 2040: 2026-09-16 — 행 본문이 두 줄에서 한 줄로 바뀌었는데 테스트 4,206개가 전부 green이었다 | rg textContent app components tests | 97 candidate test files; full assertion semantics incomplete. |
| 2086: 2026-09-16 — 뮤테이션을 되돌리는 `git checkout -- <디렉터리>`가 같은 디렉터리의 미커밋 작업을 함께 지웠다 | rg fullmatch/checkout/pipeline patterns skills scripts docs | Warnings distinguished; no destructive action taken. |
| 2125: 2026-09-17 — 같은 프로젝트의 목록과 상세 썸네일 색이 달랐다 | rg ProjectThumbnail home projects | Shared component used; visual check not run. |
| 2133: 2026-09-17 — New project 클릭 후 모달 대기 중 버튼이 반응하지 않았다 | rg NewProjectButton app components | Two button/transition consumers; runtime not run. |
| 2141: 2026-09-17 — 같은 pending이 화면마다 다르게 보였다 (비활성 형 이탈의 2회차) | rg disabled opacity/aria-disabled/background app components | Consumer contract candidates inspected; input runtime not checked. |
| 2149: 2026-09-17 — 번역 PR을 merge commit으로 머지하면 루프 마커가 사라져 push가 DB를 덮었다 | rg head_commit/gh-pr-merge workflows lib docs skills | Marker guards/roundtrip merge argument exist; CI not run. |
| 2157: 2026-09-18 — 관계 필터 count가 대량 적재 직후 5.5초였다 (Prisma LEFT JOIN × 낡은 통계) | rg LATERAL/MATERIALIZED translation-list.ts | Relational SQL exists; EXPLAIN/performance not run. |
| 2168: 2026-09-18 — 인가 방어선이 호출이 아니라 이름을 셌다 — `import` 줄과 주석 인용만으로 green | read entry-points.test.ts; rg source.includes tests | Comment stripping/call/meta cases exist; other tests incomplete. |
| 2180: 2026-09-18 — 앞 테스트의 영원히 안 끝나는 async transition이 뒤 테스트의 transition을 pending으로 붙잡았다 | rg foreverPromise/new-Promise tests; read translation-workspace-lock.test.tsx | Lock test is direct async/state, not transition; remaining promise lifetimes incomplete. |
| 2194: 2026-09-19 — 인가를 철회한 사용자가 "잠시 뒤 다시"에 갇혔고, 그 자리만 401 규칙을 어기고 있었다 | rg 401/reauthorize account | Reauthorization branch exists; expired-token runtime not run. |
| 2205: 2026-09-19 — 개인정보처리방침이 코드와 어긋난 문장 셋을 실은 채 green이었다 | rg collected/safe-adapter/delete privacy lib docs | Candidates searched; full policy/code comparison incomplete. |
| 2239: 2026-09-19 — 스크롤 래퍼에 준 접근 이름이 표의 이름이 아니었다 | rg Table/aria-label files.tsx public-doc-table.tsx | Named scrolling regions exist; accessibility tree not captured. |
| 2266: 2026-09-19 — 꺼진 Radix Select가 마우스 클릭으로 열렸다 (우리 가드가 라이브러리의 포인터 종류 감지를 무력화했다) | rg disabled/aria-disabled ui/tests | Consumer contracts inspected; typeahead/pointer not run. |
| 2317: 2026-09-20 — 포커스 복귀가 브라우저에서만 깨졌고, 그것을 재는 테스트는 아무것도 안 재고 있었다 ([malmoi#64](https://github.com/SinhyeokKang/malmoi/issues/64)) | rg activeElement/attributeFilter app components lib | Observer candidates searched; MutationObserver runtime not run. |
| 2357: 2026-09-20 — 소스 추가 커밋 뒤 캐시 오류가 전체 롤백으로 보고될 수 있었다 | rg revalidate/settleRevalidate app | Late response/addSurfaces catch paths inspected; race not run. |
| 2371: 2026-09-20 — 화면 하나에 세운 규칙 셋을 새 화면이 다시 어겼고, 그 규칙의 그물이 전부 원래 화면에만 있었다 | rg toLocaleDateString/toLocaleTimeString/img/new-Date app components | Host-default date format absent; extra img are owned assets; timezone runtime not run. |
| 2387: 2026-09-20 — 활동 판정은 통과했지만 조회·렌더·적재 연결에서 사실이 달라졌다 | rg pendingEvents/finishedAt/PROJECT_WIDE/before event/import/push | Candidates searched; full event transaction semantics incomplete. |
| 2406: 2026-09-23 — 번역 작업 화면이 테스트 5,249개 green인 채 시안·접근성과 셋 어긋났다 | rg Textarea/separator/pointercancel/lostpointercapture workspace | Width/name/end handling exists; drag not run. |
| 2430: 2026-09-23 — Revert가 잠금 대기 중 회수된 OWNER 권한으로 실행됐다 | rg lockProject/lockSurface/save/revert translation actions | Shared lock order exists; PostgreSQL race not run. |
| 2439: 2026-09-23 — 번역 화면의 부분 응답과 낙관적 상태가 다음 작업을 가렸다 | rg mergeServerRows/inFlight/beforeunload/sameValue workspace draft | Equal-row preservation exists; leave interaction not run. |
| 2447: 2026-09-23 — 테마에 없는 `text-link` 클래스로 인라인 링크 셋이 본문 글자로 섰다 | rg text-link globals/components | Current token registered; not a recurrence. |
| 2455: 2026-09-24 — 초대 모달의 포커스·입력 규칙이 jsdom에서만 참이었다 | rg focus/type-email onboarding | Result-arrival focus distinguished from mount focus; warning comments excluded. |
| 2463: 2026-09-24 — 🔁 링크 둘이 도착 화면에 없는 버튼 이름(`Send changes`)을 불렀다 (2026-09-14의 재발) | rg Send-changes/surface/import messages components | Identifiers/comments distinguished; all copy contexts incomplete. |
| 2471: 2026-09-24 — 연 채로 보관된 Settings가 거부만 받고 보관 상태로 옮겨 가지 않았다 | rg locked/access.error/redrawIfArchived app lib | Archive redraw path exists; all open views not run. |
| 2479: 2026-09-24 — 포커스가 `body`로 빠지는 자리가 열한 곳이었고, 고친 두 곳이 나머지를 가렸다 | rg DialogTrigger/asChild components; read Slottable tests | Busy consumer contract exists; real input interaction not checked. |
| 2490: 2026-09-24 — 비리터럴 값 하나로 904키가 다 들어간 소스가 "Last sync failed"가 됐다 | Full section read only; no independent debt search | INCOMPLETE: reconcile boundary/principle/invariant audit; not a clean finding. |
| 2498: 2026-09-24 — chrome `"placeholders": null`이 push→pull 왕복에서 사라졌다 (Prisma가 JSON null과 SQL NULL을 같게 읽는다) | Full section read only; no independent debt search | INCOMPLETE: reconcile boundary/principle/invariant audit; not a clean finding. |
| 2506: 2026-09-24 — 로케일 1개 리포가 온보딩 ②에서 사유 없이 막혔다 (고친 문구가 화면에 닿지 않았다) ([malmoi#99](https://github.com/SinhyeokKang/malmoi/issues/99)) | rg manual/fail/new-project onboarding | Candidates searched; failure DOM sequence not run. |
| 2514: 2026-09-27 — 경로 **안전**만 검사해 경로가 **옳은지**를 안 봤고, 토큰을 받는 사람이 리포에 쓸 수 있는지도 안 봤다 (sec-audit-3 발견 1) | Full section read only; no independent debt search | INCOMPLETE: reconcile boundary/principle/invariant audit; not a clean finding. |
| 2531: 2026-09-27 — base 파일을 못 읽어 거부된 야간 Publish가 Logs에 "Nothing to send"로 섰다 | rg eventResult/resultWhere/withheld/warning events | Both list/count withholding predicates inspected. |
| 2539: 2026-09-28 — Next 외부 rewrite가 세션 쿠키를 제3자 호스트로 넘긴다 | rg rewrites next.config.ts vercel.json | External rewrites absent; deployment not checked. |
| 2553: 2026-09-28 — 리포 안의 git worktree를 Vitest가 같이 수집해 게이트가 red로 오진됐다 | read vitest.config.ts | Worktrees excluded; decoy tests not created/run. |
| 2567: 2026-09-29 — 사건 목록의 행위자 라벨이 사건 2개 이상인 사람의 원문 이메일을 실었다 ([malmoi#146](https://github.com/SinhyeokKang/malmoi/issues/146)) | rg mask/Set/distinct/person auth/events | Actor/invitation deduplication exists; scale query not measured. |
| 2581: 2026-09-29 — 중첩 JSON 표면의 빈 `{}` 로케일 파일에 번역이 최상위 점 키로 나갔다 ([malmoi#147](https://github.com/SinhyeokKang/malmoi/issues/147)) | rg empty/observations json-style.ts | Empty-container/old observations excluded; corpus not run. |
| 2595: 2026-09-30 — 손으로 조립한 게이트가 29건 red를 dev에 push했다 | rg fullmatch/checkout/pipeline patterns skills scripts docs | Warnings distinguished; no destructive action taken. |
| 2607: 2026-10-01 — 5,000행 키 클릭 "2초 멈춤"을 앱 회귀로 추적했는데 측정 브라우저의 확장이었다 (#157) | rg memo/sameValue workspace/saved-rows | KeyRow memo/row preservation exists; typing not measured. |
| 2627: 2026-10-02 — 테스트가 전부 통과했는데 PR CI가 `EnvironmentTeardownError`로 red였다 — 게이트 재시도가 진짜 결함을 가렸다 (PR #171) | rg setTimeout/late/hung DOM tests | Real/shared timer handling distinguished; no-log hung case not called failure. |
| 2650: 2026-10-03 — 단일 언어 탐지를 열자 조상 승격이 설정 파일을 정본보다 앞세웠다 | rg liftAncestors/rankTemplateCandidates/compareTemplates lib/adapters | Shared ranking exists; full corpus comparison not performed. |
| 2658: 2026-10-05 — 지휘자가 dev CI red를 두 push 동안 몰랐다 — 로컬 `gate: ok`·CI red인 jsdom 사전 로드 대기 | read merge skill/helpers/dom.tsx | CI watch and ko/es preload exist; CI/DOM not run. |
| 2669: 2026-10-07 — 리사이즈 핸들 Enter가 폭만 바꾸고 셸의 접힘 상태를 그대로 뒀다 | rg onResize/collapsible/preventDefault shell-panels.tsx | Capture preventDefault/toggle exists; pointer runtime not checked. |
| 2680: 2026-10-07 — 허용된 CI 경합이 재Publish 뒤 PR의 복구본까지 지울 수 있었다 | rg lastPublishedAt/publish-raced/Re-run push/import/cli ACTIONS | Race guard exists; findings 1/6 concern advice/document contract. |
| 2690: 2026-10-07 — 파일 쓰기 성공과 요청한 값 전달을 같은 것으로 셌다 | rg clearable/propertyWrite/delivery translations/pull/publish | Shared save/render/preview decision exists; roundtrip not run. |
| 2700: 2026-10-07 — 비동기 경계와 검증 트리거가 구현의 끝까지 닿지 않았다 | read gate-plan and tests/vitest configs/integration imports; rg arrayBuffer/absoluteDeadline oauth-server | Finding 2: PG gate misses implementation paths; metadata body/deadline guard exists. |

Sections: 143; independent searches/reads: 129; read-only pending cross-domain verification: 14 ([355, 825, 848, 966, 1015, 1032, 1060, 1076, 1325, 1575, 1744, 2490, 2498, 2514]).

## 반응형 계획과 파일 실재 대조

| 대상 | 미완 태스크 | 실제 상태 | 판정 |
|---|---:|---|---|
| responsive-public | 최상위 11개(P0–P7 및 P6a/b/c) | tasks 서두 모두 미시작; public/auth shell min-w-shell-min 유지 | 설계 단계와 일치, 결함 아님 |
| responsive-app | 최상위 12개(A0–A8 및 A8a/b/c) | tasks 서두 모두 미시작; edit shell min-w-shell-min, Files 고정 폭 유지 | 설계 단계와 일치, 결함 아님 |

근거: `app/(edit)/layout.tsx:62`, `components/public-shell/public-shell.tsx:52`, `components/signin/auth-layout.tsx:54`, `components/onboarding/steps/files.tsx:53,60`.
계획한 `lib/translations/compact-pane.ts`, `lib/onboarding/files-layout.ts`와 신규 drawer 파일은 아직 없다. 미완 체크와 실재가 모순되지 않는다.
모바일 프레임·로컬 디자인 핸드오프·런타임 실측은 이번 정적 감사에서 미검증이다.

## 검사 범위와 미완

- POSTMORTEM 143개는 전부 독해했고 129개에 관련 검색/소스 대조 기록을 남겼다. 나머지 14개는 독해만 했으며 다른 도메인 결과와 통합해야 한다. 검색한 항목도 표에 적힌 의미 검증·런타임 한계가 남는다.
- CLAUDE·PRODUCT·ARCHITECTURE·POSTMORTEM은 세 탐색 에이전트와 부모가 분담해 전체를 읽었다. 나머지 문서 7개·README·env·feature/tasks는 파일/키워드 전역 검색 후 관련 절을 실제 소스와 대조했으며 모든 문장을 완전 검증했다는 뜻은 아니다.
- lib 전체 및 app/components/scripts/messages 검색으로 후보를 찾고 아래 파일을 직접 읽었다. components/ui는 import/소비 계약만 다뤘고 내부 스타일은 제외했다.
- 허용 범위에 따라 테스트·typecheck·빌드·브라우저·DB·배포 검증을 실행하지 않았다. 코드·문서·설정 변경, 커밋·push도 하지 않았다.
- HEAD는 시작/종료 모두 `bc8b204f18fa1aa88a0423e28f0789876f1fbf54`로 확인했다. 발견은 최근 diff로 제한하지 않았다.

## 직접 읽거나 계약 대조한 파일 목록

아래 목록은 직접 읽은 파일과 명시적으로 계약을 대조한 파일이다. 전역 검색 후보 전체를 전문 독해 목록으로 부풀리지 않았다. POSTMORTEM 표의 경로/검색 범위도 검사 증거에 포함된다.

- `.claude/commands/db.md`
- `.claude/commands/merge.md`
- `.claude/commands/orchestrate.md`
- `.claude/commands/push.md`
- `.claude/commands/roundtrip.md`
- `.env.example`
- `.github/workflows/ci.yml`
- `.npmrc`
- `CLAUDE.md`
- `README.md`
- `app/(edit)/layout.tsx`
- `app/(edit)/projects/[slug]/settings/actions.ts`
- `app/(edit)/projects/[slug]/sources/actions.ts`
- `app/(edit)/projects/actions.ts`
- `app/__tests__/entry-points.test.ts`
- `app/api/push/failure/route.ts`
- `app/api/push/route.ts`
- `app/globals.css`
- `app/invite/actions.ts`
- `app/search/actions.ts`
- `components/__tests__/helpers/dom.tsx`
- `components/__tests__/translation-workspace-lock.test.tsx`
- `components/account/dismissible-alert.tsx`
- `components/home/sync-button.tsx`
- `components/home/sync-result.tsx`
- `components/onboarding/steps/files.tsx`
- `components/onboarding/steps/naming.tsx`
- `components/public-doc-table.tsx`
- `components/public-shell/public-shell.tsx`
- `components/publish-button.tsx`
- `components/shell/content-panel.tsx`
- `components/shell/shell-panels.tsx`
- `components/signin/auth-layout.tsx`
- `components/translations/workspace/key-list.tsx`
- `components/translations/workspace/locale-panel.tsx`
- `components/translations/workspace/workspace.tsx`
- `docs/ACTIONS.md`
- `docs/ARCHITECTURE.md`
- `docs/DESIGN.md`
- `docs/DIRECTORY.md`
- `docs/OPERATIONS.md`
- `docs/POSTMORTEM.md`
- `docs/PRODUCT.md`
- `docs/features/responsive-app/tasks.md`
- `docs/features/responsive-public/tasks.md`
- `lib/adapters/__tests__/write-contract.test.ts`
- `lib/changelog/load.ts`
- `lib/cli/__tests__/push-response.test.ts`
- `lib/cli/push-response.ts`
- `lib/cli/walk.ts`
- `lib/color-scheme/scheme.ts`
- `lib/credentials/__tests__/postgres.integration.ts`
- `lib/credentials/access.ts`
- `lib/credentials/command.ts`
- `lib/credentials/storage.ts`
- `lib/device-cookies/spec.ts`
- `lib/env.ts`
- `lib/events/__tests__/locked-access.integration.ts`
- `lib/github-wait.ts`
- `lib/import/__tests__/automation.integration.ts`
- `lib/import/run.ts`
- `lib/invitation-email/__tests__/invitation.integration.ts`
- `lib/invitation-email/message.ts`
- `lib/keys/__tests__/search.integration.ts`
- `lib/keys/__tests__/translation-list.integration.ts`
- `lib/keys/translation-list.ts`
- `lib/login-link/http.ts`
- `lib/mcp/tools/keys.ts`
- `lib/nightly/__tests__/nightly.integration.ts`
- `lib/oauth-server/client-metadata-fetch.ts`
- `lib/onboarding/__tests__/workflow.test.ts`
- `lib/onboarding/language-name.ts`
- `lib/projects/remote.ts`
- `lib/publish/read.ts`
- `lib/pull/__tests__/render.test.ts`
- `lib/pull/__tests__/run.test.ts`
- `lib/push/apply.ts`
- `lib/push/guard.ts`
- `lib/push/payload.ts`
- `lib/search/highlight.ts`
- `lib/search/load-memberships.ts`
- `lib/survey/run.ts`
- `lib/translations/draft.ts`
- `lib/translations/saved-rows.ts`
- `lib/translations/text-direction.ts`
- `next.config.ts`
- `package.json`
- `prisma.config.ts`
- `prisma/schema.prisma`
- `scripts/__tests__/gate-plan.test.ts`
- `scripts/gate-plan.ts`
- `scripts/gate.ts`
- `scripts/release-plan.ts`
- `vercel.json`
- `vitest.config.ts`
- `vitest.credentials.config.ts`
- `vitest.projects.config.ts`
