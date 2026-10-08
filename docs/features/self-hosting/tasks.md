# Self-hosting — 구현 태스크

작성: 2026-10-08 · 상태: 전부 미착수 · 정본: [spec](spec.md), [design](design.md)

이 파일은 후속 구현 계획이다. 현재 문서 작성에서는 코드·빌드·DB·배포를 실행하지 않는다. 각 배치는 순수 함수 테스트를 먼저 만들고 구현한다. 커밋 제목은 제안이며 지금 커밋하지 않는다.

## 0. 착수 게이트

- [ ] 메일 Resend 유지/SMTP 범위 답변을 반영하고 feature review를 진행한다. 배포 이미지 발행 위치·권한, proxy 예제, 검증할 Postgres major를 확정한다.
  - 검증: 미확정 사항이 구현자가 임의 선택해야 하는 상태로 남아 있지 않음.
- [ ] 착수 시점 HEAD와 기존 문서·코드 경계를 다시 대조한다. hosted 회귀 기준을 기록한다.
  - 검증: 기준 revision 및 현재 hosted/preview smoke 항목이 작업 기록에 있음.

## 1. 순수 정책 — `feat(self-hosting): define deployment policies`

- [ ] 설정·origin 검증, workflow 목적지, MCP·메일 URL 정책의 실패 테스트 후 구현.
  - 검증: SH-03/04/05/07의 정상·위조·SaaS fallback 회귀 테스트와 `pnpm test` 통과.
- [ ] 이미지 참조·키·삭제 계획 및 deployment별 metadata/Analytics 정책 테스트 후 구현.
  - 검증: Blob 기존 입력과 로컬 참조, 잘못된 경로, hosted canonical 테스트 통과.
- [ ] 기존 보안 헤더 정책에 deployment별 HSTS를 연결하는 실패 테스트 후 구현한다. hosted는 기존 값을 유지하고 self-hosted는 `max-age=63072000`만 보낸다.
  - 검증: hosted의 기존 HSTS 값과 self-hosted의 includeSubDomains·preload 제외를 정확한 문자열로 단언함.
- [ ] self-hosted credential target과 UTC 다음 실행 시각·Cron 결과 판정 테스트 후 구현.
  - 검증: hosted 대상 제한, query override, 경계 시각, HTTP 200 내부 실패 테스트 통과.

## 2. 서버 경계 — `feat(self-hosting): wire instance services`

- [ ] 인증·계정 연결·MCP·온보딩 workflow가 공통 origin 정책을 사용하도록 연결한다. 필수 runtime 설정 preflight를 추가한다.
  - 검증: 잘못된 설정은 비밀 없이 기동 실패, secret 없는 build는 성공. SH-03/04/05.
- [ ] 파일 저장 구현과 기존 이미지 route·소비자·정리 경로를 연결한다.
  - 검증: 임시 디렉터리에서 put/read/delete/list, symlink·traversal·쓰기 실패·교체 실패 및 DB 참조 일관성 통합 테스트. SH-06.
- [ ] 기존 초대 메일 transport에 인스턴스 URL을 연결한다. SMTP 결정이면 선행 설계 수정 전 이 태스크를 실행하지 않는다.
  - 검증: 실제 테스트 수신함에서 초대 수락·이미지 URL 확인, 설정 누락·unknown 결과 회귀 확인. SH-07.

## 3. DB·운영 명령 — `feat(self-hosting): support standalone database operations`

- [ ] 일반 Postgres bootstrap, 역할·권한, 명시적 self-hosted migration 및 credential 명령을 구성한다.
  - 검증: 빈 DB에 전체 기존 migration 적용, PUBLIC 권한 회수 뒤 정상 CRUD, 런타임 DDL 거부. SH-02.
- [ ] self-hosted 키 verify·회전·reindex·finalize를 연결하고 hosted 안전 게이트를 보존한다.
  - 검증: 격리 fixture DB에서 회전 전후 복호화·lookup·이전 키 제거 절차 및 잘못된 대상 거절. SH-10.

## 4. 배포물 — `feat(self-hosting): package compose deployment`

- [ ] standalone Dockerfile, 도구 target, `.dockerignore`, 버전 고정 Compose, proxy 예제를 작성한다. 저장소 버전은 올리지 않는다.
  - 검증: linux/amd64 빌드·실행, sharp 업로드, 가이드·폰트·정적 자산, image layer 비밀 검사. SH-01/09.
- [ ] HSTS가 런타임 배포 설정을 따르도록 연결하고 proxy는 앱의 헤더를 중복 없이 전달하게 한다.
  - 검증: 같은 digest를 hosted/self-hosted로 실행해 proxy 뒤 페이지·API·정적 자산의 최종 HSTS가 각각 기존 값/`max-age=63072000` 하나뿐임. SH-09/13.
- [ ] 영속 볼륨·내부 네트워크·non-root 실행·readiness·migration 성공 의존 순서를 연결한다.
  - 검증: DB 초기 지연/실패·migration 실패·업로드 권한 오류에서 앱·scheduler 조기 실행 방지. 컨테이너 재생성 후 데이터 유지.
- [ ] 단일 scheduler를 기존 Cron route에 연결한다. graceful 종료·timeout·실패 로그를 확인한다.
  - 검증: 가짜 시계 테스트와 실제 route 호출, 장시간 실행 겹침 방지, 부분 실패·미처리 표시. SH-08.

## 5. 기존 공개 화면 연결 — `feat(self-hosting): adapt public instance metadata`

- [ ] sitemap·llms·metadata의 런타임 origin과 원고 tracing, noindex·robots, Analytics 제외를 적용한다.
  - 검증: 같은 digest를 두 도메인에 띄워 HTML·JSON-LD·sitemap·llms·OAuth discovery 주소와 네트워크 요청 확인. hosted 기존 내용과 비교. SH-09/12/13.
- [ ] `/privacy`의 운영자 정책 redirect와 순환 방지를 적용한다. 기존 안내의 서비스 운영자 연락처·인프라 주장을 대조한다.
  - 검증: self-hosted 정책 링크가 실제 운영자 문서로 연결되며 hosted 개인정보 페이지는 유지됨.

신규 화면·정보 구조 변경은 계획하지 않는다. 구현 중 설치 UI가 필요해지면 이 배치에 끼워 넣지 않고 범위를 재검토한다.

## 6. 운영 문서와 복구 — `docs(self-hosting): document installation and recovery`

- [ ] `.env.example`와 배포 예제에 신규·기존 필수 변수를 동기화한다. OAuth/App 등록, HTTPS·DNS, GitHub Actions 접근성, Resend 발신 설정, 공개 가입 동작을 설명한다.
  - 검증: 기존 운영자 비밀 없이 제3자가 체크리스트로 SH-01/03/07을 재현할 수 있음.
- [ ] 고정 버전 설치·업데이트·백업·빈 볼륨 복원·키 회전·장애 진단 절차를 작성한다.
  - 검증: SH-10/11 실습 기록에 digest·DB 버전·migration 상태·중단/복원 시간·결과를 남김. 비밀은 기록하지 않음.
- [ ] en·ko·es의 MCP 연결 원고와 FAQ를 함께 갱신한다. MCP 주소는 현재 인스턴스의 **Copy server URL**을 사용하도록 안내하고, 개인정보 문의는 해당 설치의 `/privacy` 및 운영자 정책을 따른다. 30일 응답을 모든 설치의 공통 약속으로 안내하지 않는다.
  - 검증: 두 self-hosted 도메인에서 가이드만 따라 각각의 MCP에 연결하고 해당 운영자 정책에 도달함. 가이드 화면·언어별 검색 색인·llms 파생본의 안내가 일치하며 hosted 연결 안내와 정책의 기존 약속도 유지됨. SH-05/09/12/13.
- [ ] PRODUCT·ARCHITECTURE·OPERATIONS·DIRECTORY·README에 최종 지원 경로를 반영한다.
  - 검증: 지원하지 않는 환경을 지원한다고 쓰지 않음. CLAUDE/명령 원본을 수정했다면 `pnpm sync:agents`와 미러 검사 통과.

## 7. 릴리스 검증 — `ci(self-hosting): verify release containers`

- [ ] 새 통합 테스트를 해당 Vitest 설정의 include에 등록하고, 그 테스트가 검증하는 생산 코드의 변경 경로도 `scripts/gate-plan.ts` 실행 조건에 등록한다. `pnpm test`는 별도 PostgreSQL 스위트를 수집하지 않으므로 테스트 파일 추가만으로 검증이 연결됐다고 판단하지 않는다.
  - 검증: 새 통합 테스트가 해당 스위트에서 실제 수집되고, 생산 코드만 변경해도 필요한 스위트가 게이트 실행 계획에 포함됨을 확인함.
- [ ] 로컬 검증은 `pnpm gate`를 실행하고 이미지 통합 검증을 별도로 수행한다. typecheck·단위/DOM·변경 경로에 따른 격리 PostgreSQL·build·미러 검사는 기존 게이트의 실행 계획을 따른다. 이미지 검증은 build와 runtime 설정을 분리해 시험한다.
  - 검증: 필요한 PostgreSQL 스위트를 포함한 `pnpm gate` 통과, 비밀 없는 이미지 build, 일반 Postgres 신규 설치 및 migration 실패 경로 통과.
- [ ] 테스트 리포에서 push → 웹 편집 → Publish → PR 확인 → 재실행 왕복을 수행한다. 편집 보호·열린 PR 보호·회원 인가도 확인한다.
  - 검증: SH-04와 export 결정성, 무의미한 추가 커밋 없음. 실제 GitHub 결과와 DB 상태 일치.
- [ ] 두 OAuth 로그인·MCP 개인 토큰/OAuth·이미지·초대·Cron·복원과 hosted preview를 수동 검증한다.
  - 검증: SH-01–13 각각에 증거 또는 명시적 실패를 기록. 미실행을 통과로 표시하지 않음.
- [ ] 릴리스 tag와 이미지 revision/digest의 일치를 검증하는 발행 절차를 연결한다. 최소 자원·지원 DB major를 실측 결과로 확정한다.
  - 검증: 태그를 이동시키지 않고 동일 소스의 이미지·Compose·문서를 추적할 수 있음. 공개 발행·프로덕션 반영은 별도 릴리스 절차에서 수행.

완료 기준은 컨테이너 기동이 아니라 [spec의 수용 기준](spec.md#4-완료-조건) 전부다. 현재 단계에서는 구현·커밋·이미지 발행·dev push·main merge를 하지 않는다.
