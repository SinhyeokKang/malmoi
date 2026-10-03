# operator-account — 스펙

## 사용자

**개발자(나, 운영자)**. 번역 편집자에게 운영자 기능은 보이지 않는다. 다만 상한 우회로를 닫는 변경(아래 "상한이 걸리는 자리")은 모든 OWNER에게 닿는다 — 복원·OWNER 승격·OWNER 초대 수락이 상한에서 거부될 수 있다.

## 개념

**운영자(operator)** = 정적 allowlist로 지정된 **플랫폼 계정**. 프로젝트 역할(OWNER/EDITOR)이 아니다 — 어느 프로젝트의 무엇을 볼 수 있나는 지금처럼 `ProjectMember`가 정한다. 운영자 여부는 "이 사람이 Malmoi를 운영하는가"만 말한다.

운영자는 PRODUCT §3이 "실제 요구가 생기기 전까지" 미뤄 둔 **플랫폼 관리자의 최소형**이다. 실제 요구(아래 상한 마찰)가 생겨서 연다. 권한은 소비자가 생길 때마다 하나씩, **그때마다 PRODUCT 판정을 거쳐** 더한다(사용자 2026-10-03 — "리밋 제한 해제는 권한 중 하나일 뿐. 나중에 백오피스 같은 곳 자격증명 계정으로도 사용"). **이번 기능의 소비자는 하나다: 프로젝트 상한 면제.**

판정 함수는 둘이다 — 순수 판정 `parseOperatorEmails`(env 문자열 → 정규화한 주소 집합)와 DB 껍데기 `isOperatorUser(prisma, userId)`. 소비자는 `isOperatorUser`만 부른다.

**운영자는 이메일 주소 전체로 지정한다 — 계정 병합과 같은 기준이다**(사용자 2026-10-03). 이 앱은 정규화한 주소 하나를 한 사람으로 보고(GitHub·Google 로그인이 같은 주소면 한 `User`로 합쳐진다), 그 주소는 `User.emailLookup`(HMAC, unique)에 정확히 한 행이다. 그래서 운영자 판정은 로그인 수단과 무관하게 같은 사람을 가리킨다. **주소는 식별자일 뿐 역할이 아니다** — PRODUCT §3 "로그인 방식이 역할을 정하지 않는다"는 그대로다.

**선례와의 차이**: 2026-09-05에 지운 `AUTH_ALLOWED_LOGINS`(ARCHITECTURE "인증 경계")도 env allowlist였지만, 그것은 로그인을 **좁히는** AND 층이었다. 이것은 로그인·인가를 건드리지 않고 계정 축 쿼터 하나를 **넓히는** 면제다 — 지운 개념의 부활이 아니다.

## 문제 (관측된 사실)

- 사용자당 프로젝트 상한 `PROJECT_LIMIT = 3`(`lib/onboarding/create-plan.ts:16`)이 운영자 본인에게도 걸린다. 셈 조건은 `ownedActiveProjects`(`lib/onboarding-run/repos.ts:19` — OWNER 행 · 비보관).
- dev에서 운영자 계정의 활성 OWNER 자리는 상주 프로젝트 셋(`bugshot-i18n-test-qa` · `i18n-order-check` · `acme-web`, `guide/SHOOTING.md:44-45`)이 채우고 있다. 스크린샷·런타임 검증·roundtrip이 새 프로젝트를 만들 때마다 하나를 보관했다가 복원하는 왕복이 반복됐다(`guide/SHOOTING.md:152·167·171·176`).
- **상한이 생성에만 걸린다.** 복원(`runUnarchive`, `lib/projects/archive.ts:47-68`) · OWNER 승격(`changeMemberRole`, `lib/auth/members.ts:91`) · OWNER 초대 수락(`acceptInvitation`, `app/invite/actions.ts:99`)은 활성 OWNER 수를 다시 세지 않는다. 그래서 누구나 "보관 → 생성 → 복원"으로 활성 OWNER 프로젝트를 4개 이상 가질 수 있고, 이 동작은 PRODUCT·ARCHITECTURE 어디에도 의도로 적혀 있지 않다.
- 운영자를 가리키는 개념이 코드에 없다.

## 범위 게이트 (PRODUCT 판정 변경)

- **§3:57 "Viewer·Admin·Billing은 실제 요구가 생기기 전까지 만들지 않는다"** — 문장 자체를 개정한다: 운영자는 그 미뤄 둔 플랫폼 관리자의 최소형이고 이번 요구(상한 마찰)로 연다 · 프로젝트 역할 표(OWNER/EDITOR)는 그대로 둘이다 · 권한은 소비자마다 PRODUCT 판정을 거쳐 하나씩 늘린다. §3:199 "로그인 방식이 역할을 정하지 않는다" 옆에 "운영자 판정의 이메일 주소는 식별자일 뿐 역할이 아니다"를 단다.
- **§4.2 "자원 상한은 전부 고정값" · 계정 축(:351)** — 상한 값은 그대로 3이다. 계정 축 상한은 "자율 가입의 대가"이고 **운영자는 자율 가입자가 아니므로** 면제된다(플랜·과금이 아니므로 "플랜으로 갈리지 않는다"도 유지). 같은 bullet에 **상한이 걸리는 자리 넷**(생성 · 복원 · OWNER 승격 · OWNER 초대 수락)과 "이미 넘긴 상태는 유지된다"를 적는다.
- 사용자 확인: 2026-10-03("allowList로 관리할 듯. 정적 운영" · "리밋 제한 해제는 권한 중 하나일 뿐" · feature-review — §3:57 문장 개정 · 복원/승격/수락도 이번에 막는다 · prod에도 켠다 · 운영자 지정은 GitHub id가 아니라 병합 기준인 이메일 주소 전체).

## 대안 (기각)

- **dev 전체의 상한을 env로 올리기** — 상한 자체가 설정값이 되어 §4.2 "고정값"을 더 넓게 깨고, dev에서 비운영자의 `limit-reached` 검증을 못 하게 된다. allowlist가 더 좁은 해법이다.

## 완료 조건

### 운영자 판정

- C1. 환경변수 `OPERATOR_EMAILS`(쉼표로 구분한 **이메일 주소 전체**)에 든 주소가 `User`의 주소인 사용자가 운영자다. 판정은 `isOperatorUser` 하나다.
- C2. 환경변수가 비었거나 없으면 운영자는 0명이다(fail-closed — 지금과 같다). 형식이 틀린 항목(`@`가 정확히 하나가 아님 · 앞뒤가 빔 · 빈 조각)은 무시하고 나머지는 적용한다. 대소문자·앞뒤 공백은 병합과 같은 `normalizeEmail`이 접는다.
- C3. 판정은 **`User.emailLookup`** 으로만 한다 — env 주소를 병합·로그인과 같은 `lookupEmail`(스코프 `user`)로 HMAC해 그 사용자 행의 값과 견준다. 평문 `User.email`(봉투)을 복호해 비교하지 않고, 이름·`User.id`·로그인 `Account`로 하지 않는다(`User.id`는 DB마다 다르고 dev 리셋마다 바뀐다). **도메인 단위 지정은 없다** — 주소 전체가 정확히 일치해야 한다.
- C4. 조회가 실패하면(DB 오류) **던진다** — "운영자 아님"으로 접지 않는다(POSTMORTEM 2026-09-03). 호출부의 기존 실패 경로를 탄다(①은 `unavailable`, 생성은 선조회 실패, 트랜잭션 안이면 롤백).

### 상한이 걸리는 자리 (넷, 전부 같은 판정)

- C5. **생성** — ①의 리포 목록 코어 `listRepositories`(`lib/onboarding-run/repos.ts:49`) · 생성 코어 `createProjectFromRepo`(`lib/onboarding-run/create.ts:87`)의 선조회와 트랜잭션 안 재집계가 같은 판정을 쓴다. 코어에서 계산하므로 웹(`listConnectableRepos`·`createProject` Action)과 MCP(`list_repositories`·`create_project`)가 함께 따라온다.
- C6. **복원** — `runUnarchive`가 그 프로젝트의 **OWNER 전원**을 잠그고 다시 센다. 운영자가 아닌 OWNER 중 하나라도 복원 뒤 상한을 넘으면 거부한다(보관 상태 그대로). 웹 Action과 MCP `unarchive_project`가 같은 코어다.
- C7. **OWNER 승격** — `changeMemberRole`이 EDITOR→OWNER일 때 **대상자**를 잠그고 다시 센다. 대상자가 운영자가 아니고 상한이면 거부한다. 웹 Action과 MCP `change_member`가 같은 코어다.
- C8. **OWNER 초대 수락** — `acceptInvitation`이 role이 OWNER인 초대에서 **수락자**를 잠그고 다시 센다. 수락자가 운영자가 아니고 상한이면 거부하고, 초대는 소비되지 않는다(트랜잭션 롤백 — 보관한 뒤 다시 수락할 수 있다). EDITOR 초대는 세지 않는다.
- C9. **이미 상한을 넘긴 상태는 그대로 둔다** — 데이터를 고치지 않는다. 늘리는 요청만 거부하고, 보관은 언제나 된다.
- C10. 거부 문구는 `messages/en.tsx`를 지난다. 상한 숫자는 `PROJECT_LIMIT` 상수를 보간한다(운영자는 거부를 받지 않으므로 숫자는 계속 3이 참이다).

### 운영자 면제

- C11. **운영자는 C5~C8의 어느 자리에서도 상한에 걸리지 않는다.** 복원은 운영자가 아닌 OWNER만 센다.
- C12. 운영자가 아닌 사용자의 생성 경로 동작·문구(`limit-reached`, ①의 상한 안내)는 그대로다.
- C13. 운영자 여부는 화면에 표시하지 않는다(배지·문구·메뉴 없음). 프로젝트 권한(`ProjectMember` 인가)은 운영자라고 늘지 않는다 — 남의 프로젝트를 보거나 고칠 수 없다.

### 환경·문서

- C14. `.env.example`에 변수 · 형식 · fail-closed · "프로젝트 역할이 아니다" 주석. dev(로컬·Preview)와 Production 값 넣기·확인 절차가 OPERATIONS에 있다. 확인은 한 문장으로 고정한다: "OWNER 활성 3개 상태에서 `/projects/new` ①이 리포 목록을 보이면 적용, `Project limit reached`면 주소 오기(로그인한 계정의 주소와 철자 대조)". 값이 개인정보라는 것(Sensitive로 넣는다)도 같은 절에 둔다.
- C15. PRODUCT §3:57·§3:199·§4.2 계정 축 · 상한 3에 기댄 근거(:366), ARCHITECTURE(§0 불변식 7 단서 · §3.1 · §5.6.4 · `ProjectMember` 인덱스 근거(:1384) · 인증 경계 표에 운영자 판정 행), OPERATIONS, DIRECTORY(`lib/operator/`), 가이드 `guide/reference/limits.md`(복원·승격·수락의 상한 — **운영자는 쓰지 않는다**)와 일치한다. **CLAUDE.md는 고치지 않는다** — 자격증명 셋 표는 바뀌지 않고 운영자 판정의 정본은 ARCHITECTURE다. `pnpm gate` green.

## 알려진 대가

- MCP `create_project`도 면제되므로, 운영자의 개인·OAuth 토큰이 새면 상한 없는 생성이 가능하다.
- 운영자 주소가 Vercel env에 평문으로 든다 — 본인 주소라 방침 판정은 바뀌지 않는다(이미 `User.email`로 저장되는 값이다).
- 이메일 lookup 키(`EMAIL_LOOKUP_KEY`)를 회전하는 도중 저장값이 아직 옛 키면 운영자가 일시적으로 비운영자로 판정된다(fail-closed — 회전이 끝나면 돌아온다).
- prod에 값이 서면 상한에 닿은 사용자의 해당 요청마다 `Account` 조회가 하나 붙는다.

## 비목표

- **백오피스·운영 화면** — 그 기능이 올 때 자기 `/feature`에서 정한다(세션 공급자 한정·운영자 행동 기록 포함).
- **권한 표·capability 플래그·관리 UI** — 소비자가 하나뿐인데 권한 목록을 만들면 확장 선반영이다.
- **운영자에게 프로젝트 접근을 더 주는 것**(남의 프로젝트 열람·수정) — 인가는 `ProjectMember` 하나다.
- **`PROJECT_LIMIT` 외 모든 상한의 면제**(프로젝트당 멤버 10 · 초대 메일 시간당 상한 · 첫 적재 예산 · push 상한 등) — 필요해지면 그때.
- **도메인 단위 지정** — 그 도메인의 동료(초대받는 번역 편집자)까지 운영자가 되고, 퇴사 뒤에도 GitHub에 검증 상태로 남은 회사 주소로 로그인한 사람이 운영자로 판정된다.
- **DB 저장 allowlist·스키마 변경** — 정적 운영이다.
- **이미 상한을 넘긴 사용자의 정리** — C9.
- **OWNER 초대 발급 시점의 상한 안내** — 거부는 수락 시점에만 한다(발급 시점엔 수락자의 상태를 확정할 수 없다).
