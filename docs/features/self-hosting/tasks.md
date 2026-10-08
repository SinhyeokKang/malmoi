# Self-hosting — 구현 태스크

작성: 2026-10-08 · 상태: 전부 미착수 · 정본: [spec](spec.md), [design](design.md)

이 파일은 후속 구현 계획이다. 현재 문서 작성에서는 코드·빌드·DB·배포를 실행하지 않는다. 각 배치는 순수 함수 테스트를 먼저 만들고 구현한다. 커밋 제목은 제안이며 지금 커밋하지 않는다.

**검증 표기**: `[자동]`은 `pnpm gate`(트리거 시 격리 PostgreSQL 스위트 포함)가 판정한다. `[수동]`은 로컬 Docker 실습이고 증거(명령·관측 값·digest·실패)를 OPERATIONS **셀프 호스팅 실습 기록** 절에 남긴다. 이 리포엔 컨테이너 CI가 없고 이번에 추가하지 않는다.

## 0. 착수 게이트

- [ ] 레지스트리·이미지 발행 위치·권한, proxy 배포물을 확정한다.
  - 검증: spec §7 표의 상태 열에 "착수 전 확정"이 남아 있지 않음.
- [ ] 착수 시점 HEAD와 기존 문서·코드 경계를 다시 대조한다. hosted 회귀 기준을 기록한다.
  - 검증: OPERATIONS 실습 기록 절에 기준 SHA와 hosted preview의 `/sitemap.xml`·`/llms.txt`·`/llms-full.txt` 본문 해시·HSTS 값이 있음.

## 1. 순수 정책 — `feat(self-hosting): define deployment policies`

- [ ] 배포 모드·origin 파서와 preflight 판정의 실패 테스트 후 구현.
  - 검증: [자동] design §9 표의 첫 두 행 사례가 각각 단언됨(끝 슬래시·대문자·`:443`·IPv6·IDN·`VERCEL_ENV` 동시 존재·`AUTH_URL` 불일치·출력에 비밀 없음·전부 있을 때 통과). `pnpm test` green.
- [ ] workflow·MCP·OAuth·메일 URL 계획의 실패 테스트 후 구현.
  - 검증: [자동] self-hosted에서 `mal-moi.com`이 나오는 경로 0, hosted 기존 단언(mcp-route·oauth metadata·well-known) 그대로 green.
- [ ] 이미지 키 추출기 하나와 참조·삭제 계획, 공개 응답 정책(noindex·sitemap/llms 404·Analytics 제외) 테스트 후 구현.
  - 검증: [자동] 기존 Blob URL과 `/api/images/<key>`가 같은 키로 추출되고 `imageSrc`·두 delete plan이 그 추출기를 씀. hosted SEO 정확 단언(seo-metadata·llms·json-ld·crawl-files) 그대로 green.
- [ ] self-hosted credential target 파서 테스트 후 구현.
  - 검증: [자동] hosted allowlist 유지, self-hosted query override 거절, `postgres` 호스트만 `sslmode` 생략/`disable` 허용·그 밖은 `verify-full` 요구.
- [ ] 스케줄러 cron 식과 `vercel.json`의 cron 값이 같다는 테스트.
  - 검증: [자동] 둘 중 하나만 바꾸면 red.

## 2. 서버 경계 — `feat(self-hosting): wire instance services`

- [ ] 인증·계정 연결·MCP·OAuth AS·온보딩 workflow가 공통 origin 정책을 사용하도록 연결한다. preflight를 기동 경로에 연결한다.
  - 검증: [자동] 1배치 테스트 green. [수동] 잘못된 설정으로 기동 시 비밀 없는 메시지로 종료, 올바른 설정으로 ready 200 — 같은 라운드에서 둘 다 관측. SH-01/03/04/05.
- [ ] 파일 저장 구현과 기존 이미지 route 둘(`[...key]`·`email/[...key]`)·소비자를 연결한다.
  - 검증: [자동] 임시 디렉터리 기반 `lib/upload/__tests__/*.test.ts`(`pnpm test`)에서 put/read/delete, symlink·traversal 거절, rename 전 crash 잔여 임시 파일이 읽기에 안 보임, 읽기 전용·쓰기 실패 시 DB 옛 참조 유지. SH-06.
- [ ] 초대 메일 config·message를 배포 모드 판정과 `MALMOI_ORIGIN`에 연결한다.
  - 검증: [자동] hosted 기존 판정 green, self-hosted 링크·이미지 URL 단언. [수동] 테스트 수신함에서 초대 수락·이미지 표시. SH-07.

## 3. DB·운영 명령 — `feat(self-hosting): support standalone database operations`

- [ ] `deploy/` 아래 bootstrap SQL(런타임 롤·`GRANT USAGE`·`ALTER DEFAULT PRIVILEGES`)을 작성한다. `prisma/migrations/`에 넣지 않는다.
  - 검증: [자동] 새 격리 스위트(`vitest.self-hosted.config.ts`, PG17, 기존 `CREDENTIAL_PG_BIN` 패턴)가 빈 DB에 전체 migration → bootstrap 순으로 적용하고 런타임 롤로 CRUD 성공·DDL 거부를 단언. SH-02.
- [ ] 그 스위트를 `package.json`(`test:self-hosted:postgres`)과 `scripts/gate-plan.ts`에 등록한다. 트리거는 `deploy/`·자격증명 target 파서 경로.
  - 검증: [자동] 테스트 파일 없이 생산 경로만 바꾼 diff에서도 gate 실행 계획에 스위트가 포함됨을 gate-plan 테스트로 단언.
- [ ] `CREDENTIAL_TARGET=self-hosted`로 키 verify·회전·reindex·finalize를 연결하고 hosted 안전 게이트를 보존한다.
  - 검증: [자동] 격리 fixture DB에서 회전 전후 복호화·lookup·이전 키 제거, 잘못된 대상 거절. SH-10.

## 4. 배포물 — `feat(self-hosting): package compose deployment`

- [ ] 비standalone Dockerfile 한 벌, `.dockerignore`, 버전 고정 Compose, proxy 예제(HSTS `max-age=63072000` 덮어쓰기 포함)를 작성한다. 저장소 버전은 올리지 않는다.
  - 검증: [수동] env를 비운 상태의 이미지 build 성공, linux/amd64 실행, sharp 업로드, 가이드·폰트·정적 자산 200, image layer·history에 비밀 문자열 없음. proxy 뒤 페이지·API·정적 자산의 최종 HSTS가 `max-age=63072000` 하나. SH-01/09.
- [ ] 영속 볼륨·내부 네트워크·non-root 실행·DB ping readiness·migrate 성공 의존 순서를 연결한다.
  - 검증: [수동] DB 초기 지연·migration 실패에서 web·scheduler가 시작되지 않고, 정상 경로에선 ready. 컨테이너 재생성 후 DB·이미지 유지. DB 포트가 호스트에 publish되지 않음.
- [ ] crond+curl 스케줄러를 기존 `GET /api/pull`에 연결한다.
  - 검증: [수동] 시각을 당긴 crontab으로 1회 호출해 web 로그에 `summarizeNightly` 줄이 남고, 잘못된 비밀은 `curl -f` 실패로 남음. SH-08.

## 5. 기존 공개 화면 연결 — `feat(self-hosting): adapt public instance metadata`

- [ ] middleware에 self-hosted 분기(noindex 헤더·sitemap/llms 404)를 연결하고 Analytics를 제외한다.
  - 검증: [자동] `entry-points.test.ts`·정책 테스트 green. [수동] self-hosted 응답 헤더와 404 확인, Vercel preview의 세 경로가 0배치 기준과 같은 본문. SH-12/13.
- [ ] `/privacy`의 운영자 정책 redirect와 순환 방지를 적용한다.
  - 검증: [자동] self-hosted redirect 대상 단언, hosted `/privacy` 기존 렌더 green.
- [ ] 로그인·초대 동의문의 "Malmoi Privacy Policy"와 "Malmoi GitHub App" 고유명(사전 11곳)을 일반화한다. **en·ko·es를 같은 커밋에서** 고치고 단어 판정은 `/translate`를 따른다.
  - 검증: [자동] `dictionary-consistency`·`no-korean-ui`·`brand-spelling` green, 세 사전에서 해당 고유명 0건.

신규 화면·정보 구조 변경은 계획하지 않는다. 구현 중 설치 UI가 필요해지면 이 배치에 끼워 넣지 않고 범위를 재검토한다.

## 6. 운영 문서와 복구 — `docs(self-hosting): document installation and recovery`

- [ ] `.env.example`와 배포 예제에 신규·기존 필수 변수를 동기화한다. OAuth/App 등록, HTTPS·DNS, GitHub Actions 접근성, Resend 발신 설정, 공개 가입의 결과(PII 저장·상한 3·`OPERATOR_EMAILS`)를 설명한다.
  - 검증: `.env.example`에 design §2 표의 신규 변수가 전부 있고, 설치 체크리스트에 preflight 필수 항목이 전부 있음.
- [ ] OPERATIONS에 고정 버전 설치·업데이트(절차만)·백업·빈 볼륨 복원·키 회전·장애 진단 절차와 **셀프 호스팅 실습 기록** 절을 만든다.
  - 검증: [수동] SH-10 실습 기록에 digest·DB 버전·migration 상태·중단/복원 시간·결과가 있음. 비밀은 기록하지 않음.
- [ ] en·ko·es의 `ai-agents/README.md`·`browser.md`·`token.md`·`prompts.md`, `faq.md`, `reference/troubleshooting.md`를 갱신한다. MCP 주소는 **Copy server URL** 안내로(`browser.md` 포함), 개인정보 문의는 해당 설치의 `/privacy`로, 30일 응답은 hosted 정책에만.
  - 검증: [자동] `pnpm test`(가이드 게이트) green, 세 언어 원고의 하드코딩 `mal-moi.com/api/mcp` 0건. [수동] self-hosted 도메인에서 가이드만 따라 MCP 연결. SH-05/12.
- [ ] PRODUCT(배포 범위·Cron·robots 서술)·ARCHITECTURE(불변식 5 재서술)·README(Privacy 전송처)·DIRECTORY에 최종 지원 경로를 반영한다.
  - 검증: SH-14 — 각 문서의 해당 절이 self-hosted를 사실대로 서술. CLAUDE/명령 원본을 수정했다면 `pnpm sync:agents:check` 통과.

## 7. 릴리스 검증 — `test(self-hosting): verify release containers`

- [ ] 로컬에서 `pnpm gate`를 실행하고, 이와 별도로 env를 비운 이미지 build와 빈 Postgres 신규 설치·migration 실패 경로를 실습한다.
  - 검증: [자동] 격리 스위트 포함 `pnpm gate` 통과. [수동] 나머지는 실습 기록에.
- [ ] 테스트 리포에서 push → 웹 편집 → Publish → PR 확인 → 재실행 왕복을 수행한다. 편집 보호·열린 PR 보호·회원 인가도 확인한다.
  - 검증: [수동] SH-04 — PR diff가 편집한 값만 담고, 재실행 뒤 대상 리포 커밋 수가 늘지 않음.
- [ ] 두 OAuth 로그인·MCP 개인 토큰/OAuth·이미지·초대·Cron·복원과 hosted preview를 수동 검증한다.
  - 검증: [수동] 실습 기록에 SH-01–14 각각의 증거 또는 명시적 실패가 있음. 미실행을 통과로 표시하지 않음.
- [ ] 릴리스 tag `v<x.y.z>`와 이미지 digest의 일치를 검증하는 발행 절차를 연결한다. 최소 자원을 실측 결과로 확정한다.
  - 검증: 이미지 태그가 앱 태그와 같은 값이고 action 태그와 독립임을 문서에 명시. 공개 발행·프로덕션 반영은 별도 릴리스 절차에서 수행.

완료 기준은 컨테이너 기동이 아니라 [spec의 수용 기준](spec.md#4-완료-조건) 전부다(SH-11은 이연). 현재 단계에서는 구현·커밋·이미지 발행·dev push·main merge를 하지 않는다.
