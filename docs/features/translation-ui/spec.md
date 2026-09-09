# translation-ui — 번역 UI 재작성 + Publish + 전 화면 재구축 (SaaS 6단계)

> 정본은 [SAAS.md](../../SAAS.md) §8 6단계다. 이 문서는 그 체크리스트를 **완료 조건이 붙은 스펙**으로
> 펼치고, 5단계까지 "기존 관용구 그대로" 붙여 온 화면 전부를 이번에 **한 디자인 시스템 위에서 다시
> 만든다**는 결정을 기록한다. 라우트별 사용자 스토리는 [user-stories.md](./user-stories.md), 시각 규칙은
> [DESIGN.md](../../DESIGN.md)(레퍼런스는 GitLab — **레이아웃·정보구조·컴포넌트 구성만**, 색·타입 토큰은 기존 유지), 설계는 [design.md](./design.md).
>
> 2026-09-07 결정 셋 (사용자):
> 1. **시각 레퍼런스를 Supabase → GitLab으로 바꾼다** — 가져오는 것은 **레이아웃·정보구조·컴포넌트 구성**이고 **색 토큰·타입 스케일·간격은 기존
>    slate + shadcn 시맨틱 그대로다** (2026-09-07 재확인 — 처음 초안이 Pajamas 팔레트까지 들였다가 되돌렸다). 근거는 §2.5.
> 2. **UI 전부를 영어 단일로 만든다.** 문자열은 사전 한 벌(`messages/en.tsx`)로 빼서 ko를 나중에 더할 수
>    있게 **구조만** 잡는다 — 언어 전환 UI는 만들지 않는다.
> 3. **T5(5단계)까지의 화면 전부가 재작성 대상이다** — 번역 화면만이 아니다.
>
> **2026-09-08 `/feature-review` 결정 — 단계를 둘로 나눈다** (design §11 #6). **6a**가 이 문서의 §3이고 SAAS §8 6단계의 완료 게이트를
> 전부 닫는다. **6b**(§3.10)는 6a 머지 뒤 별도 사이클이다 — 어댑터 오류 코드화·설정의 base 필드·멤버 화면·`/account`. 6a는
> `lib/adapters/**`를 건드리지 않아 재측정 없이 나간다. 셋(CPO·CTO·QA)이 독립적으로 같은 절단선을 냈다: 그 넷은 완료 게이트에 기여하지
> 않으면서 재측정 실패 하나가 UI 전체 머지를 막을 수 있었다.

## 1. 사용자

이 단계는 **둘 다**를 위한 것이고, 화면마다 주 사용자가 다르다.

| 화면 | 주 사용자 | 왜 |
|---|---|---|
| 번역 (`/projects/:slug/translations`) | **번역 편집자** (비개발자 동료, EDITOR) | 이 도구의 가치가 실현되는 유일한 화면. 하루의 대부분을 여기서 보낸다 |
| 설정 (`/projects/:slug/settings`) | 개발자 (OWNER) | 리포 연결·상태·push 토큰·워크플로 |
| 새 프로젝트 (`/projects/new`) | 개발자 | 첫 왕복을 설명 없이 끝내는 것이 SAAS §1 완료 조건이다 |
| 프로젝트 목록 · 로그인 · 초대 수락 | 둘 다 | 진입점 |
| 멤버 (`/projects/:slug/members`) · 계정 (`/account`) | — | **6b** (§3.10) |

**SAAS §3의 "편집자가 알 필요 없는 것"** (`adapterName`·`pathTemplate`·blob SHA·토큰 종류)은 이번에도
화면에 오르지 않는다. 문자열이 영어가 된다고 어휘가 개발자 어휘가 되는 것은 아니다 — Publish의 결과
문구가 "PR opened"가 아니라 "Sent for review"인 것은 `lib/pull/message.ts`가 이미 정한 방향이고
**그대로 간다** — 그 파일의 테스트가 `PR|pull request|merge|commit|branch` 어휘를 금지하고 있고(`message.test.ts:52,59`),
새 문구도 그 검사를 지난다.

## 2. 문제 — 관측된 것

### 2.1 화면이 "동작 확인용 동결분"의 연장이다

- MVP §8.3이 편집 UI를 동결했고, SaaS 2·4·5단계는 새 화면을 **"기존 관용구 그대로"** 붙였다
  (`features/tenant-auth/design.md` §4.1). 결과가 hand-rolled 컨트롤 13종을 클래스 문자열로 고정한 옛 DESIGN §6.4 표였고,
  그 표조차 "툴바형의 `font-medium`이 파일마다 갈려 있다"고 적어야 했다.
- `components/ui/`(shadcn 생성물 4개)는 **앱에서 import 0곳**이다. 디자인 시스템이 없는 상태에서 화면이
  여섯 개까지 늘었다.
- 옛 DESIGN §9가 레퍼런스(Supabase)를 정했지만 **반영된 것이 없다** — 좌측 사이드바·프로젝트 전환·밀도 중
  어느 축도 화면에 없다. 현재 사이드바 자리는 번역 화면 안의 네임스페이스 목록이다.

### 2.2 번역 화면의 실측 결함

- **첫 착지가 느리다**: `ts-dict` 903키 프로젝트의 필터 없는 화면이 **12.7초** · `<input>` 2,711개 ·
  네임스페이스 52개 (2026-09-07 `/bugshot-qa`). SAAS §8 6단계가 "기본 착지를 첫 네임스페이스로"를
  답으로 적어 뒀다.
- **Publish 피드백이 버튼 옆 한 줄이다.** 미배포 변경 수가 없고, PR 링크는 그 순간의 응답에만 있어
  새로고침하면 사라지고, `PullResult`가 "새 PR"과 "기존 PR 갱신"을 **구별하지 않는다**(`committed`
  하나, `run.ts:158`) — SAAS §8 6단계 완료 게이트 "서로 다른 상태"가 지금은 성립하지 않는다.
- **편집 손실 창 안내가 없다** (MVP §3.1이 감수한 대가, §8.3이 SaaS로 이관). 편집자는 자기 편집이
  다음 코드 push에 덮일 수 있다는 것을 어디서도 듣지 못한다.
- **덮인 셀에 편집자 이름이 남는다** (MVP §10 미결). push의 strict 덮어쓰기가 `updatedBy`를 건드리지
  않아(`apply.ts:209`), 리포 값으로 바뀐 셀 아래 사람 이름이 그대로 붙는다 — 화면이 거짓을 말한다. malmoi#3으로
  이름이 사람처럼 보이게 된 뒤라 그 거짓이 더 잘 읽힌다.
- **저장 상태가 접근성에 닿지 않는다** (features/README 백로그, tenant-auth CDO 검수): 저장 실패 문구에
  `role=status`가 없어 스크린리더가 읽지 않고, blur로 포커스가 떠난 뒤라 재시도 지점이 없다.

### 2.3 멤버·계정 관리가 임시다 → 6b

- ✅ **멤버 관리는 6b-2가 닫았다** (2026-09-09) — `/projects/:slug/members` 신설. 그 전에는 번역 화면 헤더의
  **임시 초대 폼** 하나였고 `changeMember`(역할 변경·제거)는 2단계가 만들었으나 **테스트에서만 불렸다**.
  이제 멤버 목록·역할 변경·제거·대기 초대·`revokeInvitation`이 화면에 있고 임시 폼은 삭제됐다.

  ⚠️ **왜 `/settings`의 섹션이 아니라 별도 라우트인가.** `github-connect/spec.md`(§1·§4 표)는 "같은
  `/settings` 페이지에 얹는다"로 결정했고 **그것을 6b-2가 뒤집었다**(그쪽에 🔴 STALE로 표시했다). 이유는
  **게이트가 다르다**: `/settings`는 `project:settings` 뒤라 EDITOR가 못 들어오는데(실측 —
  `/projects?e=forbidden`) user-stories §5는 "EDITOR는 목록만 본다"로 결정했고 "누가 이 프로젝트에 있나"는
  번역자에게도 필요한 정보다. 섹션으로 얹으면 그 스토리를 만족시킬 길이 게이트를 `translation:write`로
  낮추는 것뿐이고, 그러면 **리포 연결·push 토큰 재발급이 EDITOR에게 열린다.** 그래서 멤버 화면은
  `translation:write`로 들어오고 **컨트롤만** `member:manage`로 갈린다 — 판정은 Action이 한다.
  라우트 하나가 늘어나는 대가는 `middleware.ts`의 `matcher`가 `/projects/:path*`라 이미 덮고 있어 0이었다.
- GitHub 계정 **해제**는 2026-09-07에 사용자 수준으로 옮겨져 `/projects`의 계정 섹션에 있다(`disconnectGithub()`, `requireUser`).
  `/account` 신설은 그 섹션의 이사일 뿐이라 **만들지 말지부터** 6b가 판정한다(SAAS §8 6단계 3번은 이미 `[x]`).

### 2.4 문자열이 한국어로 소스에 박혀 있고 문체가 갈린다

- 사용자 문자열이 `app/`·`components/`·`lib/*/message.ts` 넷(`auth`·`github-connect`·`onboarding`·
  `pull`)에 **하드코딩**돼 있다. design.md §1.1이 인벤토리다(약 150개 — 정확한 수는 T1의 `no-korean-ui` 허용 목록이 센다).
- 문체가 "-다"(번역 화면 빈 상태 둘)와 "-요"(나머지)로 갈려 있다.
- 포트폴리오 대상(SAAS §8 8단계 — 외부 방문자·평가자)에게 한국어 UI는 장벽이다. **1차 언어를 영어로
  바꾸는 것이 이 단계의 결정이다.** ko는 나중이고, 그때 문자열을 다시 소스에서 뽑지 않으려면 지금 사전
  구조를 잡아야 한다.

### 2.5 레퍼런스 변경의 근거 — Supabase → GitLab

Supabase를 골랐던 이유(옛 DESIGN §9.1)는 "개발자 도구이면서 비개발자도 쓰는 밀도, 프로젝트 전환이 일급인
정보구조"였다. GitLab은 그 둘을 **더 직접적으로** 갖고 있고, 셋이 더 있다:

1. **라이트가 기본이다.** Supabase는 다크가 기본이라 옛 DESIGN §9.2가 "다크를 가져오지 않는다"를 따로 막아야
   했다. GitLab은 레이아웃을 보는 동안 다크를 의식할 일이 없다.
2. **공개 디자인 시스템(Pajamas)이 있다.** 레이아웃 치수·컴포넌트 구성·문장 규칙이 문서화돼 있어 "닮았는가"가 아니라
   **값으로** 따를 수 있다(사이드바 240px·top bar 48px·표 구성 등). **색·폰트는 가져오지 않는다** — 우리 토큰이 있다.
3. **이 도구의 사용자가 이미 GitLab/GitHub 모양에 익숙하다.** 결과물이 PR(MR)이고 편집자가 개발자와 그
   화면에서 만난다 — 같은 시각 언어를 쓰면 "내가 고친 것이 저기로 간다"가 화면에서 이어진다.

⚠️ **DESIGN.md는 이미 6a의 목표 상태로 쓰여 있다** (HEAD `ab44ec8`). §3.1·§6.4·§7이 "shadcn 생성물 삭제됐다·`dark:` 0곳·focus-ring이
`ui/` 밖 raw 태그 0 고정"을 현재형으로 적었지만 실물은 T5 전까지 다르다. T5 커밋이 그 서술을 실물로 만든다 — 그 전까지의 `/doc-check`
불일치는 의도된 상태다(tasks T0).

## 3. 완료 조건 — 검증 가능한 문장으로 (6a)

### 3.1 디자인 시스템

- [ ] `docs/DESIGN.md`가 GitLab을 **레이아웃·정보구조·컴포넌트 구성**의 레퍼런스로 삼고, **색·타입·간격 토큰은 기존 그대로**다 (HEAD에 이미 반영 — 전제).
      검증: `app/globals.css`의 토큰 값이 바뀌지 않았다(`git diff` 0).
- [ ] `components/ui/`가 **이 리포가 소유하는 프리미티브 16개**로 바뀐다 (shadcn 생성물 4개는 지운다): Button(variants **`primary`·`default`·`danger`·`ghost`·`link`** —
      DESIGN §6.4가 정본, sizes `md`·`sm`) · Input · Textarea · Select · Radio · FormGroup · Badge · Alert · Card · Table · Breadcrumb · Avatar · EmptyState ·
      DropdownMenu · Dialog · Tooltip. **Checkbox·Skeleton은 없다**(와이어 8개에서 사용 0). 검증: `focus-ring.test.ts`가 **`ui/`를 더 이상 제외하지 않고** green이다.
- [ ] `app/`·`components/`(`ui/` 밖)에 **raw `<button>`·`<input>`·`<select>`·`<textarea>`가 0개**다 — 전부 프리미티브를 지난다. 검증: `focus-ring.test.ts`의
      **raw 태그 허용 파일 목록이 비어 있다**(축소형 — 목록 밖 파일에 raw 태그가 있으면 red, 목록의 파일에 없어도 red).
- [ ] 라이트 단일이 유지된다. 검증: `lib/__tests__/globals-css.test.ts` green (`@custom-variant dark` 유지) · `components/ui/`에 `dark:` 0곳.
- [ ] `text-mono` 유틸·twMerge 등록이 유지된다. 검증: `git diff lib/utils.ts` 비어 있음.
- [ ] `client-graph.test.ts`의 허용 목록이 `radix-ui`·`class-variance-authority`·`lucide-react` 셋만큼 넓어진다 — **의도된 결정**이고 메타 테스트가 셋을 각자 고정한다.

### 3.2 앱 셸

- [ ] `(edit)` 아래 모든 라우트가 **같은 셸**을 쓴다: 좌측 사이드바(프로젝트 컨텍스트 + 섹션 네비게이션) + 상단 top bar(사용자 메뉴). **breadcrumb은 페이지
      콘텐츠 첫 줄**이다(레이아웃은 페이지 props를 못 받는다 — design §2). 검증: 실물(`/bugshot-qa`)에서 `/projects`·`/projects/new`·`/projects/:slug/*`
      셋 부류가 같은 사이드바를 보인다.
- [ ] 사이드바의 섹션은 프로젝트 안에서 **둘**(Translations · Settings)이고 Settings는 OWNER에게만 보인다 (Members는 6b — 그때 **전원**에게 보인다).
      검증: EDITOR 세션으로 Settings가 렌더되지 않고, URL 직접 진입은 `not-found`다(`app/(edit)/__tests__/authorization.test.ts`가 이미 그 진입을 고정한다).
- [ ] 레이아웃의 멤버십 조회는 **새 조회**이고 `userId`로 좁힌다(지금 레이아웃은 Prisma를 부르지 않는다). 검증: 하네스로 다른 사용자의 멤버십을 내지 않는다.
- [ ] 로그인·초대 수락은 셸 **밖**이다 (지금과 같다).

### 3.3 번역 화면

- [ ] **기본 착지는 기준 로케일(`?focus=`)에서 pending>0인 첫 네임스페이스다**(`compareKeys` 순). 전부 0이면 첫 네임스페이스, 키가 없으면 "No keys yet" 빈 상태.
      "All keys"는 명시적으로 고른다(`?ns=*`)이고 그 행에도 `pending/total`이 있다. 검증: `lib/keys/__tests__/view.test.ts`의 `defaultNamespace`; 실물에서
      903키 프로젝트의 첫 착지가 **2초 안**에 그려진다 — **같은 프로젝트·같은 머신·DevTools Performance의 LCP**로 재고, 기준선 12.7초를 같은 방법으로 다시 잰 값과 비교한다.
- [ ] 네임스페이스 패널이 남은 일(`pending/total`)을 보이고, 기준 로케일(`?focus=`)로 집계가 바뀐다 (지금과 같다).
- [ ] 키·값 **텍스트 필터**(`?q=`)와 상태 필터(`?state=`)가 네임스페이스 안에서 동작한다. 검증: `filterRows` 단위 테스트(0행 포함).
- [ ] 키 열의 **코드 참조 링크**가 유지된다(`buildPermalink`, `lastCommitSha`). 검증: `view.test.ts` 기존 케이스 green.
- [ ] 셀 저장: blur 저장 유지(Enter=저장·Shift+Enter=개행·Esc=되돌리기 — 지금 습관 그대로) + **표 하나에 시각 숨김 `aria-live="polite"` 영역 하나**가 결과("Saved
      common.viewAll · ko" / "Couldn't save …")를 읽는다(셀마다 두면 903×3 live region). 실패 시 **`document.activeElement`가 `body`이거나 같은 셀일 때만** 포커스가 그 셀로
      돌아가고, 아니면 상태줄 [Retry]가 재시도 지점이다(다른 셀 타이핑 중 포커스 탈취 금지 — WCAG 3.2). 검증: 소스 스캔(`aria-live` 1곳·`activeElement`·`Retry`) +
      실물에서 다른 셀 타이핑 중 실패 유발 후 포커스 위치.
- [ ] 세션 만료 중 저장(Action이 `unauthorized`)은 "Your session ended — sign in again. Your text is kept." + 로그인 링크, `unavailable`은 "Temporary problem — try again"이다.
      검증: `translation-input` 소스에 두 갈래.
- [ ] 배지: `needsReview`·orphaned(키·로케일 두 축) 유지. **"Translated"에는 배지가 없다**.
- [ ] **덮인 셀**: push가 값을 덮으면 `updatedBy`가 비워져 사람 이름이 남지 않는다 — 편집자 표기가 사라질 뿐
      "From repository" 같은 새 표시는 두지 않는다(design §3.6). 검증: `lib/push/__tests__/flow.test.ts`(SQL 캡처)가 upsert에 `"updatedBy" = NULL`을 고정한다.
- [ ] **orphaned 로케일**의 처리를 확정한다: 열 유지 + 헤더 배지 + 편집 비활성 (2026-09-06 임시안을 그대로
      확정). 검증: 헤더에 배지, 셀 `disabled`, 저장 Action은 여전히 `locale is no longer in the repo`로 거부.
- [ ] **편집 손실 창 배너**: 미배포 변경이 1건 이상이면 툴바 아래 경고 Alert — "{n} changes not yet sent. They can be lost if your developers push code first — send them
      when you're done."(복수 `one/other`). 닫기 키는 `lastPulledAt`이라 다음 Publish 뒤 다시 보인다. 검증: `countUnpublished`가 0이면 DOM에 없다 · 닫고 Publish·편집하면 재등장(실물).

### 3.4 Publish

- [ ] 툴바의 [Send changes] 버튼이 **미배포 변경 수**를 함께 보인다 (`Send changes (3)`). 0이면 버튼은 살아 있고 결과가
      "Nothing to send"다 — no-op에도 반드시 무엇인가 보인다 (현 `pull-button` 결정 유지).
- [ ] 결과가 **다섯 문구·네 tone**으로 갈린다: 변경 없음(info) / 새로 보냄(success) / 먼저 보낸 것을 갱신(success) / 일부 값 미기록(**warning** — `skipped`여도 warnings≥1이면
      warning, 본문 `<details>`에 못 쓴 파일 목록) / 실패(danger). **편집자 어휘**다 — "pull request"·"merge"를 쓰지 않는다. 검증: `PullResult`가
      `pr: "created" | "updated"`를 들고, `pullMessage`의 exhaustive switch가 다섯 문구를 각자 다르게 내며 기존 어휘 금지 테스트가 green이다 (`lib/pull/__tests__/message.test.ts`).
- [ ] **보낸 것의 링크가 새로고침 뒤에도 남는다**: 마지막 Publish의 PR URL·시각을 `Project`에 저장하고 툴바가 "Last sent 2 days ago · View what was sent"로 보인다.
      검증: additive 마이그레이션 + **신설** `lib/pull/__tests__/load.test.ts`.
- [ ] PR 생성과 머지를 같은 완료로 표시하지 않는다 — 성공 문구 본문이 "Your developers need to accept it before their next code push."로 경계를 한 번 말한다.
- [ ] 결과 Alert와 편집 손실 배너는 같은 자리에 **결과 위·배너 아래**로 고정된다.
- [ ] 같은 DB 상태의 반복 Publish가 새 커밋을 만들지 않는다 (이미 성립 — 2층 blob SHA. 회귀 테스트만 확인).

### 3.5 그 밖의 화면

- [ ] 로그인(`/`): 두 provider 버튼 + 거부 사유(`?error=`) + 장애 문구. 2열(폼 좌 / 장식 우) — 장식은 **토큰만**(`--border` dot-grid + `from-primary/5 to-muted`), raw 색 0.
- [ ] 프로젝트 목록(`/projects`): 행마다 이름·리포·상태(`readinessLabel`)·역할 + [New project]. 빈 상태는 EmptyState + CTA. `?e=`는 **global** Alert(DESIGN §6.4 배치).
      GitHub 계정 섹션은 그대로 둔다(6b가 `/account`를 판정한다).
- [ ] 새 프로젝트(`/projects/new`): ②~⑥ 상태 기계 **그대로**, 형만 프리미티브·카드로.
- [ ] 설정: 섹션 넷(리포 연결·상태·push 토큰·워크플로)을 settings-block 형으로. 계정 섹션 그대로. base 필드는 6b.
- [ ] 초대 수락(`/invite/:token`): 셸 밖 카드. 실패 분기 각자 한 줄 (지금과 같다).
- [ ] 임시 초대 폼은 6a에 **남는다** — 툴바 `ghost` 버튼 → `Dialog`로 옮긴다(OWNER만). 6b 멤버 화면이 대체한다.

### 3.6 i18n 구조

- [ ] 사용자 문자열의 **단일 출처가 `messages/en.tsx`**(`as const`)이고, `lib/i18n/index.ts`가 `m`으로 재수출한다. **값은 문자열 또는 함수** — 카운터·복수·쪼개진 문장은 함수 값이다.
      `fmt`·`plural`·`rich` 헬퍼, `resolveJsonModule`, JSON resolver는 **없다**(design §3.1.1). ko는 같은 모양의 `ko.tsx` 하나로 더한다.
- [ ] `app/`·`components/`·`lib/` 소스(테스트·주석·`lib/survey`·`lib/scan`·**`lib/adapters`(6b)** 제외)에 **한글이 0자**다. 검증:
      `lib/i18n/__tests__/no-korean-ui.test.ts` — **축소형 허용 목록**(목록 밖 0자·목록 안 ≥1자)이 6a 끝에 `lib/pull/run.ts`·`render.ts`만 남긴다(어댑터 `message`를 싣는다 — 6b).
- [ ] 문구 모듈 넷(`lib/auth/message.ts`·`lib/github-connect/message.ts`·`lib/onboarding/message.ts`·`lib/pull/message.ts`)이
      사전을 읽고, **갈래 누락은 여전히 컴파일 에러**다 (`satisfies Record<Union, string>`).
- [ ] 사전이 클라이언트 번들에 들어가도 무게가 없다. 검증: `client-graph.test.ts` green (`lib/i18n/`이 잎이다 — 메타 테스트의 클라이언트 픽스처가 그것을 import한다).
- [ ] ICU 복수형은 쓰지 않는다 (MVP §7). 복수는 함수 값 하나(`n === 1 ? … : …`)다.

### 3.7 게이트

- [ ] `pnpm typecheck && pnpm test && pnpm build` green. `find .next/static/chunks -name '*.js' -size +1M` 출력이 비어 있다.
- [ ] `/bugshot-qa` 한 바퀴: 라우트 6개(user-stories §1·§2·§3·§4·§6·§8) + 거부 경로(EDITOR가 settings URL) + tasks T9의 실물 항목.
- [ ] `/l10n-roundtrip`·`pnpm adapter-survey`는 **돌리지 않는다** — 6a는 `lib/adapters/**`를 건드리지 않는다.

### 3.8 (이전 §3.8 어댑터 오류 코드화) → §3.10 6b

### 3.9 (이전 §3.9) → §3.7

### 3.10 6b — 6a 머지 뒤 별도 사이클

착수 전 design을 다시 연다. 검수가 잡은 결함이 tasks.md 6b 절에 있다. 항목:

1. **어댑터 오류 코드화 + `survey` 분류기 + 14차 재측정** — `AdapterError = { path, code, key?, detail? }`(기존 테스트가 키 이름을 단언한다). `.message` 소비자 여덟(`lib/pull/run.ts:127` 포함).
   재측정 판정 값 목록은 tasks 6b-1. `/l10n-roundtrip`은 돌리지 않는다.
2. **설정의 base branch·기준 로케일** — 🔴 현재 design §3.13은 pull을 깨뜨린다(pull의 base 진실은 `Project.baseLocale`이고 `Locale.isBase`는 UI만 읽는다 · 재적재 경로는 CI뿐 ·
   `needsReview` 일괄 전파). 답의 후보는 tasks 6b-3.
3. **멤버 화면** — 별도 라우트의 근거를 먼저 쓴다(`github-connect/spec.md`는 settings 섹션으로 결정했다). 전원에게 렌더. `revokeInvitation`은 `expiresAt = now`(삭제 금지 —
   `schema.prisma:365`). 임시 초대 폼 삭제.
4. **`/account`** — 만들지 말지부터. 추천은 "만들지 않는다"(사용자 메뉴 항목으로 `/projects` 계정 섹션에 간다).

## 4. 범위 밖 — 이번에 안 하는 것

| 항목 | 왜 / 어디로 |
|---|---|
| **ko 로케일·언어 전환 UI** | 사용자 결정 — en 단일. 사전 구조만 잡는다. 전환은 `lib/i18n/index.ts` 한 곳을 바꾸면 되게 설계(design §3.1) |
| **다크 모드** | SAAS 비범위 유지. GitLab 다크 토큰을 가져오지 않는다 (DESIGN §3) |
| **가상 스크롤** | CLAUDE.md 판정 — 기본 착지를 첫 네임스페이스로 두는 것이 먼저다. 그 뒤에도 느리면 그때 |
| **ICU 복수형** | MVP §7. 앱 자체 문구도 함수 값 하나로 |
| **토스트** | `sonner`는 여전히 import 0곳. Publish 결과는 **Alert**(지속)이고, 저장 상태는 셀 인라인 + 표 live region이다. `sonner` 제거는 별도 chore |
| **프로젝트 보관·SyncRun·고정 제한** | 7단계 |
| **초대 이메일 발송** | SAAS §4.3 ① — 링크를 직접 전달한다 |
| **모바일 레이아웃** | 데스크톱 도구다. `xl` 미만에서 사이드바가 오버레이로 숨는 것까지만 하고 표는 가로 스크롤 |
| **키 추가·삭제·로케일 추가·삭제** | 코어 원칙 — 소스 키와 로케일 존재는 리포가 정본이다 (SAAS §7.2) |
| **PR 머지 상태 조회** | 화면은 "마지막으로 보낸 링크·시각"만 든다. 머지됐는지는 GitHub API 호출이 필요하고 웹훅이 비범위라 **묻지 않는다** — 링크를 누르면 GitHub이 답한다 |
| **번역 화면의 키 상세 패널·히스토리** | 컨텍스트 제공은 코드 참조 + 네임스페이스 둘까지다 (CLAUDE.md) |
| **표 열 정렬 · 일괄 편집/승인 · 키보드 단축키** | 요청 없음. 정렬은 `order`(원본 위치) 하나다 |
| **top bar 검색 · `+` · 카운터** | GitLab의 기능 밀도를 가져오지 않는다 — 대응물이 없다 |
| **아바타 이미지 업로드** | GitHub `image`가 있으면 그것, 없으면 이니셜. 업로드 없음 |
| **Publish 동시성·최소 간격** | 7단계 SyncRun. 지금은 버튼 `loading`이 이중 클릭만 막는다 |
| **프로젝트 전환 메뉴의 검색·페이지네이션** | 사용자당 3개 제한(7단계) — 목록이 전부다 |

## 5. 이 단계가 남기는 빚

- **`Translation.updatedBy`를 push가 비우면 "누가 마지막으로 만졌나"의 이력을 잃는다** — MVP §10이 명시한 대가. 7단계 `SyncRun`/감사 이벤트가 받을지 그때 정한다.
- **6a 끝에 한글이 남는 자리 둘** — `lib/pull/run.ts:127`(warnings에 어댑터 `message`를 싣는다)·`lib/pull/render.ts:72`. 온보딩 부분 실패 목록의 `<details>` 원문도 한국어다.
  6b-1이 코드화하며 닫는다. **6a는 어댑터 문구를 손대지 않는다** — `lib/survey/one.ts:168-199`가 그 문구를 부분 문자열로 분류하므로 영어화만 해도 지표가 깨진다.
- **ko 사전** — `messages/ko.tsx`를 만들 때 `lib/i18n/index.ts`가 locale을 고르는 방식(쿠키/`Accept-Language`/
  사용자 설정)을 정해야 한다. 지금은 정하지 않는다.
- **`sonner`·`tw-animate-css` 정리** — 마지막 chore에서 사용 0이면 뺀다(2026-09-07 결정). `class-variance-authority`·`radix-ui`·`lucide-react`는 프리미티브가 쓴다.
- **`components.json`** — shadcn CLI를 더 쓰지 않으면 이 파일도 낡는다. 같은 chore에서 삭제 판정.
- **SAAS §8 1단계의 "UI 레퍼런스 — Supabase" `[x]` 줄**이 stale이다 — T9가 GitLab으로 고친다.
- **하네스 부채**(TASKS 전역 미결 — `Role` enum·복합 FK 미흉내)를 T3의 `translation.count`·`loadMemberships` 검증이 정면으로 밟는다. 시드에 프로젝트·사용자를 둘씩 둔다.
- **미배포 수의 경계 하나**: push의 `needsReview` 전파가 `updatedAt`을 올리므로, 이미 Publish된 사용자 편집이
  원문 변경으로 `needsReview`가 되면 다음 Publish 전까지 "not yet sent"로 **다시 센다**. 그 편집을 다시 검토해
  보내야 하는 상태이므로 틀린 신호는 아니지만 정확한 뜻은 "사람이 만졌고 아직 안 나간 값"이 아니라 "사람이
  만진 값 중 마지막 Publish 뒤 바뀐 행"이다. design §3.5에 적어 둔다.
- **6b 착수 시 design §3.13·§3.9·§3.10을 다시 쓴다** — tasks 6b 절의 지적이 입력이다.
