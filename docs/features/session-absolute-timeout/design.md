# session-absolute-timeout — design

## 1. 영향 받는 흐름

push·pull·export와 무관하다. **인증 경계**(ARCHITECTURE §6.1.1)의 세션 수명만 바뀐다 — 편집 UI·`/account`·`/mcp`·`/preferences` 등 세션을 쓰는 모든 화면.

## 2. Auth.js가 정하는 것과 우리가 정할 수 있는 것

`@auth/core@0.41.3` `lib/actions/session.js`(DB 전략):

1. `getSessionAndUser(token)` → `session.expires < now`면 `deleteSession` 후 무효.
2. `due = session.expires − maxAge + updateAge`. `due <= now`면 `updateSession({ expires: now + maxAge })`. **반환값을 쓰지 않는다.**
3. 응답 쿠키를 **언제나** `expires: now + maxAge`로 다시 심는다(어댑터 결과와 무관).

따라서:

- **absolute는 어댑터가 DB `expires`를 잘라서만 걸 수 있다.** 쿠키 만료는 손댈 수 없다(spec 비목표).
- 쿠키가 DB보다 오래 남는 구간(마지막 7일)은 무해하다 — 그 쿠키로 온 요청은 1에서 무효가 되고, Route Handler 문맥이면 Auth.js가 쿠키를 지운다. 미들웨어는 쿠키 이름만 보고 통과시키지만(`lib/auth/cookie.ts`), 진입점의 `readSession`이 `unauthorized`를 내고 `/signin`은 `readSession` 기준이라 루프가 없다(`app/signin/page.tsx:55`). **지금 폐기된 세션이 겪는 경로와 같다.**
- ⚠️ **잘린 행은 2의 공식에서 매 요청 `due`가 된다** — 저장값이 `createdAt + 30d`로 고정되면 `expires − 7d + 1h <= now`가 마지막 7일 내내 참이다. 어댑터가 "새 값이 저장값보다 크지 않으면 쓰지 않는다"로 막는다(완료 조건 4). 대가는 마지막 7일 동안 요청마다 읽기 1회다.

## 3. 판정 위치 — `getSessionAndUser`가 아니라 `expires`를 자른다

처음 안은 `getSessionAndUser`에서 `createdAt + 30d`를 따로 보는 것이었다. 버린다:

- `expires > now`를 직접 보는 판정이 이미 셋 더 있다 — `lib/session-revocation/store.ts:24·51`, `lib/account-connect/plan.ts:39`, 그리고 OAuth callback 경로(`safe-adapter.ts` 머리 주석 — Auth.js가 callback에서 만료를 안 보고 우리 `getSessionAndUser`에 기댄다). 둘째 술어를 만들면 그 자리들이 absolute를 모른 채 남는다.
- **`expires`를 실제 만료로 유지하면** 위 판정 전부가 변경 없이 absolute를 따른다. 술어는 하나(`isSessionValid`)로 남는다.

## 4. 순수 함수 (`/tdd` 대상)

`lib/credentials/session-expiry.ts`(신규, `server-only` 없음):

```ts
export const SESSION_ABSOLUTE_MS = 1000 * 60 * 60 * 24 * 30;

/** 갱신할 새 만료 시각. 쓸 필요가 없으면 null — 저장값 이하로는 절대 움직이지 않는다. */
export function nextSessionExpiry(input: { createdAt: Date; stored: Date; proposed: Date }): Date | null;
```

- 결과 = `min(proposed, createdAt + SESSION_ABSOLUTE_MS)`. 그것이 `stored` 이하면 `null`.
- 테스트: 평범한 연장 / 상한에서 잘림 / 이미 상한(=stored) → null / proposed < stored(시계 역행) → null / 경계 등호.

idle 상수는 만들지 않는다 — idle은 Auth.js가 `proposed`(`now + maxAge`)로 넘겨주고 이 함수는 상한만 건다. `auth.ts`의 `maxAge`는 리터럴 `60 * 60 * 24 * 7`로 두고 `provider-config.test.ts`가 텍스트로 센다(그 파일은 `auth.ts`를 import하지 않는다).

## 5. 껍데기 — `credentialAdapter.updateSession`

```
row = findUnique({ sessionToken: digest })            // createdAt·expires
if row 없음 or !isSessionValid(row.expires, now) → null
next = nextSessionExpiry({ createdAt: row.createdAt, stored: row.expires, proposed: data.expires })
if next === null → return 현재 row (쓰기 없음)
updateMany({ where: { sessionToken: digest, expires: row.expires }, data: { expires: next } })   // CAS
```

- CAS(`expires: row.expires`)는 동시 갱신 둘이 서로를 되감지 않게 한다 — 지금의 `expires: { gt: now }` 조건을 대체하며 그 조건도 함의한다(row.expires > now를 위에서 확인).
- `createSession`은 그대로 — Auth.js가 `now + 7d`를 주고 `createdAt`은 DB 기본값이다(7d < 30d라 자를 일이 없다).
- `getSessionAndUser`는 그대로.

## 6. 스키마 변경 — additive

```sql
ALTER TABLE "Session" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
```

- 기존 행은 마이그레이션 시각을 받는다 = 이미 로그인한 사람의 absolute 시계가 배포 시각에 시작한다(spec 완료 조건 5). 스키마 주석에 `Locale.createdAt`처럼 "기존 행은 진짜 시각이 아니다"를 적는다.
- **SELF-HOSTING §3-1**: 백필이 SQL 안에서 끝나고 앱 코드를 기다리지 않는다 → 버전 건너뛴 업그레이드에서 안전. 빈 DB·superuser·Supabase 전용 객체 없음. 기존 테이블의 열 추가라 런타임 롤 권한은 테이블 GRANT가 덮는다(격리 PG 스위트가 확인).
- 배포 순서(additive-first): 옛 코드는 새 열을 모른 채 돈다. 새 코드가 옛 스키마를 만나면 `createdAt` select가 깨지므로 dev는 `/push` 전, prod는 `/merge` 1단계.
- `prisma/__tests__/schema-contract.test.ts`의 Session 필드 계약에 `createdAt`을 더한다.

## 7. 개인정보

- `lib/privacy/collected.ts`에 `"Session.createdAt": "retention"` — 없으면 typecheck red.
- 방침(hosted, **en·ko 둘** — es는 `publicDocs.privacy`가 영어 고정이다): `messages/en.tsx:862·932`, `messages/ko-privacy.tsx:154·223`의 "24시간" 문장과 쿠키 표 행. `policy-gate.test.tsx`의 `REVISIONS`에 행 추가 + `effectiveDate` + `changes` 절 날짜. 새 목적·전송처는 없다 — 보존 기간 변경이다.
- 가이드 `guide/{en,ko,es}/self-hosting/troubleshooting.md` 76행(Session 행의 Retention 열에 `createdAt`, 설명의 24시간) · 100행(쿠키 수명).

## 8. 새 환경변수

없다.

## 9. 불변식 영향

- export 결정성·blob SHA: 없음.
- 인증 경계(§6.1.1): **세션 수명만 바뀐다.** 판정 술어는 `isSessionValid(expires, now)` 하나로 남고(§3), 회수는 여전히 "행 삭제 = 다음 요청부터 거부"다. 세션에 role·projectIds를 싣지 않는다는 §6.00 ④는 그대로.

## 10. POSTMORTEM에서 소환한 함정

- **Codex 감사 2026-09-06 #6** (ARCHITECTURE §6.1.1) — `updateAge`를 빼면 기본값이 `maxAge`와 같아져 세션이 한 번도 연장되지 않았다. 이번에 `maxAge`만 바꾸고 `updateAge` 1h는 둔다. `due` 공식이 `maxAge`에 의존하므로(§2) 잘린 행의 매 요청 갱신 문제가 같은 공식에서 나온다.
- **`lib/auth/cookie.ts` "쿠키 없는 POST"** — 세션이 끝나면 Server Action POST는 미들웨어를 통과해 Action이 `unauthorized`를 낸다. absolute 만료도 같은 경로다.
- **`safe-adapter.ts` 머리 주석(L4.7)** — callback 경로가 만료를 안 본다. `expires`를 자르는 설계라 이 방어가 absolute까지 자동으로 덮는다(§3).
