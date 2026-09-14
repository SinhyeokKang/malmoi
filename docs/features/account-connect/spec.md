# spec — account-connect

## 사용자

**둘 다**다. 초대받아 들어온 비개발자 동료(로그인 수단을 하나 더 붙여 두고 싶은 사람)와
개발자(나) 모두 같은 화면에서 같은 버튼을 누른다.

## 문제

`/account`의 로그인 수단 목록에 **붙이는 버튼이 없다.** 붙이는 문은 실재하지만 그 문의 위치가
**로그인 시도 자체**다 — 로그아웃하고 다른 provider로 들어오면 병합 화면이 뜬다(`account-linking`,
2026-09-12).

그래서 화면에는 **흔적이 없다.** 미연결 행은 "Not connected"라는 글자 하나로 끝나고, 사용자는
**"여기서 못 하는 일"과 "할 수 없는 일"을 구별할 수 없다.** 문장으로만 존재하는 경로는 그 문장을
읽은 사람에게만 작동한다.

⚠️ **원래 판정은 "붙이는 버튼은 없다"였다** (`docs/PRODUCT.md` §4.3 ④). 근거는 *"그 문의 인가 조건을
그 화면에서는 적을 수 없다"*였는데, 적을 수 없었던 것은 조건이 아니라 **그 조건을 갖춘 경로가
없었던 것**이다. 2026-09-13에 사용자 재량으로 뒤집혔고 판정은 §4.1로 올라갔다.

⚠️ **라벨은 `Connect`가 아니다** (결정 2026-09-13, 사용자). 같은 화면 셋째 카드가 이미
`m.settings.account.connect = "Connect GitHub"`(GitHub App 리포 접근)이고
`app/(edit)/account/page.tsx:105`의 주석이 그 혼동을 이미 경고한다 — *"같은 화면에 GitHub이 두 번
나온다 — 위는 로그인 수단, 아래는 리포 쓰기 권한"*. **자격증명이 다른 둘**(로그인 OAuth App vs
GitHub App user-to-server)이 같은 말로 보이면 안 되므로 **로그인 수단 쪽을 가른다** — 같은 행의
짝이 [Disconnect]라 옆자리에서 읽히는 동사를 고른다(`Add` 계열). **아래 GitHub App 카드는 안
건드린다** — 그쪽 문구를 바꾸면 이 기능 밖의 화면까지 움직인다.

## 완료 조건

1. `/account`의 미연결 행에 **붙이는 버튼이 선다.** 누르면 **로그아웃 없이** 그 provider의 OAuth로
   나갔다 돌아온다.

2. 돌아온 뒤 셋을 다 통과해야 `Account`가 붙는다 — ① 현재 세션 `User.email`과 새 provider가
   **검증한** 이메일이 같을 것 ② 새 provider의 소유가 그 왕복에서 증명될 것 ③ **단일 사용
   challenge**가 그 둘과 **이 세션·이 state**를 묶을 것.

   ⚠️ **기존 수단의 소유 증명은 살아 있는 세션이 대신한다** (결정 2026-09-13, 사용자). 그래서 이
   옆문은 `finishLink`보다 **한 축 약하다** — `finishLink`는 세션이 없는 흐름이라 기존 provider의
   OAuth를 새로 통과시키지만, 여기는 이미 로그인된 사람이다. **대가는 세션 탈취 갈래다**: 세션을
   쥔 공격자가 자기 provider 계정을 붙여 영구 로그인 수단을 얻는다. 그 대응은 이 기능이 아니라
   **같은 화면의 "전체 세션 회수"가 든다** — 회수가 `Session`을 지우고, 붙은 `Account`는
   `unlinkLoginMethod`가 뗀다. **`docs/PRODUCT.md` §4.3 ④와 `docs/ARCHITECTURE.md` §6의
   "두 provider의 소유 증명" 문장이 이 결정으로 낡는다** — 갱신은 태스크 8이 든다.

3. **거부하면 사유가 화면에 뜬다.** ✅ **착지는 `/account`이고 사유는 Sign-in methods 카드 **안**의
   in-block Alert다**(결정 2026-09-13, 사용자 — 최초 "머리 Alert" 판정을 뒤집었다). 근거 셋:
   `docs/DESIGN.md` §6.67이 *"실패는 in-block `Alert danger`를 폼 안에 렌더한다 — 페이지 상단으로
   올리면 어느 카드의 실패인지 사라진다"*이고, `/account`에서 OAuth 왕복을 도는 **유일한 선례**
   (Sign out everywhere, `components/session-revocation.tsx`)가 카드 안에 그리며, **수단이 둘이라
   거부는 행에 대한 판정**이다 — 머리로 올리면 "어느 provider가 거부됐나"가 사라진다. 부수로
   `redirect`에서 돌아오면 포커스가 `body`라, 사유가 카드 안에 있으면 탭 거리가 짧다.
   ⚠️ **병합 화면(`/signin/link/:challenge`)으로 보내지 않는다**: 그쪽은 세션이 **없는** 흐름
   전용이고, 거기로 보내면 "이메일이 다른 둘의 병합"(이 기능의 비목표)까지 그 화면이 들게 되어
   경계가 흐려진다. 무음으로 끝나지 않는다.

4. **착지 어휘는 `?connect=`라는 새 쿼리 키다** (결정 2026-09-13, 사용자). ⚠️ **`?link=`를
   재사용하지 않고 `LinkOutcome`에 더하지도 않는다**: `?link=`는 이미 **해제(unlink) 결과 슬롯**이고
   (`disconnected`·`last-method`·`unavailable`), `LinkOutcome`의 유일한 소비자인 `failureUrl`은
   대부분의 멤버를 **`/signin/link/<challenge>?e=`로 보낸다** — 완료 조건 3이 금지한 그 착지다.
   문구도 `m.errors.connectMethod` **별도 절**이다 — 공유 중인 `m.errors.link`에 더하면
   `already-connected`↔`already-linked`, `expired`↔`invalid`가 같은 사전에 나란히 서고
   `taken-by-other`는 `lib/github-connect/message.ts`의 `ConnectError`에 **이미 있다**(같은 화면이
   `?e=`로 읽는다).

5. **판정 거부 넷과 왕복 실패 갈래가 모두 사유를 낸다.** 판정 넷은 `email-mismatch` ·
   `already-connected` · `taken-by-other` · `expired`이고, **왕복 실패에 `cancelled`(provider 화면에서
   취소)가 반드시 든다** — 취소가 가장 흔한 경로인데 사유가 없으면 문구 없는 `/account`에 착지해
   완료 조건 3이 그 자리에서 깨진다. `withLoginLink`가 `?error=access_denied`를 접는 관용구를
   그대로 따른다. 나머지 왕복 실패(state 불일치·토큰 교환 실패·왕복 중 세션 교체)도 각각 사유를
   갖는다.

6. **성공도 화면에 뜬다.** 같은 in-block 자리에 성공 Alert가 서고, **같은 렌더에서 그 행이
   "Not connected"에서 연결됨으로 바뀐다.** ⚠️ 불변식 9의 ⚠️(POSTMORTEM 2026-09-07 —
   `revalidatePath`가 결과 Alert를 언마운트해 판정은 옳고 전달만 사라졌다)가 이 자리에 그대로
   걸린다.

7. 그 provider 계정이 **이미 다른 `User`의 것**이면 거부한다. ⚠️ **거부 판정이 쓰기보다 앞이다** —
   뒤면 "실패했는데 연결까지 풀렸다"가 된다(`planAccountLink`의 `taken-by-other`가 `replace`보다
   앞인 것과 같은 이유).

8. **목적 표식이 사라진 callback은 아무것도 만들지 않는다.** 신규 가입도, 병합 제안도 아니다.
   ⚠️ POSTMORTEM 2026-09-10(*재인증 목적이 사라진 OAuth callback이 일반 가입을 실행했다*)이 이
   갈래이고, 그때의 대응이 **state 쿠키 이름·salt 분리**였다 — 표식이 사라지면 일반 로그인으로
   떨어져 **이메일이 다르면 새 `User`가 만들어지고 그것으로 로그인된다.**

9. **`linkAccount`의 거부는 그대로 서 있다.** 이 기능은 그 거부를 완화하지 않고 **옆문**을 낸다.
   ⚠️ 그 결과 `account.create` 호출자가 **셋에서 넷**이 되므로,
   `lib/login-link/__tests__/exclusive.test.ts`의 허용 목록에 **넷째가 이름으로 등재**되고 그 근거가
   `docs/ARCHITECTURE.md` §6.2에 적힌다. 그 등재 자체가 "옆문이 둘이 됐다"는 명시적 기록이다.

10. 회수 왕복(`withRevocation`)·병합 왕복(`withLoginLink`)과 **동시에 서지 않는다.** 시작하는 쪽이
    **나머지 전부의 쿠키를 먼저 지운다.**

11. `pnpm test` green + 판정 순수 함수에 단위 테스트 + **실물 왕복을 한 번 밟는다**(태스크 7).

## 비목표

- **이메일이 다른 두 수단의 병합** — `docs/PRODUCT.md` §4.3 ④의 비범위 그대로다. 이번에 여는 것은
  "같은 검증 이메일의 두 수단"뿐이다.
- **이미 양쪽에 `User`가 따로 있는 경우의 병합** — 같은 이유로 계속 비범위다.
- **provider 접근을 잃은 사람의 복구** — 여전히 안 푼다.
- **세 번째 provider** — `LOGIN_PROVIDERS`는 둘 그대로다.
- **해제 흐름** — 이미 있다(`unlinkLoginMethod`). 이 기능은 그 짝이다.
- **세션 탈취 자체의 대응** — 완료 조건 2의 대가를 이 기능이 풀지 않는다. 기존 "전체 세션 회수"가
  드는 자리다.
- **연결 성공의 부작용 고지** — `Account`가 둘이 되면 `planEmailRefresh`가 **영구히 `keep`**이라 그
  사용자의 이메일이 provider를 안 따라간다(PRODUCT §4.3 ④가 이미 명시한 대가). **사전 고지도 확인
  Dialog도 두지 않는다**(결정 2026-09-13, 사용자) — 사용자가 전부 사내 동료라 이메일이 바뀔 일이
  드물고, 확인 단계를 넣으면 비개발자에게 이해되지 않는 문장만 남는다. 그 대가는 design이 지식으로
  든다.
