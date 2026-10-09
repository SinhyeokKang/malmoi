# Self-hosting — 기술 설계

작성: 2026-10-08 · 사전 초안(feature review 3회 반영, 2026-10-09 HEAD `28482742` 재대조) · 범위 정본: [spec.md](spec.md)

## 1. 현재 경계와 변경 지점

| 현재 코드 | 관측 | 제안하는 변경 |
|---|---|---|
| `next.config.ts`, `package.json` | Next 서버 빌드. HSTS는 `headers()`가 빌드 때 routes-manifest에 고정. `build`에 `prisma generate`가 들어 있다(`package.json:14`) | 기존 버전을 유지한 비standalone 컨테이너. `headers()`는 건드리지 않음 |
| `lib/db.ts`, `prisma.config.ts` | PrismaPg, 조건부 datasource, 배포 명령은 dev/prod URL 구분 | `DIRECT_URL`만 주면 `prisma migrate deploy`가 됨. self-hosted 전용 명령은 `db:deploy`를 거치지 않음 |
| `lib/credentials/command.ts`(`credentialTarget` 반환 `"dev" \| "prod"`, `:26-39`), `scripts/finalize-credentials.ts:26-27` | 대상 Supabase ref·포트 5432·DB·query allowlist(`sslmode=verify-full`만) 고정. finalize는 prod가 아니면 `PRISMA_TARGET=dev`로 간다 | hosted 방어를 유지하고 self-hosted target을 세 번째 값으로 명시(§4). self-hosted가 dev 분기로 흘러가지 않게 한다 |
| `lib/github-connect/origin.ts`(`ALLOWED_HOSTS` `:38`, `LOCAL_HOST` `:44`, `requestOrigin`) | 알려진 hosted/로컬 호스트만 허용. 호출부 전부가 `requestOrigin`·`isAllowedHost`를 지난다: `lib/mcp/http.ts`, `lib/oauth/{endpoint,metadata}.ts`, `lib/{login-link,session-revocation,account-connect}/http.ts`, `lib/mcp/tools/define.ts`, `lib/onboarding/workflow.ts`, `app/api/mcp/route.ts:55`, `app/(edit)/projects/actions.ts:301,960`, `app/(edit)/account/actions.ts:154,235`, `app/(edit)/projects/[slug]/settings/{actions,page}.ts(x)`, `app/(edit)/mcp/page.tsx`, `app/signin/link/[challenge]/page.tsx:148` | **이 함수 한 곳만 바꾼다**(§2). 호출부는 수정하지 않는다 |
| `lib/onboarding/workflow.ts`(`workflowApiUrl` `:94-106`·`PRODUCTION_ORIGIN` `:85`), 호출부 `lib/onboarding-run/{create,add}.ts`·`app/(edit)/projects/[slug]/settings/page.tsx:83`·`lib/mcp/tools/project.ts:134`, `app/(edit)/mcp/page.tsx:50`, `.github/actions/malmoi-i18n-push/action.yml:38`(`api-url` 기본값 `https://mal-moi.com`), `docs/ACTIONS.md:63`(복사 예시에 `api-url` 없음) | 모르는 origin이면 `api-url` 줄을 생략해 action 기본값으로 hosted에 push 토큰을 보낸다 | `workflowApiUrl` 안에서 판정한다 — self-hosted면 항상 출력, 판정 실패면 렌더 거부(§2). 호출부 무수정. ACTIONS.md에 self-hosted 예시 |
| `lib/upload/store.ts`, `lib/upload/image.ts`(`imageSrc` `:97-101`·`isStoredImageKey` `:106-117`·`planImageDelete`·`planProjectImageDelete`), `prisma/schema.prisma:22`("공개 Blob URL" 주석) | Vercel Blob API. 삭제 계획은 Blob 접미사 판정. `isStoredImageKey`는 일부러 삭제 계획을 재사용하지 않는다(접미 일치가 남의 스토어도 통과시킨다). `imageSrc`는 키를 못 찾으면 원문을 그대로 돌려준다 | 기존 경계에 파일 저장 구현 연결. **삭제 계획 둘만** 상대 경로를 받도록 넓힌다(§3) |
| `app/api/images/[...key]/route.ts`, `app/api/images/email/[...key]/route.ts` | 무헤더 `readImage`, `isStoredImageKey`, 비정규 경로 404 | 같은 route가 저장 경계를 통해 읽음. 새 route 없음 |
| `lib/invitation-email/config.ts:21-25,46`, `message.ts:21,23,28`, `template.ts:10`(주석), `send.ts:65` | `VERCEL_ENV`에 묶인 발송 origin 판정, `https://mal-moi.com` 이미지 하드코딩. `unavailable` 사유가 로그에 남지 않는다 | self-hosted는 `MALMOI_ORIGIN` 하나로 판정·조립. 사유를 서버 로그에 남긴다(§7) |
| `vercel.json`, `app/api/pull/route.ts`(GET, `summarizeNightly` 로그, `maxDuration = 60` `:30`), `lib/pull/targets.ts:79`(`PULL_TIME_BUDGET_MS = 45_000`) | Vercel 일일 cron(`0 18 * * *`). `maxDuration`은 Vercel에서만 강제된다 | crond 컨테이너가 같은 경로를 같은 인증으로 호출 |
| `lib/seo/site.ts:11`(`SITE_ORIGIN`), `lib/seo/crawl.ts`, `lib/seo/json-ld.ts`, `app/docs/[[...slug]]/page.tsx:114`, `app/robots.ts`(force-dynamic), `app/sitemap.ts`·`app/llms*.txt`(force-static), `app/layout.tsx:122`·`components/analytics.tsx` | 고정 공개 origin·정적 산출물·Vercel 집계. robots는 `VERCEL_ENV`가 비면 이미 `Disallow: /`(`/inbox`도 이미 hosted disallow에 있다) | hosted는 그대로. self-hosted는 middleware가 noindex 헤더·sitemap/llms 404, Analytics는 서버 레이아웃에서 제외. JSON-LD·docs canonical의 `SITE_ORIGIN`은 noindex 아래라 무해 — 바꾸지 않음 |
| `app/privacy/page.tsx`, `lib/links.ts:40`, Privacy 링크 4곳(`components/public-shell/footer.tsx:30`·`components/shell/user-menu.tsx:144`·`app/signin/page.tsx:83`·`app/oauth/authorize/page.tsx:128`) | 언어별 본문 렌더(`page.tsx:37`). 링크는 `next/link` | self-hosted는 page에서 `MALMOI_PRIVACY_URL`로 redirect(§7) |
| `scripts/smoke-blob.ts` | `listImages`의 유일한 소비자, Blob 직접 import | hosted 전용으로 유지. self-hosted에 list를 구현하지 않음 |

push는 생성 워크플로의 목적지만 바뀐다. 편집 UI는 업로드 저장소와 URL 제공 경계만 바뀐다. pull은 같은 코어를 호출하는 실행 주체만 바뀐다. 어댑터·병합·인가 정책은 변경하지 않는다. CSP는 바꾸지 않는다 — 이미지가 이미 `/api/images` 동일 출처로 나가 `img-src`에 Blob 호스트가 없고(`lib/security-headers.ts:88`), `connect-src 'self'`라 Analytics 제외와도 무관하다. v1.2.4 이후 추가된 `/inbox`·`app/inbox/actions.ts`·사이드바 프로젝트 목록은 DB만 쓰고 썸네일은 `imageSrc`를 지나므로 이 표에 새 행을 만들지 않는다.

## 2. 설정과 origin

**배포 모드는 `MALMOI_ORIGIN`의 존재로 판정한다** — 별도 모드 변수를 두지 않는다. origin 정본이 둘이 되는 것을 막기 위해서다.

**판정은 import 없는 잎 모듈 하나가 한다.** `MALMOI_ORIGIN`·`VERCEL_ENV`를 읽는 비테스트 코드는 이 모듈뿐이다(SH-15 ①이 센다). 이 모듈은 순수 파서와 지연 getter를 함께 든다. middleware는 Edge 런타임이라 `lib/env.ts`를 import할 수 없으므로(`middleware.ts:41-43`) 잎 모듈이 `process.env`를 직접 읽고, 빈 문자열·공백을 미설정으로 취급하는 규칙을 손으로 적용한다. **fail-closed는 preflight가 아니라 판정 함수 자체가 지킨다** — `MALMOI_ORIGIN`과 `VERCEL_ENV`가 함께 있거나 `MALMOI_ORIGIN`이 형식 밖이면 판정 결과가 "무효"이고, 모든 소비자가 그 결과에서 origin을 만들지 않는다. Vercel에서는 preflight가 돌지 않으므로, 누가 Vercel env에 `MALMOI_ORIGIN`을 넣어도 읽기 전용 FS 위의 self-hosted 모드로 조용히 동작하지 않는다.

hosted 도메인 리터럴(`https://mal-moi.com`·`https://dev.mal-moi.com`)도 이 모듈 하나에 둔다. `SITE_ORIGIN`·`PRODUCTION_ORIGIN`·`expectedOrigin`·`message.ts`의 이미지 origin·`mcp/page.tsx:50` fallback이 그 상수를 import한다. 다음 기능이 리터럴을 하나 더 박으면 SH-15 ①이 red다.

**착수 전 실측**: `next start`에서 middleware가 `process.env`를 런타임 값으로 읽는지, 빌드 때 인라인하는지 같은 이미지를 다른 env로 두 번 띄워 확인한다(tasks §0). 인라인이면 SH-09가 성립하지 않으므로 설계를 다시 연다.

| 환경변수 | 계약 |
|---|---|
| `MALMOI_ORIGIN` (신규) | 있으면 self-hosted. HTTPS origin만. 사용자정보·path·query·fragment 금지. 요청 헤더에서 추론하지 않음. `VERCEL_ENV`와 함께 있으면 판정 무효 |
| `MALMOI_UPLOAD_DIR` (신규) | self-hosted 필수. 업로드 볼륨의 절대 경로. 존재·쓰기 가능 여부를 preflight가 확인 |
| `MALMOI_PRIVACY_URL` (신규) | self-hosted 필수. 운영자 정책의 HTTPS URL. 자체 `/privacy`로 순환하는 설정 금지(끝 슬래시·query·대문자 host 변형 포함) |
| `AUTH_URL`, `AUTH_TRUST_HOST` (기존) | self-hosted 둘 다 필수. `AUTH_TRUST_HOST=true`만 켜면 Auth.js가 forwarded Host를 신뢰하므로, **preflight의 `AUTH_URL === MALMOI_ORIGIN` 단언(끝 슬래시 정규화 후)이 실제 방어선이다** |
| `DATABASE_URL`, `DIRECT_URL` (기존) | 런타임(비-superuser)·마이그레이션(DB 소유 비-superuser) 연결을 분리. self-hosted는 `DIRECT_URL_PROD`를 사용하지 않음 |
| Resend 셋, `GITHUB_APP_SLUG` (기존, hosted에선 `optionalEnv`) | self-hosted에서는 preflight 필수. preflight는 **누락·형식**만 본다 |
| `INVITATION_EMAIL_ORIGIN` (기존) | self-hosted에서는 읽지 않고 `MALMOI_ORIGIN`에서 파생한다. 값이 있으면 preflight가 거부한다(정본 둘 방지) |
| `OPERATOR_EMAILS` (기존) | 설치 체크리스트 항목. 없으면 운영자도 프로젝트 상한 3 |
| 기존 OAuth·App·서명·암호화·Cron 값 | 운영자 자신의 값. 호스팅 서비스 값을 복사하지 않음 |

새 env 이름 셋은 `brand-spelling.test.ts`의 `UPPER_EXCEPTIONS`(`:78`, 지금은 `MALMOI_TOKEN` 하나)에 등록한다 — 주석 밖에 쓰면 red다.

**필수 설정 = preflight 실패, 런타임 문구 신설 없음.** Resend·업로드 디렉터리·`GITHUB_APP_SLUG`가 빠진 채 기동하면 사용자는 "Try again later"류의 일시 장애 문구나 "관리자에게 요청" 경로로 막힌다 — 영구 설정 결함을 일시 장애로 보이게 하지 않으려고 기동 자체를 막는다. **한계**: 형식은 맞지만 Resend가 거부하는 API 키·미검증 발신자는 preflight가 잡지 못한다. 기존 계약대로 초대 발급 뒤 `email-rejected`로 실패한다(`lib/invitation-email/create.ts:66`). 운영자가 원인을 찾도록 `config.ts`의 `unavailable` 사유와 발송 거부를 서버 로그에 남기고(`send.ts:65`), 설치 문서에 진단 절차를 둔다. 기동 뒤 볼륨 권한이 바뀌는 경우는 기존 문구를 수용한다. preflight 판정은 메시지 문자열이 아니라 사유 코드로 테스트한다(POSTMORTEM 2026-09-08).

`VERCEL_ENV=production`을 임의로 세워 hosted 판정을 우회하지 않는다. 새 설정과 필수/선택 여부를 `.env.example` 및 배포 예제에 함께 기록한다 — SH-15 ②가 일치를 센다. `.env.example:220,222`의 `notify.mal-moi.com` 발신자 예시는 hosted 값이라고 주석에 밝힌다.

origin 파서의 정규화·거절 경계: 끝 슬래시는 정규화, 대문자 host는 소문자로, 기본 포트 `:443`은 제거, 비기본 포트는 유지. HTTP·userinfo·path·query·fragment는 거절한다. **IPv6 리터럴·IDN은 지원하지 않는다** — 기존 `HOST` 정규식(`origin.ts:22`)이 이미 거부하고, 공인 TLS가 붙은 IPv6 리터럴 설치는 현실적이지 않다.

**`requestOrigin`이 self-hosted에서 하는 일은 셋이다**: (a) 설정 호스트만 정확 일치로 허용하고 `LOCAL_HOST`를 끈다 (b) `x-forwarded-proto`를 보지 않고 설정 origin을 그대로 반환한다 (c) 호출부는 바꾸지 않는다. hosted의 기존 허용 목록·판정은 그대로 둔다. reverse proxy는 외부 Host를 **원래 값 그대로** 앱에 넘긴다 — nginx 기본값(`proxy_set_header Host $proxy_host`)이면 판정이 전부 null이 되고, `middleware.ts:38`의 로그인 리다이렉트도 Host에 기댄다. 예제는 `proxy_set_header Host $host`를 명시한다. 앱 포트는 내부망에만 연다. 인증 콜백·계정 연결·MCP Origin/issuer/resource·Server Action CSRF 검사를 모두 실제 proxy를 통해 시험한다.

**HSTS는 앱을 바꾸지 않는다.** `next.config.ts`의 `headers()`는 빌드 때 고정되고 middleware matcher는 `/api`·정적 자산을 제외하므로, 같은 이미지에서 런타임에 값을 가를 수단이 없다. 앱은 hosted 값(`max-age=63072000; includeSubDomains; preload`)을 그대로 내고, **self-hosted proxy 예제가 `Strict-Transport-Security`를 `max-age=63072000`으로 덮어쓴다** — 설치 호스트 아래 다른 서비스를 HTTPS로 강제하지 않기 위해서다. 덧붙이면 HSTS가 둘 나가므로 예제는 덮어쓰기 지시어를 쓴다(nginx: `proxy_hide_header Strict-Transport-Security` 뒤 `add_header … always`). `lib/security-headers.ts`는 확장하지 않는다. 검증은 proxy 뒤 페이지·API·정적 자산의 최종 응답에 HSTS가 하나이고 값이 정확한지 본다.

GitHub 로그인 OAuth App, GitHub App의 user-to-server 자격증명, installation 토큰의 경계를 유지한다. GitHub·Google provider는 모두 제공하며 운영자가 각 callback을 등록한다. 검증 이메일을 가진 사용자는 현재처럼 로그인할 수 있고(PII 저장), 프로젝트 접근은 멤버십으로만 열린다. 설치 문서에 공개 가입의 결과를 명시한다.

**`workflowApiUrl`이 판정을 든다.** self-hosted면 항상 설정 origin을 출력하고, 판정이 무효면 줄을 생략하지 않고 워크플로 렌더 자체를 거부한다. 호출부(`onboarding-run/{create,add}.ts`·`settings/page.tsx:83`·`mcp/tools/project.ts:134`)는 바꾸지 않는다. hosted 프로덕션 출력이 지금과 바이트 단위로 같다는 기존 단언(`workflow.test.ts:308-329`)은 그대로 둔다. 통합 검증은 action `malmoi-i18n-push-v3`의 `api-url` 입력으로 한다(생성기 태그 전환은 spec §8). MCP 화면의 hosted fallback도 같은 판정을 지난다. `docs/ACTIONS.md`에 self-hosted 복사 예시를 두고 `api-url`이 필수라고 적는다. 도메인 변경은 OAuth 재등록·재연결을 요구하며 토큰을 자동 이식하지 않는다.

## 3. 이미지 저장

기존 put/read/delete 소비자를 그대로 수용하는 작은 저장 경계만 둔다. hosted는 Vercel Blob, self-hosted는 파일 볼륨으로 결정하며 추가 provider 등록 API는 만들지 않는다. 외부 SDK의 결과 타입이 새 구현까지 퍼지지 않도록 실제 소비 필드만 정의한다. `listImages`는 `scripts/smoke-blob.ts` 전용이라 hosted에만 남기고 self-hosted 저장 경계에는 넣지 않는다.

- 기존 랜덤 키 문법·업로드 크기 제한·192px WebP 정규화를 유지한다. 원본 이미지는 보관하지 않는다.
- self-hosted DB 이미지 참조는 `/api/images/<key>` 상대 경로로 저장한다. **`imageSrc`는 바꾸지 않는다** — 키를 못 찾으면 원문을 그대로 돌려주므로 상대 경로가 이미 맞게 렌더되고, 클라이언트 잎이라 env를 읽을 수도 없다. **`isStoredImageKey`와 삭제 계획의 분리도 유지한다** — 삭제 계획의 접미 일치를 남이 정한 경로를 받는 방향에 쓰면 아무 Vercel 고객의 스토어나 통과한다. 바꾸는 것은 `planImageDelete`·`planProjectImageDelete` 둘이 상대 경로 형태도 키로 인식하는 것뿐이다. `schema.prisma:22`의 "공개 Blob URL" 주석을 두 형태로 고친다.
- 읽기는 기존 `app/api/images/[...key]`·`app/api/images/email/[...key]` route가 저장 경계를 통해 한다. 파일 읽기는 `isStoredImageKey` 통과 뒤 볼륨 루트 realpath 포함 검사를 지난다. 읽기 스트림의 reject는 catch 안에서 404로 접는다(POSTMORTEM 2026-10-07의 본문 500 부류). 공개 난수 키라는 현재 접근 모델을 유지하고 디렉터리 listing·임의 파일 serving을 추가하지 않는다.
- 쓰기는 PII 활성 키 검증을 `putImage`보다 먼저 한다(POSTMORTEM 2026-09-13 — 외부 쓰기 뒤에 키 오류를 발견하지 않는다). 임시 파일은 난수 이름으로 만들고 rename해 부분 기록과 동시 교체 충돌을 피한다. crash가 남긴 임시 파일은 키 문법에 맞지 않아 읽기 경로에 노출되지 않는다. 업로드 디렉터리 자체가 symlink인 경우도 볼륨 밖 탈출로 판정한다. 쓰기 실패(볼륨 가득 참·읽기 전용) 시 DB가 옛 참조를 유지하는 기존 처리 순서를 검증한다.
- 쿠키·Authorization을 외부 이미지 호스트로 넘기지 않는다. Blob 읽기의 정확한 호스트 제한을 일반 URL 허용으로 완화하지 않는다.

## 4. DB와 키 운영

새 애플리케이션 테이블·컬럼은 필요하지 않다. 기존 마이그레이션 이력을 수정하지 않고 빈 Postgres 17에서 전부 실행한다. Supabase 역할 SQL은 `20260926175555_revoke_public_schema_usage_from_api_roles`의 `IF EXISTS (pg_roles)` 가드 안에 있어 일반 Postgres에서도 통과한다(가드 없는 `REVOKE … FROM PUBLIC`은 `lib/__tests__/schema-usage.integration.ts`가 이미 일반 PG에서 실측한다). `CREATE EXTENSION`·`gen_random_uuid` 의존은 없다.

**migrate는 DB를 소유한 비-superuser 롤이 실행하고, bootstrap은 migrate 다음에 돈다.** 같은 마이그레이션의 `REVOKE USAGE ON SCHEMA public FROM PUBLIC` 때문에 런타임 롤은 명시적 권한이 없으면 쿼리 자체가 실패한다. bootstrap이 하는 일:

1. 런타임 롤이 없으면 만든다(있으면 건너뛴다 — 매 업그레이드마다 다시 돌므로 멱등이어야 한다). 비밀번호는 런타임 설정으로 migrate 컨테이너에 공급한다.
2. `GRANT USAGE ON SCHEMA public` + **`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public`·`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public`** — `ALTER DEFAULT PRIVILEGES`는 이후에 만들어지는 객체에만 걸리므로 기존 객체엔 따로 준다.
3. **`ALTER DEFAULT PRIVILEGES FOR ROLE <migrate 소유자 롤>`**(테이블·sequence) — 다음 업그레이드의 마이그레이션이 만든 테이블에도 권한이 따라간다.

앱에는 DDL/superuser 자격증명을 주지 않는다. **bootstrap SQL은 `prisma/migrations/` 밖(`deploy/` 아래)에 둔다** — 안에 두면 `/merge` 1단계 `db:deploy`가 prod Supabase에 적용한다. 이는 설치 DB의 역할·권한 설정이며 제품 스키마 마이그레이션이 아니다. DB 포트는 publish하지 않는다. DB를 Compose 밖에 두는 경우 요청당 DB 왕복이 여럿이라 앱과 같은 위치에 두라고 안내한다(POSTMORTEM 2026-09-09 — 홉당 지연이 화면 시간을 정했다).

운영 명령에 `self-hosted` target을 추가한다(`CREDENTIAL_TARGET=self-hosted`로 기존 `scripts/credentials.ts`·`scripts/finalize-credentials.ts`를 그대로 쓴다). `credentialTarget`의 반환 타입을 셋으로 넓히고, **finalize의 "prod가 아니면 dev" 분기(`finalize-credentials.ts:26-27`)를 target별 명시 분기로 바꿔 self-hosted가 `PRISMA_TARGET=dev`로 흘러가지 않게 한다.** finalize는 `pnpm exec prisma migrate deploy`를 부르므로 이미지에 `pnpm`이 있어야 한다. hosted dev/prod의 Supabase allowlist와 `PRISMA_TARGET` 안전 장치를 유지한다. self-hosted URL도 driver가 대상 host/user/port를 query로 덮을 수 없도록 검증한다. **TLS는 Compose 내부 서비스 호스트(`postgres`)일 때만 `sslmode` 생략/`disable`을 허용하고, 그 밖의 호스트는 `verify-full`을 강제한다.** `db:deploy`를 그대로 호출해 hosted prod URL을 요구하는 경로를 만들지 않는다.

`TOKEN_ENCRYPTION_KEYS`·활성 ID, `PII_ENCRYPTION_KEYS`·활성 ID, `EMAIL_LOOKUP_KEY`·ID, `AUTH_SECRET`, `APP_SIGNING_SECRET`, `CRON_SECRET`을 구분한다. 재시작 때 자동 재생성하지 않으며 keyring의 이전 복호화 키도 백업한다. 현재 회전·verify·reindex·finalize 절차(`--mode`)가 self-hosted target에서 실행되어야 한다. 키를 잃은 DB 백업만으로는 복구할 수 없다.

## 5. 컨테이너와 실행 순서

서비스는 proxy, postgres, migrate(일회성), web, scheduler다. proxy의 정확한 배포물은 착수 전 지원 환경 검증에서 고정한다. 사용자가 TLS를 구성해야 하는 전제와 설정 예제(Host 전달·HSTS 덮어쓰기·rate limit 포함)를 제공한다. 앱·DB는 같은 서버의 내부망에 두고 웹은 non-root로 실행한다. 업로드와 DB는 각각 영속 볼륨을 사용한다.

**rate limit은 proxy 예제가 든다.** hosted의 Vercel WAF 규칙(OPERATIONS "Vercel WAF rate limit" — `/api/images/` OR `/oauth/authorize`, IP당 600/60s)이 self-hosted엔 없다. `/api/images/email`은 인증 없이 요청마다 sharp를 돌리고, `/oauth/authorize`는 무인증 GET 하나가 외부 fetch와 행 삽입을 만든다. 예제는 같은 경로·한도를 proxy 설정으로 두고, 예제를 바꾸면 이 보호가 사라진다고 적는다. 앱 코드에는 제한을 두지 않는다.

순서는 DB healthy → migrate(마이그레이션 + bootstrap) 성공 → web ready → scheduler 시작이다. **readiness는 DB ping만 한다** — 적용된 migration은 `service_completed_successfully`가, 업로드 경로·필수 설정은 preflight가 이미 보장한다. 외부 공개 응답에는 상세 오류나 비밀을 싣지 않는다. 업그레이드에서는 기존 migrate 컨테이너의 과거 성공을 재사용하지 않고 해당 릴리스의 명령을 새로 실행하고, **migrate 뒤 web을 같은 digest의 새 이미지로 재생성한다**(POSTMORTEM 2026-09-14 — 낡은 Prisma 클라이언트가 새 스키마를 조회했다).

Compose는 컨테이너가 실행 중이라는 사실만으로 readiness를 보장하지 않으므로 `service_healthy`와 `service_completed_successfully` 조건을 사용한다. [Docker 공식 문서](https://docs.docker.com/compose/how-tos/startup-order/)

**이미지는 비standalone 한 벌이다.** `next start`, `prisma migrate deploy`, `tsx scripts/credentials.ts`를 같은 이미지에서 실행한다 — 마이그레이션·키 운영에 어차피 prisma CLI·tsx·전체 `node_modules`가 필요하고, standalone은 가이드 원고·sharp·Prisma client의 tracing 누락이라는 새 사고 표면을 만든다(POSTMORTEM 2026-09-03 계열). digest가 하나라 "같은 revision" 검증도 필요 없다. Node 메이저는 `.nvmrc`, pnpm은 `packageManager`를 따르고 `.npmrc`(`enable-pre-post-scripts=true` — 빠지면 `prebuild`의 폰트 복사가 조용히 건너뛰어진다)를 이미지에 복사한다. 셋 다 SH-15 ③이 센다. `.env*`, `.git`, 로컬 데이터·백업을 build context에서 제외하고 image layer·history·번들에 비밀이 없는지 검사한다. 운영 비밀은 권한을 제한한 런타임 설정으로만 공급한다.

한 앱 인스턴스만 지원한다. 다중 replica용 Server Action 키 공유나 무중단 배포는 추가하지 않는다. 업그레이드 후 이전 화면 탭은 새로고침이 필요할 수 있음을 문서화한다. 최신 Next 문서는 참고이고 저장소 버전을 올리는 근거가 아니다.

이미지 태그는 앱 태그 `v<x.y.z>`를 따르고 **매 앱 태그마다 `/merge`가 발행한다**(spec §7). action 태그 `malmoi-i18n-push-vN`과는 별개 축이다.

## 6. 스케줄러

crond와 `curl`만 든 작은 컨테이너다. 매일 18:00 UTC(`vercel.json`의 `0 18 * * *`와 같은 값)에 `curl -fsS --max-time 300 -H "Authorization: Bearer $CRON_SECRET" http://web:<port>/api/pull`(GET)을 호출한다. 스케줄러에는 Cron 비밀과 내부 목적지만 주고 DB·OAuth·암호화 키를 주지 않는다.

**`--max-time 300`의 근거**: `next start`는 `maxDuration = 60`을 강제하지 않으므로 route의 시간 상한은 루프 예산 `PULL_TIME_BUDGET_MS`(45초)와 그 시점에 진행 중인 항목의 완료뿐이다(POSTMORTEM 2026-10-07 — 예산 로직만 남는다). 300초는 그 합보다 넉넉하고 하루보다 훨씬 짧다. curl이 시간 초과로 끊어도 서버 작업은 계속되고, 결과는 web 로그에 남는다.

응답 해석은 하지 않는다. route가 이미 `summarizeNightly`로 프로젝트별 결과를 web 로그에 남기므로, 부분 실패·미처리 판정은 그 로그 줄로 한다. `curl -f`는 HTTP 오류만 실패로 남긴다. 불명확한 네트워크 실패를 즉시 재시도하지 않는다. 중단 중 놓친 회차의 자동 따라잡기나 큐는 없다. 수동 실행은 같은 명령을 쓴다. 단일 cron 항목이라 정상 운영에서는 겹치지 않는다. 업그레이드 중 스케줄러 컨테이너 둘이 잠시 공존해 `/api/pull`이 겹쳐 불리는 경우는 수동 실습으로 확인한다(tasks §4).

## 7. 공개 URL·메일·개인정보 안내

hosted의 canonical·sitemap·llms 정적 산출물은 그대로 둔다. self-hosted는 middleware가 페이지에 `X-Robots-Tag: noindex`를 붙이고 `/sitemap.xml`·`/llms.txt`·`/llms-full.txt`를 404로 응답한다(세 경로는 matcher 안에 있다). 이 분기는 §2의 실측(middleware가 런타임 env를 읽는다)을 전제로 한다. robots는 `VERCEL_ENV`가 비면 이미 `Disallow: /`를 낸다. canonical은 noindex 아래에서 무해하므로 바꾸지 않는다. **Analytics는 서버 레이아웃(`app/layout.tsx:122`)에서 제외한다** — 클라이언트 컴포넌트(`components/analytics.tsx`)에서는 `MALMOI_ORIGIN`이 `undefined`라 항상 렌더된다. 위치를 테스트로 고정한다. 이것을 보안 기능이라고 설명하지 않는다. origin과 무관한 언어별 검색 색인은 정적으로 유지한다.

메일은 기존 Resend REST 호출, after-commit 발송, accepted/unknown 판정, 자동 재시도 없음의 계약을 유지한다. 링크·로고·프로젝트 이미지는 `MALMOI_ORIGIN`을 기준으로 만든다(`message.ts`의 하드코딩 제거, `config.ts`의 `VERCEL_ENV` 판정을 배포 모드 판정으로 대체). `unavailable` 사유와 발송 거부를 서버 로그에 남긴다(§2). UI 문구는 바꾸지 않는다.

self-hosted의 `/privacy`는 **`app/privacy/page.tsx`에서** `MALMOI_PRIVACY_URL`로 임시 redirect한다. URL은 하나이고 모든 화면 언어에 쓴다(hosted는 언어별 본문). 링크 4곳(푸터·사용자 메뉴·`/signin` 동의문·`/oauth/authorize` 동의문)은 그대로 `next/link`이고, 브라우저에서 실제로 운영자 페이지에 착지하는지를 SH-12 [수동]으로 본다. 진행 중인 흐름(로그인·OAuth 동의)에서 같은 탭으로 외부 정책에 나가면 원래 작업으로 돌아올 길이 끊기므로(POSTMORTEM 2026-09-12 계열, DESIGN §6.3 외부 링크 새 탭), **두 동의문 링크는 self-hosted에서 새 탭으로 연다.** 서비스 운영자의 연락처(`messages/en.tsx:875`)나 Vercel·Supabase 이용 설명을 해당 설치의 정책인 것처럼 노출하지 않는다.

**운영자 정책의 재료를 준다.** 설치 문서에 `lib/privacy/collected.ts`에서 파생한 수집 항목표(v1.2.5의 `User.attentionSeenAt` 포함), 쿠키(테마·화면 언어·세션 등), 전송처(Resend·GitHub·Google), 그리고 self-hosted DB용 계정 삭제 절차(hosted는 OPERATIONS의 수동 절차 — PRODUCT §4.2)를 둔다. 운영자가 그 표를 근거로 자기 정책을 쓴다(POSTMORTEM 2026-09-19 — 방침이 코드와 어긋남).

화면 문구 중 self-hosted에서 거짓이 되는 두 부류를 고친다.

- **동의문**: `/signin`(`app/signin/page.tsx:82`)과 `/oauth/authorize`(`app/oauth/authorize/page.tsx:126-131`)가 렌더한다. 초대 화면에는 없다. 사전의 `consent`는 `before`·`link`·`after` 세 조각이고(`messages/en.tsx:477` 등) "the Malmoi Privacy Policy"가 한 문자열이 아니다. self-hosted에서 거짓이 되는 것은 링크 대상의 소유자이므로 조각 문구가 두 배포에서 참이 되도록 고친다.
- **App 호칭**: "Malmoi GitHub App" 고유명을 **두 배포 공통** 처음 "the GitHub App", 이어서 "the app"으로 바꾼다(이 형은 이미 `messages/en.tsx:1195,1778`에 있다). 위치는 en `2295·2303·2312·2331·2334·2352·3473·3802·3926·3945·3946`(11, `3802`는 영어 고정 MCP 문구) · ko `1059·1066·1071·1084·1086·1099·1824·2012·2023·2024`(10) · es `849·1051·1058·1063·1076·1078·1091·1817·2002·2013·2014`(11, `849`는 변형 `GitHub App de Malmoi`)이고, 변형 `confirmDisconnect`("Disconnect GitHub App from Malmoi?" — en `1989`·ko `857`)도 같이 본다. 줄 번호는 착수 시 다시 센다. **같은 배치에서** DESIGN §10.1의 App 호칭 행(`docs/DESIGN.md:2375`)·`lib/i18n/__tests__/helpers/banned-terms.ts:34,91`의 use 열·`lib/i18n/__tests__/terminology.test.ts:323`·`components/__tests__/new-project.test.tsx:1247`을 고친다 — 사전만 바꾸고 정본 규칙을 남기면 POSTMORTEM 2026-09-20 형이다. [gitlab-repositories](../gitlab-repositories/design.md)도 이 키를 고치므로 먼저 착수하는 쪽이 낱말을 정한다(spec §5).

세 사전(en·ko·es)을 같은 커밋에서 고친다.

사용자 가이드 en·ko·es의 다음 원고를 고친다 — `ai-agents/README.md`, `ai-agents/browser.md`, `ai-agents/token.md`, `ai-agents/prompts.md`, 가이드 루트의 `faq.md`, `reference/troubleshooting.md`, `account/preferences.md:43`("Privacy Policy is available in English and Korean" — self-hosted에서 거짓), `setup/workflow.md:28`(self-hosted 워크플로엔 `api-url` 줄이 항상 있다). MCP 연결은 현재 인스턴스의 **Copy server URL**(`components/mcp/connected-apps-card.tsx:135`)로 얻은 주소를 사용하도록 안내한다(지금 `browser.md`에는 이 안내가 없고 하드코딩 주소만 있다). 개인정보 문의는 해당 설치의 `/privacy`로 연결하고, 처리 기한은 운영자 정책에서 확인하도록 안내한다. hosted의 30일 응답 약속은 hosted 정책에 유지하며 모든 설치의 공통 약속으로 쓰지 않는다. 원고는 런타임 origin 치환 없이 두 배포에서 통하는 안내로 유지한다. `guide/SHOOTING.md:69,159`는 origin을 `mal-moi.com`으로 바꾸고 `api-url` 줄을 지워 찍는다 — 컷은 그대로 두되 본문이 "hosted 화면 예시"라는 전제를 깨지 않는지 대조한다. 가이드 화면뿐 아니라 언어별 정적 검색 색인과 hosted llms 파생본에도 같은 안내가 반영되는지 확인한다.

## 8. 백업·업그레이드·복구

1. scheduler와 웹의 신규 유입을 멈추고 실행 중 쓰기를 종료한다.
2. DB dump, 업로드 볼륨, 모든 암호화·서명 키 및 배포 설정을 같은 정지 구간에서 백업한다. 이미지 digest·migration 상태·백업 시각을 비밀 없는 manifest로 남긴다.
3. 목표 릴리스 이미지로 migration(+bootstrap)을 실행한 뒤 같은 digest로 앱을 재생성한다. smoke 성공 뒤 외부 유입과 scheduler를 연다.
4. 실패 시 DB 호환성이 입증된 경우에만 이전 이미지를 사용한다. 그렇지 않으면 이전 DB·이미지·키 백업을 함께 복원한다. 무조건적인 down migration을 제공하지 않는다.
5. 복원 검증은 scheduler를 끈 격리 환경에서 먼저 수행한다. 실제 리포 쓰기는 테스트 리포로 제한하고 의도하지 않은 PR 생성을 막는다.

백업 파일은 DB와 같은 호스트에만 남기지 않도록 운영 안내에 포함한다. 키·DB dump의 접근 권한을 제한하고 복원 검증 없이 백업 성공만으로 SH-10을 통과시키지 않는다. 과거 시점 복원으로 되살아난 세션·토큰의 폐기 여부도 운영 절차에서 점검한다. 업그레이드 실측(SH-11)은 두 번째 지원 릴리스에서 한다.

## 9. 순수 함수와 불변식

| TDD 대상 | 검증 |
|---|---|
| 배포 모드·origin 파서 | 누락·빈 문자열·공백·오타·HTTP·userinfo·서브패스 거절, 끝 슬래시·대문자·`:443` 정규화, IPv6·IDN 거절, `VERCEL_ENV` 동시 존재 → 무효, hosted 호환. 사유 코드로 단언 |
| preflight 판정 | 필수 설정별 누락·형식 오류 보고, `AUTH_URL` 불일치(끝 슬래시 정규화 후), `INVITATION_EMAIL_ORIGIN` 존재 거부, `MALMOI_PRIVACY_URL` 순환 변형, 상대·부재 업로드 디렉터리, 출력에 비밀 값 없음, 모두 있을 때 통과 |
| `requestOrigin`·URL 계획(workflow/MCP/OAuth/메일) | self-hosted의 SaaS fallback 금지, 위조 `Host`·`X-Forwarded-*`에도 설정 origin만, self-hosted workflow에 `api-url` 줄 항상 존재·무효면 렌더 거부, 정확한 callback/issuer/resource |
| 삭제 계획·파일 저장 경계 | 기존 Blob URL과 `/api/images/<key>`가 같은 키, traversal·인코딩 우회·symlink 거절, 읽기 reject → 404 |
| credential target parser | hosted allowlist 유지, self-hosted query override 거절, 내부 호스트만 평문 허용, self-hosted가 dev 분기로 가지 않음 |
| 공개 응답 정책 | hosted 무변경, self-hosted noindex·sitemap/llms 404·Analytics 제외(서버 레이아웃 위치) |
| 스케줄 상수 | 스케줄러 cron 식이 `vercel.json`의 값과 같음 |
| 상시 게이트(SH-15) | 리터럴·env 직접 읽기 허용 목록, env ↔ preflight 표 ↔ `.env.example` ↔ compose 키, Dockerfile ↔ `.nvmrc`·`packageManager`·`.npmrc` |

파일 권한·symlink·atomic write는 임시 디렉터리 기반 `pnpm test` 테스트로 판정한다(`lib/cli/__tests__/walk.test.ts`의 `mkdtempSync`·`symlinkSync` 선례). migration·런타임 롤 권한은 격리 PostgreSQL 스위트로, proxy·OAuth·컨테이너는 수동 실습으로 판정한다. 기존 함수를 확장하는 곳은 새 이름의 중복 정책을 만들지 않는다.

불변식 1–4의 strict 적재·병합 없음·보존·결정성, 5의 `projectId` 제한, 6의 자격증명 분리, 7의 멤버십 인가, 8·9의 readiness/실패 표현, 10·11의 경로·repositoryId 보호를 그대로 재사용한다. 불변식 본문은 바꾸지 않는다. 바뀌는 것은 불변식 5 아래의 ⚠️ Supabase 권한 주석·ARCHITECTURE §7·CLAUDE.md Supabase 절로, self-hosted 대응(포트 비공개·비-superuser 런타임 롤·bootstrap)을 함께 서술한다(SH-14). 새 저장소는 앱 이미지의 저장 경계이고 번역 export/blob SHA 판정에는 관여하지 않는다.

## 10. 과거 장애에서 가져오는 제약

[POSTMORTEM](../../POSTMORTEM.md)의 다음 기록을 구현 리뷰에서 확인한다.

- 2026-08-31 환경변수 import 시점 요구: 비밀 없는 build와 지연 설정 읽기 검증. 로컬 gate는 `.env.local`이 있어 이를 증명하지 못하므로 env를 비운 build를 따로 실행한다.
- 2026-09-03 빌드 생성물 누락: standalone을 쓰지 않는 근거. `.npmrc` 복사를 SH-15 ③이 센다.
- 2026-09-06 리다이렉트 횟수로 장애를 정상으로 읽음: 왕복 판정은 착지 화면으로.
- 2026-09-08 도달 불가한 오류 갈래를 겨냥한 테스트: preflight·origin 판정은 메시지가 아니라 사유 코드로 단언.
- 2026-09-09 DB 직접 공개: 앱 인가 외에 DB 네트워크·권한 검증.
- 2026-09-09 함수가 지구 반대편에서 돌던 것: Compose 밖 DB는 앱과 같은 위치에 두라고 안내(§4).
- 2026-09-10 DB URL과 실제 driver 대상 불일치: URL query override 방어 유지.
- 2026-09-10 수집되지 않는 스위트: 새 격리 사례를 기존 projects 스위트에 넣고 gate-plan 트리거에 함께 등록.
- 2026-09-12 OAuth 오류 화면이 복귀 지점을 잃음: 동의문 외부 링크는 새 탭(§7).
- 2026-09-13 이미지 쓰기 키 오류를 외부 업로드 뒤에 발견: 파일 저장도 PII 키 검증이 쓰기보다 먼저(§3).
- 2026-09-14 낡은 Prisma 클라이언트: 업그레이드는 migrate 뒤 같은 digest로 web 재생성(§5).
- 2026-09-19 방침이 코드와 어긋남: 운영자 재료는 `collected.ts`에서 파생(§7).
- 2026-09-20 화면 하나의 규칙을 새 화면이 어김: App 호칭은 사전·정본·테스트를 같은 배치에서(§7).
- 2026-09-28 외부 rewrite의 세션 쿠키 유출: 이미지 route의 무헤더 읽기 유지.
- 2026-10-02 남은 타이머로 CI teardown red: 시계를 쓰는 테스트는 타이머 정리 필수.
- 2026-10-07 비동기 경계와 검증 트리거: 파일 읽기 reject는 catch 안에서, 새 격리 사례의 트리거에 `prisma/migrations/**`·`workflow.ts`·`oauth/endpoint.ts`·`origin.ts` 포함. 야간 대상 선정: `next start`에선 예산 로직만 남는다(§6).

새 설정은 런타임에 읽을 수 있는 위치에 두고 reverse proxy를 앞에 둔다는 배포 원칙은 [Next.js self-hosting 문서](https://nextjs.org/docs/app/guides/self-hosting)를 참고한다. 구체적인 동작은 저장소에 고정된 버전에서 검증한다.
