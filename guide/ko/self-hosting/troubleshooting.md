# 문제 해결과 개인정보

문제가 생기면 시작 검사와 로그를 읽고, 내 개인정보 처리방침에 쓸 설치본의 저장 항목을 확인합니다.

## web이 계속 다시 시작될 때 {#startup-checks}

web 컨테이너는 `pnpm preflight && next start`로 시작합니다. 검사가 실패하면 stderr에 `preflight: <name> <reason>` 줄만 쓰고(값은 쓰지 않습니다) 종료하며, Compose가 계속 다시 시작하고 스케줄러는 올라오지 않습니다. `docker compose logs web`으로 읽습니다.

| 사유 | 뜻 | 고칠 곳 |
| --- | --- | --- |
| `missing` | 필수 이름이 없거나 비어 있습니다 | `deploy/.env`. Compose가 채우는 이름이면 Compose의 `environment` 목록 |
| `incomplete-pair` | 로그인 공급자의 두 값 중 하나만 있습니다. 줄에 빠진 쪽 이름(예: `AUTH_GOOGLE_SECRET`)이 찍힙니다 | 빠진 값을 채우거나, 그 공급자를 끄려면 두 값을 모두 비웁니다 |
| `no-login-provider` | 켜진 로그인 공급자가 없습니다. 두 줄이 `AUTH_GITHUB_ID`와 `AUTH_GOOGLE_ID`를 가리킵니다 | 완전한 쌍을 하나 이상 채웁니다([설정](install.md#settings)) |
| `invalid-format` | 모양이 틀렸습니다. `RESEND_API_KEY`는 `re_`로 시작, `INVITATION_EMAIL_FROM`은 `이름 <주소>`나 주소, `GITHUB_APP_SLUG`는 `[a-z0-9-]`, `AUTH_TRUST_HOST`는 `true`만 | 해당 값 |
| `malformed` · `not-https` · `userinfo` | `MALMOI_ORIGIN`이나 `MALMOI_PRIVACY_URL`의 모양 문제입니다. 공백·역슬래시나 읽을 수 없는 URL, `http://`, `user:pw@` | 사용자 정보 없는 `https://` URL로 |
| `path` · `query` · `fragment` · `ipv6` · `idn` | `MALMOI_ORIGIN`에만 해당합니다(방침 URL의 경로·query는 괜찮습니다). 경로, `?`, `#`, IPv6 리터럴, 비ASCII 도메인 | `MALMOI_ORIGIN=https://<domain>` 꼴로 |
| `auth-url-mismatch` | `AUTH_URL`이 `MALMOI_ORIGIN`과 다릅니다(끝 슬래시는 무시) | Compose가 정한 값을 덮어쓰지 않습니다 |
| `privacy-cycle` | `MALMOI_PRIVACY_URL`이 이 설치본의 `/privacy`라 자기 자신으로 이동합니다 | 다른 사이트에 둔 내 방침으로 |
| `relative-path` | `MALMOI_UPLOAD_DIR`이 절대 경로가 아닙니다 | Compose는 `/data/uploads`를 씁니다 |
| `not-found` | 업로드 경로가 없습니다(볼륨이 마운트되지 않음) | Compose의 `uploads` 볼륨 |
| `not-directory` | 경로는 있지만 파일이거나 symlink입니다 | 마운트 대상 |
| `not-writable` | 앱 사용자(`node`, uid 1000)가 쓸 수 없습니다 | 볼륨 소유자와 권한(`chown -R 1000:1000`) |
| `present` | `INVITATION_EMAIL_ORIGIN`이 설정되어 있습니다. 설치본은 이 값을 `MALMOI_ORIGIN`에서 만듭니다 | 변수를 지웁니다 |
| `vercel-env-present` | `VERCEL_ENV`가 `MALMOI_ORIGIN`과 함께 있어 배포 모드가 무효입니다 | `VERCEL_ENV`를 지웁니다 |

## migrate가 오류로 멈출 때 {#migrate}

`docker compose logs migrate`를 읽습니다. `bootstrap: <code>` 한 줄은 `deploy/bootstrap.sql`의 검사에서 나옵니다.

- `runtime-role-missing`, `migrate-role-missing`, `password-missing`, `password-empty`: `RUNTIME_DB_PASSWORD` 같은 변수가 빠졌습니다.
- `runtime-role-is-migrate-role`: 두 롤 이름이 같습니다.
- `runtime-role-privileged`: 이미 있는 런타임 롤이 superuser이거나 CREATEROLE·CREATEDB·BYPASSRLS를 가지고 있어, 앱이 관리자 권한으로 돌게 됩니다.
- `cannot-create-role`: 롤이 없는데 bootstrap을 실행한 롤이 롤을 만들 수 없습니다. 볼륨이 비어 있지 않아 첫 시작 스크립트가 돌지 않은 경우입니다.

그 앞의 Prisma 접속 오류는 대개 `MIGRATE_DB_PASSWORD`가 볼륨을 만들 때의 값과 다르다는 뜻입니다. 첫 시작 스크립트는 빈 볼륨에서만 돌므로 비밀번호는 [키 회전](operate.md#rotate-keys)처럼 `\password`로 바꿉니다.

## 초대 메일이 오지 않을 때 {#email}

- 초대를 만들기 전에 나오는 “지금은 이메일을 보낼 수 없습니다. 나중에 다시 시도하세요.”는 설정 문제입니다. 서버 로그에 `[invite-email] config unavailable reason=<code>`가 남습니다. `missing`(키나 발신자 없음), `invalid-from`(발신자 모양), `invalid-origin`(`MALMOI_ORIGIN` 무효) 중 하나입니다.
- 초대를 만든 뒤의 거부는 Resend가 보낸 것입니다. 로그에는 주소나 키 없이 `[invite-email] batch <rejected|unknown> <http-NNN|network> count=N` 한 줄만 남습니다. 그 시각으로 Resend 대시보드의 Emails에서 같은 요청을 찾으세요. 대개 `http-401`은 잘못되었거나 폐기한 API 키, `http-403`은 인증하지 않은 발신 도메인이나 키의 도메인 밖 발신자, `http-422`는 주소 형식, `http-429`는 Resend 한도입니다. `unknown`(`network`, 시간 초과, 5xx)이면 일부가 나갔을 수 있고, 다시 보내면 이전 링크가 만료됩니다.
- 시작 검사는 이 값들의 모양만 봅니다. Resend가 거부하는 키는 첫 초대에서야 드러나므로 설치 확인 단계에서 한 통을 보내 봅니다.

## 프록시 뒤에서 {#proxy}

- 로그인 뒤 `redirect_uri` 불일치, 나중에 다시 시도하라는 오류, 제출되지 않는 양식은 원래 호스트가 앱까지 오지 않았다는 뜻입니다. nginx 예제는 `Host $host`를 넘깁니다. `MALMOI_ORIGIN`에 기본값이 아닌 포트(예: `:8443`)가 있으면 `$host`가 포트를 떼므로, `deploy/nginx/proxy-common.conf`의 `Host`와 `X-Forwarded-Host`를 `$http_host`로 바꾸고 80 → 443 리디렉션(`return 301 https://$host…`)도 포트를 유지하게 고칩니다. 다른 프록시를 쓰더라도 앱이 받는 `Host`는 `MALMOI_ORIGIN`의 호스트(443이 아니면 포트 포함)와 정확히 같아야 합니다. 로그인 오류는 `docker compose logs web`에 Auth.js의 오류 종류와 함께 `[auth] <type>`으로 남습니다.
- 큰 업데이트가 대상 리포지토리의 워크플로에서는 504인데 서버는 적재를 끝냈다면, 앱이 계속 처리하는 동안 nginx의 `proxy_read_timeout`(기본 60초)이 연결을 끊은 것입니다. 프로젝트의 로그에서 활동을 확인하고 워크플로를 다시 실행합니다. 요청 본문은 5 MB까지입니다(`client_max_body_size`).
- nginx 앞에 로드 밸런서나 CDN을 두면 `$binary_remote_addr`가 그 장비의 주소라 누구나 rate limit 카운터 하나를 나눠 쓰고, `/api/images/`와 `/oauth/authorize`가 429를 돌려줍니다. 그 장비에 맞게 `real_ip_header`와 `set_real_ip_from`을 설정합니다.
- `/api/images/*`가 404면 업로드 볼륨 권한(web 로그의 `EACCES`)부터 봅니다.

## 야간 동기화 {#nightly}

`docker compose exec scheduler /usr/local/bin/nightly-pull`로 지금 한 번 실행해 봅니다. 스케줄러 로그의 `curl: (22) … 401`은 web과 스케줄러의 `CRON_SECRET`이 다르다는 뜻입니다(둘 다 다시 만듭니다). 결과는 `docker compose logs web`의 `[pull] targets= published= …` 요약 줄입니다. 스케줄러는 HTTP 오류만 실패로 남기고, 다시 시도하거나 나중에 따라잡지 않습니다.

## 로그인하지 못하는 사람이 있을 때 {#sign-in}

로그인 화면에 가입한 로그인 수단을 여기서 쓸 수 없다는 안내가 뜨면, 그 사람이 꺼 둔 공급자로 가입했고 다른 로그인 수단을 연결하지 않았다는 뜻입니다. Malmoi는 그 사람에게 계정을 하나 더 만들어 주지 않습니다. 그 공급자를 다시 켜서 그 사람이 로그인해 남겨 둘 공급자를 연결하게 한 뒤, 다시 끄세요([로그인 공급자 끄기](operate.md#sign-in-providers)).

## GitHub {#github}

새 계정에서 GitHub App을 설치할 수 없다면 앱이 Public인지 먼저 확인합니다. 리포지토리가 설치되지 않은 것으로 보이면 그 설치의 Repository access를 확인합니다.

## 개인정보 처리방침에 쓸 재료 {#privacy}

설치본의 개인정보 처리방침은 운영자가 씁니다. 설치본의 `/privacy`는 `MALMOI_PRIVACY_URL`로 이동하고, mal-moi.com의 방침은 내 설치본을 설명하지 않으니 복사하지 마세요. 아래는 설치본이 실제로 저장하는 항목, 쓰는 쿠키, 데이터를 보내는 곳, 계정을 지우는 방법입니다. 표는 앱 자체의 저장 항목 등재부(`lib/privacy/collected.ts`)를 따르며, 앱이 새로운 것을 저장하기 시작하면 그 등재부가 바뀝니다. 업데이트할 때마다 다시 대조하세요.

### 저장 항목 {#stored-fields}

열의 뜻 — 수집: 수집 항목으로 밝혀야 하는 값 · 보관 기간: 얼마나 오래 보관할지 정하는 값 · 쿠키: 쿠키가 나르는 값 · 개인정보 아님: 사람을 설명하지 않는 값(번역 작업 데이터와 행 관리 정보). 이메일, 이름, 사진, GitHub 토큰은 봉투 암호화로 저장하고(키는 데이터베이스 밖 `.env`에 있습니다) 이메일 색인은 HMAC입니다. 세션, 초대, 코딩 에이전트 토큰은 해시만 저장합니다.

| 모델 | 무엇인가 | 수집 | 보관 기간 | 쿠키 | 개인정보 아님 |
| --- | --- | --- | --- | --- | --- |
| `User` | 로그인한 사람. 이름·이메일·사진은 GitHub나 Google이 준 값이고 PII 키로 암호화합니다. 이메일 색인은 그 주소의 HMAC입니다. 화면 설정 셋과 받은편지함 열람 시각은 계정에 저장하는 설정입니다 | `id`, `name`, `email`, `emailLookup`, `emailVerified`, `image`, `createdAt`, `uiLocale`, `timeZone`, `colorScheme`, `attentionSeenAt` | — | — | — |
| `Account` | 연결한 로그인 수단(GitHub나 Google). 공급자 계정 ID와, 리포지토리를 연결할 때 받는 GitHub App 사용자 토큰(토큰 키로 암호화)과 만료 시각 | `userId`, `installRequestedAt`, `provider`, `providerAccountId`, `refresh_token`, `access_token`, `expires_at` | — | — | `type` |
| `Session` | 로그인 세션. 쿠키 값의 다이제스트만 저장하고 마지막 활동 뒤 24시간에 만료됩니다 | — | `expires` | `sessionToken`, `userId` | — |
| `VerificationToken` | 로그인 수단 연결과 다른 세션 로그아웃의 확인 절차. `identifier`가 사용자 ID와 공급자 계정 ID를 JSON 문자열 하나에 담습니다. 5~10분 | `identifier`, `token` | `expires` | — | — |
| `ProjectMember` | 프로젝트 멤버십과 역할 | `userId`, `role`, `createdAt`, `updatedAt` | — | — | `projectId` |
| `ProjectInvitation` | 초대. 주소는 PII 키로 암호화하고 색인을 두며, 토큰은 해시입니다. 7일 뒤 만료되지만 행은 주소와 함께 남습니다 | `createdAt`, `email`, `emailLookup`, `role`, `tokenHash`, `acceptedAt`, `invitedBy` | `expiresAt` | — | `id`, `projectId` |
| `ApiToken` | 코딩 에이전트용 개인 토큰. 토큰 해시, 사용자가 고른 권한과 프로젝트, 사용 시각 | `userId`, `grants`, `allProjects`, `projectIds`, `tokenHash`, `createdAt`, `lastUsedAt` | `expiresAt` | — | — |
| `OAuthConnection` | 연결한 코딩 에이전트(Claude Code, Codex 등). 앱이 밝힌 이름과 주소, 토큰 해시, 권한과 프로젝트, 사용 시각 | `id`, `userId`, `clientId`, `clientName`, `redirectUri`, `grants`, `allProjects`, `projectIds`, `accessTokenHash`, `accessExpiresAt`, `refreshTokenHash`, `createdAt`, `lastUsedAt` | `expiresAt` | — | `issuer`, `resource` |
| `OAuthRefreshHistory` | 연결이 이미 쓴 refresh 토큰의 해시. 연결과 함께 사라집니다 | `tokenHash`, `connectionId`, `usedAt` | — | — | — |
| `OAuthCode` | 동의 직후 60초짜리 교환 기록. 교환하면 지웁니다 | `codeHash`, `clientId`, `clientName`, `redirectUri`, `userId`, `grants`, `allProjects`, `projectIds`, `connectionExpiresAt`, `usedAt` | `expiresAt` | — | `requestId`, `codeChallenge`, `issuer`, `resource` |
| `Translation` | 번역 값은 개인정보가 아니고, 마지막 편집자와 시각만 사람을 가리킵니다 | `updatedAt`, `updatedBy` | — | — | `id`, `projectId`, `surfaceId`, `keyId`, `localeCode`, `value`, `description`, `placeholders`, `needsReview`, `pendingEditToken` |
| `SyncRun` | 동기화와 게시 실행 기록. 요청한 사람과 시각 | `trigger`, `startedAt`, `finishedAt`, `requestedBy` | — | — | `id`, `projectId`, `status`, `errorCode`, `prUrl`, `changed`, `changedValues`, `warnings`, `withheld` |
| `ProjectEvent` | 로그의 활동. 행위자와 시각, 가린 멤버 라벨과 번역 전후 값을 `payload`에 담습니다. 지우지 않습니다 | `occurredAt`, `finishedAt`, `actorKind`, `actorUserId`, `payload`, `searchText` | — | — | `id`, `ref`, `projectId`, `kind`, `subtype`, `result`, `surfaceIds`, `surfaceScope`, `syncRunId`, `runToken` |

- 필드가 모두 개인정보 아님인 모델: `Project`, `TranslationSurface`, `Locale`, `StringKey`, `KeyRef`, `DeliveryConfirmation`, `TranslationBaseline`, `OAuthAuthorizationRequest`. 리포지토리 좌표, 키, 번역 상태를 담고 생성자 열이 없습니다.
- 번역 값은 프로젝트의 산출물이고 사람을 설명하지 않습니다. 작성자 정보는 위 `Translation`과 `ProjectEvent` 행에만 있습니다.
- 업로드한 프로필 사진은 192px 이내 WebP로 다시 인코딩하고(원본과 메타데이터는 버립니다) 업로드 볼륨의 `avatars/<userId>/`에 둡니다. GitHub·Google 사진은 URL만 저장하고 브라우저가 그쪽에서 직접 받습니다.
- 페이지뷰 집계는 없습니다. 앱이 외부로 보내는 호출은 아래 전송처뿐입니다.
- nginx 예제의 접근 로그는 접속 주소, 시각, 메서드, 경로, 상태, 크기, 처리 시간, 브라우저를 남깁니다. 초대 링크와 로그인 링크 경로의 토큰은 가리고(`/invite/<redacted>`, `/signin/link/<redacted>`) query 문자열과 referrer는 남기지 않습니다. 다만 앱에 닿지 못한 요청은 nginx 오류 로그에 요청 줄 전체와 referrer가 남으므로, 프록시 로그는 토큰처럼 다룹니다. 프록시와 로드 밸런서의 로그는 내 방침에 따로 밝힙니다.

### 쿠키 {#cookies}

접두사 `__Host-`와 `__Secure-`는 HTTPS에서 붙습니다(아래 이름은 접두사를 뺀 것). 광고·분석·추적 쿠키는 없습니다. 스크립트가 읽을 수 있는 쿠키는 `malmoi-sidebar-collapsed`뿐이고 나머지는 모두 HttpOnly입니다.

| 쿠키 | 수명 | 하는 일 |
| --- | --- | --- |
| `authjs.session-token` | 마지막 활동 뒤 24시간 | 로그인 유지 |
| `authjs.csrf-token` | 브라우저를 닫을 때까지 | 로그인 요청이 이 사이트에서 시작되었는지 확인 |
| `authjs.callback-url` | 브라우저를 닫을 때까지 | 로그인 뒤 돌아갈 페이지 |
| `authjs.state` · `authjs.pkce.code_verifier` | 15분 | 공급자의 응답이 시작한 로그인에 속하는지 증명 |
| `malmoi-gh-state` | 10분 | 리포지토리 연결의 같은 증명 |
| `malmoi-account-connect` · `malmoi-connect-state` · `malmoi-login-link` · `malmoi-link-state` · `malmoi-session-revocation` · `malmoi-revocation-state` | 5~15분 | 같은 주소에 로그인 수단 추가, 다른 세션 로그아웃의 같은 증명 |
| `malmoi-ui-locale` · `malmoi-color-scheme` | 마지막 선택이나 로그인 뒤 1년 | 이 브라우저에서 고른 화면 언어와 테마(로그아웃 상태 포함). 로그인하면 계정 값을 복사해 옵니다 |
| `malmoi-sidebar-collapsed` | 마지막 접기·펴기 뒤 1년 | 사이드바 접힘 상태 |

시간대는 쿠키가 아니라 계정에만 저장합니다.

### 전송처 {#recipients}

설치본은 세 서비스로 데이터를 보냅니다. mal-moi.com의 Supabase와 Vercel(호스팅, 파일 보관, 페이지뷰 집계)은 설치본에 없습니다.

| 전송처 | 보내는 것 | 이유 |
| --- | --- | --- |
| GitHub | GitHub 로그인을 켰을 때 로그인하며 받는 프로필과 확인된 이메일. 내 GitHub App을 통한 리포지토리 읽기와 브랜치·커밋·PR 쓰기(커밋은 사람이 아니라 앱 명의). 연결한 사람의 GitHub App 사용자 토큰은 읽기에만 씁니다 | 로그인 · 리포지토리 연결과 게시 |
| Google | Google 로그인을 켰을 때 Google로 로그인한 사람의 프로필과 확인된 이메일 | 로그인 |
| Resend | 초대받는 주소와 메시지(초대 링크, 프로젝트 이름, 프로젝트 사진 주소, 역할 — 보낸 사람은 쓰지 않습니다). 열람·클릭 추적은 끕니다 | 초대 메일. Resend는 발송 기록을 플랜 기간 동안(Free는 30일) 보관하므로 내 플랜을 확인해 방침에 적습니다 |

- GitHub·Google 프로필 사진은 브라우저가 그 서비스에서 직접 받습니다.
- 초대 메일의 로고와 프로젝트 사진은 내 `MALMOI_ORIGIN`에서 받습니다.
- 누군가 코딩 에이전트를 연결하면 그 에이전트가 읽은 내용(번역, 활동, 멤버, 요청 시 푸시 토큰)이 그 에이전트와 에이전트가 쓰는 AI 서비스로 갑니다. 사용자가 고르고 운영하는 것이고 설치본이 따로 보내지는 않습니다. 동의 화면에 앱 이름을 보여 주려고 Malmoi가 앱이 밝힌 주소의 공개 설명을 읽으며, 이 요청에는 사용자 정보가 없습니다.
- `/changelog`는 상류 리포지토리의 GitHub Releases를 읽으며, 이 요청에도 사용자 정보가 없습니다.

### 계정 삭제 {#delete-account}

삭제용 셀프서비스 화면이 없으므로 열람·정정·삭제 요청은 아래 수동 절차로 처리합니다. 그 사람의 멤버십 행과 보낸 초대가 `User` 행 삭제를 막으므로 이것부터 지웁니다. 그다음 `User` 행을 지우면 로그인 수단, 세션, 개인 토큰, 연결한 에이전트가 함께 사라지고 동기화 기록과 활동에서도 연결이 끊깁니다. 번역 값은 남고 작성자 연결만 지워집니다.

1. 먼저 [백업](operate.md#backup)을 만듭니다. 삭제는 되돌릴 수 없습니다. 본인 확인 방법은 내 방침이 정합니다.
2. 계정을 찾습니다. 이메일이 암호화되어 있으므로 대신 조회 색인(HMAC)을 계산합니다. 주소는 명령줄이 아니라 환경 변수로 넘기고(`EMAIL_LOOKUP_KEY`는 web 컨테이너에 이미 있습니다), `PROJECT_IDS`는 3단계가 초대를 찾을 프로젝트 목록입니다. 프로젝트가 없으면 비어 있고 `user` 줄만 출력됩니다:

   ```sh
   read -r SUBJECT_EMAIL; export SUBJECT_EMAIL
   export PROJECT_IDS="$(docker compose exec -T postgres psql -U postgres -d malmoi -Atc 'SELECT id FROM "Project"' | tr '\n' ' ')"
   docker compose run --rm --no-deps -e SUBJECT_EMAIL -e PROJECT_IDS web node -e '
   const c=require("crypto"),k=Buffer.from(process.env.EMAIL_LOOKUP_KEY,"base64"),kid=process.env.EMAIL_LOOKUP_KEY_ID;
   const e=process.env.SUBJECT_EMAIL.trim().toLowerCase();
   const h=s=>"hmac:v1:"+kid+":"+c.createHmac("sha256",k).update(JSON.stringify(["malmoi/email-lookup","v1",s,e])).digest("hex");
   for(const s of ["user",...(process.env.PROJECT_IDS||"").split(/\s+/).filter(Boolean).map(p=>"invitation:"+p)])console.log(s+"\t"+h(s))'
   unset SUBJECT_EMAIL PROJECT_IDS
   ```

   `user` 줄의 값으로 `SELECT id FROM "User" WHERE "emailLookup" = '<hmac>';`를 실행합니다. 이 `id`가 아래의 `:uid`입니다. 행이 없으면 이 주소의 계정이 없습니다(조회 키를 바꾸는 중이라면 reindex를 먼저 하고 다시 시도하세요).
3. `invitation:<projectId>` 줄들은 이 사람에게 온 미수락 초대의 색인입니다. 프로젝트마다 초대 주소의 색인이 달라서 줄이 프로젝트마다 하나씩입니다.
4. 업로드한 프로필 사진을 지웁니다: `docker compose exec web rm -rf /data/uploads/avatars/<uid>`(디렉터리가 없으면 사진이 없는 것입니다).
5. 한 트랜잭션으로 지웁니다. `docker compose exec postgres psql -U postgres -d malmoi -v ON_ERROR_STOP=1 -v uid=<uid>`로 접속해 실행하고(`<invitation indexes from step 3>` 자리에는 3단계의 색인을 작은따옴표로 감싸 쉼표로 이어 넣습니다), 각 줄의 행 수를 확인한 뒤에만 `COMMIT`합니다(이상하면 `ROLLBACK`):

   ```sql
   BEGIN;
   -- 프로젝트의 마지막 소유자면 멈춘다 — 한 행이라도 나오면 ROLLBACK하고 소유권을 먼저 넘긴다
   SELECT m."projectId" FROM "ProjectMember" m
    WHERE m."userId" = :'uid' AND m."role" = 'OWNER'
      AND NOT EXISTS (SELECT 1 FROM "ProjectMember" o WHERE o."projectId" = m."projectId" AND o."role" = 'OWNER' AND o."userId" <> m."userId");
   DELETE FROM "ProjectMember" WHERE "userId" = :'uid';
   DELETE FROM "ProjectInvitation" WHERE "invitedBy" = :'uid';                  -- 이 사람이 보낸 초대
   DELETE FROM "ProjectInvitation" WHERE "acceptedAt" IS NULL AND "emailLookup" IN ('<invitation indexes from step 3>');  -- 이 사람에게 온 미수락 초대
   DELETE FROM "VerificationToken" WHERE "identifier" LIKE '%"' || :'uid' || '"%';   -- 로그인 수단 연결·로그아웃 확인 절차
   UPDATE "Translation" SET "updatedBy" = NULL WHERE "updatedBy" = :'uid';       -- 외래 키가 없어 손으로 끊는다
   DELETE FROM "User" WHERE "id" = :'uid';                                       -- Account·Session·ApiToken·OAuth* cascade, SyncRun·ProjectEvent는 NULL
   COMMIT;
   ```

6. 남는 것: 번역 값(프로젝트의 산출물 — 작성자 연결만 끊깁니다), 활동 기록의 가린 라벨(`ProjectEvent`는 행위자 연결을 잃지만 지워지지 않습니다), 이 사람에게 왔다가 이미 수락된 초대(위 문장은 미수락만 지웁니다. 암호화된 주소가 남으므로 방침에 적거나 `"acceptedAt" IS NULL AND` 조건을 빼고 지웁니다), Resend의 발송 기록(Resend의 보관 기간에 따라 사라집니다), 백업(폐기할 때까지 남습니다 — 방침에 적습니다).
