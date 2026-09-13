# tasks — account-connect

⚠️ **1번이 [Connect] 버튼보다 앞이다.** 가로채기 셋의 배타성이 서기 전에 세 번째 왕복을 열면,
그 순간부터 "중단한 왕복이 남의 callback을 먹는" 부류가 실재한다.

## 1. 왕복 쿠키 정리를 한 자리로 접는다 — `/tdd interface`

`clearAuthRoundtripCookies(except)` 하나가 회수·병합·연결 셋의 쿠키를 든다. 지금의
`clearLinkCookies` 호출 둘(`app/(edit)/account/actions.ts`·병합 시작점)이 그 함수로 접힌다.
**그리고 소스 스캐너가 "세 왕복의 시작점이 전부 그 함수를 지나는가"를 센다.**
⚠️ **스캐너를 만들었으면 일부러 깨뜨려 red를 확인한다** — 매칭이 0인 스캐너는 장식이다.
검증: `pnpm test` green + 시작점 하나에서 호출을 지우면 red.

*커밋 경계* — `refactor(auth): fold roundtrip cookie clearing into one gate`

## 2. 판정 순수 함수 — `/tdd interface`

`lib/account-connect/policy.ts`에 `planConnect` · `connectChallengeIdentifier` · 착지 갈래.
⚠️ **`LinkOutcome` union에 더한다** — 새 union을 만들면 화면이 사전 둘을 든다.
⚠️ **`planConnect`가 이메일 원문을 안 받는다** — HMAC 조회값 둘이다.
검증: `pnpm test` green. `email-mismatch` · `taken-by-other` · `already-connected` · `expired`
넷이 각각 red → green.

*커밋 경계* — `test: pin the connect predicates`

## 3. challenge 껍데기

`lib/account-connect/store.ts` — `VerificationToken`의 **세 번째 접두**. `lockUser` 재사용.
⚠️ **모든 조회·삭제에 `userId`를 건다.**
검증: `pnpm typecheck` green + 접두가 다른 두 목적의 토큰을 서로 소비하지 않는 단위 테스트.

## 4. 왕복 — 시작과 callback

시작은 Server Action(`startLoginMethodConnect`), 착지는 기존 callback 가로채기의 **세 번째 분기**.
⚠️ **`withRevocation`이 바깥, 새 것의 자리를 명시적으로 정한다** — 순서가 배타성을 만든다.
⚠️ **`Account` 쓰기는 `create` + P2002 재조회다.** `upsert` 금지, update에 `userId` 금지.
✅ **거부·성공 모두 착지가 `/account`다**(2026-09-13, 사용자) — `routes.account({ link })`가 주소를
만든다. ⚠️ **문자열 연결로 만들지 않는다**: `entry-points.test.ts`의 쿼리 수신자 검사가 생성기를
지나는 것만 센다.
검증: `pnpm test` + `app/(edit)/__tests__/authorization.test.ts`에 새 Action이 든다.

*커밋 경계* — `feat(account): connect a second sign-in method from settings`

## 5. `linkAccount` 거부가 살아 있음을 고정한다

소스 스캐너 또는 단위 테스트로 **거부 조건이 완화되지 않았음**을 센다.
⚠️ **값이 아니라 구조를 센다** — 조건문 문자열을 박으면 리팩터 한 번에 green인 채 방어선만 사라진다.
검증: 거부 조건을 일부러 빼면 red.

*커밋 경계* — `test: the linkAccount refusal still stands`

## 6. 문구와 화면 배선

`messages/en.tsx`에 거부 사유 넷. ⚠️ **화면 문구는 `messages/en.tsx`를 지난다** — 소스에 한글 UI
리터럴 금지(`no-korean-ui.test.ts`).
⚠️ **[Connect] 버튼 자체의 시각 형(크기·variant·자리)은 `account-settings`가 든다.** 여기서는
**동작하는 진입점**까지다.
검증: `pnpm test` green.

## 7. 정본 반영

`docs/PRODUCT.md` §4.1의 `판정 · 아직 안 만들었다`를 **✅로 바꾸고** §7.7 IA의 `/account` 행과
그 아래 ⚠️ 문단을 갱신한다. `docs/ARCHITECTURE.md` §6.2의 같은 표식도 함께.
⚠️ **이 태스크는 구현이 프로덕션에 선 뒤다** — 앞서 적으면 문서가 코드보다 앞서간다.

*커밋 경계* — `docs(PRODUCT): the account screen now opens a second sign-in method`
