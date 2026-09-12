# 계정 병합 + 초대 화면 개편 (account-linking)

**같은 이메일의 다른 provider로 들어온 사람을 거부하지 않고, 존재하는 계정을 보여주고 그 계정의
provider로 인증시켜 병합한다.** 그리고 그 흐름이 **초대 링크를 끊지 않게** 초대 화면을 함께 고친다.

⚠️ **UI를 구현하기 전에 시각 초안을 읽는다 — 읽는 법과 아트보드 매핑은 [design.md §9](./design.md)다.**
Claude Design 프로젝트 `Mal-moi 로그인 디자인`(`b99d54cd-3034-44f1-8446-0a864da9d767`)의
`design_handoff_signin_invite_link_account/`에 `README.md`(핸드오프 문서)와 `Signin Invite LinkAccount.dc.html`(아트보드
1a·1b·1c + 병합 상태 둘 + `EntityCard` 규격)이 있고, `/design-login` 뒤 `DesignSync get_file`로 읽는다.
**옮겨 붙이지 않는다** — 가져오는 것은 레이아웃·정보구조·치수·문구이고 색과 컴포넌트는 기존
토큰(`app/globals.css`)·프리미티브로 번역한다 (design §9.4).

## 0. 범위 게이트

⚠️ **`docs/SAAS.md` §5.5가 이것을 비범위로 두었고, 2026-09-12에 사용자가 그 제약을 무시하기로
확정했다.** 이 기능이 그 절을 대체한다(T8).

§5.5가 든 근거 둘과 이 설계의 답:

| §5.5의 근거 | 이 설계에서 |
|---|---|
| "두 `Account` 행을 한 `User`로 옮기고 `ProjectMember`·`Translation.updatedBy`·`ProjectInvitation.invitedBy`를 함께 옮겨야 한다" | **해당 없음.** 거부된 로그인은 `User`·`Account`를 **만들지 않는다**(`signIn` 콜백이 `handleLoginOrRegister`보다 먼저 돈다) — 옮길 행이 0이고, 하는 일은 기존 User에 `Account` **한 줄 추가**다 |
| "어느 이메일이 정본인가를 다시 정해야 한다" | **정하지 않는다.** 이메일이 **같을 때만** 병합한다 — `planEmailRefresh`가 언제나 `keep`이라 정본 판정이 생기지 않는다 |

⚠️ **§5.5가 지키려던 것은 그대로 남는다**: *"잘못된 자동 병합은 불편이 아니라 계정 탈취다."*
자동 병합은 **여전히 없다** — `allowDangerousEmailAccountLinking`은 계속 꺼져 있고, 병합은
**두 수단의 소유를 각각 증명한 사람**만 할 수 있다(design §3).

코어 설계 원칙(MVP §2)과의 충돌: 없다. 번역 값·소스 키를 건드리지 않는다.

## 1. 사용자

**비중이 비개발자 동료 쪽으로 분명히 기운다.**

- **번역 편집자**: 초대 링크를 받고 Google로 들어왔는데, 그 주소가 GitHub으로 가입돼 있으면
  **거부 문구만 보고 막힌다.** 자기 주소인데도 `email-mismatch`를 만나 **수락할 길이 없다.**
- **개발자(나)**: GitHub으로 가입했는데 회사 Google로도 들어오고 싶다.

## 2. 문제 (관측된 사실)

- 2026-09-09 실측: 같은 주소의 다른 provider는 `?error=OAuthAccountNotLinked`로 거부된다.
  문구는 정확하지만 **어느 수단인지 말하지 않고 해결 경로도 없다.** 이 상태는 영구적이다.
- **초대 흐름이 그 벽에서 끊긴다.** 초대는 `User.email`과 대조하는데(SAAS §5.6), 다른 provider로
  들어온 사람은 로그인 자체가 안 되므로 대조까지 가지도 못한다.
- `/invite/[token]`은 **320 컬럼의 제목 칸이 비어 있는 유일한 화면**이다 — 로고 48 아래
  `invitedTo`가 `text-sm` 평문으로 와서 제목 역할을 겸한다. 다른 셸 밖 화면 둘은 `h1`이 있다.
- 화면에 **로그인 수단을 보여주는 자리가 없다.** `/account`의 "GitHub 계정" 섹션은
  **GitHub App 연결**(리포 쓰기 권한)이고 로그인 수단이 아니다 — 다른 축이다.

## 3. 완료 조건 (검증 가능한 문장)

1. **거부가 안내로 바뀐다** — 같은 주소가 다른 수단으로 등록돼 있으면 `/signin/link/[challenge]`로
   가고, 그 화면이 **존재하는 계정 카드**(마스킹 이메일 · provider · 가입 월)와 그 provider의
   확인 버튼을 보인다.
2. **한 화면에서 병합이 끝난다** — [Confirm with GitHub] → GitHub OAuth 통과 → `Account` 한 줄
   추가 → 로그인 세션으로 진행. 다음부터 **양쪽 다** 같은 계정에 들어온다.
3. **초대가 끊기지 않는다** — 초대 링크에서 시작한 경우 병합 뒤 `/invite/[token]`으로 돌아오고
   수락이 이어진다.
4. **다른 계정으로 확인하면 아무것도 안 쓴다** — challenge의 User와 다른 GitHub으로 확인하면
   `Account` 행 증가 0, **세션도 만들어지지 않고**, 같은 화면에 `Alert` 한 장이 뜬다.
5. **만료는 `/signin`으로** — 10분이 지난 challenge는 이 화면을 다시 그리지 않는다.
6. **이메일이 다르면 병합하지 않는다** — challenge가 애초에 만들어지지 않는다.
7. **일반 로그인이 병합으로 변신하지 않는다** — `safePrismaAdapter.linkAccount`의 현재 거부가
   **한 줄도 바뀌지 않는다**(design §5.3).
8. **병합 왕복이 일반 로그인으로 변신하지 않는다** — 목적 쿠키·DB 행을 지우고 유효한 state/PKCE만
   들고 callback해도 새 `User`·`Account`·`Session`이 생기지 않는다 (POSTMORTEM 2026-09-10).
9. **세션 회수가 계속 동작한다** — 로그인 수단이 둘인 계정에서도 성공한다
   (지금은 `accounts.length !== 1`이라 **불가능하다**).
10. **초대 화면에 `h1`이 선다** — 로그인 상태는 다섯 줄(로고 · 제목 · 설명 · `EntityCard` · 수락),
    비로그인은 **카드 없이** 세 줄 + provider 버튼 둘.
11. **`/account`에 로그인 수단 목록이 있다** — 연결·해제가 되고 **마지막 하나는 비활성**이다.
12. `pnpm test` green + `pnpm test:credentials:postgres` green.

## 4. 지금 코드가 막고 있는 것 (착수 전 실측)

| 자리 | 현재 동작 | 이 기능에서 |
|---|---|---|
| `auth.ts` `signIn` 콜백 | Auth.js 기본 `OAuthAccountNotLinked`로 떨어진다 | 같은 주소의 기존 User를 감지해 challenge를 굽고 `/signin/link/…`로 보낸다 |
| `lib/auth/safe-adapter.ts` `linkAccount` | 두 번째 로그인 provider를 **무조건 던진다** | **그대로 둔다** — 병합은 우리가 직접 쓴다 (design §5.3) |
| `lib/session-revocation/store.ts` `beginRevocation` | `accounts.length !== 1`이면 `invalid` | **수단이 둘이면 회수가 통째로 죽는다** — 결정적 선택으로 |
| `app/invite/[token]/page.tsx` | `h1` 없음 · `invitedTo` 한 줄이 제목을 겸한다 | 제목·설명·`EntityCard`로 갈린다 |
| `components/ui/` 프리미티브 **16** | — | `EntityCard` 추가 → **17** |
| `middleware.ts` matcher | `/projects/:path*`·`/account` | `/signin/link/…`는 **넣지 않는다** |

## 5. 비목표

- **이메일이 다른 두 수단의 병합.** 정본 이메일 판정이 생기고 그것이 §5.5의 근거 그대로다.
- **세 번째 수단.** provider는 GitHub·Google 둘이다.
- **이미 양쪽에 `User`가 따로 있는 경우의 병합.** 이 흐름은 두 번째 `User`가 **애초에 안 생기는**
  경우만 다룬다.
- **병합을 되돌리는 화면을 이 흐름 안에 두는 것.** 해제는 `/account`의 일이고, 이 흐름에
  "나중에 풀 수 있다"를 적으면 **그 문장이 없는 기능을 약속한다**(핸드오프 README).
- **알림 메일.** 발송 경로가 없다 — §6.
- **`/invite` 실패 여섯의 표면 변경.** Layer A 넷은 인라인 `Alert`, Layer B 셋은 토스트 그대로다.
- **`--mono-size` 판정.** `--text-xs` 13px는 이미 나갔고(`10ce111`), mono와 같은 값이 된 것은
  **8-P에서** 판단한다.

## 6. 알림 부재의 대가 — 명시

보통 이 기능을 여는 서비스는 "새 로그인 수단이 추가되었습니다" 메일로 무단 연결을 알린다.
이 앱에는 그 경로가 없다(SAAS §4.3). 그래서 **되돌릴 수단을 같은 배송에** 넣는 것이 조건이다:
`/account`의 로그인 수단 목록 + 해제 + 그 아래 이미 있는 전체 세션 회수.

⚠️ **완화이지 대체가 아니다.** 사용자가 `/account`를 보지 않으면 모른다. 이메일 provider가
붙는 시점에 이 절을 다시 본다.
