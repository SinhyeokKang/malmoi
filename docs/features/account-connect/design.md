# design — account-connect

## 영향 받는 흐름

push·편집 UI·pull **어디도 아니다.** 닿는 것은 **인증 경계 하나**(ARCHITECTURE §6)이고,
이 기능의 위험은 전부 거기에 모여 있다.

## ⚠️ 가장 큰 위험 — callback 가로채기가 **셋**이 된다

지금 OAuth callback을 가로채는 것이 둘이다(ARCHITECTURE §6.2):

> **두 가로채기의 배타성은 구조가 아니라 순서와 쿠키 정리가 만든다.** `withRevocation`이 **바깥**,
> `withLoginLink`가 **안쪽**이고, 각자 state 쿠키를 **다른 이름·salt**로 쓰며, **시작하는 쪽이
> 상대의 쿠키를 먼저 지운다**(양방향). intent 판정이 각자 쿠키 셋의 OR이라 암호적 결합이 없어서다.

**셋이 되면 지워야 할 쌍이 하나에서 셋으로 는다.** 하나를 빠뜨리면 "중단한 왕복이 다음 왕복의
callback을 먹고 Location을 덮는" 부류가 돌아온다(POSTMORTEM 2026-09-10 계보).

**대응**: 쿠키 정리를 **각자 손으로 나열하지 않고 한 함수가 든다** — `clearAuthRoundtripCookies(except)`
하나가 셋 중 지정한 하나를 빼고 전부 지우고, **소스 스캐너가 "세 왕복의 시작점이 그 함수를
지나는가"를 센다.** 지금의 `clearLinkCookies` 호출 둘이 그 함수로 접힌다.

⚠️ **이것이 이 기능에서 제일 먼저 서야 하는 것이다** — [Connect] 버튼보다 앞이다.

## challenge — `lib/login-link`를 **재사용하지 않는다**

**같은 관용구를 쓰되 다른 접두다.** `VerificationToken`을 목적 접두로 나눠 쓰는 것이 이 리포의
관용구이고(`session-revocation`·`login-link` 둘이 이미 그렇다), 접두가 갈려 있어 **두 목적의
요청이 서로를 소비하지 않는다.** 여기는 세 번째 접두다.

⚠️ **`lib/login-link`의 challenge를 그대로 들고 오지 않는 이유**: 그쪽은 세션이 **없는** 흐름이고,
challenge가 담는 것이 다르다 — 거기는 *"누구를 인증시킬 것인가"*(아직 로그인 안 된 사람에게 기존
계정을 증명시킨다)이고 여기는 *"누구에게 붙일 것인가"*(이미 로그인된 `userId`가 주어져 있다).
같은 타입에 두 의미를 담으면 어느 쪽 불변식인지가 흐려진다.

담는 것: `userId` · 붙일 `provider` · 현재 세션의 `emailLookup` · 만료. **원문 이메일은 안 담는다** —
대조는 HMAC 조회값으로 한다(`lib/credentials/access.ts`의 관용구).

## `Account` 쓰기 — Auth.js를 지나지 않는다

⚠️ **`linkAccount`의 거부를 완화하지 않는다.** 그것은 Auth.js 콜백을 지나는 **모든** 로그인에 걸린
방어선이고, 예외 구멍을 뚫으면 sec-audit-2 #31이 막은 모양이 그대로 돌아온다.

대신 셋을 다 통과한 뒤 **우리 코드가 직접 쓴다**:

- `User` 행을 **잠근 뒤**(`lockUser` — 이미 있다) 판정하고 쓴다.
- 쓰는 것은 **식별자 네 필드뿐**이다 — OAuth 토큰을 남기지 않는 것은 기존 경로와 같다.
- `upsert`가 아니라 `create` + P2002 재조회다. ⚠️ **`upsert`는 동시 요청이 `userId`를 덮어써
  소유권이 이동할 수 있다**(ARCHITECTURE §6.2.1). **어떤 update도 `userId`를 인자에 넣지 않는다.**
- ⚠️ **`taken-by-other` 판정이 쓰기보다 앞이다.**

## 순수 함수로 분리 가능한 부분 → `/tdd` 진입점

| 함수 | 무엇을 판정하나 |
|---|---|
| `planConnect({ sessionLookup, providerLookup, existing, provider })` | 붙일지 거부할지. 사유가 union이다 — `email-mismatch` · `already-connected` · `taken-by-other` · `expired` |
| `connectChallengeIdentifier(userId, provider)` | 세 번째 접두의 식별자를 만든다 |
| `connectOutcome(...)` → `?link=` 값 | 착지 갈래. **기존 `LinkOutcome` union에 더한다** — 새 union을 만들면 화면이 사전 둘을 든다. ✅ **착지는 언제나 `/account`다**(결정 2026-09-13) |
| `clearAuthRoundtripCookies(except)` | 위 §가장 큰 위험의 대응. 지워야 할 쌍을 한 자리에 모은다 |

⚠️ **`planConnect`가 이메일 원문을 받지 않는다** — 받으면 그 값이 로그·에러에 섞여 나갈 자리가
생긴다. 받는 것은 HMAC 조회값 둘이다.

## 스키마 변경

**없다.** `VerificationToken`(접두 재사용)과 `Account`(기존)로 끝난다.

## 새 환경변수

**없다.** 같은 OAuth App 자격증명을 쓴다 — ⚠️ **GitHub 자격증명 셋의 경계를 넘지 않는다**:
이 경로가 쓰는 것은 **로그인용 OAuth App 토큰**이고(`AUTH_GITHUB_*`), 연결용 GitHub App도
설치 토큰도 아니다. `lib/github-connect/__tests__/credential-separation.test.ts`가 상시로 센다.

## 불변식 영향

- **§0 불변식 7**(로그인 provider가 아니라 `ProjectMember`가 권한을 결정한다) — **강화된다.**
  수단이 하나 늘어도 열리는 것은 없다.
- **인증 경계(§6)** — 직접 건드린다. 위의 두 절이 그 계약이다.
- **§0 불변식 5**(`projectId`로 좁힌다) — 해당 없다. 이 축은 `userId`다.
  ⚠️ 단 **`Account` PK가 `(provider, providerAccountId)`라 그 둘만으로 남의 행에 닿는다** —
  모든 조회·삭제에 `userId`를 함께 건다(POSTMORTEM 2026-09-06).

## POSTMORTEM에서 소환한 것

- **2026-09-06 — `userId` 없는 `Account` 조회.** 위 불변식 절.
- **2026-09-06 — 사유를 실어 보내놓고 안 읽으면 무음이다.** 새 `?link=` 갈래를 더하면서 **읽는 쪽을
  같은 커밋에** 넣는다. `AccessError`·사전·union 셋이 함께 움직인다.
- **2026-09-08 — 주소창 값을 캐스팅하면 프로토타입 키가 화면을 죽인다.** `?link=`는 **판정 함수로**
  거른다. 모르는 값은 무시한다.
- **2026-09-10 — 버려진 왕복이 다음 callback을 먹는다.** 위 §가장 큰 위험이 정확히 그 계보다.
