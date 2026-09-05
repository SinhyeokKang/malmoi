# tenant-auth 정적 감사 — Codex, 2026-09-06

**즉시 수정 2건 · 수정 권장 7건. tenant-auth 완료 판정 전에 세션 토큰 노출과 마지막 OWNER 경합을 닫아야 한다.**

실행 재현은 하지 않았다. 아래는 애플리케이션·테스트·설치된 Auth.js/Next.js/Prisma 드라이버 소스를 대조한 결과다. 실제 배포의 HTTP 응답, DB 동시 실행, 연결 수는 이번 감사에서 측정하지 않았다.

## 범위와 기준

- 체크아웃: `/Users/sinhyeok/code/malmoi`, `dev`.
- 코드 기준: `ef53034` — tenant-auth 도입 `62edf2a`와 일회성 backfill 제거까지. 착수 시 미커밋·미푸시 변경 없음.
- 감사 도중 다른 세션이 `171db5f`를 추가했다. `POSTMORTEM.md` 40줄 추가뿐이며 코드 기준은 동일하다. 새 회고도 읽고 반영했다.
- 비교 범위: `935d3f6..ef53034`. 앱·라이브러리·스키마·의존성·환경변수 예제의 변경은 55파일, +4,070/-453. 여기에 기존 DB 연결·Publish·GitHub·CI 연결 경로를 추적했다. 어댑터 엔진 전체를 새로 감사한 보고서는 아니다.
- 기준: `CLAUDE.md`, `docs/SAAS.md` §5·§8·§9, `docs/ARCHITECTURE.md`, 닫힌 PoC 계약 `docs/MVP.md`, `docs/features/tenant-auth/{spec,design,tasks}.md`, `docs/POSTMORTEM.md`.
- 방법: `source-command-code-review`로 변경과 과거 회귀를 대조하고, `source-command-audit`의 불변식·원칙·경계·부채 네 관점으로 확장했다. 전문 에이전트 3개와 메인 검토를 합치고 중복을 제거했다.
- 코드 수정·빌드·typecheck·test·DB/API 쓰기·커밋·푸시는 하지 않았다. 이 보고서 파일만 새로 작성했다.

## 발견

### 1. 🔴 P1 [boundary] 원문 세션 토큰이 클라이언트 응답에 실린다

위치: [auth.ts:139](/Users/sinhyeok/code/malmoi/auth.ts:139).

`session` 콜백은 `session.user.id`만 추가하고 입력 객체를 그대로 반환한다. DB 세션에서 이 객체는 공개용 세션이 아니라 `sessionToken`을 포함한 DB 행이다. 로그인된 브라우저가 `/api/auth/session`을 조회하면 HttpOnly 쿠키와 같은 인증 토큰을 JSON으로 읽을 수 있다. 화면은 정상으로 보여 누출을 알 수 없다. 같은 출처에서 실행되는 스크립트에 대해 HttpOnly가 제공하던 토큰 읽기 차단이 무효가 된다.

설치 소스 근거:

- `node_modules/@auth/prisma-adapter/index.js:24`: `getSessionAndUser`가 Session 전체를 조회하고 `user`만 분리한다.
- `node_modules/.pnpm/@auth+core@0.41.3/node_modules/@auth/core/lib/actions/session.js:94`: `{ ...session, user }`를 콜백에 전달하고 104행에서 반환값을 응답 본문에 넣는다.
- 같은 패키지 `lib/init.js:20`: 기본 콜백은 이름·이메일·이미지·만료만 선택하지만 현재 설정이 이를 대체한다.

제안: 응답을 `user.id/name/email/image`와 `expires`의 허용 목록으로 새로 구성하고, DB 세션 토큰이 응답에 없는 것을 검증한다.

### 2. 🔴 P1 [principle] 동시 제거·강등으로 마지막 OWNER가 사라진다

위치: [projects/actions.ts:114](/Users/sinhyeok/code/malmoi/app/(edit)/projects/actions.ts:114), 같은 파일 126행.

OWNER A/B가 있을 때 각자 자신을 제거하거나 EDITOR로 강등하는 요청을 동시에 보낸다. 두 요청이 모두 OWNER 2명인 목록을 읽으면 `planMemberChange`가 둘 다 통과시킨다. 이후 서로 다른 행을 쓰므로 `deleteMany`/`updateMany`의 `count`는 각각 1이고 두 응답 모두 성공한다. 최종 OWNER는 0명이며 남은 멤버는 관리 권한을 얻을 수 없다. FK의 `Restrict`는 멤버 행 직접 삭제나 역할 변경을 막지 않는다.

현재 count 검사는 같은 대상을 먼저 삭제한 경합만 처리한다. `SAAS.md` §5.6의 “항상 OWNER 한 명 이상”은 보장하지 못한다.

제안: 프로젝트 단위로 OWNER 수 판정과 변경을 직렬화하고, 서로 다른 OWNER를 동시에 제거·강등하는 경우를 검증한다.

### 3. 🟡 P2 [boundary] 수락 중 만료·회전된 초대가 이전 권한으로 살아난다

위치: [invite/actions.ts:70](/Users/sinhyeok/code/malmoi/app/invite/actions.ts:70).

만료 검사는 43행의 사전 조회 결과로만 한다. 실제 토큰 소비 조건은 `id`와 `acceptedAt: null`뿐이다. 이전 OWNER 초대의 수락 요청이 사전 검사를 통과한 뒤, 관리자가 EDITOR 초대를 재발급해 이전 행을 만료시켜도 진행 중인 요청은 이전 토큰을 소비하고 OWNER 멤버십을 만든다. 자연 만료 시각을 지나서 소비하는 경우도 같은 조건을 통과한다.

제안: 토큰을 소비하는 조건부 쓰기에도 현재 유효기간을 포함하고, 조건 불일치 사유를 정상 거부 응답으로 처리한다.

### 4. 🟡 P2 [boundary] 동시 초대 발급이 유효 토큰을 여러 개 남긴다

위치: [projects/actions.ts:66](/Users/sinhyeok/code/malmoi/app/(edit)/projects/actions.ts:66), 같은 파일 73행.

이전 초대 만료와 신규 생성이 분리돼 있다. 같은 프로젝트·이메일에 대한 두 발급 요청이 각각 `updateMany`를 끝내고 각각 `create`하면 유효 토큰이 둘 남는다. 역할이 다르면 이전 OWNER 링크와 새 EDITOR 링크가 함께 유효할 수 있다. 한 링크로 가입한 멤버를 제거한 뒤 다른 미소비 링크로 다시 들어오는 경로도 생긴다. `@@index([projectId, email])`는 이를 막는 제약이 아니다.

제안: 같은 프로젝트·초대 대상의 회전을 직렬화한다. 단순히 두 쓰기를 기본 격리 수준 트랜잭션에 넣는 것만으로는 기존 행이 없는 동시 발급을 막지 못한다.

### 5. 🟡 P2 [boundary] provider 이메일을 변경하면 새 주소의 초대를 수락할 수 없다

위치: [auth.ts:124](/Users/sinhyeok/code/malmoi/auth.ts:124), [invite/actions.ts:35](/Users/sinhyeok/code/malmoi/app/invite/actions.ts:35).

GitHub primary 이메일 A로 가입한 뒤 검증된 primary를 B로 변경하고 재로그인해도 `User.email`은 A로 남는다. 초대 수락은 DB 이메일만 읽으므로 B로 받은 링크를 계속 `email-mismatch`로 거부한다. 현재 primary로 초대하라는 운영 안내로 해결되지 않는다. 반대로 A를 제거·재할당한 뒤에도 A 초대 링크를 소지하면 오래된 이메일 대조를 통과한다.

설치된 Auth.js `lib/actions/callback/index.js:64`는 기존 DB 사용자를 `signIn`에 넘기며, `handle-login.js:179`의 기존 Account 로그인은 `updateUser` 없이 세션을 반환한다. 현재 주석도 재로그인 재검증이 없음을 인정하므로, 단순히 콜백 주석을 고칠 문제가 아니다.

제안: 기존 사용자도 최신 provider 검증 이메일이 초대 대조까지 도달하게 한다. 이메일 충돌 처리와 계정 자동 병합 금지는 함께 유지해야 한다.

### 6. 🟡 P2 [debt] 쿠키가 사라진 뒤 blur 저장은 인라인 거부 경로에 도달하지 못한다

위치: [middleware.ts:22](/Users/sinhyeok/code/malmoi/middleware.ts:22), [translation-input.tsx:48](/Users/sinhyeok/code/malmoi/components/translation-input.tsx:48).

다른 탭에서 로그아웃하거나 브라우저 세션 쿠키가 만료된 상태로 열린 번역 셀을 저장하면, Action POST도 `/projects/:path*`에 걸려 `/`로 307된다. Action의 `{ ok: false, error: "unauthorized" }` 응답까지 가지 못한다. Next의 Action 응답 처리에서 일반 오류가 발생하며 컴포넌트에는 catch가 없어 한국어 인라인 안내와 입력 유지 계약이 깨진다.

설치 소스 근거: Next `server-action-reducer.js:74`는 현재 URL로 POST하고, 140행에서 비RSC 응답을 거부한다. `action-handler.js:499`는 다른 worker로 전달하며 전달 요청은 `redirect: "manual"`이고 비RSC 결과는 JSON `{}`로 접힌다. 기존 `.next/server/server-reference-manifest.json`에서도 `saveTranslation` worker가 번역 페이지 하나인 것을 확인했다. 이번에 새 빌드를 만들거나 브라우저 재현을 실행한 것은 아니다.

`tasks.md`의 수동 검증은 DB Session 행 삭제로 쿠키가 남은 경우였다. 쿠키 자체가 사라지는 경우는 그 검증과 다르다.

제안: Server Action POST는 자체 인증 판정까지 도달하게 하고, 쿠키 소실과 DB 세션 회수를 각각 검증한다.

### 7. 🟡 P2 [boundary] Publish가 라이브러리 오류 원문을 편집자에게 반환한다

위치: [actions.ts:104](/Users/sinhyeok/code/malmoi/app/(edit)/actions.ts:104).

`triggerPullAction`은 `error.message` 또는 `String(error)`를 그대로 직렬화한다. 인가가 완료된 뒤 DB/GitHub 호출이 실패하면 라이브러리 진단이 EDITOR 응답과 `pullMessage`의 화면 문구로 노출된다. 같은 `triggerPull`을 부르는 `/api/pull`은 `classifyFailure`로 자체 메시지와 외부 오류를 구별하지만 Action은 그 보호를 우회한다.

DB 호스트·사용자 등 운영정보가 노출될 수 있는 경계다. 이번 감사에서 실제 토큰·PEM·비밀번호가 담긴 오류를 관측한 것은 아니므로 자격증명 유출로 단정하지 않는다. tenant-auth 이전부터 있던 경로지만, 이번에 비개발자 EDITOR에게도 열렸고 `SAAS.md` §5.7의 완료 주장은 이 경로를 포함해야 한다.

제안: Action도 `classifyFailure`를 사용하고 외부 오류는 서버 로그와 추적 ID로 연결한다.

### 8. 🟡 P2 [invariant] 프로젝트별 sync 브랜치 전환이 CI 경고에 전달되지 않았다

위치: [.github/actions/l10n-push/action.yml:130](/Users/sinhyeok/code/malmoi/.github/actions/l10n-push/action.yml:130), [lib/pull/trigger.ts:44](/Users/sinhyeok/code/malmoi/lib/pull/trigger.ts:44).

Publish는 `l10n/sync-<slug>`로 PR을 만들지만 composite action은 여전히 `gh pr list --head l10n/sync`만 조회한다. `order-check` PR이 열려 있어도 CI는 “열린 l10n/sync PR 없음 (조회 성공)”을 출력하고 strict push로 진행한다. 편집 손실 창 자체는 승인된 정책이지만 그 창을 알리는 경고가 무효가 된 것은 회귀다.

`scripts/smoke-github.ts:118`도 옛 `heads/l10n/sync`를 읽으며 `docs/ACTIONS.md`도 옛 이름을 안내한다. 단위 테스트가 이름 생성 함수만 검사하면 이 연결 누락을 못 본다.

제안: `inputs.project`에서 결정한 실제 sync 브랜치를 CI 경고와 스모크에서도 사용하고, 생산자·소비자의 이름 일치를 검증한다.

### 9. 🟡 P2 [debt] 프로덕션에서 Prisma 풀 재사용이 꺼져 있다

위치: [lib/db.ts:31](/Users/sinhyeok/code/malmoi/lib/db.ts:31).

`getPrisma()`는 캐시를 읽지만 `NODE_ENV !== "production"`일 때만 저장한다. 프로덕션의 후속 호출은 매번 새 PrismaClient와 PrismaPg를 만든다. 설치된 드라이버 `@prisma/adapter-pg/dist/index.js:811`은 연결 시 별도 `pg.Pool`을 만든다.

정상 번역 페이지의 최초 렌더는 레이아웃 인증·페이지 인증·프로젝트 인가·번역 조회에 별도 풀 4개를 만들 수 있다. 저장·Publish Action 본체도 인증과 업무 조회에 최소 2개를 사용한다. Auth.js 지연 config는 `auth()`마다 다시 평가된다. warm 인스턴스에서도 연결과 handshake가 재사용되지 않아 요청량에 비례해 연결 부담이 늘어난다.

이 결함은 `2b3ea60`의 지연 생성 변경부터 존재하며 tenant-auth가 호출 수를 늘렸다. pg-pool의 기본 idle timeout은 10초이므로 영구 연결 누수라고 부르지 않는다. 기존 `EMAXCONNSESSION` 장애가 이 코드 때문이었다고 단정할 근거도 없다.

제안: import 시 환경변수를 평가하지 않는 지연 생성은 유지하면서 프로덕션에서도 생성한 인스턴스를 재사용한다.

## 검증 공백과 기존 회고 대조

기존 테스트 수나 과거 green은 위 시나리오의 검증 결과가 아니다.

- `provider-config.test.ts`는 설정 텍스트를 검사하고 공개 세션 응답을 실행하지 않는다. DB 세션 객체의 원문 토큰이 응답에서 제거되는지는 보지 않는다.
- `membership.test.ts`는 동일 대상의 삭제 경합과 `acceptedAt: null` 인자를 확인한다. 서로 다른 OWNER를 동시에 줄이는 경우, 회전과 수락의 경합, 동시 발급은 검사하지 않는다. 하네스의 `$transaction`은 콜백을 호출할 뿐 실제 격리·rollback을 구현하지 않는다.
- UI 수동 기록은 DB Session 삭제에 한정돼 있다. 쿠키가 사라지는 경우에는 미들웨어라는 앞단이 추가로 개입한다.
- 진입점·링크·쿼리 수신 소스 검사는 유용하지만, 식별자·문자열 존재를 읽는 검사라 실제 호출·렌더·값 소비의 전부를 보증하지 않는다.
- POSTMORTEM은 착수 시 24항목, 종료 시 추가 회고 포함 25항목을 대조했다. 동일 파일의 옛 결함이 그대로 되살아난 것과 유사 실패 유형을 구분했다. 특히 검사값과 소비값의 분리(#5), 조건부 쓰기의 불충분한 조건(#2~4), 생산자·소비자 배선 누락(#8)이 기존 회고와 같은 유형이다.
- 새 회고 `171db5f`의 DB 장애→null 세션→로그인 화면 문제는 이미 기록된 현행 결함으로 인지했다. 신규 9건에 중복 계상하지 않았다. `auth()`가 내부에서 DB 예외를 삼키므로 호출부에 try/catch만 더해서는 구별되지 않는다는 점도 설치 소스에서 확인했다.

## 확인된 경계와 제외

번역 저장은 Zod 검증 → 멤버십 인가 → 인가된 projectId로 key/locale 소속 확인 → 쓰기 순서를 따른다. 클라이언트의 projectId·role·updatedBy를 저장 권한으로 신뢰하는 경로는 발견하지 못했다. Translation의 공유 projectId 복합 FK도 유지돼 있다. EDITOR의 저장·Publish 허용과 멤버 관리 거부는 권한표에 맞는다. 리포 쓰기는 계속 GitHub App installation token을 사용한다.

API의 단일 `ACTIVE_PROJECT_SLUG`·프로젝트별 push 토큰은 5단계, GitHub 설치 3중 검증은 4단계, 멤버 관리 화면·orphaned 로케일 표시·updatedBy 표시 정리는 6단계의 명시된 범위이므로 미구현 결함으로 올리지 않았다. 과거 환경변수 오배선과 24시간 세션 길이도 새 결함으로 세지 않았다.

## Claude Code 전달 범위

사용자 요청은 감사 보고서를 열린 Claude Code 세션에 전달하는 것이다. 이 문서는 현재 리뷰의 근거 대조·통합용이며 코드 수정·커밋·배포는 수행하지 않았다. 후속 검토 시 번호를 유지해 지칭할 수 있다.
