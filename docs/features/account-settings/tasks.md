# tasks — account-settings

## 0. 캔버스 실독 — ✅ 끝났다 (2026-09-13)

아트보드 **여덟 전부** 읽었고 측정값은 `design.md`의 "캔버스 실측값"에 있다. 버튼 `sm`/`md` 모순은
**`md`로 갈렸다**(렌더가 전부 36/10/14). 새로 나온 것 다섯도 같은 파일에 있다.

⚠️ **`Account.dc.html`은 120KB다.** 다시 볼 일이 생기면 `get_file` → 스크래치패드 저장 →
`grep -n 'id="2c"'` → `sed -n`으로 **아트보드 구역만** 읽는다. 통째로 컨텍스트에 올리지 않는다.
⚠️ **서브에이전트에는 `DesignSync`가 없다** — 상위 에이전트가 직접 받는다.
⚠️ **`account-settings.prompt.md`를 SoT로 읽지 않는다** — README·캔버스보다 앞선 요청서이고 넷이
어긋난다(`design.md` 새로 나온 것 5).

## 1. 의존 둘이 선다

`docs/features/file-upload/tasks.md` 4번 · `docs/features/account-connect/tasks.md` 4번까지.
⚠️ **버튼만 먼저 세우지 않는다** — 뒤가 없는 [Connect]는 리포가 막은 바로 그 모양이다.
검증: 두 Action이 `app/(edit)/__tests__/authorization.test.ts`에 들어 있다.

## 2. 이름 저장 — `/tdd interface`

`planNameSave` 순수 함수 + `updateProfileName` Action + **`planEmailRefresh`가 이름을 안 덮게 가른다.**
⚠️ **이것이 이 기능의 진짜 서버 작업이다.** 안 가르면 재로그인 한 번에 고친 이름이 되돌아간다.
검증: `pnpm test` green. **"이름을 고치고 재로그인해도 유지된다"**가 단위 테스트로 선다.

*커밋 경계* — `feat(account): let people edit their display name`

## 3. 프리미티브 넷을 안전하게 옮긴다

`design.md`의 "안 본 화면이 함께 움직이는 자리 넷" 표 그대로.
⚠️ **Dialog 폭은 프리미티브 기본값을 바꾸지 않고 호출부 prop으로 내린다.**
⚠️ **mono는 `/account`와 `components/github-account.tsx` 둘 다 걷는다.**
⚠️ **일괄 치환은 `assert`로 강제한다** — 대상이 없어도 조용히 지나가는 치환으로 "고쳤다"고 보고하면
거짓 보고가 된다.
검증: `pnpm test` green + **`/projects/:slug/settings`가 의도한 만큼만 움직였는지 실측**.

*커밋 경계* — `refactor(ui): move dialog width and avatar size to the call site`

## 4. 화면 재편 — 머리 하나 + 리스트 셋

`Card` 다섯 → 머리(아바타 56 + 이름 필드 + 이메일 읽기 전용) + 구역 셋(수단 · GitHub · Sessions).
세션 둘은 **한 리스트의 항목 둘**이고 순서가 뒤집힌다(Sign out이 위).
⚠️ **항목 규격 하나**를 쓴다 — 글리프 32(radius 8) · 이름 14 · 보조 13 · 우측 컨트롤.
⚠️ **리스트 래퍼는 New Project의 리포 목록과 같은 구조다**(테두리 하나 + `overflow:hidden` + 둘째부터
`border-top`). 항목마다 테두리를 주면 셋뿐인 목록이 카드 갤러리처럼 무거워진다.
검증: `pnpm build` green(RSC 경계는 `tsc`가 못 본다) + 1440×900에서 접힘 0.

*커밋 경계* — `feat(account): one header and three lists`

## 5. Dialog 넷

수단 해제(기존) + 연결 해제 · 전체 로그아웃 · 로그아웃(신규 셋).
⚠️ **전체 로그아웃은 `useActionState`의 제출 지점이 Dialog 안으로 들어간다.** 실패 Alert는
**카드에 남긴다** — Dialog가 닫힌 뒤에도 사유가 보여야 한다.
⚠️ **제목이 대상을 명시한다** — 이 화면에 같은 라벨의 `Disconnect`가 둘이다.
⚠️ **로그아웃만 확정이 primary다**(잃는 것이 없다). 넷을 다 붉게 칠하면 같은 무게로 보인다.
검증: `focus-ring.test.ts`에 새 Dialog 안 버튼 넷이 든다.

*커밋 경계* — `feat(account): confirm the four irreversible actions`

## 6. 집계 한 줄

`N projects use this connection.` — **`loadAccountView`를 넓히지 않는다.** `/account` 전용 조회.
기준은 **내가 OWNER이고 보관되지 않은 프로젝트**(design.md).
✅ **조회 실패면 그 줄을 숨긴다**(2026-09-13, 사용자). 반환은 `number | null`이고 **0과 실패를 같은
값으로 접지 않는다** — 0은 말할 수 있는 정보다.
⚠️ **실패는 화면에서 무음이므로 서버 로그에 남긴다.** 남기지 않으면 "0이라 안 보인다"와 "죽어서 안
보인다"를 나중에 구별할 흔적이 없다.
⚠️ **`projectId`가 아니라 `userId`로 좁히는 조회다** — 이 축의 소유자는 `User`다.
검증: 순수 집계 함수에 단위 테스트(0 · N · 실패 셋) + 실패 시 Dialog에 검은 줄이 **없다**.

## 7. 셸 아바타가 사진을 받는다 — ✅ 결정됨 (2026-09-13, 사용자)

`SessionRead` → `header.tsx` → `UserMenu` 세 자리에 `image` 하나를 잇는다. `Avatar`는 이미 `src`를
받으므로 프리미티브는 안 건드린다.
⚠️ **`components/shell/user-menu.tsx`의 주석을 같은 커밋에서 정정한다** — *"publicSession이 필드를
하나 더 실어야 한다"*가 거짓이다(`design.md`의 근거 셋). 남겨 두면 다음 사람이 같은 비용을 다시
계산한다.
⚠️ **4번(화면 재편)보다 앞이거나 같은 커밋이다** — 아바타 56의 근거가 여기 걸려 있다.
검증: 로그인 상태에서 셸 32와 `/account` 56이 **같은 얼굴**이다(사진이 있으면 둘 다 사진, 없으면
둘 다 `toneOf(name)` 이니셜).

*커밋 경계* — `feat(shell): the header avatar shows the profile picture`

## 8a. `link.methods.description`을 교체한다 ⚠️ 캔버스가 놓친 자리

현재 문장 *"Adding one happens when you sign in with it at this same address."*는 **붙이는 문이
로그인뿐**이라는 뜻이다. [Connect]가 서면 **거짓이 된다.** 캔버스가 그 문장을 `Sign-in methods` 부제로
그대로 옮겨 놨고 README의 신규 문구 목록에도 없다.
⚠️ **`account-connect`가 출하되는 순간 거짓이 되므로 그쪽 6번과 같은 커밋이어도 된다** — 늦어도
이 화면이 [Connect]를 세우기 전이다.
검증: `pnpm test` green + 새 문장이 [Connect]의 존재와 모순되지 않는다.

## 8. 죽은 문구 제거

`link.methods.disconnected`(`"GitHub is no longer a sign-in method."`)를 `page.tsx`가 `null`로 버린다.
**무음이 정본이면 그 문구를 지운다** — 남겨 두면 다음 사람이 "왜 안 나오나"를 다시 조사한다.
검증: `pnpm test` green + `messages/en.tsx`에서 사라진다.

## 9. 실측과 리뷰 — `/design-sync` 4·5단계

⚠️ **스크린샷으로 판정하지 않는다** — 색·치수는 computed style, 접근성은 CDP 접근성 트리다.
⚠️ **스크롤·hover·선택 상태를 실제로 만들어서 잰다.**
⚠️ **불일치나 리뷰 지적이 하나라도 있으면 수정으로 돌아간다.** 없을 때까지 돈다.
검증: 대조표 전 항목 일치 + 리뷰 지적 0.

## 10. 방어선 — 실측으로 잡은 것을 테스트로 고정

⚠️ **값이 아니라 구조를 센다.** 클래스 문자열을 박으면 스타일을 바꾸는 순간 green인 채 결함만 돌아온다.
검증: 일부러 깨뜨려 red를 확인한다.

*커밋 경계* — `test: pin the account screen structure`

## 11. 정본 반영

`docs/DESIGN.md` §4.1(mono 표에 이메일·`@handle` 한 줄) + 새 raw 색이 늘었으면 §6.2 등재 +
`docs/PRODUCT.md` §4.1의 판정 표식을 ✅로.
⚠️ **문서가 코드보다 앞서가지 않는다** — 프로덕션에 선 뒤다.

*커밋 경계* — 문서별로 하나씩
