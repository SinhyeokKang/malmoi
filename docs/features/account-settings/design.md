# design — account-settings

## 영향 받는 흐름

**편집 UI 하나**다. push·pull과 무관하다.

## ⚠️ 핸드오프가 코드를 잘못 읽은 자리 — 구현 전에 고친다

`/design-sync --audit` 1차(2026-09-13)가 잡은 것이다. **시안이 정본이지만, 시안이 현재 코드에 대해
적은 사실까지 정본인 것은 아니다.**

| 핸드오프 | 실제 | 그래서 |
|---|---|---|
| 보조 문구 `text-xs`(**12**) → 13 | `app/globals.css`의 **`--text-xs: 13px`**(2026-09-12) | **이탈이 아니다.** 대조표에서 뺀다 |
| `User`에 이미지 컬럼이 없다 | `prisma/schema.prisma`에 **있다**(PII 봉투 대상) | 스키마 변경 없음 — `file-upload` 참조 |
| 버튼 "**전부 `md`(36)**"(§4 표) vs 본문의 `default **sm**` | ✅ **캔버스가 `md`로 갈랐다**(2026-09-13 실독) — `1a`·`2b`·`2c`·`2d`의 렌더된 버튼이 전부 `height:36px; border-radius:10px; padding:0 12px; font-size:14px`다 | §4 표가 맞고 **본문의 `sm`이 전부 오기**다 |

## 캔버스 실측값 (`Account.dc.html`, 2026-09-13 실독)

**아트보드 여덟을 전부 읽었다** — `1a` 기본 · `2a` GitHub 블록 넷 · `2b` 수단 행 셋 · `2c` Dialog 넷 ·
`2d` hover·focus·pending · `2e` 머리 Alert 둘 · `2f` 로딩 · `2g` `?sessionRevocation=` 넷.

### 뼈대

| 자리 | 값 |
|---|---|
| `PanelHeader` | `padding: 24 24 12` · 안쪽 `max-width:896` · 세로 `gap:12` · `h1` 20/500 `ls .005em` `min-height:36` |
| `PanelBody` | `padding: 12 24 32` · 안쪽 `max-width:896` · **구역 사이 `gap:28`** |
| 머리 블록 | `padding-bottom:20` + `border-bottom:1px solid #e5e5e5` · 그리드 `128px 1fr` · `gap: 16 12` · `align-items:center` |
| 구역 | 세로 `gap:12`(헤더↔리스트) · 헤더 줄 `align-items:baseline; gap:8` |
| 구역 헤더 | `h2` 14/500 `ls .02em` + 부제 13 `#737373` |
| 리스트 래퍼 | `border:1px solid #e5e5e5` · `border-radius:12` · `overflow:hidden` · **배경 없음** |
| 항목 | `padding:12` · `gap:12` · 둘째부터 `border-top:1px solid #e5e5e5` |
| 글리프 | `32×32` · `radius 8` · `background:#f5f5f5` · svg 16 · 색은 브랜드 `#0a0a0a` / lucide `#737373` |
| 항목 본문 | 세로 `gap:1px` · 이름 14 `ls .02em` · 보조 13 `#737373` `line-height:1.5` |
| 우측 컨트롤 | `flex-shrink:0` · `gap:12` |

### 머리

아바타 `56×56` `radius 999` `background:#d97706`(toneOf) `color:#fff` **20/500** · 아바타↔버튼 `gap:16` ·
버튼 묶음↔캡션 `gap:6` · [Image upload]·[Delete] `gap:8`.
필드 `height:36; width:320; border:1px solid #e5e5e5; radius 10; padding:0 10; font 14 ls .02em`.
이메일 필드만 `background:#f5f5f5; cursor:default` + `readonly` + `tabindex="-1"`, **글자는 `#0a0a0a`**.
라벨 13 `#737373`. 이름 필드↔[Save] `gap:8`, 이메일 필드↔출처 문구 `gap:12`.

### 버튼 셋 (전부 `height:36; radius 10; padding:0 12; font 14 ls .02em`)

| 형 | 값 | hover |
|---|---|---|
| default | `border:1px solid #e5e5e5` · `background:#fff` · `color:#0a0a0a` | `background:#fafafa` |
| danger(외곽선) | `border:1px solid rgba(220,38,38,0.4)` · `background:#fff` · `color:#dc2626` | `background:rgba(220,38,38,0.05)` |
| primary | `border:0` · `background:#171717` · `color:#fafafa` | `background:#0a0a0a` |
| ghost([Delete]) | `border:0` · `background:transparent` · `color:#737373` | `color:#0a0a0a` |

아이콘 전용 [×]·[Dismiss]는 **36 정방** `radius 10` `color:#737373` hover `#0a0a0a`,
음수 마진으로 당긴다(Dialog `-6px -8px 0 0` · Alert `-8px -8px 0 0`).

### Dialog (`2c`)

`width:360` · `background:#fff` · `border:1px solid #e5e5e5` · `radius 12` ·
`box-shadow:0 6px 16px 2px rgba(22,24,27,0.15)`.
헤더 `padding:16 16 8` `align-items:flex-start` `justify-content:space-between` `gap:8` · `h3` **15/500 `ls .015em`** ·
설명 `p` `padding:0 16` **13/1.6 `#737373`** · 검은 줄 `padding:16 16 0` 13/1.6 기본색 ·
푸터 `justify-content:flex-end` `gap:8` **`padding:16`**.

### 상태 셋 (`2d`)

- **hover는 버튼 배경 하나다.** 항목에 배경을 깔지 않는다.
- **focus는 `box-shadow:0 0 0 2px rgb(96 165 250)` + `outline:none`, offset 없음.** 필드도 **같은 링**이고
  **테두리 색을 바꾸지 않는다.**
- **pending은 스피너 16을 라벨 앞에 세우고 라벨은 그대로.** 스피너는 `border:2px` + `border-top-color:transparent`
  + `spin 0.7s linear infinite`. default·danger는 **글자만** `#737373`으로 내려가고(danger 테두리는 붉게 남는다),
  primary는 `opacity:0.7`.

### Alert

머리 Alert(`2e`)와 구역 Alert(`2g`)가 **같은 형**이다 — `border:1px solid rgba(220,38,38,0.4)` ·
`background:#fff` · `radius 12` · `padding:16` · `color:#dc2626` · `gap:12` · 아이콘 `circle-x` `margin-top:2` ·
본문 **14/20 `ls .02em`**.
⚠️ **다른 것은 하나뿐이다 — 머리 Alert에만 [Dismiss]가 있다.** 구역 Alert에는 없다(`2g` 넷 다).
자리: 머리는 `h1` **다음**(`gap:12`), 구역은 **헤더 아래·리스트 위**(`gap:12`).

### 로딩 골격 (`2f`)

블록 `background:rgba(10,10,10,0.05)`, radius는 **자리를 따라간다** — 글자 4 · 버튼·필드 10 · 글리프 8 · 아바타 999.
치수도 실물이다(필드 320×36 · 아바타 56 · 글리프 32).
**Sessions는 안 그린다** — 서버 데이터를 안 기다리는 카드다.

## ⚠️ 캔버스를 읽고 새로 나온 것 다섯

1. **캔버스 주석과 렌더가 두 자리에서 어긋난다.** 근거 카드가 *"업로드는 default **sm**"*이라 적었는데
   렌더는 36(`md`)이고, *"이메일 필드의 다른 것 셋: 배경 · 글자 **`#737373`** · readonly"*라 적었는데
   렌더는 `color:#0a0a0a`다. ⚠️ **렌더된 인라인 스타일이 이긴다** — README 본문도 글자는 `#0a0a0a`라고
   따로 논증했다(muted-on-muted가 14px에서 4.35:1로 하한을 깬다).
2. **README의 hover 값이 초안이다.** `Interactions` 절이 danger hover를 `rgba(185,28,28,0.05)`(red-700)로
   적었는데 캔버스는 `rgba(220,38,38,0.05)`(red-600)다. **토큰과 맞는 쪽은 캔버스**다.
3. ⚠️ **`link.methods.description`이 [Connect]와 함께 거짓이 된다.** 캔버스가 그 문장을 `Sign-in methods`
   부제로 **그대로** 옮겨 놨다 — *"Adding one happens when you sign in with it at this same address."*
   붙이는 문이 로그인뿐이라는 뜻이고, [Connect]가 서면 그 자리가 하나 더 생긴다. **신규 문구 목록에 없다** —
   README가 *"설명문은 코드 원문"*이라 적어 그대로 통과시켰다. **문구 교체가 필요하다.**
4. **Dialog 본문이 코드보다 작고 푸터가 붙어 있다.** 캔버스 설명문 13 vs 코드 `text-sm`(14),
   푸터 위 간격 캔버스 16 vs 코드 24(`p-4` + `pt-2`). 폭 360과 함께 호출부로 내릴 값이다.
5. **`account-settings.prompt.md`는 요청서지 정본이 아니다.** README·캔버스보다 **앞선** 문서이고 넷이
   어긋난다 — 헤더 라벨(`Signing in`·`Repository access` → `Sign-in methods`·`GitHub account`) ·
   `EntityCard` 재사용(→ 리스트 래퍼) · "머리 + **카드** 셋"(→ 리스트 셋) · `[Edit name & picture]` 버튼
   (→ 인라인 필드). ⚠️ **그 파일을 SoT로 읽지 않는다.**

✅ **표기를 `malmoi`로 통일했다** (2026-09-13, 사용자 — 이 기능 착수 전에 별건으로 처리). 여덟 자리가
`Malmoi`였고(`messages/en.tsx` 일곱 + `app/layout.tsx`의 `title`) 전부 소문자로 내렸다.
**`lib/i18n/__tests__/brand-spelling.test.ts`가 그 표기를 상시로 센다** — 이 화면이 신규 문구를 여럿
더하므로, 사전에 대문자가 다시 들어오면 그 커밋이 red다.

## ⚠️ 안 본 화면이 함께 움직이는 자리 넷

**공용 프리미티브의 기본값을 손대면 이 루프가 보지 않은 화면이 함께 움직인다.**

| 무엇 | 누가 같이 쓰나 | 어떻게 한다 |
|---|---|---|
| `DisconnectGithubButton` (danger→default + Dialog) | `/projects/:slug/settings`가 `GithubAccount` 안에서 쓴다 | ⚠️ **핸드오프에 언급이 없다.** 그 화면도 같이 바뀌는 것을 받아들이거나, variant를 호출부 prop으로 내린다. **설정 화면의 그 자리도 같은 동작이므로 함께 바꾸는 쪽을 추천한다** — 같은 버튼이 화면마다 다른 무게면 그 자체가 결함이다 |
| mono 제거(이메일 · `@handle`) | `@handle` 칩이 `components/github-account.tsx`에도 있다 | **둘 다 걷는다.** `/account`만 걷으면 같은 값이 화면마다 갈리고, `docs/DESIGN.md` §4.1이 그것을 **결함으로** 적는다(온보딩 `Input` 하나 때문에 한 번에 걷은 선례). §4.1 표에 한 줄 더한다 |
| Dialog 폭 512 → **360** | `components/ui/dialog.tsx`의 `max-w-lg`가 공용이고 소비자가 넷(archive-card · invite-dialog · member-list · login-methods) | **프리미티브 기본값을 바꾸지 않는다.** 폭을 호출부 prop으로 내리고 이 화면의 넷만 360으로 준다 |
| `Avatar` 56 | `size?: 16 \| 24 \| 32` 유니온 밖 + 글자가 `text-xs` **고정** | 유니온을 넓히고 **글자 크기를 `size`에 연동**한다(56에 12px은 점처럼 보인다). ⚠️ 프리미티브 변경이므로 `entity-card`·`user-menu`의 32가 안 움직이는지 확인한다 |

## 아바타 — ✅ **셸도 사진을 싣는다** (결정 2026-09-13, 사용자)

핸드오프가 아바타 56의 존재 이유로 든 것은 *"셸의 32와 **같은 판정·같은 입력**(`toneOf(name)`)이라
둘이 같은 계정임이 한눈에 붙는다"*이다. 사진이 생기면 `/account`의 56만 사진이 되고 셸의 32는
이니셜로 남아 **그 근거가 자기 손으로 깨진다.** 그래서 셸을 따라가게 한다.

⚠️ **그 비용이 `user-menu.tsx`의 주석이 말하는 것보다 훨씬 싸다 — 주석의 뒷문장이 틀렸다.**

> ⚠️ **아바타 이미지를 싣지 않는다** — `SessionRead`가 `name`·`email`만 든다. GitHub 아바타를
> 넣으려면 `publicSession`이 필드를 하나 더 실어야 하고, 그건 모든 요청의 세션 페이로드를 넓히는
> 결정이다.

앞문장은 참이고 **뒷문장은 거짓이다**:

- `lib/credentials/adapter.ts`의 `getSessionAndUser`가 **`decodeUser(user)`**를 돌려주므로 세션
  콜백이 받는 것은 **복호된** 행이다.
- `lib/auth/public-session.ts`의 허용 목록에 **`image`가 이미 있다** — `/api/auth/session` 본문은
  **지금도** 사진 URL을 싣고 있다.
- 떨어뜨리는 것은 `publicSession`이 아니라 **`lib/auth/read-session.ts`의 `SessionRead`**다
  (`{ status: "ok"; userId; name; email }` — `image`가 없다).

따라서 배선은 `SessionRead` → `header.tsx` → `UserMenu` 세 자리에 필드 하나를 잇는 것이고,
**세션 페이로드는 안 커진다.** ⚠️ **그 주석을 같은 커밋에서 정정한다** — 남겨 두면 다음 사람이
같은 비용을 다시 계산하고 같은 결론을 안 낸다.

## 서버 쪽 — 이 기능이 직접 만드는 것

`file-upload`·`account-connect`가 든 것 말고 여기 남는 것:

- **`updateProfileName`** (신규 Action). `requireUser` → 트림 → 빈 문자열 거부 → 길이 상한 →
  `revalidatePath("/", "layout")`(셸 아바타·사용자 메뉴가 같은 값을 읽는다).
- ⚠️ **`planEmailRefresh`가 이름을 덮지 않게 가른다.** 이것이 이 변경의 **진짜 서버 작업**이다 —
  이름은 사용자 소유, 이메일은 provider 소유로 축이 갈린다. 안 가르면 재로그인 한 번에 사용자가
  고친 이름이 provider 값으로 되돌아간다.
- **`N projects use this connection` 집계**(신규 조회). ⚠️ **`loadAccountView`를 넓히지 않는다** —
  프로젝트 설정 화면이 같은 함수를 쓴다. 세는 기준은 **내가 OWNER이고 보관되지 않은 프로젝트**를
  추천한다(발송이 실제로 멈추는 대상이 그것이다).
  - ✅ **조회 실패면 그 줄을 숨긴다** (결정 2026-09-13, 사용자). Dialog 형이 이미 *"없으면 그리지
    않는다"*이고(수단 해제 Dialog에 검은 줄이 없다), 되돌릴 수 없는 확인 화면에 "모른다"를 하나
    더하면 사용자가 거기서 멈춘다.
  - ⚠️ **그래서 실패가 화면에서 무음이다.** 값으로 가르되(`number | null`) **서버 로그에는 남긴다** —
    숫자가 0이라 안 보이는 것과 조회가 죽어서 안 보이는 것을 나중에 구별할 유일한 흔적이다.
  - ⚠️ **0과 실패를 같은 `null`로 접지 않는다.** 0이면 *"어느 프로젝트도 이 연결을 쓰지 않는다"*를
    말할 수 있고, 그것은 숨길 이유가 없는 정보다.

## 순수 함수로 분리 가능한 부분 → `/tdd` 진입점

| 함수 | 무엇을 판정하나 |
|---|---|
| `planNameSave(raw)` | 트림 · 빈 문자열 거부 · 길이 상한. 거부가 **값**이다 |
| `planEmailRefresh` 확장 | 이름을 `keep`으로 고정하는 갈래 |
| `sessionRevocationMessage(outcome)` | 갈래 **다섯이 문구 넷으로** 접힌다(`invalid`·`unavailable`·제출 실패가 하나) |
| `accountSectionRows(...)` | 구역 셋의 항목을 **같은 규격 하나**로 만든다 |

## 스키마 변경

**없다.** 앞의 둘도 없다.

## 새 환경변수

**없다** (`file-upload`의 `BLOB_READ_WRITE_TOKEN`은 그쪽이 든다).

## 불변식 영향

- **차단 두 층(ARCHITECTURE §6.1)** — `/account`는 이미 `middleware.ts` matcher에 있고 페이지
  최상단이 `requireUser`다. ⚠️ **새 Action 넷이 각자 `requireUser`를 지난다** — 조건부 렌더는
  어느 층도 아니다.
- **§0 불변식 5** — 해당 없다(사용자 축). 단 새 집계 조회는 `userId`로 좁힌다.
- **export 결정성·blob SHA** — 안 건드린다.

## POSTMORTEM에서 소환한 것

- **2026-09-06 — 사유 없는 `disabled`를 만들지 않는다.** 마지막 수단의 [Disconnect]와 사진 없을
  때의 [Delete] 둘이 이 부류다. 사유가 옆에 선다.
- **2026-09-06 — 실어 보낸 사유를 안 읽으면 무음이다.** `?e=`·`?link=`·`?sessionRevocation=` 셋이
  **같은 자리에 서지 않는다**: 앞의 둘은 머리 Alert, 뒤는 Sessions 구역 안 인라인이다.
- **2026-09-08 — 주소창 값 캐스팅.** 셋 다 판정 함수로 거른다.
- **2026-09-13 — 모달 딥링크가 배경 목록을 기다렸다.** 이 화면엔 인터셉팅 슬롯이 없지만, Dialog
  넷을 붙이면서 **열림 상태를 URL에 싣지 않는다**(공유·새로고침으로 확인 대화가 떠 있을 이유가 없다).
