# 자격증명·회원 정보 저장 보호 — 구현 태스크

> [스펙](./spec.md) · [설계](./design.md) | 로컬 코드 검증과 운영 전환을 구분한다. 기존 초안을 보존한 뒤 sec-audit-2·feature-review 기준으로 재정렬했다. 운영 검증이 포함된 항목은 증거가 남아도 전체 조건 미달이면 열어 둔다.
> 순서: 순수 함수 → 저장 어댑터 → 연결 경로 → 전환 도구 → 통합·운영 검증.

## 재개 선행 조건

- [x] **T0:** origin/dev에 sec-audit-2 `dac4c97`이 포함됨을 확인하고 credential 브랜치를 그 기준으로 정렬한다. 기존 초안의 미커밋 변경은 보존한다.
  - 검증: safePrismaAdapter·callback User 잠금/소유자 조건·membership의 expiresAt CAS 회귀가 유지된다. 이전 기본 PrismaAdapter를 새 구현 기준으로 삼지 않음.

## 커밋 A — 순수 계약과 암호 도구

- [x] **T1 /tdd interface:** 세션 해시·만료 판정·로그인 Account allowlist 테스트를 먼저 작성한다. digest 재사용, 만료 경계, 비밀 필드 추가 주입을 포함한다.
  - 검증: 구현 전 red, 구현 후 관련 테스트 green. AC1·AC2·AC6.
- [x] **T2:** envelope/keyring/AAD 파서와 암·복호화 테스트를 먼저 작성하고 구현한다. 알려진 GCM 벡터, 잘못된 키 길이·인코딩, 모든 envelope 필드 변조, 사용자·계정·컬럼 교환, NULL refresh를 포함한다.
  - 검증: 고정 fixture 왕복과 변조 거부; production nonce 생성 경로가 고정 fixture에 의존하지 않음. AC4.
- [x] **T3:** server-only crypto 껍데기와 지연 env 로드를 추가한다. 토큰용 환경변수 둘 및 개인정보/검색용 넷을 `.env.example`에 문서화한다.
  - 검증: 키 없이 모듈 로드 가능, 실제 암호 연산은 안전하게 실패, 클라이언트 그래프에 키/crypto 저장 모듈 없음. AC4·AC9.

## 커밋 A2 — 회원 정보 계약과 additive 스키마

- [x] **P1 /tdd interface:** 이메일 lookup·개인정보 AAD·User DTO 변환·전환 계획의 테스트를 먼저 작성한다. 정규화, scope 분리, 서로 다른 행/컬럼 교환, null/undefined, 같은 값 암호문의 비결정성을 포함한다.
  - 검증: red→green; Gmail 점/plus 태그를 합치지 않고 기존 이메일 판정 테스트 유지. AC10~AC12.
- [ ] **P2:** User/ProjectInvitation의 nullable emailLookup과 새 인덱스를 additive migration으로 준비한다. 기존 ID 보존·신규 ID 사전 생성 계약, 독립 개인정보/검색 키 지연 로드를 구현한다.
  - 검증: 생성 SQL 검토와 dev 적용; 기존 코드가 준비 스키마에서 동작; prod 반영은 배송 전환 절차에서 별도로 수행. AC10·AC14.

## 커밋 B — 세션과 로그인 저장 경계

- [x] **T4:** 현재 safePrismaAdapter를 확장해 session create/get/update/delete와 로그인 linkAccount를 감싼다. raw ↔ digest 변환은 각 메서드에서 명시한다. 신규 세션 토큰은 32바이트 난수다.
  - 검증: 실제 설치 Auth.js 계약을 쓰는 통합 테스트에서 쿠키는 원문, DB는 digest; DB digest 쿠키 거부; github/google Account 비밀 값 NULL. AC1·AC6.
- [x] **T5:** 만료 세션 OAuth 콜백, 만료와 갱신 경합, 삭제와 갱신 경합, 로그아웃 멱등성, DB 장애 분류를 검증한다. 공개 세션 allowlist를 유지한다.
  - 검증: 만료 세션이 기존 사용자를 OAuth 연결 대상으로 제공하지 않음, 삭제 행 부활 없음, DB 장애는 unavailable. AC2·AC9. sec-audit-2의 추가 계정 연결 거부·동시 첫 로그인 User 잠금·조건부 만료행 정리 테스트를 그대로 보존.

## 커밋 B2 — 회원·초대 저장 접근 경계

- [x] **P3:** Auth.js User 생성/갱신/조회/삭제 반환과 getSessionAndUser를 전부 감싼다. auth.ts의 검증된 이메일 refresh도 같은 접근 함수를 사용한다.
  - 검증: 두 provider 신규/재로그인, 이메일 변경·중복 거부, 동시 생성·변경의 DB unique 경쟁 테스트. 키/복호화 장애는 unavailable이며 자동 계정 생성/병합 없음. AC11·AC12.
- [x] **P4:** 초대 발급/재발급/수락, 초대 페이지, 멤버·번역자·계정·세션 표시를 설계 §9의 접근 함수로 전환한다. 프로젝트 범위와 기존 마스킹 및 초대 expiresAt CAS를 보존한다. loadSyncRuns의 현재 requester 개인정보 소비도 포함한다.
  - 검증: 미가입자·기존 회원·변경된 이메일·다른 프로젝트·만료/수락 초대, 마스킹 충돌·정렬, actor ID 범위를 포함한 회귀 테스트. AC11·AC13.
- [x] **P5:** 모든 개인정보 컬럼 직접 소비자를 전체 검색해 목록과 대조한다. 오류/로그/새 SyncRun actor 경로와 클라이언트 직렬화를 검사한다.
  - 검증: 본인/타인/비회원 응답의 원문 허용 범위가 기존 정책과 동일하고 암호문/lookup/키는 노출되지 않음. AC13.

## 커밋 C — GitHub App 저장 경계

- [x] **T6:** callback의 신규·기존·교체 경로와 token-store의 읽기·refresh 쓰기에 암호화를 연결한다. providerAccountId를 읽고 복합키+userId로 쓰기를 제한한다.
  - 검증: 각 writer가 평문을 한 번도 DB에 쓰지 않음; 다른 소유자 행으로 바뀌면 덮어쓰기 실패. AC3·AC4.
- [x] **T7:** refresh는 읽었던 암호문으로 CAS하며 토큰 쌍을 원자적으로 교체한다. CAS 실패 후 승자 재조회, disconnect/replace 경합을 검증한다.
  - 검증: 통제한 순서의 경쟁 테스트에서 새 토큰 유실·타인 토큰 사용·연결 부활 없음; 복호화/키 장애는 reauthorize와 구별. AC5.
- [x] **T8:** 기존 account-view의 unavailable 표시를 재사용한다. 로그·오류·RSC·세션 JSON 경계를 검사하고 credential-separation 테스트를 필요한 범위에서 갱신한다.
  - 검증: fixture 비밀 원문과 암호문이 응답/로그에 없고 사용자 토큰이 installation 쓰기 경로로 넘어가지 않음. AC9.

## 커밋 D — 데이터 전환과 키 회전 도구

- [x] **T9:** provider/저장 형식별 전환 계획 순수 함수를 먼저 테스트한다. check-only 기본값, dev/prod 명령 분리, 명시적 apply, 값 없는 건수 보고를 구현한다.
  - 검증: 기본 실행 DB 쓰기 0, 중복 github-app·손상 envelope·알 수 없는 비밀 저장 provider 거부, 대상 잘못 지정 방지. AC7.
- [x] **T10:** legacy 세션 제거·로그인 비밀 NULL·App 토큰 암호화 및 별도 키 회전을 구현한다. 재실행·중간 중단·CAS 실패·백업 복원 후 재전환을 검증한다.
  - 검증: dev fixture에서 두 번 실행 결과 동일, 새 해시 세션 유지, 정상 암호문 이중 암호화 없음, expires_at 유지. AC7·AC8.
- [ ] **T11 (T10·P6·P7 완료 뒤):** 요청 차단·이전 배포 URL 차단·진행 중 요청 종료·재개 조건을 실제 배포 환경에서 리허설한다. 차단 중 refresh/API 호출 0을 확인한다.
  - 검증: 전환 중 옛 writer가 실행될 수 없음; 새 코드/키 장애 시 차단 상태 복구 가능; 안전 릴리스로만 rollback. AC7·AC8.

## 커밋 D2 — 개인정보 전환과 검색 키 회전

- [x] **P6:** 모든 User/초대의 암호문+lookup backfill, 구 이메일 인덱스 제거 및 NOT NULL 제약 SQL을 준비한다. 사전 중복·NULL·형식 오류 보고와 부분 실패 재실행을 구현한다.
  - 검증: 전환 fixture의 ID/FK/권한/초대 토큰 보존, 대상 평문 0·lookup 불일치 0, 기존 unique 이메일 의미 유지. AC10~AC12.
- [ ] **P7:** 개인정보 키 회전과 검색 키 전건 재색인을 별개 명령으로 구현하고, 전체 트래픽 차단 상태에서 부분 실패·재개·키 유실·백업 복원을 리허설한다.
  - 검증: 개인정보 키 회전 시 lookup 불변, 검색 키 회전 시 전 행 동일 세대, 키/DB 백업 쌍 복원 성공; 혼합 세대에서 재개 불가. AC14.

## 커밋 E — 통합 검증과 정본 문서

- [ ] **T12:** `pnpm test`·`pnpm typecheck`와 dev 실물 로그인 두 공급자, 시간당 세션 갱신, 로그아웃, 기존 쿠키 거부, GitHub 조회·refresh·재연결을 검증한다. 신규 DB 상태는 원문 출력 없이 검사한다.
  - 검증: AC1~AC14 충족 증거를 남김. 빌드는 해당 배송 절차에서 수행하고, 운영 전환은 문서 작성과 분리한다.
- [x] **T13:** ARCHITECTURE의 평문 수용 기록·인증 경계, SAAS의 저장 정책, github-connect 설계, env 설명을 실제 구현과 맞춘다. 회원/초대 암호화 및 조회 인덱스의 잔여 위험과 백업·키 회전 절차도 반영한다.
  - 검증: 현재 코드/문서가 동일한 저장 형식·오류·운영 절차를 설명함. sec-audit-2의 31·33·39번은 실제 해결한 부분만 증거와 함께 추적.

## 배송과 운영 전환 경계

A~E와 A2/B2/D2는 리뷰 가능한 커밋 경계이며, 실행 의존성은 T10+P6+P7 → T11 → T12다. 준비/전환의 실제 배송 단위는 설계 §10의 R1/R2로 나눈다. R1에는 finalize migration을 포함하지 않으며, B 또는 C만 기존 평문 DB에 배포하지 않는다. 전체 변경 준비 후 설계 §7의 준비/차단 전환 두 단계로 배송한다. Codex는 원격 push·merge를 하지 않는다.

prod 전환 완료는 코드를 머지한 시점이 아니다. legacy 세션 0·로그인 비밀 0·개인정보 평문 0·lookup 누락/불일치 0·암호문 전건 인증 복호화 성공·새 로그인 및 연결 동작을 확인하고 서비스가 재개된 시점이다. 세션 무효화 외 사용자 데이터 삭제는 허용 범위가 아니다.


## feature-review 보완 검증 (2026-09-10)

다음은 위 태스크의 필수 검증을 구체화한 것이며 새 제품 범위가 아니다.

- [ ] **P2/P6 배송 경계:** R1 pending에는 additive만, R2 finalize는 backfill 전건 검사 후에만 실행한다.
  - 검증: 실제 격리 PostgreSQL의 빈 DB·legacy DB에서 R1만 먼저 배포해 기존 코드 호환 확인.
    첫 배치 후 / finalize 직전 / finalize 후 앱 활성화 전 / 검색 키 부분 교체 후 중단·재개를 검사.
    실패한 migration과 실제 DDL 상태를 대조해 복구하고 reset·체크섬 편집으로 통과시키지 않음.
- [ ] **T4/T5/P3 테스트 층:** 실제 Auth.js 핸들러+가짜 공급자 응답, 실제 PostgreSQL 경쟁, 브라우저 두 공급자 왕복을 구분한다.
  - 검증: fake DB로 DB unique/잠금 증명을 대체하지 않음. 파괴적 fixture는 공유 dev/prod가 아닌 격리 DB.
    schema-contract 테스트는 유효 어댑터의 emailLookup unique·User override·평문 email 조회 부재를 검사.
- [x] **P3 이메일 충돌:** 신규 가입 중복과 기존 로그인 이메일 refresh 충돌·동시 P2002를 별도로 검증한다.
  - 검증: 신규 중복은 거부, 기존 로그인은 옛 userId·이메일로 허용하며 병합·부분 필드 갱신 없음.
- [ ] **P3/P4 장애 화면:** signIn 암호/DB 오류→Unavailable, 초대 개별 행 손상, 다른 멤버/actor 손상의 수신자를 구현한다.
  - 검증: 실제 callback 응답과 각 화면/Action에서 이메일 미검증·비로그인·빈 목록으로 오분류하지 않음.
    페이지 재시도·기존 danger Alert·인라인 오류, 키보드와 포커스 동작을 수동 확인.
- [ ] **P4/P5 logs:** loadSyncRuns의 requester ID를 포함한 서버 복호화·마스킹을 구현한다.
  - 검증: requester=null, 이름 없음, 마스킹 충돌, 다른 프로젝트 접근 거부, RSC 암호문/lookup 부재.
- [x] **T8/P5 로그:** crypto/DB 예외를 저장 경계에서 값 없는 코드로 정규화한다.
  - 검증: 평문·암호문·lookup을 넣은 Prisma 오류 fixture가 로그·응답에 남지 않고 SessionTokenError 장애 감지는 유지.
    초대·push 토큰의 승인된 최초 표시와 HttpOnly 세션 쿠키는 비밀 노출 실패로 오판하지 않음.
- [ ] **T11 전환 경험:** 구 배포 URL·OAuth·cron·CI·로컬 writer를 포함한 차단과 이미 연결된 쓰기의 종료를 확인한다.
  - 검증: 점검 안내·재시도 제공, 열린 편집기의 저장 성공 오응답 없음, 재개 후 같은 공급자로 동일 userId/권한 복귀.
    차단·drain 수단이 검증되지 않으면 운영 전환 시작 금지.

검수 결론: 인증 방어선 재도입 위험·DDL 실행 순서·장애 표시의 설계 누락을 문서에 반영했다.
이는 코드/테스트/운영 전환 완료 표시가 아니다. 구현 재개 전에 이 보완 계약을 적용할 기준점부터 확인한다.


## 실행 기록 — 2026-09-10

작업 위치는 `/Users/sinhyeok/orca/workspaces/malmoi/sec-audit-2`, 브랜치는 `SinhyeokKang/credential-storage`다. 기준점은 origin/dev의 sec-audit-2 `dac4c97` 및 후속 검수 `40879ab` + feature-review(원본 `6922897`, rebase 후 `beeaeef`)다. 기존 초안은 stash `efde9dff863e25ae137b4a977481f4ead5ab38ed`에 보존했고 미커밋 구현을 그 위에서 이어갔다. 최신 dev 후속 검수는 작업 백업 stash `4c45a9b2d742d4d9686a4f2d4781b988bdfa8bb5`를 만든 뒤 rebase했고 코드·문서 충돌 없이 반영됐다. 공유 dev 작업 디렉터리는 변경하지 않았다.

### 수행 라운드

- **tdd:** 보존된 crypto/DTO 초안 테스트를 유지하고, 추가 계정 연결 방어·만료 세션 정리 누락을 red로 재현 후 복원했다. access/예외값 제거/key preflight·전환 계획/기본 check-only·finalize pending 계약도 import 또는 동작 red를 확인한 뒤 구현했다.
- **implement:** 세션 hash·User/초대 PII·token 암호화·lookup·DTO 소비자·전환/회전/재색인 도구를 연결했다. 순수 export/번역값/설치 토큰 경로는 변경하지 않았다.
- **code-review / refactor:** 불변식·원칙·타입경계·단순성 4관점 검수. URL query의 DB 대상 우회, 손상 암호문 재포장, refresh 전에 쓰기 키 미검증, 초대 retry 누락을 발견하고 각각 red→green. 같은 일회용 소비 패턴인 callback 코드 교환도 추가 회귀 후 preflight를 적용했다. 재검수에서 지적된 중대/수정권장 항목은 해소했다.
- **doc-check:** ARCHITECTURE·SAAS는 문서별 전담 검수, github-connect/design·credential 문서·env·sec-audit 후속 상태는 직접 대조했다. 저장 정책·준비 nullable·R1/R2 경계·로그 원문 제거를 맞췄다. 운영 완료 체크박스는 올리지 않았다.
- **postmortem:** URL 검증과 실제 드라이버 해석 차이, 일회용 토큰 소비 전에 저장 전제조건을 검사해야 하는 문제를 기록했다.

### 검증 증거

- `pnpm test`: 전체 **2,489개**(155 파일) 통과.
- `pnpm test:credentials:postgres`: **16개** 통과. 임시 Unix socket 전용 PostgreSQL 17을 생성·제거하며 공유 DB URL을 읽지 않았다.
- `pnpm typecheck`: 통과. `git diff --check` 통과. 빌드는 implement/refactor 규칙에 따라 수행하지 않았다.
- 실제 설치 Auth.js + 가짜 github/google OAuth 응답: 쿠키 원문/DB digest 분리, digest 쿠키 거부, 세션 연장·로그아웃, 만료 쿠키의 타 사용자 연결 방지, SessionTokenError 장애 신호 유지.
- 실제 DB: 동시 unique 가입·이메일 refresh, User 잠금의 계정 연결 경쟁, 삭제/갱신 및 만료 정리 경쟁, 저장 CAS, 첫 배치 중단 후 재개, PII/token 회전·부분 reindex·키 유실·pg_dump/psql 백업 복원.
- 실제 Prisma deploy: R1 완료 → legacy에서 R2 실패 → 실패 이력/미적용 DDL 대조 → rolled-back resolve → backfill → R2 재적용. 체크섬 변경·reset 없이 완료했다.
- 멤버·초대·번역자·SyncRun 소비자 전수 검색과 실제 DB DTO 검증. 타 프로젝트/원문·암호문·lookup 부재, 개별 손상의 오류 전파 확인.

### 남은 운영 게이트

**P2 공유 dev 적용, P7 실제 차단/재개, T11, T12는 미완료다.** 격리 DB 증거가 실제 서비스의 차단·drain·OAuth·키보드/포커스 검증을 대체하지 않는다. R2 staging과 최종 schema NOT NULL 변경도 실제 배송 단계에서 수행한다. 현재 credential 코드는 평문 DB에 곧바로 배포할 수 없다.

회원/초대/기존 GitHub 연결을 보존하려면 [운영 절차](./operations.md)에 따라 키·백업·전체 writer 차단을 준비한 뒤 전환해야 한다. 공유 dev/prod credential migration, 실제 데이터 backfill, 커밋·푸시·병합·배포는 이번 구현 라운드에서 수행하지 않았다.


## 후속 전체 세션 회수

같은 워크트리에서 sec-audit-2 #38 [session-revocation](../session-revocation/tasks.md)을 추가했다. 해시 세션 어댑터에 의존하며 새 스키마/환경변수는 없다. 이 후속의 자동 검증이 기존 R1/R2 운영 게이트나 실제 OAuth 게이트를 닫지는 않는다.
