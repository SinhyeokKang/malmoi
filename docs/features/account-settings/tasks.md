# tasks — account-settings

⚠️ **커밋 경계가 없는 태스크가 다섯이다 — 누락이 아니다.** `0`(실독) · `1`(의존 대기) · `9`(실측 루프) ·
`10b`(수동 스위트) · `4b`(4번과 같은 커밋)는 **산출물이 커밋이 아니거나 다른 커밋에 흡수된다.**
나머지는 전부 *커밋 경계*를 갖는다.

⚠️ **번호 순서 ≠ 실행 순서다.** `7`(셸 아바타)은 **`4`보다 앞이거나 같은 커밋**이고 — 아바타 56의
근거가 거기 걸려 있다 — `6`(집계)은 **`5`보다 앞이거나 같은 커밋**이다(GitHub 해제 Dialog의 논거다).
실행 순서: `1 → 2 → 3 → 7 → 4 → 4b → 6 → 5 → 8a → 8 → 9 → 10 → 10b → 11`.

## 0. 캔버스 실독 — ✅ 끝났다 (2026-09-13)

아트보드 **여덟 전부** 읽었고 측정값은 `design.md`의 "캔버스 실측값"에 있다. 버튼 `sm`/`md` 모순은
**`md`로 갈렸다**(렌더가 전부 36/10/14). 새로 나온 것 다섯도 같은 파일에 있다.

⚠️ **`Account.dc.html`은 120KB다.** 다시 볼 일이 생기면 `get_file` → 스크래치패드 저장 →
`grep -n 'id="2c"'` → `sed -n`으로 **아트보드 구역만** 읽는다. 통째로 컨텍스트에 올리지 않는다.
⚠️ **서브에이전트에는 `DesignSync`가 없다** — 상위 에이전트가 직접 받는다.
⚠️ **`account-settings.prompt.md`를 SoT로 읽지 않는다** — README·캔버스보다 앞선 요청서이고 넷이
어긋난다(`design.md` 새로 나온 것 5).

## 1. 의존 둘이 선다

`docs/features/file-upload/tasks.md` 3번 · `docs/features/account-connect/tasks.md` 4번까지.
⚠️ **버튼만 먼저 세우지 않는다** — 뒤가 없는 [Connect]는 리포가 막은 바로 그 모양이다.
검증: 네 Action이 `app/__tests__/entry-points.test.ts`의 `USER_SCOPED_ACTIONS`에 등재돼 있고
`pnpm test`가 green이다.
⚠️ **`app/(edit)/__tests__/authorization.test.ts`가 아니다** — 그 파일은 `saveTranslation`·
`triggerPullAction`만 명시 import하고 파일 스캔을 안 해서, 계정 축 Action을 새로 만들어도 **영원히
green**이다. 사용자 소유 행을 쓰는 Action을 실제로 강제하는 것은 `entry-points.test.ts`의 그 목록이고,
이름을 손으로 등재하지 않으면 `requireUser`만으로는 `unguarded`에 실려 red다.

## 2. 이름 저장 — `/tdd interface`

`planNameSave` 순수 함수(트림 · 빈 문자열 거부 · 길이 상한 — 거부가 **값**이다) + `updateProfileName` Action.

⚠️⚠️ **`User.name`은 PII 봉투 대상이다 — `encodeUserFields`를 지난다.** `prisma.user.update({ data: { name } })`를
직접 쓰면 평문이 들어가고 **다음 `decodeUser`가 `CredentialError`로 죽는다**(`lib/credentials/storage.ts`의
`PiiContext` · `records.ts`의 `["name","image"]` 루프). ⚠️ **`prisma/schema.prisma`에 그 주석이 없으므로**
같은 커밋에서 `name`·`image` 두 컬럼에 봉투 주석을 단다(마이그레이션 아님 — `///` 주석만).

⚠️ **`planEmailRefresh`를 확장하지 않는다 — 1차 설계가 대상을 잘못 짚었다.** 그 함수는 입력 넷이 전부
이메일이고 유일 호출부가 `{ email: fresh }`만 쓴다. 이름을 덮는 실제 통로는 `lib/credentials/adapter.ts`의
`updateUser`이고, **OAuth 재로그인은 그 메서드를 안 부른다**(`auth.ts`·`lib/auth/email.ts`·ARCHITECTURE 셋이
못 박았다). 즉 지금은 안전하고, **막을 것은 "그 사실이 계약이라는 것"**이다.

⚠️ **같은 오해가 세 자리에 더 있다 — 같은 커밋에서 정정한다**: `docs/DESIGN.md` · `messages/en.tsx`의
프로필 설명문 · `app/(edit)/account/page.tsx`의 *"프로필은 읽기 전용이다"* 주석(**이 태스크가 그 문장을
거짓으로 만든다**). ⚠️ 근거가 이메일 축에만 성립한다는 논증을 주석에 남긴다.

**저장 피드백**: `[Save]` 오른쪽 `text-xs` "Saved" 인라인 + 실패는 in-block `Alert danger`
(`repository-form.tsx`·`base-locale-form.tsx`와 같은 형). ⚠️ **토스트가 아니다** — 이 리포에서 저장 결과를
토스트로 내는 자리는 0이다. ⚠️ **blur 저장도 아니다.**

검증: `pnpm test` green — ① `planNameSave`의 거부 갈래 전부(빈 문자열 · 공백만 · 상한 초과 · 유니코드/이모지)
② **`updateUser`에 `name`이 들어오면 덮고, OAuth 재로그인 경로는 그것을 안 부른다**가 회귀 테스트로 선다
③ 저장 후 행이 `enc:v1:`로 시작한다.
⚠️ **③의 실 PostgreSQL 왕복은 `pnpm test` 밖이다** — 아래 10b를 함께 돌린다.

*커밋 경계* — `feat(account): let people edit their display name`

## 3. 프리미티브 **여섯**을 안전하게 옮긴다

`design.md`의 "안 본 화면이 함께 움직이는 자리 **여섯**" 표 그대로. ⚠️ **1차 감사는 넷이라 적었고 실물
대조에서 둘이 더 나왔다**(Button hover) — **이 표도 전수라고 가정하지 않는다.**

- ✅ **Dialog는 프리미티브 기본값을 바꾼다** (2026-09-13, 사용자) — 폭 512→**360**, 그림자
  `shadow-lg`→**`shadow-medium`**(DESIGN §4.5가 Tailwind 기본 그림자를 금지한다), 설명문 14→**13**,
  푸터 위 24→**16**. **소비자 넷이 전부 움직인다**(archive-card · invite-dialog · member-list ·
  login-methods) — 넷 다 실측 대상이다. ⚠️ **"이 화면의 Dialog 넷"이 아니다** — 지금 `/account`의
  Dialog는 **1개**다.
- ✅ **Button hover 둘도 캔버스로 맞춘다** — `default` `bg-accent`(#f5f5f5)→**#fafafa**,
  `primary` `bg-primary/90`→**#0a0a0a**. ⚠️ **primary는 방향이 반대다**(코드는 hover에서 밝아진다).
  **앱 전체의 버튼이 움직인다.** ⚠️ #fafafa는 `--primary-foreground`의 **세 번째 역할**이므로
  DESIGN §6.2의 그 문단에 한 줄 더한다.
- ✅ **mono는 여섯 자리를 전부 걷는다** (2026-09-13, 사용자) — 이메일 넷(`account/page.tsx` ·
  `member-list.tsx` · `pending-invitations.tsx`) + `@handle` 둘(`account/page.tsx` ·
  `github-account.tsx`). ⚠️ **`/account`만 걷으면 §4.1이 결함으로 적는 "같은 값이 화면마다 갈린다"가
  그대로 재현된다.** ⚠️ **DESIGN §4.1과 §6.67이 이미 어긋나 있다**(§6.67이 이메일을 mono로 규정) —
  **둘 다 고친다**(태스크 11).
- **`Avatar`는 `size` 유니온 + 글자 크기 연동만** 넓힌다. ⚠️ **사진 렌더는 프리미티브 변경이 아니다** —
  `src`를 이미 받아 `<img>`를 그린다. ⚠️ **`components/ui/entity-card.tsx`의 주석이 "`size` union을
  넓힐 이유가 없다"고 적어 놨다 — 같은 커밋에서 정정한다.** ⚠️ 소비자 둘 다 32라 안 움직인다.
- **`DisconnectGithubButton`** danger→default + Dialog. `/projects/:slug/settings`도 함께 바뀐다.
- **[×]·[Dismiss]** 28/radius 8 → **36 정방/radius 10**(`ghost` + `size-9 rounded-md`, `size="icon"`은
  만들지 않는다). ⚠️ **DESIGN §6.4의 *"닫기 우상단 `ghost sm`"*도 같이 고친다.**

⚠️ **일괄 치환은 `assert`로 강제한다** — 대상이 없어도 조용히 지나가는 치환으로 "고쳤다"고 보고하면
거짓 보고가 된다.
검증: `pnpm test` green + **`/projects/:slug/settings`·Dialog 소비자 넷이 의도한 만큼만 움직였는지 실측**
(의도한 것 = 위 목록의 항목뿐이고, 그 외 computed style이 바뀌면 불일치다).

*커밋 경계* — `refactor(ui): align the shared primitives with the canvas`

## 4. 화면 재편 — 머리 하나 + 리스트 셋

`Card` 다섯 → 머리(아바타 56 + 이름 필드 + 이메일 읽기 전용) + 구역 셋(수단 · GitHub · Sessions).
세션 둘은 **한 리스트의 항목 둘**이고 순서가 뒤집힌다(Sign out이 위).
⚠️ **항목 규격 하나**를 쓴다 — 글리프 32(radius 8) · 이름 14 · 보조 13 · 우측 컨트롤.
⚠️ **리스트 래퍼는 New Project의 리포 목록과 같은 구조다**(테두리 하나 + `overflow:hidden` + 둘째부터
`border-top`). 항목마다 테두리를 주면 셋뿐인 목록이 카드 갤러리처럼 무거워진다.
검증: `pnpm build` green(RSC 경계는 `tsc`가 못 본다) + 1440×900에서 **가로 스크롤 0**(`document.
documentElement.scrollWidth <= clientWidth`) + **리스트 항목의 우측 컨트롤이 줄바꿈되지 않는다**
(`flex-shrink:0`이 computed style에 살아 있다).

*커밋 경계* — `feat(account): one header and three lists`

## 4b. 사진 컨트롤 — `file-upload`가 넘긴 자리

`docs/features/file-upload/tasks.md` 7번이 이름으로 넘긴 여섯을 여기서 전부 든다. **하나라도 빠지면
거부 사유가 값으로 돌아와도 화면에 안 닿는다** (POSTMORTEM 2026-09-06).

- **`components/ui/`에 `FileInput` 프리미티브**(19번째). `accept="image/png,image/jpeg"`.
  ⚠️ **raw `<input type="file">`을 화면 파일에 두지 않는다** — `focus-ring.test.ts:43`의
  `RAW_TAG_ALLOWED = []`가 전면 방어선이고 주석이 *"다시 채우지 않는다"*로 못 박았다.
  ⚠️ **`sr-only` + 라벨 관용구라 포커스 링이 사라진다** — `peer-focus-visible`로 라벨에 옮긴다.
- **클라이언트 `File.size` 선검사(800 KB)** — 서버 판정이 정본이고 이쪽은 바이트를 안 보내기 위한
  1차 방어다. ⚠️ **Next의 Server Action 본문 기본 상한이 1 MB라 그 위는 프레임워크가 던진다** —
  상한을 그 아래로 둔 이유가 그것이다(`file-upload/spec.md` 완료 조건 1).
- **`messages/en.tsx`의 `errors.upload.*`** — 능력 쪽은 `UploadReject` union의 **갈래 이름만**
  정의한다. ⚠️ **문구를 `lib/upload/`에 두면 `no-korean-ui.test.ts`가 한글만 세므로 green인 채
  사전을 통째로 우회한다.**
- **캡션** `"PNG or JPEG, up to 800 KB. Uploaded as-is."` — ⚠️ **"as-is"가 EXIF를 안 벗긴다는
  판정을 말하는 자리다**(2026-09-13, 사용자). 빼면 그 판정이 화면에서 사라진다.
- **pending** — `Button`의 `loading`. ⚠️ **진행률 바를 만들지 않는다**(DESIGN: 전역 스피너·진행률
  숫자가 없다).
- **[Delete]의 `disabled` 옆 사유 캡션** — 사진이 없을 때다. 시안이 캡션으로 그렇게 그렸고,
  POSTMORTEM 2026-09-06이 *"사유 없는 `disabled`를 만들지 않는다"*로 못 박은 자리다.

⚠️ **4번(화면 재편)과 같은 커밋이거나 그 뒤다** — 아바타 56이 먼저 서야 미리보기가 들어갈 자리가 있다.
검증: `pnpm test` green + `pnpm dev`에서 ① 900 KB PNG를 고르면 **제출 전에** 사유가 보이고
② `.png`로 이름만 바꾼 SVG가 **서버 사유**로 거절되며 ③ 사진이 없을 때 [Delete] 옆에 사유가 선다.

## 5. Dialog 넷

수단 해제(기존) + 연결 해제 · 전체 로그아웃 · 로그아웃(신규 셋).
⚠️ **전체 로그아웃은 `useActionState`의 제출 지점이 Dialog 안으로 들어간다.** 실패 Alert는
**카드에 남긴다** — Dialog가 닫힌 뒤에도 사유가 보여야 한다.
⚠️ **제목이 대상을 명시한다** — 이 화면에 같은 라벨의 `Disconnect`가 둘이다. 기존 셋이 이미 그 형이다
(`Archive ${name}?` · `Remove ${who} from this project?` · `Disconnect ${provider}?`).
⚠️ **로그아웃만 확정이 primary다**(잃는 것이 없다). 넷을 다 붉게 칠하면 같은 무게로 보인다.
⚠️ **`components/account/login-methods.tsx`의 주석을 같은 커밋에서 정정한다** — *"`DisconnectGithubButton`과
달리 확인을 받는다 — 그쪽은 다시 누르면 복구되는 GitHub App 연결"*이 이 태스크로 거짓이 된다.
**뒤집는 논거를 그 자리에 남긴다**: 복구가 쉬운 것과 결과가 가벼운 것은 다른 일이고, 이 해제는 내가
OWNER인 모든 프로젝트의 발송을 멈춘다(6번의 집계 한 줄이 그 논거의 화면 쪽 짝이다).
⚠️ **취소 라벨을 `m.members.cancel`에서 빌려 오지 않는다** — 지금 `login-methods.tsx`가 그렇게 쓰고
있고, 구역이 다른 문구를 가져다 쓰면 한쪽을 고칠 때 다른 쪽이 조용히 따라 움직인다.
검증: `focus-ring.test.ts`에 새 Dialog 안 버튼 넷이 든다 + `pnpm test` green.

*커밋 경계* — `feat(account): confirm the four irreversible actions`

## ~~6. 집계 한 줄~~ — ❌ **만들었다가 걷었다** (2026-09-14)

`N projects use this connection.`을 `lib/account/connection-usage.ts`로 만들어 행과 Dialog 두 자리에
세웠고, **9번 실측 뒤 리뷰가 그 숫자를 무너뜨렸다**: 기준이 *"내가 OWNER이고 보관되지 않은 프로젝트"*라
**이 연결에 의존하지 않는 것까지 셌다**(`installationId`가 `null`인 프로젝트도 들어간다). 해제가 실제로
막는 것은 리포 (재)연결뿐이고 야간 pull·PR은 App **설치 토큰**이 낸다 — 숫자가 근거가 될 수 없어
모듈·테스트·두 자리를 함께 지웠다.

⚠️ **그 판정이 5번(Dialog)을 무효로 만들지는 않는다** — Dialog는 남고, 근거가 *"되돌리려면 OAuth 왕복
전체"*로 바뀌었다(`spec.md`). **이 절을 지우지 않고 남기는 이유**가 그것이다: 다음 사람이 같은 집계를
다시 제안할 때 "왜 걷었나"가 여기 있어야 한다.

## 7. 셸 아바타가 사진을 받는다 — ✅ 결정됨 (2026-09-13, 사용자)

`SessionRead` → **`app/(edit)/layout.tsx`** → `header.tsx` → `UserMenu` **네 자리**에 `image` 하나를
잇는다. ⚠️ **`layout.tsx`를 빼먹지 않는다** — 세션을 실제로 읽는 것이 그 파일이라 앞뒤만 고치면 값이
`undefined`로 흐른다. `Avatar`는 이미 `src`를 받으므로 프리미티브는 안 건드린다.
⚠️ **`components/shell/user-menu.tsx`의 주석을 같은 커밋에서 정정한다** — *"publicSession이 필드를
하나 더 실어야 한다"*가 거짓이다(`design.md`의 근거 셋). 남겨 두면 다음 사람이 같은 비용을 다시
계산한다.
⚠️ **같은 거짓 문장이 `docs/PRODUCT.md` §4.1에도 있다**(커밋 `fa581fb`가 새로 새겼다). **코드 주석은
여기서, PRODUCT는 11번에서** 고친다 — 문서는 프로덕션에 선 뒤다.
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
⚠️ **같은 부류의 문장이 코드 주석에 둘 더 있다** — `app/(edit)/account/page.tsx`의 *"⚠️ [Connect]가
없다 — 붙이는 문은 `finishLink` 하나뿐이다"*와 *"⚠️ 프로필은 읽기 전용이다"*. **앞의 것을 여기서,
뒤의 것을 2번에서** 정정한다.
검증: `pnpm test` green + 새 문장이 [Connect]의 존재와 모순되지 않는다.
⚠️ **`brand-spelling.test.ts`가 `malmoi` 표기를 상시로 센다** — 새 문구에 `Malmoi`가 들어오면 red다.

*커밋 경계* — `fix(account): the sign-in methods subtitle no longer says login is the only door`

## 8. 죽은 문구 제거

`link.methods.disconnected`를 `page.tsx`가 `null`로 버린다. ⚠️ **그 값은 문자열이 아니라
`(provider: string) => string` 템플릿이다**(`"GitHub is no longer…"`는 `provider="GitHub"`일 때의
출력이다) — 지울 때 호출부를 찾는 grep이 문자열로는 안 걸린다.
**무음이 정본이면 그 문구를 지운다** — 남겨 두면 다음 사람이 "왜 안 나오나"를 다시 조사한다.
검증: `pnpm test` green + `messages/en.tsx`에서 사라진다 + 전 리포 grep 결과 참조 0.

*커밋 경계* — `chore(i18n): drop a message nothing renders`

## 9. 실측과 리뷰 — `/design-sync` 4·5단계

⚠️ **스크린샷으로 판정하지 않는다** — 색·치수는 computed style, 접근성은 CDP 접근성 트리다.
⚠️ **스크롤·hover·선택 상태를 실제로 만들어서 잰다.**
⚠️ **불일치나 리뷰 지적이 하나라도 있으면 수정으로 돌아간다.** 없을 때까지 돈다.
⚠️ **대조 범위는 "캔버스 전부"가 아니라 `design.md` 대조표에 **남은** 항목이다** — 근거를 적고 뺀 것
(`--text-xs`가 13px인 자리)은 대상이 아니다. **그 표가 범위의 정본이고, 루프 중에 항목을 빼려면
근거를 같이 적는다.**
⚠️ **`/account` 밖 화면 다섯도 실측 대상이다** — 프리미티브 여섯이 움직이므로
`/projects/:slug/settings` + Dialog 소비자 넷. **거기서 바뀐 것이 3번 목록의 항목뿐인지** 확인한다.
검증: 대조표 전 항목 일치 + 리뷰 지적 0 + 위 다섯 화면의 의도 밖 변화 0.

## 10. 방어선 — 실측으로 잡은 것을 테스트로 고정

⚠️ **값이 아니라 구조를 센다.** 클래스 문자열을 박으면 스타일을 바꾸는 순간 green인 채 결함만 돌아온다.
세는 것은 **넷**이다:

- **머리 하나 + 리스트 셋**이고 각 리스트가 래퍼 하나 안에 있다(항목마다 테두리가 아니다).
- **되돌릴 수 없는 넷이 각자 `Dialog`를 지난다** — 확인 없이 제출하는 버튼이 0이다.
- **`?e=`·`?link=`·`?sessionRevocation=` 셋이 각자 자리에 닿는다**(앞의 둘은 머리 Alert, 뒤는
  Sessions 구역 안 인라인). ⚠️ **화면을 실제로 렌더하는 테스트만 이 부류를 잡는다** — 요소 트리만
  순회하면 green이 무죄의 근거가 아니다(POSTMORTEM 2026-09-11).
- **사유 없는 `disabled`가 0이다** — 마지막 수단의 [Disconnect]와 사진 없을 때의 [Delete] 옆에
  캡션이 선다.

검증: **일부러 깨뜨려 red를 확인한다** — 넷을 각각 한 번씩(Dialog 하나 제거 · Alert 하나 제거 ·
리스트 래퍼 분해 · 캡션 제거).

*커밋 경계* — `test: pin the account screen structure`

## 10b. `pnpm test` 밖 스위트를 손으로 돌린다 ⚠️ 잊으면 green인 채 red가 남는다

**`pnpm test:credentials:postgres`** — `lib/credentials/__tests__/postgres.integration.ts`가 이 기능이
건드리는 것 둘을 단언한다:

| 축 | 단언 | 이 기능이 무엇을 하나 |
|---|---|---|
| 문자열 | `…/account?sessionRevocation=invalid` · `…=wrong-account` (+ `callbackUrl`의 `…=expired`) | `?sessionRevocation=`의 **수신 지점이 Sessions 구역 안 인라인으로 옮겨간다** |
| PII 봉투 | 저장된 행이 `enc:v1:`로 시작 + 재로그인 왕복 | `updateProfileName`이 **`name` 봉투 왕복을 새로 만든다** |

⚠️ **POSTMORTEM 2026-09-10 그대로다** — *"손으로 돌릴 스위트의 트리거는 어느 디렉터리를 건드렸나가
아니라 **무엇을 단언하나**로 쓴다."* 그때 `pnpm test` 2553 green인 채 옛 문자열 단언이 살아 있었다.
⚠️ **`lib/credentials/**`를 안 건드려도 돌린다** — 이 기능이 건드리는 것은 `lib/session-revocation/`·
화면·`app/(edit)/account/`인데, 그 파일이 단언하는 것은 **앱 전역 문자열과 봉투 왕복**이다.

**재로그인 경로(`relogin`)에 이름 단언을 하나 더한다** — *"사용자가 고친 이름이 재로그인 뒤에도
남아 있다"*. 2번의 계약을 실 PostgreSQL에서 보는 유일한 자리다.

검증: `pnpm test:credentials:postgres` green (필요하면 `pnpm test:projects:postgres`도 — 6번 참조).

## 11. 정본 반영

⚠️ **문서가 코드보다 앞서가지 않는다** — 프로덕션에 선 뒤다.

### `docs/DESIGN.md`
- **§4.1** mono 표에 이메일·`@handle` 한 줄. ⚠️ **§6.67도 같이 고친다** — *"주소는 식별자라
  `text-mono`"*가 §4.1과 이미 어긋나 있고, 한쪽만 고치면 다음 사람이 둘을 보고 갈린다.
- **§6.2** — ✅ **새 raw 색은 0건이다**(실물 대조 완료: 캔버스 값 전부가 기존 토큰/알파 조합에 정확히
  대응한다). 등재는 불필요하고, 대신 **`--primary-foreground`(#fafafa)가 "역할을 하나 더 든다"는
  문단에 세 번째 역할**(Button `default` hover)을 더한다.
- **§6.4** — Dialog 행(`max-w-lg`·`shadow-lg` → 360·`shadow-medium`) + *"닫기 우상단 `ghost sm`"* →
  36 정방 + Button hover 둘 + Avatar `size`에 56.
- **§7** — ⚠️ *"`focus-visible:ring-offset-1`은 남겨 뒀다"*가 **stale이다**(실물 사용처 0건). 이 기능이
  focus를 안 건드리므로 **고칠지만 판단하고, 안 고치면 여기 한 줄로 남긴다.**

### `docs/PRODUCT.md`
- **§4.1** — 판정 표식 둘 중 **프로필 편집·사진 쪽만** ✅로. ⚠️ **[Connect] 쪽은 `account-connect`가
  든다.**
- ⚠️⚠️ **§4.1의 `publicSession` 근거를 지운다** — *"`publicSession`을 넓히면 모든 요청의 세션
  페이로드가 커진다"*가 **코드상 거짓이다**(`lib/auth/public-session.ts`에 `image`가 이미 있다).
  `fa581fb`가 새로 새긴 문장이고, 떨어뜨리는 것은 `SessionRead`다. **안 지우면 다음 사람이 같은
  비용을 다시 계산한다.**
- **§7.7 IA** — ⚠️ **표 아래 ⚠️ 문단이 두 항목을 함께 든다**(프로필 편집·사진 / [Connect]).
  **내 절반만 지운다** — 통째로 지우면 아직 안 선 항목의 경고까지 사라진다.

### `docs/ARCHITECTURE.md`
- ⚠️ **뒤집힌 문장이 살아 있다** — *"그 조건을 적을 수 없는 진입점은 만들지 않는다 — `/account`에
  **[Connect]가 없는 이유다**."* PRODUCT는 `fa581fb`에서 지웠는데 ARCHITECTURE는 추가만 했다.
  ⚠️ **이건 `account-connect` 소관이다** — 여기서는 **자리만 기록하고 고치지 않는다.**

*커밋 경계* — 문서별로 하나씩 (`docs(DESIGN): …` · `docs(PRODUCT): …`)
