# Self-hosting — 기술 설계

작성: 2026-10-08 · 사전 초안(feature review 2회 반영) · 범위 정본: [spec.md](spec.md)

## 1. 현재 경계와 변경 지점

| 현재 코드 | 관측 | 제안하는 변경 |
|---|---|---|
| `next.config.ts`, `package.json` | Next 서버 빌드. HSTS는 `headers()`가 빌드 때 routes-manifest에 고정 | 기존 버전을 유지한 비standalone 컨테이너. `headers()`는 건드리지 않음 |
| `lib/db.ts`, `prisma.config.ts` | PrismaPg, 조건부 datasource, 배포 명령은 dev/prod URL 구분 | `DIRECT_URL`만 주면 `prisma migrate deploy`가 됨. self-hosted 전용 명령은 `db:deploy`를 거치지 않음 |
| `lib/credentials/command.ts` | 대상 Supabase ref·포트 5432·DB·query allowlist(`sslmode=verify-full`만) 고정 | hosted 방어를 유지하고 self-hosted target을 별도로 검증(§4) |
| `lib/github-connect/origin.ts`(`ALLOWED_HOSTS`), `lib/mcp/http.ts`(같은 목록 재사용) | 알려진 hosted/로컬 호스트만 허용 | 설정한 origin 하나를 정확하게 허용 |
| `lib/oauth/endpoint.ts`, `app/.well-known/*` | MCP issuer·resource를 요청 Host에서 만듦 | self-hosted는 설정 origin에서 만듦 |
| `lib/{login-link,session-revocation,account-connect}/http.ts` | 요청 origin 판정 | 공통 origin 정책 사용 |
| `lib/onboarding/workflow.ts`(`workflowApiUrl`·`PRODUCTION_ORIGIN`), `lib/onboarding-run/{create,add}.ts`, `app/(edit)/mcp/page.tsx:50` | 호스팅 서비스 기본 주소로 fallback | self-hosted에서는 설정 origin, 잘못된 설정은 실패 |
| `lib/upload/store.ts`, `lib/upload/image.ts`(`imageSrc`·`planImageDelete`·`planProjectImageDelete`) | Vercel Blob API·URL 접미사 판정 의존 | 기존 경계에 파일 저장 구현 연결, 키 추출기 하나를 공유(§3) |
| `app/api/images/[...key]/route.ts`, `app/api/images/email/[...key]/route.ts` | 무헤더 `readImage`, `isStoredImageKey`, 비정규 경로 404 | 같은 route가 저장 경계를 통해 읽음. 새 route 없음 |
| `lib/invitation-email/config.ts:21-25,46`, `message.ts:21,23,28` | `VERCEL_ENV`에 묶인 발송 origin 판정, `https://mal-moi.com` 이미지 하드코딩 | self-hosted는 설정 origin 하나로 판정·조립 |
| `vercel.json`, `app/api/pull/route.ts`(GET, `summarizeNightly` 로그) | Vercel 일일 cron(`0 18 * * *`), 결과 요약을 서버 로그에 남김 | crond 컨테이너가 같은 경로를 같은 인증으로 호출 |
| `lib/seo/site.ts`(`SITE_ORIGIN`), `lib/seo/crawl.ts`, `app/robots.ts`(force-dynamic), `app/sitemap.ts`·`app/llms*.txt`(force-static), Analytics | 고정 공개 origin·정적 산출물·Vercel 집계. robots는 `VERCEL_ENV`가 비면 이미 `Disallow: /` | hosted는 그대로. self-hosted는 middleware가 noindex 헤더·sitemap/llms 404, Analytics 제외 |
| `scripts/smoke-blob.ts` | `listImages`의 유일한 소비자, Blob 직접 import | hosted 전용으로 유지. self-hosted에 list를 구현하지 않음 |

push는 생성 워크플로의 목적지만 바뀐다. 편집 UI는 업로드 저장소와 URL 제공 경계만 바뀐다. pull은 같은 코어를 호출하는 실행 주체만 바뀐다. 어댑터·병합·인가 정책은 변경하지 않는다. CSP는 바꾸지 않는다 — 이미지가 이미 `/api/images` 동일 출처로 나가 `img-src`에 Blob 호스트가 없고, `connect-src 'self'`라 Analytics 제외와도 무관하다.

## 2. 설정과 origin

서버 전용 설정을 `lib/env.ts`를 통해 지연해서 읽는다. 순수 파서는 주입받은 값으로 배포 모드를 판정한다. 테스트·빌드의 모듈 import 시점에 런타임 비밀을 요구하지 않는다. 실행 전 preflight에서는 필수 설정 누락을 비밀 없이 보고하고 종료한다.

**배포 모드는 `MALMOI_ORIGIN`의 존재로 판정한다** — 별도 모드 변수를 두지 않는다. origin 정본이 둘이 되는 것을 막기 위해서다.

| 환경변수 | 계약 |
|---|---|
| `MALMOI_ORIGIN` (신규) | 있으면 self-hosted. HTTPS origin만. 사용자정보·path·query·fragment 금지. 요청 헤더에서 추론하지 않음. `VERCEL_ENV`와 함께 있으면 기동 실패(hosted 오설정 차단) |
| `MALMOI_UPLOAD_DIR` (신규) | self-hosted 필수. 업로드 볼륨의 절대 경로. 쓰기 가능 여부를 preflight가 확인 |
| `MALMOI_PRIVACY_URL` (신규) | self-hosted 필수. 운영자 정책의 HTTPS URL. 자체 `/privacy`로 순환하는 설정 금지 |
| `AUTH_URL`, `AUTH_TRUST_HOST` (기존) | self-hosted 둘 다 필수. `AUTH_TRUST_HOST=true`만 켜면 Auth.js가 forwarded Host를 신뢰하므로, **preflight의 `AUTH_URL === MALMOI_ORIGIN` 단언이 실제 방어선이다** |
| `DATABASE_URL`, `DIRECT_URL` (기존) | 런타임(비-superuser)·마이그레이션(소유자) 연결을 분리. self-hosted는 `DIRECT_URL_PROD`를 사용하지 않음 |
| Resend 셋, `GITHUB_APP_SLUG` (기존, hosted에선 `optionalEnv`) | self-hosted에서는 preflight 필수 |
| `OPERATOR_EMAILS` (기존) | 설치 체크리스트 항목. 없으면 운영자도 프로젝트 상한 3 |
| 기존 OAuth·App·서명·암호화·Cron 값 | 운영자 자신의 값. 호스팅 서비스 값을 복사하지 않음 |

**필수 설정 = preflight 실패, 런타임 문구 신설 없음.** Resend·업로드 디렉터리·`GITHUB_APP_SLUG`가 빠진 채 기동하면 사용자는 "Try again later"류의 일시 장애 문구나 "관리자에게 요청" 경로로 막힌다 — 영구 설정 결함을 일시 장애로 보이게 하지 않으려고 기동 자체를 막는다. 기동 뒤 볼륨 권한이 바뀌는 경우는 기존 문구를 수용한다.

`VERCEL_ENV=production`을 임의로 세워 hosted 판정을 우회하지 않는다. `INVITATION_EMAIL_ORIGIN`을 별도로 제공하면 `MALMOI_ORIGIN`과 일치해야 한다. 새 설정과 필수/선택 여부를 `.env.example` 및 배포 예제에 함께 기록한다.

origin 파서의 정규화·거절 경계: 끝 슬래시는 정규화, 대문자 host는 소문자로, 기본 포트 `:443`은 제거, 비기본 포트는 유지, IPv6 리터럴·IDN(punycode 정규형)은 허용하되 비교는 정규형으로 한다. HTTP·userinfo·path·query·fragment는 거절한다.

reverse proxy가 외부 Host와 forwarded 헤더를 정규화하며 앱 포트는 내부망에만 연다. 인증 콜백·계정 연결·MCP Origin/issuer/resource·Server Action CSRF 검사를 모두 실제 proxy를 통해 시험한다. hosted preview의 기존 허용 목록은 별도로 유지한다.

**HSTS는 앱을 바꾸지 않는다.** `next.config.ts`의 `headers()`는 빌드 때 고정되고 middleware matcher는 `/api`·정적 자산을 제외하므로, 같은 이미지에서 런타임에 값을 가를 수단이 없다. 앱은 hosted 값(`max-age=63072000; includeSubDomains; preload`)을 그대로 내고, **self-hosted proxy 예제가 `Strict-Transport-Security`를 `max-age=63072000`으로 덮어쓴다** — 설치 호스트 아래 다른 서비스를 HTTPS로 강제하지 않기 위해서다. `lib/security-headers.ts`는 확장하지 않는다. 검증은 proxy 뒤 페이지·API·정적 자산의 최종 응답에 HSTS가 하나이고 값이 정확한지 본다.

GitHub 로그인 OAuth App, GitHub App의 user-to-server 자격증명, installation 토큰의 경계를 유지한다. GitHub·Google provider는 모두 제공하며 운영자가 각 callback을 등록한다. 검증 이메일을 가진 사용자는 현재처럼 로그인할 수 있고(PII 저장), 프로젝트 접근은 멤버십으로만 열린다. 설치 문서에 공개 가입의 결과를 명시한다.

`workflowApiUrl`은 self-hosted에서 유효한 URL을 반드시 출력한다. 현재 action `malmoi-i18n-push-v2`의 `api-url` 입력과 통합 검증한다. 설정 실패를 `undefined`로 바꿔 SaaS에 보내지 않는다. MCP 화면의 hosted fallback도 같은 계약으로 막는다. 도메인 변경은 OAuth 재등록·재연결을 요구하며 토큰을 자동 이식하지 않는다.

## 3. 이미지 저장

기존 put/read/delete 소비자를 그대로 수용하는 작은 저장 경계만 둔다. hosted는 Vercel Blob, self-hosted는 파일 볼륨으로 결정하며 추가 provider 등록 API는 만들지 않는다. 외부 SDK의 결과 타입이 새 구현까지 퍼지지 않도록 실제 소비 필드만 정의한다. `listImages`는 `scripts/smoke-blob.ts` 전용이라 hosted에만 남기고 self-hosted 저장 경계에는 넣지 않는다.

- 기존 랜덤 키 문법·업로드 크기 제한·192px WebP 정규화를 유지한다. 원본 이미지는 보관하지 않는다.
- self-hosted DB 이미지 참조는 `/api/images/<key>` 상대 경로로 저장한다. 기존 Blob URL도 기존 규칙으로 처리한다. **`imageSrc`·`planImageDelete`·`planProjectImageDelete`가 키 추출기 하나를 공유한다** — 지금은 각자 Blob 접미사 판정에 기댄다. 입력 검증, 메일 이미지 URL도 같은 추출기를 지난다.
- 읽기는 기존 `app/api/images/[...key]`·`app/api/images/email/[...key]` route가 저장 경계를 통해 한다. 공개 난수 키라는 현재 접근 모델을 유지하고 디렉터리 listing·임의 파일 serving을 추가하지 않는다.
- 순수 함수는 키 문법·참조 변환을 판단한다. I/O에서는 볼륨 밖 경로와 symlink 탈출을 차단하고, 임시 파일 후 rename으로 부분 기록을 피한다. crash가 남긴 임시 파일은 키 문법에 맞지 않아 읽기 경로에 노출되지 않는다. 쓰기 실패(볼륨 가득 참·읽기 전용) 시 DB가 옛 참조를 유지하는 기존 처리 순서를 검증한다.
- 쿠키·Authorization을 외부 이미지 호스트로 넘기지 않는다. Blob 읽기의 정확한 호스트 제한을 일반 URL 허용으로 완화하지 않는다.

## 4. DB와 키 운영

새 애플리케이션 테이블·컬럼은 필요하지 않다. 기존 마이그레이션 이력을 수정하지 않고 빈 Postgres 17에서 전부 실행한다. Supabase 역할 SQL은 `20260926175555_revoke_public_schema_usage_from_api_roles`의 `IF EXISTS (pg_roles)` 가드 안에 있어 일반 Postgres에서도 통과한다. `CREATE EXTENSION`·`gen_random_uuid` 의존은 없다.

**bootstrap은 migrate 다음에 돈다.** 같은 마이그레이션의 `REVOKE USAGE ON SCHEMA public FROM PUBLIC` 때문에 런타임 롤은 명시적 `GRANT USAGE`와 `ALTER DEFAULT PRIVILEGES`(테이블·sequence)가 없으면 쿼리 자체가 실패한다. bootstrap은 마이그레이션 소유자와 최소 권한 런타임 계정을 분리하고 앱에는 DDL/superuser 자격증명을 주지 않는다. **bootstrap SQL은 `prisma/migrations/` 밖(`deploy/` 아래)에 둔다** — 안에 두면 `/merge` 1단계 `db:deploy`가 prod Supabase에 적용한다. 이는 설치 DB의 역할·권한 설정이며 제품 스키마 마이그레이션이 아니다. DB 포트는 publish하지 않는다.

운영 명령에 `self-hosted` target을 추가한다(`CREDENTIAL_TARGET=self-hosted`로 기존 `scripts/credentials.ts`·`scripts/finalize-credentials.ts`를 그대로 쓴다). hosted dev/prod의 Supabase allowlist와 `PRISMA_TARGET` 안전 장치를 유지한다. self-hosted URL도 driver가 대상 host/user/port를 query로 덮을 수 없도록 검증한다. **TLS는 Compose 내부 서비스 호스트(`postgres`)일 때만 `sslmode` 생략/`disable`을 허용하고, 그 밖의 호스트는 `verify-full`을 강제한다.** `db:deploy`를 그대로 호출해 hosted prod URL을 요구하는 경로를 만들지 않는다.

`TOKEN_ENCRYPTION_KEYS`·활성 ID, `PII_ENCRYPTION_KEYS`·활성 ID, `EMAIL_LOOKUP_KEY`·ID, `AUTH_SECRET`, `APP_SIGNING_SECRET`, `CRON_SECRET`을 구분한다. 재시작 때 자동 재생성하지 않으며 keyring의 이전 복호화 키도 백업한다. 현재 회전·verify·reindex·finalize 절차(`--mode`)가 self-hosted target에서 실행되어야 한다. 키를 잃은 DB 백업만으로는 복구할 수 없다.

## 5. 컨테이너와 실행 순서

서비스는 proxy, postgres, migrate(일회성), web, scheduler다. proxy의 정확한 배포물은 착수 전 지원 환경 검증에서 고정한다. 사용자가 TLS를 구성해야 하는 전제와 설정 예제(HSTS 덮어쓰기 포함)를 제공한다. 앱·DB는 같은 서버의 내부망에 두고 웹은 non-root로 실행한다. 업로드와 DB는 각각 영속 볼륨을 사용한다.

순서는 DB healthy → migrate(마이그레이션 + bootstrap) 성공 → web ready → scheduler 시작이다. **readiness는 DB ping만 한다** — 적용된 migration은 `service_completed_successfully`가, 업로드 경로·필수 설정은 preflight가 이미 보장한다. 외부 공개 응답에는 상세 오류나 비밀을 싣지 않는다. 업그레이드에서는 기존 migrate 컨테이너의 과거 성공을 재사용하지 않고 해당 릴리스의 명령을 새로 실행한다.

Compose는 컨테이너가 실행 중이라는 사실만으로 readiness를 보장하지 않으므로 `service_healthy`와 `service_completed_successfully` 조건을 사용한다. [Docker 공식 문서](https://docs.docker.com/compose/how-tos/startup-order/)

**이미지는 비standalone 한 벌이다.** `next start`, `prisma migrate deploy`, `tsx scripts/credentials.ts`를 같은 이미지에서 실행한다 — 마이그레이션·키 운영에 어차피 prisma CLI·tsx·전체 `node_modules`가 필요하고, standalone은 가이드 원고·sharp·Prisma client의 tracing 누락이라는 새 사고 표면을 만든다(POSTMORTEM 2026-09-03 계열). digest가 하나라 "같은 revision" 검증도 필요 없다. Node·pnpm·의존성 버전은 저장소 정본을 따른다. `.env*`, `.git`, 로컬 데이터·백업을 build context에서 제외하고 image layer·history·번들에 비밀이 없는지 검사한다. 운영 비밀은 권한을 제한한 런타임 설정으로만 공급한다.

한 앱 인스턴스만 지원한다. 다중 replica용 Server Action 키 공유나 무중단 배포는 추가하지 않는다. 업그레이드 후 이전 화면 탭은 새로고침이 필요할 수 있음을 문서화한다. 최신 Next 문서는 참고이고 저장소 버전을 올리는 근거가 아니다.

이미지 태그는 앱 태그 `v<x.y.z>`를 따른다. action 태그 `malmoi-i18n-push-vN`과는 별개 축이다.

## 6. 스케줄러

crond와 `curl`만 든 작은 컨테이너다. 매일 18:00 UTC(`vercel.json`의 `0 18 * * *`와 같은 값)에 `curl -fsS --max-time <route 예산보다 긴 값> -H "Authorization: Bearer $CRON_SECRET" http://web:<port>/api/pull`(GET)을 호출한다. 스케줄러에는 Cron 비밀과 내부 목적지만 주고 DB·OAuth·암호화 키를 주지 않는다.

응답 해석은 하지 않는다. route가 이미 `summarizeNightly`로 프로젝트별 결과를 web 로그에 남기므로, 부분 실패·미처리 판정은 그 로그 줄로 한다. `curl -f`는 HTTP 오류만 실패로 남긴다. 불명확한 네트워크 실패를 즉시 재시도하지 않는다. 중단 중 놓친 회차의 자동 따라잡기나 큐는 없다. 수동 실행은 같은 명령을 쓴다. 단일 cron 항목이고 `--max-time`이 하루보다 짧아 겹치지 않는다.

## 7. 공개 URL·메일·개인정보 안내

hosted의 canonical·sitemap·llms 정적 산출물은 그대로 둔다. self-hosted는 middleware(요청마다 도는 런타임이라 같은 이미지에서 분기 가능)가 페이지에 `X-Robots-Tag: noindex`를 붙이고 `/sitemap.xml`·`/llms.txt`·`/llms-full.txt`를 404로 응답한다(세 경로는 matcher 안에 있다). robots는 `VERCEL_ENV`가 비면 이미 `Disallow: /`를 낸다. canonical은 noindex 아래에서 무해하므로 바꾸지 않는다. Analytics는 서버에서 제외한다. 이것을 보안 기능이라고 설명하지 않는다. origin과 무관한 언어별 검색 색인은 정적으로 유지한다.

메일은 기존 Resend REST 호출, after-commit 발송, accepted/unknown 판정, 자동 재시도 없음의 계약을 유지한다. 링크·로고·프로젝트 이미지는 `MALMOI_ORIGIN`을 기준으로 만든다(`message.ts`의 하드코딩 제거, `config.ts`의 `VERCEL_ENV` 판정을 배포 모드 판정으로 대체).

self-hosted의 `/privacy`는 `MALMOI_PRIVACY_URL`로 임시 redirect한다. 서비스 운영자의 연락처나 Vercel·Supabase 이용 설명을 해당 설치의 정책인 것처럼 노출하지 않는다. 실제 연락처·삭제 요청 절차는 운영자 정책에 포함하도록 문서화한다. 공개 푸터의 Privacy 링크(`lib/links.ts`의 `external: false`)는 redirect로 외부에 착지하는 것을 수용한다.

화면 문구 중 self-hosted에서 거짓이 되는 두 부류를 일반화한다 — 로그인·초대 화면 동의문의 "Malmoi Privacy Policy"와, 사용자가 GitHub에서 호스팅 App을 찾게 만드는 "Malmoi GitHub App" 고유명(사전 11곳). 세 사전(en·ko·es)을 같은 커밋에서 고친다.

사용자 가이드 en·ko·es의 다음 원고를 고친다 — `ai-agents/README.md`, `ai-agents/browser.md`, `ai-agents/token.md`, `faq.md`, 그리고 "Malmoi GitHub App"을 지칭하는 `reference/troubleshooting.md`·`ai-agents/prompts.md`. MCP 연결은 현재 인스턴스의 **Copy server URL**로 얻은 주소를 사용하도록 안내한다(지금 `browser.md`에는 이 안내가 없고 하드코딩 주소만 있다). 개인정보 문의는 해당 설치의 `/privacy`로 연결하고, 처리 기한은 운영자 정책에서 확인하도록 안내한다. hosted의 30일 응답 약속은 hosted 정책에 유지하며 모든 설치의 공통 약속으로 쓰지 않는다. 원고는 런타임 origin 치환 없이 두 배포에서 통하는 안내로 유지한다. 가이드 화면뿐 아니라 언어별 정적 검색 색인과 hosted llms 파생본에도 같은 안내가 반영되는지 확인한다.

## 8. 백업·업그레이드·복구

1. scheduler와 웹의 신규 유입을 멈추고 실행 중 쓰기를 종료한다.
2. DB dump, 업로드 볼륨, 모든 암호화·서명 키 및 배포 설정을 같은 정지 구간에서 백업한다. 이미지 digest·migration 상태·백업 시각을 비밀 없는 manifest로 남긴다.
3. 목표 릴리스 이미지로 migration을 실행한 뒤 앱을 기동한다. smoke 성공 뒤 외부 유입과 scheduler를 연다.
4. 실패 시 DB 호환성이 입증된 경우에만 이전 이미지를 사용한다. 그렇지 않으면 이전 DB·이미지·키 백업을 함께 복원한다. 무조건적인 down migration을 제공하지 않는다.
5. 복원 검증은 scheduler를 끈 격리 환경에서 먼저 수행한다. 실제 리포 쓰기는 테스트 리포로 제한하고 의도하지 않은 PR 생성을 막는다.

백업 파일은 DB와 같은 호스트에만 남기지 않도록 운영 안내에 포함한다. 키·DB dump의 접근 권한을 제한하고 복원 검증 없이 백업 성공만으로 SH-10을 통과시키지 않는다. 과거 시점 복원으로 되살아난 세션·토큰의 폐기 여부도 운영 절차에서 점검한다. 업그레이드 실측(SH-11)은 두 번째 지원 릴리스에서 한다.

## 9. 순수 함수와 불변식

| TDD 대상 | 검증 |
|---|---|
| 배포 모드·origin 파서 | 누락·오타·HTTP·userinfo·서브패스 거절, 끝 슬래시·대문자·`:443`·IPv6·IDN 정규화, `VERCEL_ENV` 동시 존재 거절, `AUTH_URL`·`INVITATION_EMAIL_ORIGIN` 불일치 거절, hosted 호환 |
| preflight 판정 | 필수 설정별 누락 보고, 출력에 비밀 값 없음, 모두 있을 때 통과 |
| workflow/MCP/OAuth/메일 URL 계획 | self-hosted의 SaaS fallback 금지, 정확한 callback/issuer/resource |
| 이미지 키 추출기·참조·삭제 계획 | 기존 Blob URL과 로컬 참조가 같은 키, traversal·인코딩 우회 거절 |
| credential target parser | hosted allowlist 유지, self-hosted query override 거절, 내부 호스트만 평문 허용 |
| 공개 응답 정책 | hosted 무변경, self-hosted noindex·sitemap/llms 404·Analytics 제외 |
| 스케줄 상수 | 스케줄러 cron 식이 `vercel.json`의 값과 같음 |

파일 권한·symlink·atomic write는 임시 디렉터리 기반 `pnpm test` 테스트로 판정한다(`lib/cli/__tests__/walk.test.ts`의 `mkdtempSync`·`symlinkSync` 선례). migration·런타임 롤 권한은 격리 PostgreSQL 스위트로, proxy·OAuth·컨테이너는 수동 실습으로 판정한다. 기존 함수를 확장하는 곳은 새 이름의 중복 정책을 만들지 않는다.

불변식 1–4의 strict 적재·병합 없음·보존·결정성, 6의 자격증명 분리, 7의 멤버십 인가, 8·9의 readiness/실패 표현, 10·11의 경로·repositoryId 보호를 그대로 재사용한다. 불변식 5는 요지(DB가 인터넷에 열리지 않는다)를 유지하고 self-hosted 대응을 덧붙여 다시 쓴다(SH-14). 새 저장소는 앱 이미지의 저장 경계이고 번역 export/blob SHA 판정에는 관여하지 않는다.

## 10. 과거 장애에서 가져오는 제약

[POSTMORTEM](../../POSTMORTEM.md)의 다음 기록을 구현 리뷰에서 확인한다.

- 2026-08-31 환경변수 import 시점 요구: 비밀 없는 build와 지연 설정 읽기 검증. 로컬 gate는 `.env.local`이 있어 이를 증명하지 못하므로 env를 비운 build를 따로 실행한다.
- 2026-09-03 빌드 생성물 누락: standalone을 쓰지 않는 근거.
- 2026-09-06 리다이렉트 횟수로 장애를 정상으로 읽음: 왕복 판정은 착지 화면으로.
- 2026-09-09 DB 직접 공개: 앱 인가 외에 DB 네트워크·권한 검증.
- 2026-09-10 DB URL과 실제 driver 대상 불일치: URL query override 방어 유지.
- 2026-09-10 수집되지 않는 스위트: 새 격리 스위트를 include·gate-plan 트리거에 함께 등록.
- 2026-09-28 외부 rewrite의 세션 쿠키 유출: 이미지 route의 무헤더 읽기 유지.
- 2026-10-02 남은 타이머로 CI teardown red: 시계를 쓰는 테스트는 타이머 정리 필수.

새 설정은 런타임에 읽을 수 있는 위치에 두고 reverse proxy를 앞에 둔다는 배포 원칙은 [Next.js self-hosting 문서](https://nextjs.org/docs/app/guides/self-hosting)를 참고한다. 구체적인 동작은 저장소에 고정된 버전에서 검증한다.
