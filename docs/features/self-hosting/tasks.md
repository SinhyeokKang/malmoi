# Self-hosting — 구현 태스크

작성: 2026-10-08 · 갱신: 2026-10-09(feature review 3회) · 상태: 전부 미착수 · 정본: [spec](spec.md), [design](design.md)

이 파일은 후속 구현 계획이다. 현재 문서 작성에서는 코드·빌드·DB·배포를 실행하지 않는다. 각 배치는 순수 함수 테스트를 먼저 만들고 구현한다. 커밋 제목은 제안이며 지금 커밋하지 않는다.

**검증 표기**: `[자동]`은 `pnpm gate`(트리거 시 격리 PostgreSQL 스위트 포함)가 판정한다. `[수동]`은 로컬 Docker 실습이고 증거(명령·관측 값·digest·실패)를 OPERATIONS **셀프 호스팅 실습 기록** 절에 남긴다. 이 리포엔 컨테이너 CI가 없고 이번에 추가하지 않는다 — 대신 SH-15의 순수 게이트가 상시로 돈다.

## 0. 착수 게이트

- [x] 레지스트리·이미지 발행 위치·권한, proxy 배포물, 생성기 action 태그(v2→v3) 전환 여부를 확정한다(2026-10-09 — GHCR 공개 · nginx · v3는 v1.2.6에 배포).
  - 검증: spec §8 표의 상태 열에 "착수 전 확정"이 남아 있지 않음.
- [ ] `next start`에서 middleware가 `process.env`를 런타임에 읽는지 실측한다 — 같은 빌드를 서로 다른 `MALMOI_ORIGIN`으로 두 번 띄워 middleware가 내는 값을 비교한다.
  - 검증: [수동] 실습 기록에 두 기동의 관측 값이 있고 서로 다름. 같으면(빌드 인라인) 착수를 멈추고 design §2·§7을 다시 연다.
- [ ] 착수 시점 HEAD와 기존 문서·코드 경계를 다시 대조한다. hosted 회귀 기준을 기록한다.
  - 검증: OPERATIONS 실습 기록 절에 기준 SHA와, **같은 SHA의 로컬 `pnpm build` 산출물**의 `/sitemap.xml`·`/llms.txt`·`/llms-full.txt` 본문 해시·HSTS 값이 있음. preview는 Vercel SSO 뒤라 `curl`이 302를 받고, llms 본문은 가이드 커밋마다 바뀌므로 기준을 배포가 아니라 revision에 묶는다.

## 1. 순수 정책 — `feat(self-hosting): define deployment policies`

- [ ] 배포 모드 잎 모듈(import 없음, `MALMOI_ORIGIN`·`VERCEL_ENV`·hosted 도메인 리터럴의 유일한 집)·origin 파서·preflight 판정의 실패 테스트 후 구현.
  - 검증: [자동] design §9 표 첫 두 행의 사례가 **사유 코드로** 각각 단언됨 — 빈 문자열·공백 env, 끝 슬래시·대문자·`:443`, IPv6·IDN 거절, `VERCEL_ENV` 동시 존재 → 무효, `AUTH_URL` 끝 슬래시 정규화 비교, `INVITATION_EMAIL_ORIGIN` 존재 거부, `MALMOI_PRIVACY_URL`이 같은 origin의 `/privacy/`·`/privacy?x`·대문자 host로 순환, 상대·부재 업로드 디렉터리, Resend는 누락·형식만, 출력에 비밀 없음, 전부 있을 때 통과. `pnpm test` green.
- [ ] 새 env 이름 셋(`MALMOI_ORIGIN`·`MALMOI_UPLOAD_DIR`·`MALMOI_PRIVACY_URL`)을 `lib/i18n/__tests__/brand-spelling.test.ts`의 `UPPER_EXCEPTIONS`(`:78`)에 등록한다.
  - 검증: [자동] `brand-spelling` green.
- [ ] `requestOrigin`(self-hosted: 설정 호스트 정확 일치·`LOCAL_HOST` off·forwarded-proto 무시)과 workflow·MCP·OAuth·메일 URL 계획의 실패 테스트 후 구현. `workflowApiUrl`은 self-hosted면 `api-url`을 항상 내고 무효면 렌더를 거부한다.
  - 검증: [자동] self-hosted에서 `mal-moi.com`이 나오는 경로 0, self-hosted workflow 출력에 `api-url:` 줄이 항상 있음, 무효 판정이면 렌더 거부. 위조 `Host`·`X-Forwarded-Host`·`X-Forwarded-Proto`에도 `requestOrigin`·`oauthEndpoint`가 설정 origin만 냄.
- [ ] 삭제 계획 둘(`planImageDelete`·`planProjectImageDelete`)이 `/api/images/<key>` 형태를 받도록 넓히고, 공개 응답 정책(noindex·sitemap/llms 404·Analytics 제외) 테스트 후 구현. `imageSrc`·`isStoredImageKey`는 바꾸지 않는다.
  - 검증: [자동] 기존 Blob URL과 `/api/images/<key>`가 두 삭제 계획에서 같은 키(`image.test.ts:44-49`·`project-image.test.ts:12-18`에 상대 경로 사례 추가). `isStoredImageKey`가 삭제 계획을 재사용하지 않음.
- [ ] self-hosted credential target 파서 테스트 후 구현(`CREDENTIAL_TARGET`의 세 번째 값).
  - 검증: [자동] hosted allowlist 유지, self-hosted query override 거절, `postgres` 호스트만 `sslmode` 생략/`disable` 허용·그 밖은 `verify-full` 요구. `conversion.test.ts:35-42`에 direct host 사례와 `verify-full` 단독 통과 사례 추가. self-hosted가 finalize의 dev 분기로 가지 않음.
- [ ] 스케줄러 cron 식과 `vercel.json`의 cron 값이 같다는 테스트.
  - 검증: [자동] 둘 중 하나만 바꾸면 red.
- [ ] **SH-15 상시 게이트 셋**을 `pnpm test`에 넣는다. ① 비테스트 소스의 hosted 도메인 리터럴·`MALMOI_ORIGIN`·`VERCEL_ENV` 직접 읽기 허용 목록(`brand-spelling.test.ts` 선례) ② `lib/env.ts`가 읽는 env 이름 전부 ↔ preflight 표(필수·선택·hosted 전용) ↔ `.env.example` ↔ compose 예제 키 ③ Dockerfile Node 메이저 == `.nvmrc`, pnpm == `packageManager`, `.npmrc` COPY 존재. ③은 4배치의 Dockerfile과 같은 커밋에서 켠다.
  - 검증: [자동] 각 게이트에 일부러 어긋난 입력을 준 사례가 red, 현재 트리에서 green.
- **수정 없이 green이어야 할 hosted 정확 단언** — 이 배치와 2배치의 판정 기준이다: `lib/invitation-email/__tests__/config.test.ts:102-106`(`VERCEL_ENV` 없음 + prod origin 거절 — `MALMOI_ORIGIN` 판정이 이 사례를 열면 안 된다) · `lib/invitation-email/__tests__/message.test.ts:239,296` · `lib/github-connect/__tests__/origin.test.ts:126-136` · `lib/onboarding/__tests__/workflow.test.ts:308-329`(YAML 바이트 동일 — 생성기 태그 전환 커밋은 예외, spec §8) · `lib/__tests__/security-headers.test.ts:159` · `app/__tests__/security-headers.test.ts:57` · `lib/seo/__tests__/crawl.test.ts:15-19` · mcp-route·oauth metadata·well-known · seo-metadata·llms·json-ld·crawl-files.

## 2. 서버 경계 — `feat(self-hosting): wire instance services`

- [ ] 인증·계정 연결·MCP·OAuth AS·온보딩 workflow가 바뀐 `requestOrigin`·`workflowApiUrl`을 통해 동작하는지 연결한다(호출부 무수정). preflight를 기동 경로에 연결한다.
  - 검증: [자동] 1배치 테스트 green. `app/__tests__/well-known.test.ts`에 self-hosted 위조 헤더 사례 추가, `checkOrigin`(`lib/mcp/http.ts:10`)이 다른 Origin을 거절. [수동] 잘못된 설정으로 기동 시 비밀 없는 메시지로 종료, 올바른 설정으로 ready 200 — 같은 라운드에서 둘 다 관측. SH-01/03/04/05.
- [ ] 파일 저장 구현과 기존 이미지 route 둘(`[...key]`·`email/[...key]`)·소비자를 연결한다.
  - 검증: [자동] 임시 디렉터리 기반 `lib/upload/__tests__/*.test.ts`(`pnpm test`)에서 put/read/delete, `readImage` 직접 시험, symlink·traversal 거절, 업로드 디렉터리 자체가 symlink, 읽기 reject가 catch 안에서 404, 활성 PII 키가 무효면 파일을 쓰지 않음, 같은 키 동시 교체 시 임시 파일 이름 충돌 없음, rename 전 crash 잔여 임시 파일이 읽기에 안 보임, 읽기 전용·쓰기 실패 시 DB 옛 참조 유지. `schema.prisma:22` 주석 갱신. SH-06.
- [ ] 초대 메일 config·message를 배포 모드 판정과 `MALMOI_ORIGIN`에 연결하고, `unavailable` 사유·발송 거부를 서버 로그에 남긴다.
  - 검증: [자동] hosted 기존 판정 green, self-hosted 링크·이미지 URL 단언, 사유 로그 단언(비밀 없음). [수동] 테스트 수신함에서 초대 수락·이미지 표시. SH-07.

## 3. DB·운영 명령 — `feat(self-hosting): support standalone database operations`

- [ ] `deploy/` 아래 bootstrap SQL을 작성한다 — 런타임 롤 생성(있으면 건너뜀), `GRANT USAGE ON SCHEMA public`, `GRANT … ON ALL TABLES/SEQUENCES IN SCHEMA public`, `ALTER DEFAULT PRIVILEGES FOR ROLE <migrate 소유자 롤>`(테이블·sequence). `prisma/migrations/`에 넣지 않는다.
  - 검증: [자동] 격리 사례 `lib/__tests__/self-hosted-bootstrap.integration.ts`를 **기존 projects 스위트**(`test:projects:postgres`)에 넣는다. PG17 빈 DB에 DB 소유 비-superuser 롤로 전체 migration → bootstrap 순 적용 후 ① bootstrap 2회 실행 성공 ② 런타임 롤로 기존 테이블 CRUD 성공·DDL 거부 ③ bootstrap 뒤 새 migration이 만든 테이블에 런타임 롤 CRUD 성공. 기존 스위트처럼 `postgres` 롤로 SQL을 직접 붓지 않는다(`lib/events/__tests__/locked-access.integration.ts:80-82` 방식은 이 결함을 가린다). SH-02.
- [ ] `scripts/gate-plan.ts`의 projects 스위트 트리거에 `deploy/`와 `lib/onboarding/workflow.ts`·`lib/oauth/endpoint.ts`·`lib/github-connect/origin.ts`를 추가한다(`prisma/migrations/**`는 기존 트리거를 물려받는다 — `lib/mcp/__tests__/tools.integration.ts:266-268`·`oauth-{code,refresh}.integration.ts:58-66`이 이 세 경로를 단언한다). 새 GateStep·config·스크립트는 만들지 않는다.
  - 검증: [자동] 테스트 파일 없이 생산 경로만 바꾼 diff(`deploy/`·`prisma/migrations/`·위 세 파일 각각)에서도 gate 실행 계획에 projects 스위트가 포함됨을 `scripts/__tests__/gate-plan.test.ts`로 단언.
- [ ] `CREDENTIAL_TARGET=self-hosted`로 키 verify·회전·reindex·finalize를 연결하고 hosted 안전 게이트를 보존한다. `credentialTarget` 반환 타입을 넓히고 `finalize-credentials.ts:26-27`을 target별 명시 분기로 바꾼다.
  - 검증: [자동] 격리 fixture DB에서 회전 전후 복호화·lookup·이전 키 제거, 잘못된 대상 거절, self-hosted finalize가 `PRISMA_TARGET=dev`를 세우지 않음. SH-10.

## 4. 배포물 — `feat(self-hosting): package compose deployment`

- [ ] 비standalone Dockerfile 한 벌(`.nvmrc` Node·`packageManager` pnpm·`.npmrc` 복사·`pnpm` 포함), `.dockerignore`, 버전 고정 Compose, proxy 예제(원래 Host 전달 `proxy_set_header Host $host`, HSTS `proxy_hide_header` 후 `max-age=63072000` 덮어쓰기, `/api/images/`·`/oauth/authorize` IP당 600/60s rate limit)를 작성한다. 저장소 버전은 올리지 않는다. SH-15 ③을 같은 커밋에서 켠다.
  - 검증: [자동] SH-15 ③ green. [수동] env를 비운 상태의 이미지 build 성공, linux/amd64 실행, sharp 업로드, 가이드·폰트·정적 자산 200, image layer·history에 비밀 문자열 없음. proxy 뒤 페이지·API·정적 자산의 최종 HSTS가 `max-age=63072000` 하나. rate limit 초과 시 proxy가 429. SH-01/09.
- [ ] 영속 볼륨·내부 네트워크·non-root 실행·DB ping readiness·migrate 성공 의존 순서를 연결한다.
  - 검증: [수동] DB 초기 지연·migration 실패에서 web·scheduler가 시작되지 않고, 정상 경로에선 ready. 컨테이너 재생성 후 DB·이미지 유지. DB 포트가 호스트에 publish되지 않음.
- [ ] crond+curl 스케줄러(`--max-time 300`)를 기존 `GET /api/pull`에 연결한다.
  - 검증: [수동] 시각을 당긴 crontab으로 1회 호출해 web 로그에 `summarizeNightly` 줄이 남고, 잘못된 비밀은 `curl -f` 실패로 남음. 스케줄러 컨테이너 둘을 잠시 공존시켜 `/api/pull`이 겹쳐 불려도 프로젝트별 결과가 깨지지 않음. SH-08.

## 5. 기존 공개 화면 연결 — `feat(self-hosting): adapt public instance metadata`

- [ ] middleware에 self-hosted 분기(noindex 헤더·sitemap/llms 404)를 연결하고, Analytics 제외를 **서버 레이아웃**(`app/layout.tsx:122`)에서 판정한다.
  - 검증: [자동] `entry-points.test.ts`·정책 테스트 green, Analytics 판정 위치가 서버 레이아웃임을 고정하는 테스트. [수동] self-hosted 응답 헤더와 404 확인, 0배치 기준 SHA의 로컬 build 산출물과 세 경로 본문 해시 일치. SH-12/13.
- [ ] `app/privacy/page.tsx`에서 운영자 정책 redirect와 순환 방지를 적용하고, `/signin`·`/oauth/authorize` 동의문 링크를 self-hosted에서 새 탭으로 연다.
  - 검증: [자동] self-hosted redirect 대상 단언, hosted `/privacy` 기존 렌더 green, self-hosted 동의 링크에 `target="_blank"`·`rel` 단언. [수동] 링크 4곳(푸터·사용자 메뉴·`/signin`·`/oauth/authorize`)에서 클릭해 운영자 페이지에 착지. SH-12.
- [ ] 동의문(`consent`의 before/link/after 세 조각 — `/signin`·`/oauth/authorize`)과 App 호칭을 고친다. App 호칭은 **두 배포 공통** 처음 "the GitHub App", 이어서 "the app"이고 위치는 design §7의 목록(en 11·ko 10·es 11 + `confirmDisconnect` 변형)이다. **en·ko·es를 같은 커밋에서** 고치고 단어 판정은 `/translate`를 따른다. **같은 배치에서** DESIGN §10.1 App 호칭 행·`lib/i18n/__tests__/helpers/banned-terms.ts:34,91`·`lib/i18n/__tests__/terminology.test.ts:323`·`components/__tests__/new-project.test.tsx:1247`을 고친다(DESIGN 수정은 이 배치의 문서 커밋).
  - 검증: [자동] `dictionary-consistency`·`no-korean-ui`·`brand-spelling`·`terminology` green, 세 사전에서 `Malmoi GitHub App`·`GitHub App de Malmoi` 0건, banned-terms의 use 열과 DESIGN §10.1 행이 같은 낱말.

신규 화면·정보 구조 변경은 계획하지 않는다. 구현 중 설치 UI가 필요해지면 이 배치에 끼워 넣지 않고 범위를 재검토한다.

## 6. 운영 문서와 복구 — `docs(self-hosting): document installation and recovery`

- [ ] `.env.example`와 배포 예제에 신규·기존 필수 변수를 동기화한다(`.env.example:220,222`의 `notify.mal-moi.com`이 hosted 값임을 주석으로). OAuth/App 등록, HTTPS·DNS, GitHub Actions 접근성, Resend 발신 설정과 `email-rejected` 진단 절차, 공개 가입의 결과(PII 저장·상한 3·`OPERATOR_EMAILS`), 상류 action 실행 의존, `/changelog`의 "Latest"가 설치본 버전이 아니라는 것을 설명한다.
  - 검증: [자동] SH-15 ② green. 설치 체크리스트에 preflight 필수 항목이 전부 있음.
- [ ] 운영자 정책 재료를 만든다 — `lib/privacy/collected.ts`에서 파생한 수집 항목표(`User.attentionSeenAt` 포함)·쿠키·전송처(Resend·GitHub·Google)와 self-hosted DB용 계정 삭제 절차.
  - 검증: 표의 항목이 `collected.ts` 등재 필드와 일대일, 삭제 절차가 실습 DB에서 한 번 수행된 기록이 실습 기록 절에 있음.
- [ ] OPERATIONS에 고정 버전 설치·업데이트(절차만, migrate 뒤 같은 digest로 web 재생성)·백업·빈 볼륨 복원·키 회전·장애 진단 절차와 **셀프 호스팅 실습 기록** 절을 만든다.
  - 검증: [수동] SH-10 실습 기록에 digest·DB 버전·migration 상태·중단/복원 시간·결과가 있음. 비밀은 기록하지 않음.
- [ ] en·ko·es의 `ai-agents/README.md`·`ai-agents/browser.md`·`ai-agents/token.md`·`ai-agents/prompts.md`, 가이드 루트 `faq.md`, `reference/troubleshooting.md`, `account/preferences.md`(Privacy 언어 문장), `setup/workflow.md`(`api-url` 안내)를 갱신한다. MCP 주소는 **Copy server URL** 안내로(`browser.md` 포함), 개인정보 문의는 해당 설치의 `/privacy`로, 30일 응답은 hosted 정책에만. `guide/SHOOTING.md:69,159`의 컷 전제를 대조한다.
  - 검증: [자동] `pnpm test`(가이드 게이트) green, 세 언어 원고의 하드코딩 `mal-moi.com/api/mcp` 0건. [수동] self-hosted 도메인에서 가이드만 따라 MCP 연결. SH-05/12.
- [ ] `docs/ACTIONS.md`에 self-hosted 복사 예시(`api-url` 필수)를 추가한다.
  - 검증: 예시에 `api-url:` 줄이 있고 그 값이 설치 origin 자리표시자. SH-04.
- [ ] SH-14의 정본 문서를 갱신한다 — PRODUCT(배포 범위·Cron·robots 서술), ARCHITECTURE(불변식 5의 ⚠️ 주석·§7 — 본문은 그대로), CLAUDE.md(Supabase 권한 절·스택 표), README(Privacy 전송처), DIRECTORY, `.claude/commands/merge.md`(매 앱 태그 이미지 발행 단계).
  - 검증: SH-14 — 각 문서의 해당 절이 self-hosted를 사실대로 서술. CLAUDE·명령 원본을 고쳤으므로 `pnpm sync:agents:check` 통과.

## 7. 릴리스 검증 — `test(self-hosting): verify release containers`

- [ ] 로컬에서 `pnpm gate`를 실행하고, 이와 별도로 env를 비운 이미지 build와 빈 Postgres 신규 설치·migration 실패 경로를 실습한다.
  - 검증: [자동] 격리 스위트 포함 `pnpm gate` 통과. [수동] 나머지는 실습 기록에.
- [ ] 테스트 리포에서 push → 웹 편집 → Publish → PR 확인 → 재실행 왕복을 action `malmoi-i18n-push-v3`로 수행한다. 편집 보호·열린 PR 보호·회원 인가도 확인한다.
  - 검증: [수동] SH-04 — PR diff가 편집한 값만 담고, 재실행 뒤 대상 리포 커밋 수가 늘지 않음, 호스팅 서비스 로그에 해당 토큰 요청 0.
- [ ] 두 OAuth 로그인·MCP 개인 토큰/OAuth·이미지·초대·Cron·복원과 hosted 산출물 비교를 수동 검증한다.
  - 검증: [수동] 실습 기록에 SH-01–15 각각의 증거 또는 명시적 실패가 있음. 미실행을 통과로 표시하지 않음.
- [ ] `/merge`의 이미지 발행 단계로 릴리스 tag `v<x.y.z>`와 이미지 digest의 일치를 검증한다. 최소 자원을 실측 결과로 확정한다.
  - 검증: 이미지 태그가 앱 태그와 같은 값이고 action 태그와 독립임을 문서에 명시. 공개 발행·프로덕션 반영은 `/merge` 절차에서 수행.

완료 기준은 컨테이너 기동이 아니라 [spec의 수용 기준](spec.md#4-완료-조건) 전부다(SH-11은 이연). 현재 단계에서는 구현·커밋·이미지 발행·dev push·main merge를 하지 않는다.
