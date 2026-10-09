# SELF-HOSTING — 셀프 호스팅 개발·릴리스 정본

말모이의 셀프 호스팅(Linux 단일 서버 Docker Compose)을 **만드는 쪽**의 문서다. 기능을 고치는 사람·에이전트가 "이 변경이 설치본을 깨는가"를 판정하고, 릴리스마다 상류 유지자가 할 일을 하는 자리다. 서빙하지 않는다.

**다른 문서와의 경계** — 두 벌을 두지 않는다.

| 무엇 | 정본 |
|---|---|
| 범위·비범위(지원 형태·비목표) | PRODUCT §4.1 "셀프 호스팅" · §4.2 |
| 운영자 절차(설치·업데이트·백업/복원·키 회전·진단·개인정보 재료) | 공개 가이드 `guide/<언어>/self-hosting/`(= `/docs/self-hosting`, en 원문 + ko·es) |
| DB 롤 계약·업로드 볼륨 계약 | ARCHITECTURE §7 "self-hosted DB"·업로드 볼륨 단락, 불변식 5의 ⚠️ 주석 |
| 방문자용 비교 | README "Self-hosting"(hosted 비교표 → 가이드) |
| **유지보수 계약 · 기능 개발 체크리스트 · 게이트 · 릴리스 · 수용한 위험 · 실습 기록** | **이 문서** |

## 1. 구조 한눈에

- **배포 모드**: `MALMOI_ORIGIN`이 있으면 self-hosted, 없으면 hosted, `VERCEL_ENV`와 함께 있으면 무효(fail-closed). 판정과 hosted 도메인 리터럴의 집은 `lib/deployment/mode.ts` 하나다(import 없는 잎 — middleware도 쓴다).
- **origin**: self-hosted의 모든 외부 주소(Auth.js·OAuth AS issuer/resource·MCP Origin·초대 메일·생성 워크플로 `api-url`·og 메타데이터)는 설정 origin에서 나온다. 요청 헤더에서 추론하지 않는다(`requestOrigin`).
- **기동 전 판정**: `pnpm preflight`(`scripts/preflight.ts` → `lib/deployment/preflight.ts`) — 필수 설정의 누락·형식을 사유 코드로만 찍는다.
- **파일 저장**: hosted는 Vercel Blob, self-hosted는 `MALMOI_UPLOAD_DIR` 볼륨(`lib/upload/file-store.ts`).
- **DB**: 일반 Postgres 17, 롤 둘 — migrate(DB 소유 비-superuser, CREATEROLE)와 런타임(`deploy/bootstrap.sql`이 만들고 매 업그레이드 다시 돈다).
- **배포물**: `Dockerfile`(비standalone 한 벌 — web·migrate·키 운영 공용) · `deploy/`(compose · nginx · postgres init · scheduler · bootstrap).
- **스케줄러**: crond+curl이 `lib/deployment/schedule.ts`의 `NIGHTLY_PULL`(= `vercel.json`) 시각에 `GET /api/pull`.

## 2. 유지보수 계약

셀프 호스팅이 출시된 뒤 **모든 기능에 걸리는 계약**이다. 비용이 여기서 나온다.

| 항목 | 계약 |
|---|---|
| 이미지 발행 | **매 앱 태그 `v<x.y.z>`마다** `/merge` 9-b가 `ghcr.io/sinhyeokkang/malmoi:v<x.y.z>`(linux/amd64)를 발행한다. 이미지 태그 = 앱 태그, action 태그와 독립 |
| 지원 대상 | 최신 앱 태그 하나. 창구는 GitHub Issues, best-effort(개발자 1명 — PRODUCT §0) |
| 업그레이드 | 어느 과거 태그에서든 최신 이미지의 `prisma migrate deploy`가 남은 마이그레이션을 **한 번에 이어서** 적용한다 → §3의 마이그레이션 규칙 |
| action 호환 | 서버는 발행된 action 태그(v1·v2·v3)의 `/api/push` 요청을 계속 받는다. 설치본은 자기 생성기가 낸 태그를 쓰므로 "구버전 서버 + 신버전 action"은 지원 범위 밖이다 |
| 상시 게이트 | 컨테이너 CI는 두지 않는다 — hosted 전용 전제가 새로 들어오는 순간을 `pnpm test`가 잡는다(§4) |
| 운영자 개인정보 재료 | 가이드 `troubleshooting.md#stored-fields`(세 언어)는 `lib/privacy/collected.ts` 등재부와 필드 단위 일대일이다 — 자동 대조가 없으니 같은 커밋에서 손으로 고친다 |

## 3. 기능 개발 체크리스트

`/feature`·`/implement`·`/code-review`에서 아래에 걸리면 이 문서를 연다. **게이트가 잡는 것(§4)은 실수해도 red가 나고, 여기 적은 것은 사람이 봐야 한다.**

1. **마이그레이션은 버전을 건너뛰어도 안전해야 한다.** 운영자가 v1.2.6에서 v1.5로 바로 올리면 중간 버전의 **앱 코드는 한 번도 돌지 않고** 마이그레이션만 연달아 적용된다.
   - "앱 코드가 백필 → 다음 릴리스에서 컬럼 삭제" 패턴은 깨진다 — 백필은 마이그레이션 SQL 안에서 끝낸다.
   - prod에만 있는 데이터를 가정하지 않는다(빈 DB·작은 DB에서도 돈다).
   - superuser 전용 작업·`CREATE EXTENSION`·Supabase 전용 스키마(`auth.`·`storage.`)·Supabase 롤을 가드 없이 쓰지 않는다 — self-hosted migrate 롤은 superuser가 아니다(Supabase 롤 SQL은 `IF EXISTS (pg_roles)` 가드 선례: `20260926175555_revoke_public_schema_usage_from_api_roles`).
   - 새 테이블·시퀀스의 런타임 권한은 bootstrap의 `ALTER DEFAULT PRIVILEGES FOR ROLE <migrate>`가 따라 준다 — 격리 PG 스위트가 확인한다.
2. **새 패키지**: 네이티브 바이너리·시스템 라이브러리가 필요한 것(sharp류)은 linux/amd64 Debian(bookworm) 이미지에서 돌아야 한다. 필요하면 `Dockerfile`에 apt 줄 — 게이트가 못 잡는다. `pnpm-workspace.yaml`의 `onlyBuiltDependencies`도 이미지 빌드에 그대로 적용된다.
3. **Vercel·Supabase 전용 기능**(Blob·Cron·Analytics·KV·Global Config·Edge 전용 API 등)을 새로 쓰면 self-hosted 경로를 같이 만들거나 배포 모드로 hosted 전용임을 명시한다. **새 cron은 `vercel.json`과 `deploy/scheduler/crontab` 둘 다** — 게이트는 기존 `NIGHTLY_PULL` 하나만 대조한다.
4. **새 환경변수**: `requireEnv`·`optionalEnv`로만 읽고 preflight 분류표(필수·선택·hosted 전용·command)·`.env.example`·`deploy/.env.example`에 등재 — 빠지면 SH-15 ②가 red다. self-hosted 필수면 가이드 설치 표도.
5. **외부로 나가는 주소**: origin을 박지 말고 `deploymentMode()`·`requestOrigin`을 지난다(리터럴은 SH-15 ①이 red).
6. **토큰이 경로에 실리는 새 공개 URL**(`/invite/<token>`·`/signin/link/<challenge>` 부류)은 `deploy/nginx/`의 로그 마스킹 map에 추가한다 — 자동으로 안 잡힌다.
7. **업로드 볼륨**은 web만 마운트한다(§5 계약, 게이트가 compose를 센다).
8. **새 외부 전송처·수집 필드**: 방침(hosted) + 가이드 운영자 개인정보 재료(세 언어).
9. **설치 절차가 바뀌면**(새 env·서비스·컨테이너·포트) 가이드 `self-hosting/` 세 언어를 같은 배치에서 고친다. 고친 명령은 실측이 아니다 → §7 실습 기록의 다음 회차에 다시 밟는다.

## 4. 게이트 지도 (자동)

| 무엇이 어긋나면 | 어디서 red | 어디 |
|---|---|---|
| hosted 도메인 리터럴·`MALMOI_ORIGIN`·`VERCEL_ENV` 직접 읽기(허용 목록 밖, `app/.well-known` 포함) | `pnpm test` (SH-15 ①) | `lib/deployment/__tests__/self-hosted-gates.test.ts` |
| env 이름 ↔ preflight 표 ↔ `.env.example` ↔ compose(해석 못 하는 인자도 red) | `pnpm test` (SH-15 ②) | 같은 파일 |
| Dockerfile Node 메이저·pnpm·`.npmrc`·psql≥15 배포판·비밀 ENV·non-root | `pnpm test` (SH-15 ③) | 같은 파일 |
| compose 의존 순서·healthcheck 형태·업로드 볼륨 단일 마운트·nginx 불변식(Host·HSTS·rate limit·마스킹 로그·resolver) | `pnpm test` | 같은 파일 |
| 스케줄러 식 ≠ `vercel.json` | `pnpm test` | `lib/deployment/__tests__/schedule.test.ts` |
| 백업 명령이 실패 뒤 계속 실행하거나 성공을 출력함(세 언어, sh·bash) | `pnpm test` — 외부 명령을 실패시키는 셸 회귀 | `lib/guide/__tests__/backup-shell.test.ts` |
| 마이그레이션 뒤 런타임 롤 권한·bootstrap 멱등·PUBLIC USAGE | 격리 PG 스위트(`pnpm gate`가 `prisma/migrations/`·`deploy/` 변경에 붙인다) | `lib/__tests__/self-hosted-bootstrap.integration.ts` |
| 인코딩 경로로 크롤 파일·`/privacy` 우회 | `pnpm test` | `lib/seo/__tests__/public-response.test.ts`·`lib/deployment/__tests__/preflight.test.ts` |

**게이트가 못 보는 것**: 실제 이미지 빌드·기동·외부 OAuth 왕복. 이건 §7 실습이 든다.

## 5. 보안 계약과 수용한 위험

- **업로드 볼륨의 쓰기 주체는 web 하나다.** 다른 주체(컨테이너·호스트 프로세스)가 쓰면 경로 검사와 사용 사이에 symlink를 바꿔 web이 자기 파일시스템(환경변수 포함)을 서빙하게 만들 수 있다. symlink 거절은 정적 링크에만 성립하고 동시 교체는 코드로 막지 않는다(Node에 openat 계열이 없다). compose 게이트가 단일 마운트를 센다 — 백업 사이드카를 compose에 붙이려면 이 계약을 다시 판단한다.
- **nginx 에러 로그**(컨테이너 stderr)는 502·rate limit 때 요청 줄(쿼리 포함)을 남긴다 — nginx로 끌 수 없고 docker 권한이 있어야 읽는다. 접근 로그는 쿼리·referer를 버리고 토큰 경로를 가린다.
- **스케줄러 컨테이너 Config.Env의 `CRON_SECRET`** — `docker inspect`·`exec env`에 보인다(docker 접근 = root). 프로세스 인자·crond 환경엔 없다.
- **대상 리포 CI가 상류 action 태그(`SinhyeokKang/malmoi@malmoi-i18n-push-vN`)를 실행한다** — 설치본 push 토큰이 그 실행에 들어간다. 공급망 의존을 수용하고 가이드에 적었다.
- 앱 안 rate limit은 없다 — nginx 예제가 `/api/images/`·`/oauth/authorize` IP당 600/60s를 든다(hosted WAF와 같은 값). 예제를 바꾸면 보호가 사라진다.

## 6. 상류 유지자 할 일

**운영자 절차의 정본은 공개 가이드다** — `guide/<언어>/self-hosting/`(= `https://mal-moi.com/docs/self-hosting`, en 원문 + ko·es): 지원 범위·hosted 비교·외부 앱 등록·설정 표(preflight 필수 항목)·Compose 설치·업데이트·백업·빈 볼륨 복원·키 회전·장애 진단(preflight 사유 코드)·운영자 개인정보 재료(수집 항목·쿠키·전송처·계정 삭제). **이 문서에 절차 사본을 두지 않는다** — 두 벌이면 한쪽이 틀린다. 범위·비범위의 정본은 PRODUCT §4.1·§4.2, DB 롤 계약은 ARCHITECTURE §7 "self-hosted DB"다. 이 절은 **상류 유지자가 다시 할 일**만 든다.

- **이미지 발행 확인** — 매 앱 태그마다 `/merge` 9-b가 `ghcr.io/sinhyeokkang/malmoi:v<x.y.z>`를 발행한다. 끝나면 `docker buildx imagetools inspect ghcr.io/sinhyeokkang/malmoi:v<x.y.z>`의 digest가 리포트에 남긴 값과 같은지, 패키지 공개 범위가 Public인지(비로그인 `docker pull`이 되는지) 본다. 실패해도 머지·Release는 끝난 것이라 9-b만 손으로 다시 한다. 가이드의 설치 1단계가 이 digest로 고정하므로 **발행이 빠진 태그는 설치할 수 없는 릴리스다**.
- **복원 실습은 운영 스택이 없는 다른 호스트에서만** 한다 — compose 프로젝트명이 `malmoi`로 고정이라 같은 호스트에서는 운영 볼륨을 친다(가이드 `operate.md#restore`의 경고). 실습 결과는 아래 "셀프 호스팅 실습 기록" 표에 남긴다.
- **가이드의 명령을 고치면 그 명령은 실측이 아니다** — 아래 표의 실측은 그 시점 명령 꼴의 것이다. 2026-10-09 B6c가 리뷰 결함을 고치며 바꾼 것(업데이트의 정지 유지 → migrate → 포트를 운영자 IP로 제한한 smoke → scheduler·포트 재개, 백업 manifest 명령, 계정 삭제의 `export PROJECT_IDS`·빈 값 처리, DB 비밀번호 psql의 `-X`)과, 그 뒤 리뷰로 다시 바꾼 백업 블록(subshell `set -eu` · `backup ok` 확인 · `pg_restore -l` 검증 · root 실행 전제)·업데이트 9단계의 `deploy/` 롤백은 **다음 실습에서 다시 밟는다**. 외부 OAuth·GitHub App·초대 메일·MCP 왕복(SH-03·04·05·07)도 아직 한 번도 실측하지 않았다 — 다음 실습에 폐기용 도메인·앱을 준비해 채운다.
- **수집 항목 표 대조** — 가이드 `troubleshooting.md#stored-fields`(세 언어)는 `lib/privacy/collected.ts`의 등재부와 필드 단위로 일대일이다. 그 등재부가 바뀌는 커밋에서 세 언어 표를 함께 고친다(자동 게이트가 표를 대조하지 않는다).
- **SH-11(이연)** — 두 번째 지원 릴리스에서 이전 릴리스 → 최신 업데이트를 실측하고 아래 표에 남긴다. 그 전까지 가이드는 "건너뛴 릴리스는 미검증"이라고 말한다.
- **릴리스 머신 전제**: 9-b는 Docker(이 머신은 Colima vz+Rosetta — 재부팅 뒤 `colima start`)와 `ghcr.io` 로그인이 필요하다. 발행이 빠지면 그 태그는 설치할 수 없는 릴리스다.

## 7. 셀프 호스팅 실습 기록

SH-10 등 [수동] 항목의 실행 증거를 남기는 자리다(**릴리스 검증 배치가 채운다**). 기록할 것: 날짜 · 이미지 **digest** · Postgres 버전 · migration 상태 · 중단/복원에 걸린 시간 · 결과(성공/실패/미실행). ⚠️ **비밀(키·비밀번호·토큰·`.env` 내용)은 기록하지 않는다.** 미실행 항목을 통과로 적지 않는다 — 안 한 것은 "미실행"으로 남긴다. 절차 본문은 가이드(`guide/<언어>/self-hosting/`)다 — 표의 "이 절 절차"·"OPERATIONS 명령"은 이관 전 같은 명령을 가리킨다.

| 날짜 | 항목 | 이미지 digest | Postgres | migration 상태 | 걸린 시간 | 결과 |
|---|---|---|---|---|---|---|
| 2026-10-09 | 이미지 빌드 — env 없이(`env -i PATH HOME docker build --platform linux/amd64`) · 비밀 검사(`docker history` grep 0줄, 컨테이너 FS에서 로컬 `.env.local` 비밀 값 24개 대조 0건) · 도구(psql·pg_isready 15.19, pnpm 10.33.0, node v24.21.0, uid 1000, `/app` 쓰기 거부, `.next/cache`·`/data/uploads` 쓰기, 오프라인 pnpm) | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | — | — | 빌드 2분 34초(Colima vz+Rosetta) | 성공 |
| 2026-10-09 | 첫 설치 `docker compose up -d`(`config -q` 통과 · `nginx -t` ok) — postgres healthy → migrate Exited 0 → web healthy → proxy·scheduler · 런타임 롤 `malmoi_app` super/createrole/createdb/bypassrls 전부 f · PUBLIC USAGE f · `docker compose port` postgres·web 빈 값, 호스트 5432·3000 닫힘 | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | 42개 적용(마지막 `20261005090000_add_user_attention_seen_at`) | 43초 | 성공 |
| 2026-10-09 | 빈 볼륨 첫 설치 반복 `down -v && up -d` ×5(+2회 첫 요청 측정) | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | 매번 42개 적용 | 회당 15~17초 | 성공 — migrate 5/5 exit 0, 첫 요청은 리슨 전 연결 실패 1회 뒤 200(502 없음) |
| 2026-10-09 | 실패 경로 — `MIGRATE_DB_PASSWORD` 틀림(P1000, web·proxy·scheduler Created에서 멈춤) · `RESEND_API_KEY` 빈 값(`preflight: RESEND_API_KEY missing`만, 25초에 재시작 8회, proxy·scheduler 미기동) · `http://` origin + 잘못된 키(`not-https`·`invalid-format`) | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | — | — | 성공(값 미출력) |
| 2026-10-09 | proxy — HSTS 정확히 1개 `max-age=63072000`(200·301 대상·404·429·502·정적 자산) · 80→443 301(query 유지) · 429(`/api/images/` 800회 중 556, 병렬 뒤 `/oauth/authorize`도 429 — zone 공유) · web만 재생성 뒤 proxy 무재생성 5초 안 200 · 위조 `Host`·`X-Forwarded-Host`·`X-Forwarded-Proto` 무시(well-known·Auth.js redirect_uri 설정 origin 유지, 직접 web에 위조 Host면 404) · Server Action Origin 일치 200 / 불일치 거부 | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | — | — | 성공 |
| 2026-10-09 | 공개 응답 — robots `Disallow: /` · 페이지 `X-Robots-Tag: noindex` · `/sitemap.xml`·`/llms.txt`·`/llms-full.txt` 404 · `/privacy` 307 → `MALMOI_PRIVACY_URL` · Analytics 스크립트 0 · `/signin` 동의 링크 새 탭 | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | — | — | 성공(canonical·og·JSON-LD는 설계대로 hosted origin) |
| 2026-10-09 | 두 origin(`a.malmoi.localhost`·`b.malmoi.localhost`, 같은 이미지 ID) — issuer·token endpoint·protected-resource·Auth.js callback·signin redirect·80→443이 각자 origin, 교차 Host 404 | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | — | — | 성공 |
| 2026-10-09 | 업로드 볼륨(스크립트 — 화면 왕복은 OAuth 없어 미실행) — `putImage`→`/api/images/…` 200(uid 1000 소유)·경로 탈출 키 거부·`deleteImage` 뒤 404 · web+postgres 재생성 뒤 유지 · sharp 정규화 800×600 PNG → 192×144 WebP | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | — | — | 성공(UI 업로드 미실행) |
| 2026-10-09 | 스케줄러 — 즉시 호출 → web `[pull] targets=…` 줄 · 틀린 `CRON_SECRET` → `curl: (22) … 401` · 매분 crontab으로 자동 1회 · 두 컨테이너 동시 호출 둘 다 200 · `ps`에 비밀 없음 | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | — | — | 성공(대상 프로젝트 0개 — 프로젝트별 동시 결과는 미실행) |
| 2026-10-09 | 키 운영 — `docker compose run --rm --no-deps -e DIRECT_URL web pnpm credentials:self-hosted`가 db 망에서 접속 · `verify` · 토큰 키 회전(check-only `oldTokenKey:1` → `--apply` → `verify` 0) · `credentials:finalize:self-hosted`(`--apply` 포함) `pending:false` | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | 42 | 차단~복귀 28초 | 성공(`--apply`의 `migrate deploy` 실행은 pending이 없어 미관측) |
| 2026-10-09 | 업데이트 — `pull --ignore-buildable`(scheduler 건너뜀; 로컬 태그 앱 이미지는 레지스트리에 없어 거부) · `run --rm migrate`(No pending, bootstrap 멱등) · 새 태그로 `up -d --force-recreate --no-deps web proxy scheduler` 2초 안 200, `EACCES`·`preflight:` 0 | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | 42 그대로 | — | 성공(레지스트리 pull은 미실행) |
| 2026-10-09 | 백업 → `down -v` → 빈 볼륨 복원(이 절 절차 그대로, 운영 스택 없는 머신) — pg_restore 오류 0 · 행 수 동일(User 2·초대 2·Account 1) · bootstrap이 런타임 롤 생성·PUBLIC USAGE f · 업로드 이미지 200 · PII·토큰 복호화(회전된 키 포함) · `verify` 0 | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | 42 = 42 | 정지~백업 17초 · 복원 1~6단계 약 30초 | 성공 |
| 2026-10-09 | 계정 삭제 절차 — HMAC 색인 스니펫이 대상 `User`·미수락 초대를 찾음 · 트랜잭션: OWNER 판정 0행 → 멤버 1·보낸 초대 1·받은 초대 1·User 1 삭제, Account cascade | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | 42 | — | 성공 |
| — | 로그인(GitHub·Google)·프로젝트 생성·생성 워크플로 `api-url`·초대 메일·MCP 연결·`/projects` 스트리밍·GHCR 발행 | — | — | — | — | 미실행(외부 OAuth·App·메일 없음) |
| 2026-10-09 | 감사 후 운영 절차 수정 — 독립 subshell 안 정지·백업·성공 표시, 복원 전 방화벽 제한·백업 경로 선택·세션 폐기, 권한 검토 뒤 공개 재개 | — | — | — | — | Docker 복원·방화벽 실습 미실행. 백업 셸은 외부 명령 대역으로 78건 통과(실제 Docker 검증 아님) |

실습에서 본 것(절차·동작 차이, 2026-10-09):
- 빈 볼륨 복원 4단계의 `docker volume create malmoi_uploads` 뒤로 모든 compose 명령이 `volume "malmoi_uploads" already exists but was not created by Docker Compose` 경고를 낸다(동작 무관, `down -v`는 그 볼륨도 지운다).
- 복원 6단계 `up -d web proxy`는 `depends_on` 때문에 migrate를 한 번 더 돈다(멱등이라 무해).
- 백업 manifest는 `chmod -R go-rwx` 뒤에 만들어지면 644로 남는다 — manifest까지 쓴 뒤 권한을 건다.
- nginx 기본 access log가 `/invite/<토큰>`과 `?code=…&state=…`를 원문으로 남긴다(web 로그는 0건) — proxy 로그 보존·공유는 토큰을 다루듯 한다.
