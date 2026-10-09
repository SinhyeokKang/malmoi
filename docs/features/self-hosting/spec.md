# Self-hosting — 스펙

작성: 2026-10-08 · 기준: v1.2.5 + `28482742`(2026-10-09 재대조) · 상태: 사전 초안(feature review 3회 반영), 구현 미착수

## 1. 목적과 사용자

개발자가 자신의 서버에서 말모이를 설치·업데이트·복구할 수 있는 공식 경로 하나를 제공한다. 번역 편집자는 기존 UI와 권한 모델을 그대로 사용한다. MIT 라이선스와 별개로, 실제 운영 가능한 배포물을 제공하려는 제품 결정이다.

**요청 근거**: 외부 사용자 요청은 관측되지 않았다. MIT 공개 리포를 운영하는 저자의 제품 판단이다. 그래서 1차는 실제 수요가 확인되기 전까지 지원 면적을 가장 작게 잡는다. 착수 여부는 수요 트리거가 아니라 저자 판단으로 둔다(2026-10-09 review 확정).

이번 요청은 스펙 작성까지다. 구현 일정·배포·이미지 공개는 승인된 작업이 아니다. 구현 전 [확인 사항](#8-확인-사항)을 확정하고 현재 코드와 다시 대조한다.

## 2. 관측된 문제

- 앱은 Vercel, 업로드는 Vercel Blob, 야간 작업은 Vercel Cron을 사용한다. Dockerfile만 추가하면 업로드와 야간 작업은 여전히 해당 서비스에 의존한다.
- DB 런타임은 Postgres지만 자격증명 운영 명령은 두 Supabase 프로젝트를 허용 대상으로 고정한다(`sslmode=verify-full`·포트 5432만 허용).
- 로그인·GitHub 연결·MCP·생성 워크플로·메일·공개 메타데이터에 서비스 도메인 전제가 있다. 일부 경로는 알 수 없는 origin에서 호스팅 서비스 주소로 되돌아간다. 초대 메일은 `VERCEL_ENV`가 없으면 항상 `origin-mismatch`다.
- **생성 워크플로가 모르는 origin에서 `api-url` 줄을 생략하면 action 기본값 `https://mal-moi.com`이 쓰여, 설치본 대상 리포의 CI가 push 토큰 원문을 호스팅 서비스로 보낸다.** `docs/ACTIONS.md`의 복사용 예시도 `api-url`이 없다.
- 독립 설치를 위한 영속 저장소, 전체 마이그레이션, 암호화 키 보관, 백업 복원 절차를 함께 검증하는 배포 계약이 없다.

근거 파일과 변경 경계는 [설계](design.md)에 기록한다.

## 3. 1차 범위

공식 지원 경로는 Linux 단일 서버의 Docker Compose다. 앱 한 인스턴스, 일반 Postgres 17, 파일 업로드 볼륨, 야간 스케줄러를 운영한다. HTTPS reverse proxy 뒤의 도메인 루트에 설치한다. 서브패스 배포는 지원하지 않는다.

GitHub.com 리포 연동과 GitHub·Google OAuth 로그인은 유지한다. 운영자는 자기 OAuth App·GitHub App을 등록한다. 초대 메일은 **Resend로 확정한다**. 따라서 외부 연결이 필요한 셀프 호스팅이며 폐쇄망 배포는 아니다. GitHub Actions에서 설치 주소에 접근할 수 있어야 한다.

**대상 리포의 CI는 상류 리포(`SinhyeokKang/malmoi`)의 action 태그 코드를 실행한다** — 그 실행에 설치본의 push 토큰이 들어간다. 1차는 이 공급망 의존을 수용하고 설치 문서에 명시한다. action 태그는 설치본의 생성기가 낸 값을 그대로 쓴다(생성기가 이미지에 들어 있어 서버 버전과 맞는 태그가 나온다). 손으로 태그를 올린 조합은 지원하지 않는다.

**가입은 현행 그대로 열려 있다** — 검증 이메일을 가진 누구나 로그인해 `User` 행(PII 봉투)을 얻고, 비운영자는 프로젝트 상한 3을 받는다. 운영자 본인은 `OPERATOR_EMAILS`에 등록해야 상한에서 벗어난다. 이 결과를 설치 문서에 명시하고 `OPERATOR_EMAILS`를 설치 체크리스트 항목으로 둔다.

공개 랜딩(`/`)과 공개 셸은 self-hosted에서도 그대로 유지한다(화이트라벨은 비목표). `/privacy`는 운영자 정책 URL **하나**로 redirect되고 모든 화면 언어가 같은 URL을 쓴다(hosted는 언어별 본문). `/changelog`는 상류 리포의 Release를 보여 설치 버전보다 앞설 수 있고 "Latest" 배지도 설치본이 아니라 상류 최신판에 붙는다 — 모두 1차에서 수용하고 설치 문서에 적는다.

배포물은 버전과 digest가 고정된 **앱 이미지 한 벌**(웹·마이그레이션·키 운영 도구 공용)과 Compose 설정이다. 최초 검증 아키텍처는 linux/amd64다. 레지스트리·최소 자원은 구현 착수 전 검증으로 확정하며, 지원한다고 선기재하지 않는다.

## 4. 완료 조건

**판정 표기**: 각 행 끝의 `[자동]`은 `pnpm gate`(격리 PostgreSQL 스위트 포함)가 판정하고, `[수동]`은 로컬 Docker 실습으로 판정한다. 이 리포엔 컨테이너·e2e CI가 없으므로 `[수동]`을 자동처럼 기록하지 않는다. 수동 증거(실행 명령·관측 값·digest·실패)는 OPERATIONS의 **셀프 호스팅 실습 기록** 절에 남긴다 — feature 디렉터리는 기능이 끝나면 지워지기 때문이다.

| ID | 수용 기준 | 판정 |
|---|---|---|
| SH-01 | 빈 서버에서 문서에 적힌 외부 앱 등록·환경 설정 후 Compose로 설치한다. Vercel·Supabase 계정과 자격증명이 없어도 로그인과 프로젝트 생성이 된다. 필수 설정(`MALMOI_ORIGIN`·`AUTH_URL`·Resend 셋·`GITHUB_APP_SLUG`·업로드 디렉터리·`MALMOI_PRIVACY_URL`)이 **빠지거나 형식이 틀리면** preflight가 비밀 없는 메시지로 기동을 거부한다. 형식은 맞지만 Resend가 거부하는 키는 preflight가 판정하지 않는다 — 기존 계약대로 발급 뒤 `email-rejected`이고, 설정 판정의 `unavailable` 사유는 서버 로그에 남는다. | [자동] preflight 판정 · [수동] 설치 |
| SH-02 | 빈 Postgres 17에 기존 마이그레이션 전체가 DB 소유 비-superuser 롤로 적용된다. 실패하면 웹·스케줄러가 시작되지 않는다. migrate 뒤 bootstrap이 만든 비-superuser 런타임 롤로 **기존 테이블과 이후 마이그레이션이 만든 테이블 모두** CRUD가 성공하고 DDL은 거부된다. bootstrap은 재실행해도 안전하다. DB 포트는 publish하지 않는다. | [자동] 격리 스위트 · [수동] Compose 순서 |
| SH-03 | GitHub·Google 로그인, 계정 연결·해제, 세션 폐기, GitHub App 설치·연결이 proxy 뒤 설치 도메인에서 각각 최종 착지 화면까지 간다(리다이렉트 횟수가 아니라 착지 화면으로 판정). 위조 `Host`·`X-Forwarded-Host`·`X-Forwarded-Proto`는 신뢰 주소를 만들지 못한다. | [자동] origin 정책·위조 헤더 · [수동] 왕복 |
| SH-04 | 생성된 GitHub Actions 워크플로가 설치 주소로 push한다. **self-hosted에서 `api-url` 줄 없이 나가는 워크플로 경로가 0이다** — 생성기(웹·MCP)와 설치 문서의 복사 예시 모두. 판정할 수 없는 설정이면 워크플로 렌더를 거부한다. 편집 후 Publish가 대상 리포 PR에 반영되고 재실행은 불필요한 커밋을 만들지 않는다. 미전달 편집·열린 PR 보호도 유지한다. 통합 검증의 action 태그는 `malmoi-i18n-push-v3`다. | [자동] URL 계획 · [수동] 테스트 리포 왕복 |
| SH-05 | MCP 개인 토큰과 OAuth 발견·동의·교환이 설치 주소에서 동작한다. 토큰 issuer/resource가 호스팅 서비스 주소나 위조 헤더로 대체되지 않는다. | [자동] URL 계획·위조 헤더 · [수동] 클라이언트 연결 |
| SH-06 | 프로필·프로젝트 이미지 업로드·표시·교체가 동작한다. 컨테이너 재생성 뒤에도 유지되며 traversal·symlink로 볼륨 밖 파일을 읽거나 쓰지 못한다. 쓰기 실패 시 DB는 옛 참조를 유지한다. | [자동] 저장소 테스트(`pnpm test`) · [수동] 재생성 |
| SH-07 | 초대 메일이 설치 주소와 해당 인스턴스의 이미지를 사용한다. 발송 불명확 상태는 기존 실패 계약대로 보인다. | [자동] URL 계획 · [수동] 테스트 수신함 |
| SH-08 | 스케줄러가 매일 18:00 UTC(`vercel.json`과 같은 값)에 `GET /api/pull`을 호출한다. 프로젝트별 실패·미처리는 web 로그의 `summarizeNightly` 줄로 구분된다. | [자동] cron 값 일치 · [수동] 실제 호출 로그 |
| SH-09 | 같은 앱 이미지 digest를 서로 다른 두 self-hosted origin에서 실행해 각 인스턴스의 기능 URL을 확인한다. 비밀은 빌드에 필요하지 않으며(env를 비운 build로 증명) 이미지·클라이언트 번들·로그에 포함되지 않는다. | [수동] |
| SH-10 | DB·이미지·키를 백업해 빈 볼륨에 복원한 뒤 로그인, 번역 조회·편집, 이미지, 자격증명 복호화와 리포 왕복을 검증한다. 키 회전·검증 도구도 self-hosted target에서 동작한다. | [자동] target 파서 · [수동] 복원 |
| SH-11 | (이연) 이전 지원 릴리스에서의 업그레이드·복구 실측은 **두 번째 지원 릴리스의 완료 조건**이다. 1차는 업그레이드 절차 문서만 남긴다. | — |
| SH-12 | self-hosted는 robots `Disallow: /`와 페이지 `X-Robots-Tag: noindex`를 내고 `/sitemap.xml`·`/llms*.txt`는 404다. Vercel Analytics를 렌더하지 않는다. `/privacy`는 운영자 정책으로 redirect되고, 푸터·사용자 메뉴·`/signin`·`/oauth/authorize`의 Privacy 링크가 브라우저에서 운영자 페이지에 착지한다. 두 동의문 링크는 self-hosted에서 새 탭으로 열린다. 이는 접근 제어를 대신하지 않는다. | [자동] 정책 판정 · [수동] 응답 헤더·착지 |
| SH-13 | hosted production/preview의 origin 정책, Blob, Cron, SEO(sitemap·llms 정적 산출물 포함), HSTS, Analytics, 메일 동작에 회귀가 없다. 기존 hosted 정확 단언 테스트([tasks §1](tasks.md#1-순수-정책--featself-hosting-define-deployment-policies) 목록)가 수정 없이 green이고, `/sitemap.xml`·`/llms.txt`·`/llms-full.txt`·HSTS가 **같은 revision의 로컬 `pnpm build` 산출물끼리** 기준과 같다. | [자동] `pnpm gate` · [수동] 산출물 비교 |
| SH-14 | 정본 문서가 배포 범위를 사실대로 말한다 — PRODUCT(Cron·robots의 Vercel 전제 서술과 배포 범위), ARCHITECTURE(불변식 5의 ⚠️ Supabase 주석과 §7의 self-hosted 대응 — 불변식 본문은 그대로), CLAUDE.md(Supabase 권한 절·스택 표의 Vercel·Supabase 단언), ACTIONS.md(self-hosted 복사 예시·`api-url` 필수), DESIGN §10.1(App 호칭 행), README Privacy(전송처 목록), OPERATIONS(설치·복구·실습 기록), `.claude/commands/merge.md`(이미지 발행). | [수동] 문서 대조 |
| SH-15 | **self-hosted 경로를 상시로 지키는 `pnpm test` 게이트 셋이 있다.** ① 비테스트 소스의 hosted 도메인 리터럴·`MALMOI_ORIGIN`·`VERCEL_ENV` 직접 읽기가 허용 목록 밖에서 0 ② `lib/env.ts`가 읽는 env 이름 전부가 preflight 표(필수·선택·hosted 전용)에 분류되고 `.env.example`·compose 예제의 키와 일치 ③ Dockerfile의 Node 메이저 == `.nvmrc`, pnpm == `packageManager`, `.npmrc`가 이미지에 복사됨. 하나라도 어긋나면 red. | [자동] |

## 5. 비목표

- Kubernetes, 다중 인스턴스, 고가용성, 무중단 업데이트, 자동 업데이트, 여러 DB·저장소 provider를 위한 범용 플러그인.
- 폐쇄망, GitHub Enterprise·GitLab, 로컬 비밀번호·SAML·이메일 로그인, 초대 전용 가입·가입 도메인 제한.
- SMTP 등 Resend 외 메일 transport. 메일 큐·자동 재시도·일반 알림도 추가하지 않는다.
- SaaS와 셀프 호스팅 사이 계정·프로젝트 이전, 서로 다른 인스턴스 병합, 기존 Blob 일괄 이관.
- 관리 콘솔·설치 마법사·화이트라벨·쿼터 변경. 기존 운영자 예외와 ProjectMember 인가를 유지한다.
- self-hosted용 sitemap·llms 산출물. 설치본은 noindex라 제공하지 않는다.
- 앱 안의 rate limit. hosted는 Vercel WAF, self-hosted는 proxy 예제가 같은 경로·한도를 든다.
- 번역·키·이력 보존 규칙, push/편집/pull 계약, export 알고리즘 변경.
- **셀프 호스팅 말모이 + GitLab.com 리포 조합.** [gitlab-repositories](../gitlab-repositories/spec.md) §5와 대칭이다. 두 스펙이 같은 파일을 고치는 지점(초대 메일 `lib/invitation-email/`·사전의 "GitHub App" 문구·README·`/privacy` 전송처·ARCHITECTURE §0)은 **먼저 착수하는 쪽이 리포 호스트 중립 낱말을 정하고 나중 쪽이 따른다.** 이 스펙의 "저장소"는 파일 저장소이고 그 스펙의 "리포 호스트"와 다르다.

## 6. 범위 게이트

[PRODUCT](../../PRODUCT.md) §4.2에 셀프 호스팅은 비범위로 지정되어 있지 않고, §4.3의 이메일 로그인·웹훅을 요구하지 않는다. 다만 **PRODUCT의 Cron·robots 서술은 Vercel을, [ARCHITECTURE](../../ARCHITECTURE.md) 불변식 5의 ⚠️ 주석과 §7·CLAUDE.md의 Supabase 권한 절은 Supabase 권한 모델을 전제한다.** 불변식 1–11의 본문은 그대로 유지한다. 불변식 5 본문은 "인가된 `projectId`로 쿼리를 제한한다"이고 이 기능이 바꾸지 않는다. 바뀌는 것은 그 아래 Supabase 전제 주석으로, self-hosted 대응(포트 비공개·비-superuser 런타임 롤·bootstrap)을 함께 서술한다. 이 갱신은 SH-14로 완료 조건에 들어 있다. 이 스킬 단계에서 정본 문서를 직접 고치지 않는다.

화면 구조를 신설하지 않으므로 `design-brief.md`는 만들지 않는다. 화면 문구 변경(동의문 링크 동작·GitHub App 호칭)은 세 사전(en·ko·es)을 같은 커밋에서 고친다. **App 호칭은 hosted·self-hosted 공통으로 처음 "the GitHub App", 이어서 "the app"으로 바꾼다**(2026-10-09 review 확정 — 런타임 치환 없이 두 배포에서 참). DESIGN §10.1의 App 호칭 행·`banned-terms.ts`·해당 테스트를 같은 배치에서 고친다.

## 7. 유지보수 계약

이 기능이 출시되면 아래가 앞으로의 모든 기능에 걸리는 계약이 된다. 비용이 여기서 나온다.

| 항목 | 계약 |
|---|---|
| 이미지 발행 | **매 앱 태그 `v<x.y.z>`마다** `/merge`가 이미지를 발행한다. 이미지 태그 = 앱 태그, action 태그와 독립. `.claude/commands/merge.md` 갱신이 산출물이다(SH-14) |
| 지원 대상 | 최신 앱 태그 하나. 지원 창구는 GitHub Issues이고 best-effort다(개발자 1명 — PRODUCT §0) |
| 업그레이드 | 어느 과거 태그에서든 최신 이미지의 `prisma migrate deploy`가 남은 마이그레이션을 순서대로 적용한다. 따라서 **additive-first는 dev·prod 두 DB가 아니라 모든 과거 태그의 스키마에서 성립해야 한다** — 마이그레이션은 특정 데이터 상태(prod에만 있는 행 등)를 가정하지 않는다. 실측은 SH-11(두 번째 지원 릴리스) |
| action 호환 | 서버는 발행된 action 태그(v1·v2·v3)의 `/api/push` 요청을 계속 받는다 — hosted에 이미 있는 계약이다. 새로 생기는 조합은 "구버전 서버 + 신버전 action"인데, 설치본은 자기 생성기가 낸 태그를 쓰므로(§3) 지원 범위 밖이다 |
| 상시 게이트 | SH-15의 셋. 컨테이너 CI는 두지 않는다 — 대신 hosted 전용 전제가 새로 들어오는 순간을 `pnpm test`가 잡는다 |
| 운영자 개인정보 | 운영자가 정책을 쓸 재료(수집 항목·쿠키·전송처·계정 삭제 절차)를 `lib/privacy/collected.ts`에서 파생해 설치 문서에 둔다. 새 수집 필드는 이미 typecheck가 `collected.ts` 등재를 요구하므로 재료 표도 같은 출처를 따른다 |

## 8. 확인 사항

| 항목 | 결정 | 상태 |
|---|---|---|
| 착수 조건 | 수요 트리거 없이 저자 판단 | 확정(2026-10-09 review) |
| 메일 범위 | Resend 유지. SMTP는 비목표. preflight는 누락·형식만 | 확정(2026-10-08 · 2026-10-09 review) |
| 배포 지원 폭 | 단일 서버 Compose, linux/amd64, 이미지 한 벌, Postgres 17 | 확정. 레지스트리 공개 권한은 착수 전 확정 |
| 이미지 발행 | 매 앱 태그, `/merge` 단계 | 확정(2026-10-09 review). 레지스트리는 위 행 |
| migrate 롤 | DB를 소유한 비-superuser 롤. 런타임 롤은 bootstrap이 만드는 별도 롤 | 확정(2026-10-09 review) |
| App 호칭 | 두 배포 공통 "the GitHub App" → "the app" | 확정(2026-10-09 review) |
| 개인정보 URL | `MALMOI_PRIVACY_URL` 하나를 모든 화면 언어에 쓴다. redirect는 `/privacy` page에서 | 확정(2026-10-09 review) |
| 생성기 action 태그 | 생성기는 아직 v2를 낸다(`lib/onboarding/workflow.ts:27`, [ACTIONS](../../ACTIONS.md) v3 절). v3로 올리면 hosted 출력도 바뀐다 | 착수 전 확정 — 추천: 0배치에서 생성기를 v3로 올리는 별도 커밋(hosted 바이트 단언을 그 커밋에서 갱신) |
| 배포 검증 값 | 최소 CPU/RAM·디스크 여유·복구 실측 시간 | 컨테이너 실습에서 기록. 임의 성능·가용성 보장 없음 |

후속 구현은 이 문서만으로 시작하지 않는다. 위 표의 "착수 전 확정" 항목을 닫은 뒤 [태스크](tasks.md)를 진행한다.
