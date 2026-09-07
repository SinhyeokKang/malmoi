# translation-ui — 번역 UI 재작성 + Publish + 전 화면 재구축 (SaaS 6단계)

> 정본은 [SAAS.md](../../SAAS.md) §8 6단계다. 이 문서는 그 체크리스트를 **완료 조건이 붙은 스펙**으로
> 펼치고, 5단계까지 "기존 관용구 그대로" 붙여 온 화면 전부를 이번에 **한 디자인 시스템 위에서 다시
> 만든다**는 결정을 기록한다. 라우트별 사용자 스토리는 [user-stories.md](./user-stories.md), 시각 규칙은
> [DESIGN.md](../../DESIGN.md)(이번에 레퍼런스를 GitLab으로 — **레이아웃·정보구조·컴포넌트 구성만**, 색·타입 토큰은 기존 유지), 설계는 [design.md](./design.md).
>
> 2026-09-07 결정 셋 (사용자):
> 1. **시각 레퍼런스를 Supabase → GitLab으로 바꾼다** — 가져오는 것은 **레이아웃·정보구조·컴포넌트 구성**이고 **색 토큰·타입 스케일·간격은 기존
>    slate + shadcn 시맨틱 그대로다** (2026-09-07 재확인 — 처음 초안이 Pajamas 팔레트까지 들였다가 되돌렸다). 근거는 §2.5.
> 2. **UI 전부를 영어 단일로 만든다.** 문자열은 사전 한 벌(`messages/en.json`)로 빼서 ko를 나중에 더할 수
>    있게 **구조만** 잡는다 — 언어 전환 UI는 만들지 않는다.
> 3. **T5(5단계)까지의 화면 전부가 재작성 대상이다** — 번역 화면만이 아니다.

## 1. 사용자

이 단계는 **둘 다**를 위한 것이고, 화면마다 주 사용자가 다르다.

| 화면 | 주 사용자 | 왜 |
|---|---|---|
| 번역 (`/projects/:slug/translations`) | **번역 편집자** (비개발자 동료, EDITOR) | 이 도구의 가치가 실현되는 유일한 화면. 하루의 대부분을 여기서 보낸다 |
| 멤버 (`/projects/:slug/members`, 신설) | 개발자 (OWNER) | 초대·역할·제거. 편집자는 목록만 본다 |
| 설정 (`/projects/:slug/settings`) | 개발자 (OWNER) | 리포 연결·상태·push 토큰·워크플로 |
| 새 프로젝트 (`/projects/new`) | 개발자 | 첫 왕복을 설명 없이 끝내는 것이 SAAS §1 완료 조건이다 |
| 계정 (`/account`, 신설) | 둘 다 | GitHub 계정 연결·해제는 **사용자** 소유다 (SAAS §8 6단계 이관 항목) |
| 프로젝트 목록 · 로그인 · 초대 수락 | 둘 다 | 진입점 |

**SAAS §3의 "편집자가 알 필요 없는 것"** (`adapterName`·`pathTemplate`·blob SHA·토큰 종류)은 이번에도
화면에 오르지 않는다. 문자열이 영어가 된다고 어휘가 개발자 어휘가 되는 것은 아니다 — Publish의 결과
문구가 "PR opened"가 아니라 "Sent to your developers for review"인 것은 `lib/pull/message.ts`가
이미 정한 방향이고 그대로 간다.

## 2. 문제 — 관측된 것

### 2.1 화면이 "동작 확인용 동결분"의 연장이다

- MVP §8.3이 편집 UI를 동결했고, SaaS 2·4·5단계는 새 화면을 **"기존 관용구 그대로"** 붙였다
  (`features/tenant-auth/design.md` §4.1). 결과가 DESIGN §6.4의 표다 — hand-rolled 컨트롤 13종을
  클래스 문자열로 고정하고, 그 표조차 "툴바형의 `font-medium`이 파일마다 갈려 있다"고 적어야 했다.
- `components/ui/`(shadcn 생성물 4개)는 **앱에서 import 0곳**이다. 디자인 시스템이 없는 상태에서 화면이
  여섯 개까지 늘었다.
- DESIGN §9가 레퍼런스(Supabase)를 정했지만 **반영된 것이 없다** — 좌측 사이드바·프로젝트 전환·밀도 중
  어느 축도 화면에 없다. 현재 사이드바 자리는 번역 화면 안의 네임스페이스 목록이다.

### 2.2 번역 화면의 실측 결함

- **첫 착지가 느리다**: `ts-dict` 903키 프로젝트의 필터 없는 화면이 **12.7초** · `<input>` 2,711개 ·
  네임스페이스 52개 (2026-09-07 `/bugshot-qa`). SAAS §8 6단계가 "기본 착지를 첫 네임스페이스로"를
  답으로 적어 뒀다.
- **Publish 피드백이 버튼 옆 한 줄이다.** 미배포 변경 수가 없고, PR 링크는 그 순간의 응답에만 있어
  새로고침하면 사라지고, `PullResult`가 "새 PR"과 "기존 PR 갱신"을 **구별하지 않는다**(`committed`
  하나) — SAAS §8 6단계 완료 게이트 "서로 다른 상태"가 지금은 성립하지 않는다.
- **편집 손실 창 안내가 없다** (MVP §3.1이 감수한 대가, §8.3이 SaaS로 이관). 편집자는 자기 편집이
  다음 코드 push에 덮일 수 있다는 것을 어디서도 듣지 못한다.
- **덮인 셀에 편집자 이름이 남는다** (MVP §10 미결). push의 strict 덮어쓰기가 `updatedBy`를 건드리지
  않아, 리포 값으로 바뀐 셀 아래 사람 이름이 그대로 붙는다 — 화면이 거짓을 말한다. malmoi#3으로
  이름이 사람처럼 보이게 된 뒤라 그 거짓이 더 잘 읽힌다.
- **저장 상태가 접근성에 닿지 않는다** (features/README 백로그, tenant-auth CDO 검수): 저장 실패 문구에
  `role=status`가 없어 스크린리더가 읽지 않고, blur로 포커스가 떠난 뒤라 재시도 지점이 없다.

### 2.3 멤버·계정 관리가 임시다

- 멤버 관리는 번역 화면 헤더의 **임시 초대 폼** 하나다. `changeMember`(역할 변경·제거)는 2단계가 만들었지만
  **테스트에서만 불린다**. 멤버 목록도, 대기 중인 초대 목록도 화면에 없다.
- GitHub 계정 **해제**가 `/projects/:slug/settings` 안에 있어 `project:settings`(OWNER) 뒤다. OWNER에서
  강등된 사람은 자기 연결을 풀 화면이 없고, 그 계정으로 연결하려는 다른 User는 `taken-by-other`에 영구히
  막힌다 (SAAS §8 6단계, github-connect code-review 🟡3).

### 2.4 문자열이 한국어로 소스에 박혀 있고 문체가 갈린다

- 사용자 문자열이 `app/`·`components/`·`lib/*/message.ts` 넷(`auth`·`github-connect`·`onboarding`·
  `pull`)에 **하드코딩**돼 있다. 정확한 수는 design.md §1이 인벤토리로 든다.
- 문체가 "-다"(번역 화면 빈 상태 둘)와 "-요"(나머지)로 갈려 있다 (DESIGN §6.4 끝).
- 포트폴리오 대상(SAAS §8 8단계 — 외부 방문자·평가자)에게 한국어 UI는 장벽이다. **1차 언어를 영어로
  바꾸는 것이 이 단계의 결정이다.** ko는 나중이고, 그때 문자열을 다시 소스에서 뽑지 않으려면 지금 사전
  구조를 잡아야 한다.

### 2.5 레퍼런스 변경의 근거 — Supabase → GitLab

Supabase를 골랐던 이유(DESIGN §9.1)는 "개발자 도구이면서 비개발자도 쓰는 밀도, 프로젝트 전환이 일급인
정보구조"였다. GitLab은 그 둘을 **더 직접적으로** 갖고 있고, 셋이 더 있다:

1. **라이트가 기본이다.** Supabase는 다크가 기본이라 DESIGN §9.2가 "다크를 가져오지 않는다"를 따로 막아야
   했다. GitLab은 레이아웃을 보는 동안 다크를 의식할 일이 없다.
2. **공개 디자인 시스템(Pajamas)이 있다.** 레이아웃 치수·컴포넌트 구성·문장 규칙이 문서화돼 있어 "닮았는가"가 아니라
   **값으로** 따를 수 있다(사이드바 240px·top bar 48px·표 구성 등). **색·폰트는 가져오지 않는다** — 우리 토큰이 있다.
3. **이 도구의 사용자가 이미 GitLab/GitHub 모양에 익숙하다.** 결과물이 PR(MR)이고 편집자가 개발자와 그
   화면에서 만난다 — 같은 시각 언어를 쓰면 "내가 고친 것이 저기로 간다"가 화면에서 이어진다.

## 3. 완료 조건 — 검증 가능한 문장으로

### 3.1 디자인 시스템

- [ ] `docs/DESIGN.md`가 GitLab을 **레이아웃·정보구조·컴포넌트 구성**의 레퍼런스로 삼고, **색·타입·간격 토큰은 기존 그대로**다.
      검증: `app/globals.css`의 토큰 값이 바뀌지 않았다(`git diff` 0) · DESIGN §9.2가 "색 팔레트를 가져오지 않는다"를 든다.
- [ ] `components/ui/`가 **이 리포가 소유하는 프리미티브**로 바뀐다 (shadcn 생성물 4개는 지운다). 최소:
      Button(variants `default`·`confirm`·`danger`·`link`, sizes `sm`·`md`) · Input · Textarea · Select ·
      Badge · Alert · Card · Table · Breadcrumb · Avatar · EmptyState. 검증: `pnpm test`의
      `focus-ring.test.ts`가 **`ui/`를 더 이상 제외하지 않고** green이다.
- [ ] `app/`·`components/`(`ui/` 밖)에 **raw `<button>`·`<input>`·`<select>`·`<textarea>`가 0개**다 —
      전부 프리미티브를 지난다. 검증: `focus-ring.test.ts`가 그 수를 0으로 고정한다 (프리미티브가 링을
      들고, 밖에서 태그를 직접 쓰면 red).
- [ ] 라이트 단일이 유지된다. 검증: `lib/__tests__/globals-css.test.ts` green (`@custom-variant dark` 유지).
- [ ] `text-mono` 유틸·twMerge 등록이 유지된다. 검증: 기존 테스트 green + DESIGN §4.

### 3.2 앱 셸

- [ ] `(edit)` 아래 모든 라우트가 **같은 셸**을 쓴다: 좌측 사이드바(프로젝트 컨텍스트 + 섹션 네비게이션) +
      상단 breadcrumb. 검증: 실물(`/bugshot-qa`)에서 `/projects`·`/projects/new`·`/projects/:slug/*`·`/account`
      다섯 부류가 같은 사이드바를 보인다.
- [ ] 사이드바의 섹션은 프로젝트 안에서 **셋**(Translations · Members · Settings)이고 Members·Settings는
      OWNER에게만 보인다. 검증: EDITOR 세션으로 두 항목이 렌더되지 않고, URL 직접 진입은 `not-found`다
      (`app/__tests__/authorization.test.ts`가 이미 그 진입을 고정한다).
- [ ] 로그인·초대 수락은 셸 **밖**이다 (지금과 같다).

### 3.3 번역 화면

- [ ] **기본 착지가 첫 네임스페이스다**(`compareKeys` 순). "All keys"는 명시적으로 고른다. 검증:
      `lib/keys/__tests__/view.test.ts`의 `defaultNamespace`; 실물에서 903키 프로젝트의 첫 착지가 **2초 안**에
      그려진다 (`/bugshot-qa`, 2026-09-07의 12.7초와 비교).
- [ ] 네임스페이스 패널이 남은 일(`pending/total`)을 보이고, 기준 로케일(`?focus=`)로 집계가 바뀐다 (지금과 같다).
- [ ] 키·값 **텍스트 필터**(`?q=`)가 네임스페이스 안에서 동작한다. 검증: `filterRows` 단위 테스트.
- [ ] 셀 저장: blur 저장 유지 + 저장 상태가 **`role="status"`** 로 읽히고, 실패 시 **포커스가 그 셀로 돌아온다**.
      검증: 컴포넌트 소스 스캔(`role="status"` 존재) + 실물에서 실패 유발 후 포커스 위치.
- [ ] 배지: `needsReview`·orphaned(키·로케일 두 축) 유지. **"Translated"에는 배지가 없다**.
- [ ] **덮인 셀**: push가 값을 덮으면 `updatedBy`가 비워져 사람 이름이 남지 않는다 — 편집자 표기가 사라질 뿐
      "From repository" 같은 새 표시는 두지 않는다(design §3.6). 검증: `lib/push/__tests__/apply*.test.ts`가 upsert SQL에 `"updatedBy" = NULL`을 캡처한다.
- [ ] **orphaned 로케일**의 처리를 확정한다: 열 유지 + 헤더 배지 + 편집 비활성 (2026-09-06 임시안을 그대로
      확정). 검증: 헤더에 배지, 셀 `disabled`, 저장 Action은 여전히 `locale is no longer in the repo`로 거부.
- [ ] **편집 손실 창 배너**: 미배포 변경이 1건 이상이면 화면 상단에 경고 Alert — "N unpublished changes.
      A code push before you publish will overwrite them." 검증: `countUnpublished`가 0이면 배너가 없다.

### 3.4 Publish

- [ ] 툴바의 [Publish] 버튼이 **미배포 변경 수**를 함께 보인다 (`Publish (3)`). 0이면 버튼은 살아 있고 결과가
      "Nothing to publish"다 — no-op에도 반드시 무엇인가 보인다 (현 `pull-button` 결정 유지).
- [ ] 결과가 **다섯 상태로 서로 다르다**: 변경 없음 / 새 PR / 기존 PR 갱신 / 일부 값 미기록(warnings) /
      실패. 검증: `PullResult`가 `pr: "created" | "updated"`를 들고, `pullMessage`의 exhaustive switch가 다섯
      갈래를 각자 다른 `tone`·문구로 낸다 (`lib/pull/__tests__/message.test.ts`).
- [ ] **PR 링크가 새로고침 뒤에도 남는다**: 마지막 Publish의 PR URL·시각을 `Project`에 저장하고 툴바가 보인다.
      검증: additive 마이그레이션 + `lib/pull/__tests__/load.test.ts`.
- [ ] PR 생성과 머지를 같은 완료로 표시하지 않는다 — 문구가 "Sent for review"이고 "Merged"라는 말을 쓰지 않는다.
- [ ] 같은 DB 상태의 반복 Publish가 새 커밋을 만들지 않는다 (이미 성립 — 2층 blob SHA. 회귀 테스트만 확인).

### 3.5 멤버 화면 (신설)

- [ ] `/projects/:slug/members` — 멤버 목록(이름·이메일·역할·가입일) + OWNER에게만 역할 변경·제거 +
      초대 링크 발급 + **대기 중인 초대 목록**(이메일·역할·만료·**취소**). 검증: `app/__tests__/membership.test.ts`
      확장 + 실물.
- [ ] 마지막 OWNER 보호 문구가 화면에 닿는다 (`accessErrorMessage`가 이미 갖고 있다).
- [ ] 번역 화면 헤더의 임시 초대 폼(`components/invite-form.tsx`)이 사라진다.

### 3.6 계정 화면 (신설) + 해제 인가 이관

- [ ] `/account` — 로그인 정보(이름·이메일·provider) + **GitHub 연결·해제**. 검증: `middleware.ts` matcher에
      `/account/:path*`가 있고, `entry-points.test.ts`가 그 페이지의 `requireUser`를 본다.
- [ ] `disconnectGithub`의 인가는 **이미 `requireUser` + 자기 `Account` 행**이다 (2026-09-07 리뷰 🟡9가 먼저 옮겼다 — 워킹트리
      미커밋분, `app/(edit)/projects/actions.ts`). 6단계는 그 섹션을 `/projects`에서 `/account`로 **옮기기만** 한다. 검증: 기존 테스트 유지.
- [ ] 설정 화면의 "GitHub 계정" 섹션은 사라지고, **연결 상태 한 줄 + `/account` 링크**만 남는다.

### 3.7 그 밖의 화면

- [ ] 로그인(`/`): 두 provider 버튼 + 거부 사유(`?error=`) + 장애 문구. GitLab 로그인 레이아웃(폼 좌 / 장식 우).
- [ ] 프로젝트 목록(`/projects`): 행마다 이름·리포·상태(`readinessLabel`)·역할 + [New project]. 빈 상태는
      EmptyState + CTA.
- [ ] 새 프로젝트(`/projects/new`): ②~⑥ 상태 기계 **그대로**, 형만 프리미티브·카드로 (DESIGN §6.7).
- [ ] 설정: 섹션 넷(리포 연결·상태·push 토큰·워크플로)을 settings-block 형으로. 계정 섹션은 §3.6.
- [ ] **설정의 Repository 블록에서 base branch·기준 로케일을 바꿀 수 있다** (OWNER, 2026-09-07 결정 — SAAS §3 표가 6단계로 지정).
      기준 로케일은 orphaned 아닌 기존 로케일 중에서만 고른다. 저장 성공 시 재생성된 워크플로 YAML과 "워크플로를 갱신하기 전까지 CI push가
      409로 거부된다"는 경고가 같은 블록에 보인다(`checkFormat`이 그렇게 막는다 — design §3.13). 검증: `planBaseLocaleChange`·`isValidBranchName`
      단위 테스트 + 하네스에서 `Locale.isBase`가 정확히 하나 + 실물에서 저장 뒤 YAML의 `base-locale:` 줄이 바뀐다.
- [ ] 초대 수락(`/invite/:token`): 셸 밖 카드. 실패 분기 각자 한 줄 (지금과 같다).

### 3.8 i18n 구조

- [ ] 사용자 문자열의 **단일 출처가 `messages/en.json`** 이고, `lib/i18n/`이 그것을 타입으로 노출한다.
- [ ] `app/`·`components/`·`lib/` 소스(테스트·주석·`lib/survey`·`lib/scan` CLI 출력 제외)에 **한글이 0자**다. 검증:
      `lib/i18n/__tests__/no-korean-ui.test.ts` (소스 스캔 — 주석을 벗긴 뒤 센다).
- [ ] **어댑터 오류가 코드다** (2026-09-07 결정): `AdapterError`가 `{ path, code, detail? }`이고 문장은 사전이 낸다. 검증: 어댑터
      계약 테스트가 `code`를 단언 · `lib/survey/one.ts`의 분류가 코드를 받고 기존 픽스처 결과가 동일 · **재측정**(학습+홀드아웃) 지표가 13차와 같다.
- [ ] 문구 모듈 넷(`lib/auth/message.ts`·`lib/github-connect/message.ts`·`lib/onboarding/message.ts`·`lib/pull/message.ts`)이
      사전을 읽고, **갈래 누락은 여전히 컴파일 에러**다 (`satisfies Record<Union, string>`).
- [ ] 사전이 클라이언트 번들에 들어가도 무게가 없다. 검증: `client-graph.test.ts` green (`lib/i18n/`이 잎이다).
- [ ] 보간은 `{name}` 자리표시자 하나뿐이고 ICU 복수형은 쓰지 않는다 (MVP §7). 복수는 키 둘(`one`·`other`)이다.

### 3.9 게이트

- [ ] `pnpm typecheck && pnpm test && pnpm build` green. 클라이언트 청크에 7.2MB류가 없다 (`client-graph`).
- [ ] `/bugshot-qa` 한 바퀴: 라우트 8개(user-stories.md의 순서) + 거부 경로(EDITOR가 members·settings URL).
- [ ] `/l10n-roundtrip`은 **돌리지 않는다** — 어댑터의 `write` 출력은 바뀌지 않는다(오류 보고 경로만 코드화). 대신 **`pnpm adapter-survey`
      재측정**을 학습·홀드아웃 둘 다 돌린다(`lib/adapters/**` 변경 트리거) — ADAPTER-COVERAGE에 회차를 더하고 지표가 13차와 같아야 한다.

## 4. 범위 밖 — 이번에 안 하는 것

| 항목 | 왜 / 어디로 |
|---|---|
| **ko 로케일·언어 전환 UI** | 사용자 결정 — en 단일. 사전 구조만 잡는다. 전환은 `lib/i18n/index.ts` 한 곳을 바꾸면 되게 설계(design §3.1) |
| **다크 모드** | SAAS 비범위 유지. GitLab 다크 토큰을 가져오지 않는다 (DESIGN §3) |
| **가상 스크롤** | CLAUDE.md 판정 — 기본 착지를 첫 네임스페이스로 두는 것이 먼저다. 그 뒤에도 느리면 그때 |
| **ICU 복수형** | MVP §7. 앱 자체 문구도 `one`/`other` 키 둘로 |
| **토스트** | `sonner`는 여전히 import 0곳. Publish 결과는 **Alert**(지속)이고, 저장 상태는 셀 인라인이다 (design §3.13). `sonner` 제거는 별도 chore |
| **프로젝트 보관·SyncRun·고정 제한** | 7단계 |
| **초대 이메일 발송** | SAAS §4.3 ① — 링크를 직접 전달한다 |
| **모바일 레이아웃** | 데스크톱 도구다. `xl` 미만에서 사이드바가 오버레이로 숨는 것까지만 하고 표는 가로 스크롤 |
| **키 추가·삭제·로케일 추가·삭제** | 코어 원칙 — 소스 키와 로케일 존재는 리포가 정본이다 (SAAS §7.2) |
| **PR 머지 상태 조회** | 화면은 "마지막으로 보낸 PR 링크·시각"만 든다. 머지됐는지는 GitHub API 호출이 필요하고 웹훅이 비범위라 **묻지 않는다** — 링크를 누르면 GitHub이 답한다 |
| **번역 화면의 키 상세 패널·히스토리** | 컨텍스트 제공은 코드 참조 + 네임스페이스 둘까지다 (CLAUDE.md) |

## 5. 이 단계가 남기는 빚

- **기준 로케일 변경 뒤의 재적재는 사용자 몫이다** — UI는 DB와 YAML만 바꾸고 재적재를 자동으로 잇지 않는다(design §3.13). 워크플로를
  갱신하지 않으면 CI push가 409로 계속 거부되는데, 그 사실은 설정 화면의 경고와 Actions 로그에만 있다. 7단계 `SyncRun`이 "마지막 push가
  409였다"를 화면에 올리는 자리다.
- **ko 사전** — `messages/ko.json`을 만들 때 `lib/i18n/index.ts`가 locale을 고르는 방식(쿠키/`Accept-Language`/
  사용자 설정)을 정해야 한다. 지금은 정하지 않는다.
- **`sonner`·`tw-animate-css` 정리** — 마지막 chore에서 사용 0이면 뺀다(2026-09-07 결정). `class-variance-authority`·`radix-ui`는 프리미티브가 쓴다.
- **`components.json`** — shadcn CLI를 더 쓰지 않으면 이 파일도 낡는다. 같은 chore에서 삭제 판정.
- **미배포 수의 경계 하나**: push의 `needsReview` 전파가 `updatedAt`을 올리므로, 이미 Publish된 사용자 편집이
  원문 변경으로 `needsReview`가 되면 다음 Publish 전까지 "unpublished"로 **다시 센다**. 그 편집을 다시 검토해
  보내야 하는 상태이므로 틀린 신호는 아니지만 정확한 뜻은 "사람이 만졌고 아직 안 나간 값"이 아니라 "사람이
  만진 값 중 마지막 Publish 뒤 바뀐 행"이다. design §3.5에 적어 둔다.
