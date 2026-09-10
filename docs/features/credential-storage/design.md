# 자격증명·회원 정보 저장 보호 — 기술 설계

> [스펙](./spec.md) · [태스크](./tasks.md)

## 1. 변경 경계

`auth.ts`의 PrismaAdapter를 명시적인 래퍼로 감싸 세션 CRUD·User CRUD/조회와 로그인 `linkAccount`를 변경한다. GitHub App 연결은 Auth.js 어댑터를 거치지 않으므로 `app/api/github/callback/route.ts`와 `lib/github-connect/token-store.ts`에도 저장 경계를 적용한다. Prisma 전역 middleware로 모든 문자열을 변환하지 않는다.

편집 UI 인증과 GitHub 연결을 이용하는 생성·탐지가 영향받는다. push bearer 검증, installation 토큰을 쓰는 pull, 번역 export는 그대로다. 새 화면은 없다.

## 2. 세션 해시 어댑터

저장 형식은 `sha256:v1:<64자리 소문자 hex>`이며 digest 입력은 UTF-8 `malmoi/session/v1\0` + 원문이다. 새 원문은 `randomBytes(32)`의 base64url 문자열로 생성한다. 고엔트로피 bearer의 일치 조회이므로 비밀번호 KDF나 복호화 키는 필요 없다.

| 메서드 | DB 계약 | Auth.js 반환 계약 |
|---|---|---|
| createSession | 원문을 해시해 저장 | 반환 sessionToken은 입력 원문 |
| getSessionAndUser | 입력을 항상 해시해 조회; `expires <= now`이면 null | 유효할 때만 원문을 가진 내부 세션 반환 |
| updateSession | digest와 `expires > now` 조건으로 expires만 갱신; upsert 금지 | 해당 행이 없으면 null, 있으면 입력 원문 반환 |
| deleteSession | digest로 삭제; 없는 행은 멱등 처리 | 반환이 필요하면 입력 원문으로 복원한 내부 세션 |

입력이 해시 형식처럼 보여도 **반드시 다시 해시**한다. 접두어를 보고 DB 해시를 그대로 조회하면 덤프가 다시 bearer가 된다. 갱신 결과 조회 사이에 삭제된 행도 복구하지 않는다.

설치된 `@auth/core@0.41.3`은 OAuth 콜백에서 어댑터가 반환한 sessionToken을 쿠키에 쓴다. DB digest를 그대로 반환하면 로그인 계약이 깨진다. 반대로 내부 원문 객체가 공개 session callback/event 로그에 실리지 않도록 기존 `publicSession` 허용 목록과 로그 제한을 검증한다.

`getSessionAndUser`에서 직접 만료를 검사하므로 일반 세션 조회뿐 아니라 OAuth 콜백에도 적용된다. DB 예외는 null로 삼키지 않는다. `readSession`의 `SessionTokenError` → unavailable 경로를 보존한다. 유효 세션의 추가 OAuth 계정 연결 금지는 별도 수정이다.

## 3. GitHub App 토큰 암호화

Node `node:crypto`의 AES-256-GCM을 사용한다. 키 32바이트, 암호화마다 CSPRNG nonce 12바이트, tag 16바이트를 강제한다. access와 refresh는 각각 새 nonce를 사용한다.

저장 envelope는 `enc:v1:<kid>:<nonce>:<ciphertext>:<tag>`다. 바이너리는 padding 없는 canonical base64url, kid는 `[A-Za-z0-9_-]{1,32}`로 제한한다. 파서는 필드 수·버전·인코딩·바이트 길이를 엄격히 검사한다. nullable refresh는 NULL 그대로 보존한다.

AAD는 고정 순서 문자열 배열의 JSON UTF-8 바이트다:
`["malmoi/github-app-token", "v1", kid, userId, provider, providerAccountId, column]`.
`column`은 `access_token` 또는 `refresh_token`이다. 구분자 결합 대신 배열 인코딩으로 모호성을 없앤다. 소유자나 컬럼이 다르면 복호화되지 않는다. 같은 행의 과거 암호문을 재주입하는 rollback 공격까지 막는 설계는 아니다.

`decipher.final()`의 tag 검증 성공 전에는 어떠한 평문도 호출자에게 반환하지 않는다. 알 수 없는 버전·키, 인증 실패, 평문 입력은 오류다. 자동 평문 fallback이나 자동 삭제/연결 해제는 없다. 서버에는 정해진 오류 코드만 기록하고 토큰·암호문·키·외부 인증 응답 전체를 남기지 않는다.

### 읽기와 쓰기

- callback의 create/update/replace 모두 암호화한 토큰 쌍을 하나의 DB 쓰기에 담는다. 갱신 조건에는 계정 복합키와 현재 userId를 포함한다. 조회 뒤 소유자가 바뀌면 0건으로 실패시키고 타인 행을 덮지 않는다(감사 33번 관련).
- token-store 조회에는 providerAccountId를 포함한다. 원문은 서버의 GitHub 호출 직전에만 복호화하고 외부 반환형에 추가하지 않는다.
- refresh CAS 조건은 **조회한 refresh 암호문 원본 + 복합키 + userId**다. 복호화한 값을 다시 암호화해 비교하지 않는다. 성공한 access/refresh 쌍과 expires_at을 함께 갱신한다.
- CAS 실패 시 현재 행을 재조회해 승자의 토큰을 사용한다. 삭제/소유자 변경이면 실패하고 재생성하지 않는다. 외부 refresh 호출을 DB 트랜잭션 안에서 기다리지 않는다.
- 키/복호화 오류는 unavailable로 분류한다. 공급자가 토큰을 거절한 경우의 reauthorize와 구분하고, 장애를 사용자 재연결로 해결하도록 안내하지 않는다.

## 4. 로그인 OAuth 토큰 최소화

Auth.js adapter `linkAccount`에서 `github`·`google`에 대해 식별 필드(`userId`, `type`, `provider`, `providerAccountId`)만 저장한다. 기존 access_token·refresh_token·id_token은 전환 작업에서 NULL로 만든다. 공급자가 인증하는 동안 쓰는 응답을 조기에 제거하지 않고 **DB 저장 경계에서만** 제거한다. 검증된 이메일 저장 규칙은 유지한다.

이 어댑터는 등록된 로그인 provider만 허용한다. `github-app`은 별도 연결 경로가 암호화해서 쓴다. 전체 OAuth 응답이나 인증 라이브러리 객체를 spread해서 저장하지 않는다.

## 5. 순수 함수와 I/O 분리

| 대상 | 계약/테스트 |
|---|---|
| hashSessionToken(raw) | 고정 입력 → 고정 digest; digest 입력도 재해시 |
| isSessionValid(expires, now) | 경계 시각 포함 만료 판정 |
| loginAccountData(account) | 식별 필드 allowlist, 비밀 필드 배제 |
| parseKeyring / parseEnvelope / encodeAAD | 엄격한 형식, 길이, 키 ID·컨텍스트 검증 |
| encryptToken(plain, context, key, nonce) / decryptToken | 명시적 입력의 순수 암호 변환, 변조와 컨텍스트 교환 실패 |
| planCredentialMigration(row) | provider/형식별 encrypt·clear·keep·reject 판정 |

nonce 생성·env 읽기·현재 시각·DB·GitHub는 껍데기에 둔다. 테스트용 고정 nonce는 순수 함수 fixture에서만 쓰며 실제 저장 경로는 매 호출 `randomBytes`를 사용한다. 서버 전용 경계로 클라이언트 import를 차단한다.

## 6. 키와 환경변수

- `TOKEN_ENCRYPTION_KEYS`: JSON 객체 `{ "<kid>": "<base64 32-byte key>" }`.
- `TOKEN_ENCRYPTION_ACTIVE_KEY_ID`: 새 암호문에 사용할 등록된 kid.

독립 난수 키를 사용하고 AUTH_SECRET·App 개인키·DB 비밀번호에서 유도하거나 재사용하지 않는다. prod와 dev는 서로 다른 키를 사용한다. Preview와 로컬이 같은 dev DB를 읽을 때는 dev keyring을 사용한다. `NEXT_PUBLIC_` 변수는 금지한다.

키는 DB/소스와 분리된 서버 비밀 설정 및 접근 제한된 복구 저장소에서 관리한다. `.env.example`에는 빈 자리와 형식 설명만 쓴다. env는 실제 토큰 저장/읽기 시 지연 로드하고 빌드 시점에 강제하지 않는다. 운영 전환의 preflight는 키 구성을 미리 검증한다. 잘못된 토큰 키는 GitHub 연결을 fail-closed한다. 세션 해시 자체는 암호화 키에 의존하지 않지만, 사용자 정보를 반환하는 로그인·세션 조회에는 아래 개인정보 키가 필요하다. 해당 키 오류는 unavailable이다.

## 7. 스키마와 전환 — 두 단계

§9의 이메일 조회 컬럼·인덱스를 nullable로 추가하는 additive DDL을 먼저 적용한다. 이후 차단 구간에서 backfill·개인정보 암호화·세션 삭제와 제약 전환을 수행한다. **컬럼 의미 변경과 기존 이메일 인덱스 제거는 파괴적 전환**이므로 일반 코드 rollback으로 되돌릴 수 없다. 기존 평문 컬럼을 복사본으로 남기지 않는다.

1. **준비:** 새 코드·전환 도구·키·dev 리허설을 준비한다. 기존 배포는 아직 기존 데이터만 읽는다. 기본 실행은 check-only이며 대상 DB와 provider별 건수·형식·오류 건수만 출력한다. 토큰 값은 출력하지 않는다. 사용자별 github-app 중복, 알 수 없는 provider의 비밀 값, 손상 envelope는 자동 정리하지 않고 전환을 중단한다.
2. **차단 후 전환:** 이전 배포 URL·OAuth callback을 포함한 회원/초대/편집 읽기까지 포함한 전체 앱 트래픽을 차단하고 진행 중 요청을 종료한다. 차단을 검증하지 못하면 시작하지 않는다. 명시적 apply로 기존 평문 세션을 삭제하고, 로그인 토큰을 지우며, github-app 토큰과 회원/초대 개인정보를 암호화하고 HMAC 인덱스를 채운다. §9의 제약 변경과 검증을 끝낸 뒤 새 코드만 활성화하고 요청을 재개한다.

도구는 dev 기본 명령과 prod 전용 명령을 분리하고 기존 DIRECT_URL/DIRECT_URL_PROD 대상 분리 원칙을 따른다. DB URL이나 비밀을 CLI 인자로 전달하지 않는다. DB 쓰기는 읽었던 값·복합키·소유자를 조건으로 하고, 충돌/실패 시 서비스 차단을 유지한다. 배치별 완료 후 재실행할 수 있다.

재실행은 검증된 envelope를 복호화 검증 후 유지하고, 새 해시 세션은 유지한다. 최초 전환 전에는 기존 모든 세션이 평문이므로 전부 만료된다. 전환 후 평문 신규 쓰기 발견은 옛 writer가 살아 있다는 오류이며 정상 운영에서 자동 수용하지 않는다. 데이터 변경 동안 GitHub API를 호출하거나 expires_at을 임의 연장하지 않는다.

검증 실패 시 평문 코드로 rollback하지 않는다. 암호문/해시를 이해하는 이전 안전 릴리스와 필요한 keyring으로 복구하거나 차단 상태에서 전진 수정한다. 기존 DB 백업 복원 시에도 요청 재개 전 전환 검사를 다시 수행한다. 과거 평문 백업의 접근·보존 정책은 별도로 점검한다.

### 키 회전과 키 유실

토큰 키 회전도 연결 요청을 차단하고 진행 중 refresh를 종료한 상태에서 수행한다. 온라인 재암호화가 refresh의 ciphertext CAS를 먼저 바꾸면 공급자가 갱신한 토큰을 저장하지 못할 수 있기 때문이다.

새 키를 keyring에 추가 → 차단·drain → 새 키로 재암호화(CAS, expires 유지) → active kid 변경 배포 → 전체 복호화·이전 kid 0건 확인 → 재개 순서다. 부분 실패 시 두 키를 보유한 채 재실행한다. 세션 해시는 키 회전의 영향이 없다.

이전 키는 현 DB 전환뿐 아니라 보존 중인 암호화 백업의 복구 필요도 확인한 뒤 폐기한다. 키가 영구 유실되면 해당 GitHub 연결은 복구할 수 없으므로 별도 운영 절차로 연결을 제거하고 재연결해야 한다. 이를 자동 장애 복구로 실행하지 않는다. 키/토큰 유출 사고에서는 DB 재암호화만 하지 말고 공급자 측 토큰 폐기도 수행한다.

## 8. 불변식·과거 함정·근거

번역 값 소유권·export 결정성·blob SHA에는 영향이 없다. 암호문은 매번 달라지는 것이 의도이며 번역 export 입력에 넣지 않는다. 로그인/연결/installation 세 자격증명 경계와 요청마다 ProjectMember를 읽는 인가도 유지한다.

[POSTMORTEM](../../POSTMORTEM.md)의 2026-08-31 env 조기 평가, 2026-09-05 검증과 저장의 불일치, 2026-09-06 세션 장애를 비로그인으로 오인·사용자 연결 범위 누락, 2026-09-09 JSX 마스킹만으로 RSC 원문이 남은 사례를 회귀 조건으로 삼는다. 보호는 DB writer와 직렬화 경계에 있어야 한다.

외부 근거: [OWASP Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)는 저장 최소화, 인증 암호 모드, 키와 데이터 분리를 권고한다. 실제 암호 API는 [Node 24 crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html)의 GCM AAD·auth tag·final 검증 계약을 따른다. envelope·AAD·전환 절차는 이 저장소를 위한 설계 결정이다.

## 9. 회원·초대 개인정보 암호화

### 컬럼과 인덱스

| 테이블 | 최종 저장 | 제약 |
|---|---|---|
| User | 기존 email/name/image 컬럼을 개인정보 키로 암호화; name/image NULL 보존 | email의 기존 unique 제거 |
| User | `emailLookup String` = 버전·키 ID·HMAC digest | NOT NULL + unique |
| ProjectInvitation | 기존 email 컬럼을 개인정보 키로 암호화 | 기존 `(projectId,email)` 인덱스 제거 |
| ProjectInvitation | `emailLookup String` | NOT NULL + `(projectId,emailLookup)` 일반 인덱스 |

초대 조회 인덱스는 unique가 아니다. 수락·만료 이력을 남기고 같은 사람을 다시 초대하는 기존 계약을 유지한다. 무작위 암호문의 unique로 이메일 중복을 판정하지 않는다.

준비 DDL은 두 emailLookup 컬럼을 nullable로 추가하고 새 인덱스를 추가한다. 차단 전환에서 평문 이메일로 중복/정규화 충돌을 사전 검사하고, 각 행의 암호문과 lookup을 함께 쓴다. NULL·복호화 실패·lookup 불일치 0을 확인한 뒤 NOT NULL 적용 및 옛 인덱스 제거 SQL을 수행한다. 모든 SQL은 `/db` 절차에서 생성·검토하며 이 feature 단계에서는 생성/실행하지 않는다. 수정된 Prisma 모델에서 더 이상 `findUnique({email})`를 호출할 수 없도록 해당 unique 선언도 제거한다.

### 키 분리와 검색

새 환경변수는 `PII_ENCRYPTION_KEYS`(kid→base64 32-byte key JSON), `PII_ENCRYPTION_ACTIVE_KEY_ID`, `EMAIL_LOOKUP_KEY`(base64 32-byte 독립 난수), `EMAIL_LOOKUP_KEY_ID`다. 앞의 TOKEN 변수 둘과 합쳐 총 6개다. 토큰 암호화·개인정보 암호화·조회 키는 독립이며 환경 간 분리한다.

개인정보 envelope 형식과 GCM 파서는 §3을 재사용하지만 키 저장소와 AAD 도메인은 분리한다. AAD는 `["malmoi/pii", "v1", kid, table, rowId, field, projectIdOrNull]`의 JSON UTF-8 바이트다. User는 마지막 원소가 null, 초대는 실제 projectId다. 신규 행 ID는 서버에서 먼저 생성하고 그 ID로 AAD와 DB create를 구성한다(Prisma String ID에 UUID 허용). 기존 ID는 보존한다. 서로 다른 행/컬럼/프로젝트로 복사하면 복호화가 실패해야 한다.

lookup은 `hmac:v1:<keyId>:<64자리 hex>`다. Node HMAC-SHA-256으로 JSON 배열 `["malmoi/email-lookup", "v1", scope, normalizedEmail]`을 인증한다. User의 scope는 `user`, 초대는 `invitation:<projectId>`다. 같은 주소라도 테이블 및 프로젝트 간 digest가 다르다. 단순 SHA-256(email), 암호화 키 재사용, 결정적 AES-GCM nonce는 금지한다.

정규화는 기존 `normalizeEmail`만 사용한다. 조회 후 복호화한 이메일도 정규화 입력과 일치하는지 검사한다. 불일치/손상은 데이터 오류로 중단하고 사용자 자동 생성·병합으로 넘기지 않는다. 로그인/초대 이메일 변경은 암호문과 lookup을 같은 쓰기로 갱신한다. unique 충돌은 기존 중복 이메일 거부 의미로 처리한다.

인덱스는 정확 일치만 지원한다. 부분 검색·정렬에는 쓰지 않는다. 현재 초대 목록의 `orderBy: {email:"asc"}`는 프로젝트로 좁힌 행을 서버에서 복호화한 뒤 기존 이메일 순서와 ID tie-break로 정렬하고 마스킹한다. 이후 페이지네이션이 생기면 암호문 순 정렬로 대체하지 말고 별도 설계한다.

### Auth.js와 직접 Prisma 경로

PrismaAdapter를 spread하고 세션만 바꾸면 기본 User 메서드가 암호문을 반환하므로 불충분하다. `createUser`, `updateUser`, `getUser`, `getUserByEmail`, `getUserByAccount`, `getSessionAndUser`와 사용자 객체를 반환하는 `deleteUser`까지 명시적으로 감싼다. AdapterUser는 신뢰된 서버 경계 안에서만 평문으로 복원한다. 업데이트에서 undefined는 유지, nullable 필드의 null은 제거로 구별한다. emailVerified를 OAuth 소유권 검증의 근거로 승격하지 않는다.

Auth.js 밖의 아래 경로도 서버 전용 저장 접근 함수로 모은다. DB 모델과 복호화 DTO 타입을 나누고 불필요한 필드를 복호화/반환하지 않는다.

| 현재 경로 | 변경 계약 |
|---|---|
| auth.ts signIn 이메일 refresh | 현재 이메일 복호화·새 주소 lookup 중복 검사·암호문/lookup 원자 갱신 |
| projects/actions.ts 초대 발급 | 회원 lookup 조회, 프로젝트 범위 초대 lookup으로 이전 미수락 초대 만료, 새 초대 암호화 |
| invite/actions.ts 수락 | 인증된 회원과 토큰으로 찾은 초대 복호화 후 기존 소유권 판정; HMAC만으로 인증하지 않음 |
| invite/[token]/page.tsx | 토큰·상태 검사 후 서버에서 복호화 및 마스킹 |
| lib/auth/query.ts | 멤버·초대·초대한 사람의 필요한 필드만 복호화; 기존 maskedEmailLabels 적용 |
| lib/keys/query.ts loadActors | 인가된 번역 행에서 수집한 ID만 조회, 서버 표시 라벨로 변환 |
| account/page.tsx 및 publicSession | 본인에게 허용된 기존 필드만 반환; envelope/lookup은 제외 |

새로 추가되는 SyncRun 등의 actor 조회도 같은 접근 함수를 쓰는지 구현 시 전체 검색으로 확인한다. 이메일·이름을 새 로그 스냅샷 컬럼에 평문으로 복제하지 않는다. DB raw row를 RSC props로 넘기거나 Prisma 오류의 인자 값을 기록하지 않는다. 개인정보 복호화 실패는 로그인 필요가 아니라 unavailable로 분류한다.

### 전환·회전·복구

모든 회원·초대 행(만료/수락 포함)을 전환한다. 세션만 만료시키며 기존 초대 토큰과 사용자/프로젝트 ID는 보존한다. 전환 재실행은 envelope와 lookup을 함께 검증하고 정상 행을 건너뛴다. 암호문인데 lookup이 없으면 키로 복호화해 재계산하고, 평문처럼 보이는 손상 암호문은 자동 수용하지 않는다.

개인정보 키 회전은 전체 앱 트래픽을 차단한 상태에서 수행하고 lookup은 바꾸지 않는다. 검색 키 회전은 별개다: 차단·진행 중 요청 종료 → 전체 User/초대 이메일 복호화 → 새 키로 lookup 전건 재계산 → unique/NOT NULL/키 세대 및 건수 검증 → 새 키 설정으로 배포 → 재개. 중간 실패는 차단 상태에서 재실행하며, 서비스 중 두 키 세대의 unique 인덱스를 섞지 않는다. 이 때문에 온라인 dual-key 조회는 만들지 않는다.

개인정보 키가 유실되면 이메일·이름도 복구할 수 없다. 토큰 재연결과 달리 재로그인으로 기존 회원을 임의 재생성하지 않는다. 키 백업을 복구할 때까지 인증·표시를 unavailable로 유지한다. 키/DB 백업 쌍의 실제 복원 시험을 전환 완료 조건에 포함한다. 검색 키만 유실됐다면 개인정보 키로 이메일을 복호화하여 새 검색 키로 전건 재색인할 수 있다.

### 추가 순수 함수와 근거

`emailLookup(normalizedEmail, scope, key, keyId)`, `encodePiiAAD`, `encrypt/decryptPiiField`, `encode/decodeUser`, `planPiiMigration`을 테스트 우선 대상으로 추가한다. 공급자 검증은 기존 함수, 정규화는 기존 계약을 재사용한다.

검색용 인덱스의 별도 키·도메인 분리와 동일 값 노출이라는 한계는 [CipherSweet의 보안 모델](https://ciphersweet.paragonie.com/security)과 [키 계층 설명](https://ciphersweet.paragonie.com/internals/key-hierarchy)을 참고했다. 이 설계는 해당 라이브러리/프로토콜을 구현한다고 주장하지 않으며, 이 저장소의 정확 일치·DB unique 요구를 위한 전체 길이 HMAC을 사용한다.
