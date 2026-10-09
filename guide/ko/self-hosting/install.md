# 설치

외부 서비스를 내 계정으로 등록하고, 설정 값을 채운 뒤 Docker Compose로 Malmoi를 띄웁니다.

## 외부 서비스 등록 {#external-apps}

아래 서비스는 모두 내 계정으로 만듭니다. mal-moi.com의 OAuth 앱, GitHub App, Resend 도메인, 키를 가져다 쓰지 마세요. `<ORIGIN>`은 내 `MALMOI_ORIGIN`입니다.

| 무엇 | 만드는 곳 | 설정 | `deploy/.env`에 넣을 값 |
| --- | --- | --- | --- |
| HTTPS 도메인 | DNS와 인증서 | 도메인 루트 · A/AAAA를 서버로 · 80/443 포트 개방 · 공개 CA 인증서를 `deploy/certs/fullchain.pem`과 `privkey.pem`으로 · `deploy/nginx/malmoi.conf`의 `server_name`(두 곳)을 이 도메인으로 | `MALMOI_ORIGIN=https://<domain>` — 경로·query·사용자 정보가 없어야 하고 IPv6 리터럴과 비ASCII 도메인은 받지 않습니다 |
| GitHub OAuth App(로그인, Google을 켜면 선택) | GitHub Developer settings → OAuth Apps | Homepage `<ORIGIN>` · Authorization callback `<ORIGIN>/api/auth/callback/github` | `AUTH_GITHUB_ID` · `AUTH_GITHUB_SECRET` |
| GitHub App(리포지토리 읽기·쓰기, 계정 연결) | GitHub Developer settings → GitHub Apps | Public(아니면 소유 계정에만 설치됩니다) · Callback URL `<ORIGIN>/api/github/callback` · Request user authorization (OAuth) during installation 켬 · Redirect on update 켬 · Setup URL 비움 · Webhook 끔 · 권한: Contents 읽기·쓰기, Pull requests 읽기·쓰기(Metadata 읽기는 자동) | `GITHUB_APP_ID`(숫자) · `GITHUB_APP_CLIENT_ID`(`Iv…`, ID와 다른 값) · `GITHUB_APP_CLIENT_SECRET` · `GITHUB_APP_SLUG` · `GITHUB_APP_PRIVATE_KEY`(PEM을 한 줄로, 줄바꿈은 `\n`으로) |
| Google OAuth(로그인, GitHub를 켜면 선택) | Google Cloud Console → OAuth 동의 화면과 사용자 인증 정보 | 동의 화면 External, In production(Internal이면 조직 밖 사람이 모두 `403 org_internal`로 막히고, 테스트 모드면 등록한 테스트 사용자만 들어옵니다) · 범위 `email`·`profile` · 승인된 리디렉션 URI `<ORIGIN>/api/auth/callback/google` · 개인정보처리방침 URL = `MALMOI_PRIVACY_URL` | `AUTH_GOOGLE_ID` · `AUTH_GOOGLE_SECRET` |
| Resend 발신 도메인(초대 메일, 필수) | Resend → Domains와 API Keys | 도메인 인증(SPF·DKIM) · 열람·클릭 추적 끔(추적은 초대 링크를 바꿉니다) · TLS Enforced 권장 · 그 도메인으로 한정한 Sending access API 키 | `RESEND_API_KEY` · `INVITATION_EMAIL_FROM="Malmoi <invite@<verified domain>>"` |

- GitHub App 권한은 앱이 실제로 부르는 기능에 필요한 최소 집합입니다. 설치마다 Repository access의 리포지토리 목록이 Malmoi가 닿을 수 있는 리포지토리를 정하고, 목록에 없는 리포지토리는 설치되지 않은 것으로 보입니다.
- 로그인 공급자를 하나 이상 켜세요. GitHub, Google, 또는 둘 다입니다. 공급자는 ID와 시크릿이 둘 다 있을 때 켜지고, 로그인 화면에는 켜진 공급자의 버튼만 나옵니다. 번역자에게 GitHub 계정이 없으면 Google을 켜세요.
- GitHub App은 어느 쪽이든 필요합니다. Google로만 로그인하는 설치에서도 소유자는 GitHub App으로 리포지토리를 연결합니다.

## 설정 값 채우기 {#settings}

값은 모두 `deploy/.env`에 넣습니다. web 컨테이너는 시작할 때마다 아래 이름을 확인하고, 하나라도 비었거나 모양이 틀리면 시작하지 않습니다([시작 검사](troubleshooting.md#startup-checks)). 일부는 Compose가 직접 채우므로 건드리지 마세요.

| 이름 | 채우는 쪽 | 참고 |
| --- | --- | --- |
| `MALMOI_ORIGIN` | 운영자 | nginx 파일의 `server_name`과 같은 호스트 |
| `MALMOI_PRIVACY_URL` | 운영자 | HTTPS, 사용자 정보 없음, 이 설치본의 `/privacy`가 아님 |
| `MALMOI_UPLOAD_DIR` | Compose(`/data/uploads`) | `uploads` 볼륨이 여기에 마운트됩니다. 검사가 존재와 쓰기 권한을 확인합니다 |
| `AUTH_URL` · `AUTH_TRUST_HOST` | Compose(`${MALMOI_ORIGIN}` · `true`) | `AUTH_URL`은 `MALMOI_ORIGIN`과 같아야 합니다 |
| `AUTH_SECRET` | 운영자 | `openssl rand -base64 32` |
| `AUTH_GITHUB_ID` · `AUTH_GITHUB_SECRET` · `AUTH_GOOGLE_ID` · `AUTH_GOOGLE_SECRET` | 운영자 | 완전한 쌍이 하나 이상 있어야 합니다. 공급자를 끄려면 두 값을 모두 비웁니다. 둘 중 하나만 채우면 기동이 멈춥니다 |
| `APP_SIGNING_SECRET` | 운영자 | `node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))'` — `AUTH_SECRET`·암호화 키와 다른 값 |
| `DATABASE_URL` | Compose | 런타임 롤 `malmoi_app`과 `RUNTIME_DB_PASSWORD` |
| `GITHUB_APP_ID` · `GITHUB_APP_PRIVATE_KEY` · `GITHUB_APP_CLIENT_ID` · `GITHUB_APP_CLIENT_SECRET` · `GITHUB_APP_SLUG` | 운영자 | slug는 `[a-z0-9-]`. 없으면 새 사용자가 Malmoi 안에서 GitHub App을 설치하지 못합니다 |
| `CRON_SECRET` | 운영자 | web과 스케줄러 컨테이너가 같은 값을 받습니다 — `openssl rand -hex 32` |
| `TOKEN_ENCRYPTION_KEYS` · `TOKEN_ENCRYPTION_ACTIVE_KEY_ID` · `PII_ENCRYPTION_KEYS` · `PII_ENCRYPTION_ACTIVE_KEY_ID` · `EMAIL_LOOKUP_KEY` · `EMAIL_LOOKUP_KEY_ID` | 운영자 | 키링 JSON은 작은따옴표로 감쌉니다: `TOKEN_ENCRYPTION_KEYS='{"k1":"<32-byte base64>"}'`. 세 키 값은 서로 달라야 합니다(각각 `openssl rand -base64 32`) |
| `RESEND_API_KEY` · `INVITATION_EMAIL_FROM` | 운영자 | `re_`로 시작 · `이름 <주소>` |
| `OPERATOR_EMAILS` | 운영자(선택) | 쉼표로 구분한 이메일 주소 전체. 비우면 운영자가 없습니다 |

Compose는 `MALMOI_IMAGE`, `POSTGRES_PASSWORD`, `MIGRATE_DB_PASSWORD`, `RUNTIME_DB_PASSWORD`도 읽고, 설명은 `deploy/.env.example`에 있습니다. 데이터베이스 비밀번호 셋은 접속 URL에 그대로 들어가므로 각각 `openssl rand -hex 32`로 서로 다르게 만드세요. `INVITATION_EMAIL_ORIGIN`, `VERCEL_ENV`, `BLOB_*`는 넣지 않습니다. web 컨테이너는 Compose가 나열한 이름만 받고, Compose를 고쳐 넘기면 시작 검사가 `INVITATION_EMAIL_ORIGIN`을 거부하며 `VERCEL_ENV`는 배포 모드를 무효로 만듭니다.

## 설치하기 {#install}

1. 최신 앱 릴리스 `v<x.y.z>`를 고르고, 리포지토리의 같은 태그를 받아 그 `deploy/` 디렉터리를 씁니다: `git clone --depth 1 --branch v<x.y.z> https://github.com/SinhyeokKang/malmoi.git`. `docker buildx imagetools inspect ghcr.io/sinhyeokkang/malmoi:v<x.y.z>`로 이미지 digest를 확인해 고정합니다: `MALMOI_IMAGE=ghcr.io/sinhyeokkang/malmoi:v<x.y.z>@sha256:<digest>`.
2. `cd deploy && cp .env.example .env && chmod 600 .env`를 실행하고 값을 채웁니다([설정 값](#settings)). 이 파일에는 키와 비밀번호가 전부 들어 있으므로 리포지토리·메신저·암호화하지 않은 백업에 평문 사본을 두지 마세요. `$`가 든 값은 작은따옴표로 감쌉니다.
3. 인증서를 `deploy/certs/`에 두고(`chmod 600 privkey.pem`) `nginx/malmoi.conf`의 `server_name`을 고칩니다. 80·443 포트만 열고 PostgreSQL과 앱 포트는 공개하지 않습니다.
4. `docker compose config -q`로 문법 오류와 빠진 필수 값을 확인한 뒤 `docker compose up -d`를 실행합니다.
5. `docker compose ps`를 확인합니다. postgres가 healthy, migrate가 코드 0으로 종료, web이 healthy, proxy와 scheduler가 실행 중이어야 합니다. `docker compose logs migrate`에는 마이그레이션 적용과 bootstrap 무오류가 보입니다. web이 계속 다시 시작되면 `docker compose logs web`의 `preflight: <name> <reason>` 줄이 원인을 알려 줍니다([문제 해결](troubleshooting.md#startup-checks)).
6. `https://<domain>/`을 열어 켠 공급자마다 로그인해 보고, 프로젝트를 만든 뒤 생성된 워크플로 파일에 `api-url: "https://<domain>"`이 있는지 확인합니다. 프로필 사진을 올려 보고 테스트 주소로 초대 메일을 한 통 보냅니다.
7. 바로 첫 백업을 만듭니다([백업](operate.md#backup)). 이 순간부터 `.env`의 키 여섯은 데이터베이스와 짝입니다. 키를 잃으면 누구의 이름과 이메일도 복구할 수 없습니다.

## 다음 단계 {#next}

정기적으로 백업하고, 새 릴리스가 나오면 업데이트합니다([업데이트·백업·복원](operate.md#update)). web이 계속 다시 시작되거나 로그인이 깨지면 [문제 해결](troubleshooting.md#startup-checks)부터 봅니다.
