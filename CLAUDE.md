# CLAUDE.md

## 응답 스타일 (이 문서의 다른 모든 규칙보다 우선)

**한국어로, 간결하게.** 위반 시 답변을 다시 쓴다. 아래는 취향이 아니라 판정 기준이다.

- **첫 문장이 결론**: 서두·예고 금지 — "~해보겠습니다", "좋은 질문입니다", "확인해보니 다음과 같습니다" 류로 시작하지 않는다. 바로 답/결과부터.
- **꾸밈말 금지**: "완벽합니다", "훌륭한", "핵심적인", "말씀하신 대로" 같은 평가·동조 표현을 빼도 정보가 안 줄면 뺀다.
- **재진술 금지**: 방금 보여준 diff·명령 출력·파일 내용을 산문으로 다시 설명하지 않는다. 코드가 말하는 건 코드가 말하게 둔다.
- **길이 상한**: 단순 질문·확인 → 3줄 이내. 작업 완료 보고엔 줄 수 상한이 없다 — 필요한 정보를 줄이면서까지 짧게 만들지 않는다. 대신 위의 재진술·꾸밈말 금지로 군더더기만 덜어낸다.
- **미완·실패를 먼저**: 못 한 것·실패한 테스트·건너뛴 범위를 성공 요약보다 앞에 쓴다.
- **선택지 나열 금지**: 추천 하나를 고르고 그 이유 한 줄. 사용자 결정이 필요한 지점(작업 원칙의 "가정을 명시")만 예외.
- **예외**: 코드·커밋 메시지·PR title/body는 영문.

강제 장치는 2단이다: 이 섹션(두 런타임 공통 — Codex는 `AGENTS.md` 미러로 받는다)과, `.claude/settings.json`의 `UserPromptSubmit` 훅이 매 턴 **이 절의 요약**을 컨텍스트에 재주입하는 것(응답 스타일 + 범위 한 줄이고, 문서 전체의 요약이 아니다 — **그 범위 줄은 SAAS.md를 가리킨다**, 2026-09-07에 MVP.md에서 옮겼다)(긴 세션에서 문서 앞쪽이 희석되는 걸 막는다). **훅은 Claude Code 전용이라 Codex 세션에선 이 섹션만 남는다.**

**✅ MVP는 닫혔고 현재 단계는 SaaS화다** (2026-09-05). **SaaS는 단계로 쪼개져 있고 5단계(탐지 온보딩)까지 프로덕션에 나갔다** — 2단계(인증·인가)는 2026-09-06에, **4·5단계는 2026-09-07에**(PR [#9](https://github.com/SinhyeokKang/malmoi/pull/9) → squash `f595cc3`, `db:deploy`로 prod 마이그레이션 11개 반영). 5단계는 **잔여 없이 닫혔다** — 마지막이던 Vercel 옛 env 삭제도 2026-09-07에 끝났다(**Production+Preview 둘이었다** — Development엔 없었다). **6단계(번역 UI 재작성 + Publish)는 착수했다** — 2026-09-08에 **6a를 4번의 배송으로 쪼갰고**(`docs/features/translation-ui/tasks.md` 배송 단위), **ship 1**(기반 — 사전 `messages/en.tsx`·순수 판정·스키마 둘·프리미티브 16)이 PR [#12](https://github.com/SinhyeokKang/malmoi/pull/12) → squash `46df51a`로 **프로덕션에 나갔고**(`db:deploy`로 prod 마이그레이션 12개), **ship 2**(셸)와 **ship 3**(T7 — 번역 화면·필터·Publish·편집 손실 배너)이 PR [#14](https://github.com/SinhyeokKang/malmoi/pull/14) → squash `add099a` · PR [#15](https://github.com/SinhyeokKang/malmoi/pull/15) → squash `ef9da44`로 **프로덕션에 나갔고**, **ship 4**(T8·T9 — 설정·새 프로젝트·초대 수락 + 문서·chore)가 PR [#16](https://github.com/SinhyeokKang/malmoi/pull/16) → squash `695e441`로 **프로덕션에 나가 6a가 닫혔다.** **6b-1**(어댑터 오류 코드화 + survey 분류기 + 14차 재측정 — ADAPTER-COVERAGE §20)과 **6b-2**(멤버 화면)가 PR [#17](https://github.com/SinhyeokKang/malmoi/pull/17) → squash `982cb42` · PR [#19](https://github.com/SinhyeokKang/malmoi/pull/19) → squash `a00d380`으로 **프로덕션에 나갔고**, **6b-3**(설정의 기준 브랜치·기준 로케일 — `Project.declaredBaseLocale` 신설)이 PR [#21](https://github.com/SinhyeokKang/malmoi/pull/21) → squash `7c975c0`, **6b-4**(`/account`)가 PR [#22](https://github.com/SinhyeokKang/malmoi/pull/22) → squash `70e393b`, **6b-5**(`/projects/:slug/locales`)와 **6b-6**(`/projects/:slug` Home — 착지점)이 PR [#23](https://github.com/SinhyeokKang/malmoi/pull/23) → squash `0d68d71`로 **프로덕션에 나가 6단계가 끝났다** (2026-09-09). **IA 정본은 SAAS §7.7**이고 **✅ 7단계(운영 안전성 — `SyncRun`·보관·`logs`)가 PR [#26](https://github.com/SinhyeokKang/malmoi/pull/26) → squash `d0e8688`로 나가 라우트 여덟이 전부 섰다** (2026-09-10). **그 뒤 보안 라운드 셋이 프로덕션까지 갔다** (2026-09-10): sec-audit-2(PR [#27](https://github.com/SinhyeokKang/malmoi/pull/27) → `ff5e8a4` — `Project.repositoryId` 고정·글롭 DP·초대 취소 CAS·Publish 스냅샷) · **자격증명·개인정보 저장 암호화 + 전체 세션 회수**(PR [#28](https://github.com/SinhyeokKang/malmoi/pull/28) → `9e6854e`) · 평문 email 인덱스 제거(PR [#29](https://github.com/SinhyeokKang/malmoi/pull/29) → `f6933d7`). **dev·prod 양쪽 전환이 끝났고 마이그레이션 17개가 둘 다 적용됐다.** **8단계(UI 재작성)는 착수했다** — `docs/features/ui-rework/`가 배송 단위이고, **8-1**(signin·초대 + neutral 팔레트·radius·weight·elevation 등 전역 토큰)이 PR [#31](https://github.com/SinhyeokKang/malmoi/pull/31) → squash `718db80`으로 **프로덕션에 나갔다**. **8-2**(셸 — 전폭 48 헤더·투명 사이드바·흰 콘텐츠 패널·320 프로젝트 패널 골격 + `projects/[slug]/layout.tsx` 신설)와 **8-3**(사이드바를 Figma LNB로 재작성 — 접기 레일·프로젝트 스위처·`New project` 제거, `Tooltip` 프리미티브 삭제)이 PR [#32](https://github.com/SinhyeokKang/malmoi/pull/32) → squash `23f0f50`으로 **프로덕션에 나갔다**(2026-09-11). **그 뒤 2026-09-11에 폴리싱 라운드가 dev에 얹혔다**: 프로젝트 목록 재작성(이름 검색 `?q=` · 필터가 상태 다섯 + all로 확대 · `EmptyState` 둘 · `loading.tsx` 스켈레톤 · 행 타일) · **패널 머리 고정**(`ContentPanel`이 `<main>`이 되고 `PanelHeader`/`PanelBody`가 스크롤 경계를 가른다 — 라우트 아홉 전부) · 컨트롤 36px + size별 radius · **화면 제목이 사이드바 라벨 키를 공유** · `lib/tone.ts`(이름 해시 색 여덟). **8-4**(번역 화면 재작성 — **표의 축이 로케일 = 행이 됐다**: `?focus=`·`?state=` 폐기 → `?locales=` 다중 · 툴바 + 칩 행 · 왼쪽 네임스페이스 패널 삭제 · **breadcrumb을 프로젝트 하위 화면 다섯에서 함께 삭제** · `lib/keys/flag.ts`·`filters.ts` 신설 — 프리미티브는 16 그대로다(`DropdownMenuCheckboxItem`이 기존 파일의 export라 파일이 안 늘었다))도 **프로덕션에 나갔다**(PR [#34](https://github.com/SinhyeokKang/malmoi/pull/34) → squash `77630c4`, 2026-09-11 — `docs/features/ui-rework/translations/`. 그 PR에 폴리싱 라운드와 아래 시안 정합 라운드가 함께 실렸다). **같은 날 시안 정합 라운드가 그 위에 얹혔다** — 시안 `212:937`을 좌표로 재서 머리 여백·제목 급·칩 높이(32)·초기화 버튼 자리(줄 오른쪽 끝 `RotateCcw`)·표의 선 구조(바깥 상자 없음 + 키 셀 `border-r`)·로케일 칸 68을 맞췄고, **`Textarea`에 `resize-none`**(셀마다 손잡이가 2,709개 서 있었다), **mono가 키 이름·로케일 코드에서 빠졌으며**(사용자 — mono는 8-P의 diff로 남긴다, DESIGN §4.1), **패널 머리를 라우트 아홉 전부에서 통일했다**(제목 `text-xl` + 줄 높이 36). **그 뒤 dev에 weight 라운드가 얹혔다** — 본문 기본이 300에서 **400**으로 올라가 쓰는 weight가 **400·500 둘뿐**이 됐고(`font-light` 소비자 0), 상한 500은 그대로다. ✅ **T12(903키 `?ns=*` 2초)가 닫혔다** (2026-09-12 — 로컬 프로덕션 빌드 + dev DB의 `perf-903`(bugshot-2 · ts-dict · **907키**), FCP 3회). **FCP는 기본 착지·`?ns=*` 둘 다 0.3초대**이고 게이트를 통과했다. ⚠️ **그 게이트가 못 보는 축을 함께 쟀다** — `?ns=*`는 `<Textarea>` **2,721개** · DOM 노드 34,624 · 문서 1.44MB라 **`loadEventEnd`가 3.9초**다(FCP는 스트리밍이라 셸에서 난다). **그래도 가상화는 넣지 않는다**: 판정 조건이 게이트 미달인데 통과했고 `?ns=*`는 기본 경로가 아니다(기본 착지는 load까지 1초). 다음에 이 화면이 느리다는 제보가 오면 **FCP가 아니라 그 `loadEventEnd`부터** 본다 — 숫자는 `features/ui-rework/translations/tasks.md` 실측 기록에 있다. 국기 SVG는 2026-09-11에 도착해 `public/flags/`에 **253개가 커밋됐다**(T0 닫힘). **8단계의 전역 규칙은 DESIGN §0**, 작업 규약 아홉은 `features/ui-rework/README.md`다. **잔여는 없다** — 마지막이던 6b-3의 T6(실물 409 검증)도 2026-09-09에 프로덕션 `order-check`로 실측했고, 거기서 나온 선행 결함 둘(base 셀을 비우면 다음 push가 전 로케일에서 orphan한다 · DB가 base와 같아지면 sync PR이 옛 스냅샷을 든 채 남는다)은 `lib/pull/plan.ts`·`lib/pull/run.ts`에 반영됐다. **지금 무엇을 만드는지의 정본은 [docs/SAAS.md](./docs/SAAS.md)** 이고, `docs/MVP.md`·`docs/TASKS.md`는 **PoC 기록으로 닫혔다.** 경계가 이렇다: **MVP.md·TASKS.md = PoC(닫힘) / SAAS.md = 지금.** 아래는 그 PoC가 무엇이었는지다.

**MVP 범위는 셋이었다** (2026-09-03 재정의 — MVP §8.1): **A** `lib/` 모듈이 각자 계약을 닫고 → **B** 세 흐름이 끝에서 끝까지 값을 안 잃고 → **C** Actions·Cron으로 자동으로 돈다. 여기까지가 MVP이고, 그다음이 SaaS화(인증·인가, 프로젝트 생성, 복수 멤버, **UI 시작**)다. **편집 UI는 동작 확인용으로 동결**한다 — SaaS에서 새로 만들 화면을 지금 다듬으면 버려진다 (§8.3).

말모이(`malmoi`): 사내 로컬라이제이션 관리 도구(TMS) PoC. **이름은 1910년대 조선어사전 편찬 사업에서 왔다** — 흩어진 말을 여러 사람이 모아 하나로 만드는 일이 이 도구가 하는 일이다. 표기는 문서 본문 `말모이`, 코드·리포명·slug·도메인 `malmoi`(2026-09-04 개명, 옛 이름 `i18n-poc`). 크롬 확장의 `_locales/<locale>/messages.json`을 대상으로, 개발자가 코드에 심은 소스 문자열을 DB로 올리고(push), 비개발자 동료가 웹 UI에서 번역하고, 그 결과를 고정 브랜치의 PR 하나로 되돌려보낸다(pull). Crowdin/Tolgee 대체가 목표가 아니라 학습·실험이고, 사내에서 실제로 한 번 써볼 수 있는 수준이 목표다.

**PoC 스펙 문서는 [docs/MVP.md](./docs/MVP.md)다** (닫힘 — 현재 단계 스펙은 [docs/SAAS.md](./docs/SAAS.md)). 무엇을 만들고 무엇을 안 만드는지, 각 기술 선택의 근거, 세 흐름(push·편집 UI·pull)의 단계별 계약, 스키마, 구현 순서가 전부 거기 있다. **작업을 시작하기 전에 읽고, 설계 결정이 바뀌면 코드보다 먼저 그 문서를 고친다.** 이 문서(CLAUDE.md)는 *어떻게 작업하는가*를 다루고, MVP.md는 *무엇을 만드는가*를 다룬다.

## 코어 설계 원칙: 번역 값은 DB가 진실, 소스 키는 코드가 진실

**이 프로젝트의 유일한 축이고, 여기서 파생되지 않는 복잡도는 전부 의심 대상이다.** (원문·근거는 [docs/MVP.md](./docs/MVP.md) §2)

두 종류의 데이터에 각각 소유자를 하나씩 배정한다. 소스 키(어떤 문자열이 존재하는가)는 **코드만** 안다. 각 축에 소유자가 하나뿐이므로 **머지 로직이 아예 존재하지 않는다** — export는 DB에서 결정적으로 재생성되니, git 브랜치가 갈라져도 base에서 다시 따서 파일을 새로 뽑으면 끝난다. 3-way merge도, 충돌 해소 UI도, "누가 이겼나" 판정도 없다.

**번역 값의 진실은 시점에 따라 갈린다** (strict 정책 — MVP §3.1): push 시점엔 리포가 DB를 덮고, 그 사이엔 DB가 진실이며 pull이 리포로 되돌려준다. 어느 순간에도 **두 쪽을 병합하지 않는다** — 이 원칙이 실제로 지키는 것은 "단일 소유자"가 아니라 **"병합 없음"** 이다.

따라서:

- **push는 리포 값으로 번역을 덮고 저자도 비운다** (`ON CONFLICT DO UPDATE`, strict — `"updatedBy" = NULL`, 2026-09-08). 변경 감지도 병합도 없다. **덮인 값의 저자는 리포이므로 사람 이름이 남는 쪽이 거짓이었다** (MVP §10 미결 하나가 여기서 닫혔다). 미배포 집계(`countUnpublished`·`isUnpublished`)가 그 조건 위에 선다 — `updatedAt`만 보면 push가 전 행의 시각을 올려 code push 직후 903키 전부가 "안 보낸 편집"이 된다. **대가는 편집 손실 창이다** — 번역자가 편집한 뒤 pull PR이 머지되기 전에 코드가 푸시되면 그 편집이 사라진다 (MVP §3.1). 정책을 느슨하게 하면(변경 감지·병합) 이 원칙이 요구하는 단순성이 무너진다.
- **키는 삭제하지 않는다.** 코드에서 사라진 키도 `orphaned` 플래그만 세운다 — 브랜치를 되돌리거나 기능을 복구하면 번역이 그대로 살아 돌아와야 한다. 삭제는 되돌릴 수 없어 이 원칙을 깬다.
- **pull은 값을 병합하지 않는다.** **모든 어댑터가 원본 파일 내용을 읽는다** (2026-09-04) — 수술적 치환(`ts-dict`·`yaml-catalog`·`code-dict`)은 **구조**(빈 줄·주석·키 순서)를, 재생성(`chrome-locales`·`json-catalog`)은 **표현**(들여쓰기·한 줄 컨테이너·이스케이프·필드 순서)을 가져온다. 어느 쪽도 **값**은 아니다. 값은 전부 DB에서 온다. 기존 값과 DB 값을 견줘 고르는 코드가 생기는 순간 이 원칙이 깨진다. *(2026-09-01 정정: 이전 서술은 "읽는 것은 blob SHA뿐"이었는데 MVP §4.1이 승인한 수술적 치환과 어긋났다 — 지키는 것은 "안 읽는다"가 아니라 "병합하지 않는다"다.)*
- **export는 결정적이어야 한다.** 같은 DB 상태 → 언제나 바이트 단위로 같은 파일. 이게 깨지면 blob SHA 비교가 매번 "변경됨"을 뱉어 무의미한 커밋이 쌓이고, 변경 감지 최적화 전체가 무너진다.

## 작업 원칙

- **가정을 명시**: 해석이 여러 개면 조용히 하나 고르지 말고 선택지를 제시. 불확실하면 물어라.
- **더 단순한 방법이 있으면 제안**: 200줄을 50줄로 줄일 수 있으면 줄여라. 요청하지 않은 유연성·설정 가능성·추상화 추가 금지. **이 프로젝트는 PoC다** — 확장성을 위한 선반영은 그 자체가 결함이다.
- **외과적 변경**: 요청과 직접 관련 없는 인접 코드 개선·리팩터 금지. 기존 스타일 따르기. 기존 dead code는 언급만 하고 삭제하지 않는다 — 내 변경이 만든 고아만 제거.
- **검증 가능한 목표로 전환**: "버그 고쳐" → "재현 테스트 작성 후 통과시켜". 멀티스텝 작업은 단계별 검증 체크를 포함한 플랜을 먼저 제시.
- **테스트 우선**: 신규 인터페이스(함수·헬퍼·어댑터) 추가 시 테스트를 먼저 작성하고 구현한다. 기존 로직 변경 시에도 관련 순수 함수의 단위 테스트를 작성/갱신하고 `pnpm test` 통과를 확인한 뒤 작업을 마친다. 테스트 없이 코드만 변경하지 않는다.

## 스택

**버전은 2026-08-31 기준으로 실제 설치·빌드 검증된 조합이다.** 임의로 올리지 않는다 — 특히 `next-auth`는 beta라 마이너 변경에 API가 움직인다.

| 영역 | 선택 | 버전 |
|---|---|---|
| 앱 | Next.js App Router (React 19, TypeScript) | `next` 16.3.3 / `react` 19.2.8 / `typescript` 7.0.2 |
| 배포 | Vercel — **dev push = preview / main 머지 = 프로덕션**(`https://mal-moi.com`) | — |
| DB | Supabase Postgres **둘** — prod(`malmoi`, ref `xgsyyapzkpbdtkrprlmn`) / dev(`malmoi-dev`, ref `bfugwmjubgmmroevrave`) | — |
| 테넌시 | **편집 경로는 멀티테넌트다** (2026-09-05) — 프로젝트는 URL의 slug, 권한은 `ProjectMember`가 정하고 모든 진입점이 `getProjectAccess`를 지난다. ✅ **두 라우트 모두 단일 프로젝트 가정을 벗어났다** (2026-09-07): `/api/push`는 토큰이 프로젝트를 정하고(`sha256(Bearer)` → `Project.pushTokenHash` → slug 대조), `/api/pull`은 준비된 **전 프로젝트를 순회**한다(`lib/pull/targets.ts`, 프로젝트별 try/catch + 배열 응답). 공유 slug env를 읽는 코드가 남아 있지 않다 | — |
| ORM | Prisma 7 — **접속 URL이 스키마에 없다.** 마이그레이션은 `prisma.config.ts`(`DIRECT_URL`, 5432) / 런타임은 driver adapter(`DATABASE_URL`, 6543) | `prisma`·`@prisma/client`·`@prisma/adapter-pg` 7.10.0 + `pg` 8.23.0 |
| 로그인 | Auth.js v5 **DB 세션** — GitHub + Google **둘 다 열려 있다** (2026-09-05, 허용 목록 제거와 같은 커밋). 로그인은 **검증된 이메일만** 요구하고, 그것이 아무것도 열지 않는다 — 인가는 `ProjectMember`다. ⚠️ **Google 동의 화면은 External + 테스트**여야 한다(Internal은 조직 밖 계정을 `403 org_internal`로 막아 초대 경로를 통째로 죽인다) | `next-auth` 5.0.0-beta.32 + `@auth/prisma-adapter` 2.11.3 (`@auth/core@0.41.3`을 정확히 고정해 인스턴스를 공유한다) |
| 리포 쓰기 | GitHub App **installation 토큰** — `octokit`의 `App`을 쓴다 (`@octokit/auth-app` 별도 설치 불필요) | `octokit` 5.0.5 |
| 계정 연결 | 같은 App의 **user-to-server 토큰** (2026-09-06, SaaS 4단계) — "이 사람이 이 설치를 볼 수 있는가"를 묻는 데만 쓰고 **GET만** 부른다. ⚠️ **`octokit`이 재수출하는 `OAuthApp`으로는 안 된다** — `clientType: "oauth-app"`으로 고정된 클래스라 github-app 모드가 타입상 `never`로 접히고 `defaults`로도 못 되돌린다(실측). 그래서 이미 전이 의존성이던 것을 **직접 의존성으로 승격**했다 | `@octokit/oauth-app` 8.0.4 |
| 스타일 | Tailwind CSS 4 — **`tailwind.config.js`가 없다.** 테마는 `app/globals.css`의 `@theme` | `tailwindcss`·`@tailwindcss/postcss` 4.3.3 |
| UI | **`components/ui/`를 이 리포가 소유한다** (2026-09-08, 6a T5 — shadcn 생성물 4개는 삭제됐고 CLI로 신규 컴포넌트 추가는 허용하되 기존 파일을 덮어쓰지 않는다). 프리미티브 **17개**(`components/ui/*.tsx` — **파일 단위로 센다**. **`EntityCard`가 2026-09-12에 붙었다** — account-linking. 같은 디렉터리의 `tone.ts`는 프리미티브가 아니라 색 클래스 헬퍼라 이 수에 안 들어간다) + `radix-ui`에서 DropdownMenu·Dialog·**Slot**·**RadioGroup** 넷 (2026-09-11에 `Tooltip`을 걷었고 — 8-3이 접기 레일을 지우면서 소비자가 0이 됐다 — 같은 날 8-4가 `DropdownMenuCheckboxItem`을 더했는데 **그것은 `dropdown-menu.tsx`의 export라 파일이 안 늘었다**. **RadioGroup은 2026-09-12에 붙었다** — `SegmentedControl`이 손으로 든 roving tabindex를 그쪽에 넘겼다). **라이트 단일, `dark:` 금지**. 시각 규칙은 [docs/DESIGN.md](./docs/DESIGN.md) | `radix-ui` 1.6.7 (단일 통합 패키지 — `@radix-ui/react-*` 개별 설치 아니다) · `class-variance-authority` |
| 아이콘 | `lucide-react` 1.37.0 | |
| 폰트 | **Pretendard Variable 동적 서브셋, 자사 호스트** | `pretendard` 1.3.9 |
| 검증 | Zod 4 — `/api/push` 페이로드 등 외부 진입점 | `zod` 4.5.4 |
| YAML | `yaml` — **CST 보존 수술적 치환용**(`parseDocument`). 주석·앵커·빈 줄을 지켜야 해서 재생성용 파서로 쓰지 않는다. ⚠️ **고정 이유가 둘이다** (2026-09-10): `lib/onboarding/budget.ts`가 첫 적재의 중첩 깊이를 재려고 **`Parser`의 내부 `stack`을 읽는다** — 공개 API가 아니라 버전이 올라가면 조용히 모양이 바뀔 수 있고, 그때 red를 내는 것은 `budget.test.ts`뿐이다 | `yaml` 2.9.0 |
| **키·원문 출처** | **리포의 로케일 파일** — 어댑터가 양방향으로 읽고 쓴다 (`lib/adapters/`) | — |
| 사용처 수집 | `ts-morph` AST + 정규식 — **`refs` 전담, 실패는 경고** | `ts-morph` 28.0.0 |
| 스크립트 실행 | `tsx` — `scripts/scan.ts` CLI 실행용 | `tsx` 4.23.13 |
| 테스트 | Vitest — **순수 함수 단위 + DOM** (2026-09-12에 뒤가 붙었다: 파일 머리의 `// @vitest-environment jsdom`으로 켜고 `components/__tests__/helpers/dom.tsx`가 `createRoot`+`act`를 감싼다. ⚠️ **`vitest.config.ts`의 기본은 그대로 `node`다** — 전역으로 켜면 순수 모듈 수백 개가 이유 없이 jsdom을 세운다) | `vitest` 4.1.11 · `jsdom` 27.4.0 · `@testing-library/user-event` 14.6.1 |
| Node | `.nvmrc` **24** — `@types/node`를 이 메이저에 맞춘다(`^24`). **정본은 Vercel 프로젝트의 Node.js Version이다** (2026-09-03 실측 24.x): 프로덕션이 그 버전으로 빌드하므로 로컬·CI가 따라간다 | `@types/node` 24.13.3 |
| DB 접속 | Supabase 리전 `ap-northeast-1` (도쿄). 직결 `db.<ref>.supabase.co`는 IPv6 전용이라 Vercel에서 안 붙으므로 **마이그레이션도 pooler**를 쓴다. ⚠️ **Vercel 함수도 같은 리전에 둔다** (`vercel.json`의 `regions: ["hnd1"]`, 2026-09-09) — 기본 `iad1`에서는 홉당 ~375ms였다 | — |

⚠️ **`lucide-react`는 셸 전 항목이 든다** (DESIGN §6.8 — 접힌 레일에서 아이콘이 유일한 라벨이다). Radix는 `components/ui/`의 프리미티브 셋을 통해서만 쓰인다. ⚠️ **`sonner`가 2026-09-10에 돌아왔다** (8-1b). 2026-09-08에 "사용 0"으로 제거하면서 *"피드백은 셀 인라인과 `Alert`이고 토스트는 그것을 둘로 가른다"*를 근거로 적었는데, **8단계가 토스트로 통일하기로 뒤집었다**(사용자, 두 번 재확인). 그 결정이 요구한 **경계**는 `docs/features/ui-rework/README.md` 규약 8과 DESIGN §6.25에 있다 — 토스트는 **전역 결과를 내는 이벤트**만이고, 대상이 있는 판정·지속되는 조건·페이지 콘텐츠 자체는 인라인이다. ⚠️ **`client-graph.test.ts`는 허용 목록이라 편집이 셋이었다**(`ALLOWED` 추가 · 메타 반례에서 제거 · 근거 주석). `tw-animate-css`는 그대로 없다.

**린터·다크모드·가상 스크롤·테이블 라이브러리는 없다.** 필요해지면 그때 넣는다 (`next-themes`·`@tanstack/*` 미설치).

**⚠️ `app/globals.css`의 `@custom-variant dark` 한 줄이 라이트를 고정한다.** Tailwind v4는 `dark:`의 기본 동작이 `prefers-color-scheme`이라, **그 줄을 지우면 누가 `dark:`를 하나 쓰는 순간 OS 다크에서 살아난다.** 지금 소스에 `dark:`는 0곳이지만(shadcn 생성물과 함께 사라졌다) 그 줄은 남긴다 — 막는 것이 요지다. 상세는 [docs/DESIGN.md](./docs/DESIGN.md) §3.1.

### Prisma 7 — v6와 배선이 다르다

`url`·`directUrl`이 스키마에서 제거되고 driver adapter가 필수가 됐다. v6 문서·예제를 그대로 적용하면 valid하지 않다.

| 용도 | 위치 | 환경변수 | 포트 | 어느 DB |
|---|---|---|---|---|
| 마이그레이션 생성·상태 | `prisma.config.ts` | `DIRECT_URL` | 5432 (session) | **dev** |
| 마이그레이션 **프로덕션 반영** | `prisma.config.ts` (`PRISMA_TARGET=prod`) | `DIRECT_URL_PROD` | 5432 (session) | **prod** |
| 런타임 쿼리 | `lib/db.ts` (`PrismaPg` adapter) | `DATABASE_URL` | 6543 (transaction) | 로컬·Preview는 dev / 프로덕션은 prod |

**`PRISMA_TARGET`을 사람이 넘기지 않는다** — `package.json`의 `db:deploy`·`db:status:prod`가 세운다. 없으면 dev(안전한 쪽)로 떨어지고, `.env.example`에도 넣지 않는다(사람이 채우는 값이 아니다).

- 클라이언트는 `generated/prisma/`로 생성된다 (**gitignore된 산출물** — CI가 typecheck 전에 `db:generate`를 돌린다). import는 `@/generated/prisma/client`
- `prisma.config.ts`가 **`.env.local`을 명시적으로 읽는다.** `dotenv` 기본값은 `.env`라서 경로를 안 주면 URL이 `undefined`가 되고 `P1001 Can't reach database server`로 오진하게 된다
- ⚠️ **`prisma.config.ts`에서 `env("DIRECT_URL")`을 쓰지 않는다.** 그 헬퍼는 config **로드 시점에** 던지고 이 파일은 `prisma generate`에도 로드되므로, `.env.local`이 없는 환경(Vercel·새 체크아웃)의 `pnpm build`가 통째로 죽는다. `datasource`는 마이그레이션·introspection 전용이라 **조건부로 넣는다** — 없으면 그 명령에서만 실패하고, Prisma가 명령 이름까지 찍어 알려준다. 같은 파일이 같은 이유로 두 번 터졌다 (`docs/POSTMORTEM.md` 2026-08-31 + 🔁 재발)
- **✅ dev DB와 prod DB가 갈렸다** (2026-09-04). Supabase 프로젝트 둘 — `malmoi-dev`(로컬·Preview) / prod(프로덕션 배포). `pnpm db:migrate`가 프로덕션에 **닿을 수 없다.**
  - **새 실패 모드가 생겼다**: dev에만 적용하고 `db:deploy`를 잊으면 배포 순간 프로덕션이 없는 컬럼을 조회한다. 분리 전에는 `migrate dev`가 이미 프로덕션을 바꿔놔서 잊어도 안 깨졌다. 그래서 **`/merge` 1단계가 `pnpm db:status:prod`를 확인한다** — `/push` 3단계와 `db:status`는 dev만 본다
  - `--create-only` + `db:deploy`로 쪼개는 습관은 유지한다: 생성한 SQL을 프로덕션에 보내기 전에 눈으로 본다
  - **dev에서는 리셋을 승인해도 된다** (번역 데이터가 없다 — 폐기용 리포 적재분뿐이고 `push:local`로 복구된다). ⚠️ 단 `db:deploy`는 prod를 겨누므로 그 명령에 리셋 개념이 없다는 것을 전제로 한다. 상세는 `/db`

### 데이터 변경 경로 — 내부는 Server Action, 외부 진입점만 Route Handler

| 경로 | 형태 | 호출자 |
|---|---|---|
| 번역 값 저장, pull 트리거 | **Server Action** (`app/(edit)/actions.ts`) | 편집 UI |
| 초대 발급·멤버 변경 | **Server Action** (`app/(edit)/projects/actions.ts`) | 편집 UI (OWNER) |
| 프로젝트 생성·탐지·첫 적재·토큰 재발급 | **Server Action** (같은 파일, 2026-09-07 SaaS 5단계) | 온보딩 UI — 프로젝트가 없는 넷은 `requireUser`뿐이다 |
| 초대 수락 | **Server Action** (`app/invite/actions.ts`) | 초대 링크 — **인가 예외**, 토큰이 대신한다 |
| `/api/push` | Route Handler | GitHub Actions — Bearer가 **그 프로젝트의 토큰 원문**이다 (서버 env가 아니다, 2026-09-07) |
| `/api/pull` | Route Handler | Vercel Cron만 (`CRON_SECRET`) — 편집 UI 버튼은 Server Action이 `triggerPull`을 직접 부른다 |

**내부 쓰기에 Route Handler를 새로 만들지 않는다.** 클라이언트 fetch 배선과 중복 스키마가 생기고, `revalidate`를 손으로 배선해야 한다. 역으로 **외부가 부르는 진입점을 Server Action으로 만들지 않는다** — Actions는 안정된 공개 계약이 아니다.

### 세션은 DB에 있다 — 권한 회수가 다음 요청부터 반영된다 (2026-09-05 전환)

`session: { strategy: "database", maxAge: 60 * 60 * 24, updateAge: 60 * 60 }` + `@auth/prisma-adapter`. **세션에 담는 것은 `userId` 하나**이고 권한은 매 요청 `ProjectMember`에서 읽는다 — 토큰에 role이나 projectIds를 실으면 JWT의 지연 문제가 그대로 돌아온다 (SAAS §5.3).

**JWT를 고른 원래 이유는 "사용자 테이블 4개가 사라진다"였고, 그 대가가 "허용 목록에서 뺀 사람이 최대 하루 편집할 수 있다"였다** (MVP §5). SaaS는 그 절제를 되돌린다 — 멤버 제거와 역할 변경이 즉시 반영돼야 하기 때문이다. 지불하는 대가는 **요청마다의 DB 왕복**이다.

**인가도 함께 바뀌었다** (2026-09-05, §5) — 편집 경로의 모든 진입점이 `getProjectAccess`를 지나고 프로젝트는 URL의 slug가 정한다. **로그인은 이제 누구에게나 열려 있고, 그것이 아무것도 열지 않는다** — 멤버십이 없으면 어떤 slug를 쳐도 `not-found`다.

⚠️ **`maxAge` 24시간은 "마지막 활동 뒤 24시간"이다** (2026-09-06 결정 — `updateAge` 1h). 그 전엔 `updateAge`를 안 줘서 기본값(24h)이 `maxAge`와 같았고, 그러면 Auth.js의 갱신 조건이 `expires`와 일치해 **세션이 한 번도 연장되지 않았다** — 로그인 정각 24시간 뒤 편집 도중 끊기고 쿠키까지 사라졌다. 활동 중인 세션은 시간당 한 번 DB 쓰기로 연장된다 (ARCHITECTURE §6.1.1).

⚠️ **`auth()`를 직접 부르지 않는다 — `readSession()`을 쓴다** (`lib/auth/read-session.ts`, 2026-09-06). `auth()`는 어댑터 예외를 삼키고 `null`을 돌려주므로 **DB 장애와 비로그인이 반환값으로 구별되지 않는다** — 장애를 로그인 화면으로 그냥 보내면 정상 로그아웃과 바이트 단위로 같은 응답이 되어 프로덕션 전면 장애를 "정상"으로 읽었다 (POSTMORTEM 2026-09-06). `readSession`은 `logger.error` + AsyncLocalStorage로 `unavailable`을 가르고, 그때 `/signin?error=Unavailable`·"일시적인 오류" 문구로 간다 (ARCHITECTURE §6.1.2).

⚠️ **미들웨어에서 `auth()`를 부르지 않는다** — DB 세션에서 그 래퍼는 DB를 읽고 세션 갱신 쓰기까지 한다. **렌더 요청(GET·HEAD)에** 쿠키 이름만 보는 것으로 갈랐고, **Server Action POST는 통과시킨다**(307이면 `fetch`가 POST를 로그인 화면으로 재전송해 페이지 오류가 된다 — Action은 스스로 인증한다). 상세는 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) §6.1이다.

### 키 리스트는 가상화하지 않는다

네임스페이스 필터로 자르면 한 화면이 보통 수십~수백 행이다. `@tanstack/react-virtual`·`react-table`을 넣지 않고 순수 렌더로 시작한다. **실제로 느려지는 네임스페이스가 관측되면** 그때 대응한다 — 인라인 편집과 가상 스크롤을 섞으면 스크롤 튐·포커스 유실 함정이 붙는다.

⚠️ **관측됐다** (2026-09-07 실측, `/bugshot-qa`): `ts-dict` 903키 프로젝트의 **필터 없는** 번역 화면이 **12.7초**다 — 903행 · `<input>` 2,711개 · 네임스페이스 52개. 필터를 걸면 위 전제대로 수십 행이다. **그래도 지금 가상화를 넣지 않는다**: 그 화면은 동결분이고(MVP §8.3) SAAS §8 6단계가 재작성하므로, 거기서 "기본 착지를 첫 네임스페이스로" 같은 값싼 수단을 먼저 본다.

✅ **그 값싼 수단이 화면에 붙었다** (2026-09-08, 6a T2 판정 + T7 화면): `defaultNamespace`가 **pending>0인 첫 네임스페이스**로 착지시키고 표는 그 ns의 행만 렌더한다 — `compareKeys` 첫 항목은 알파벳순이라 이미 다 번역된 사소한 ns일 수 있었다. orphaned만 있는 ns는 건너뛴다. **전체 보기는 `?ns=*`로만 간다.**

⚠️ **재측정했고 2초 목표가 미달이었다** (2026-09-08 프로덕션): 필터 없는 화면 **12.7 → 4.66초**(2.7배), **기본 착지 3.30초**. 그런데 **24키 프로젝트도 3.29초**라 약 1.9초가 **키 수와 무관한 고정 비용**이었고, **가상화도 조회 좁힘도 그것을 못 줄인다**는 판정은 그대로다.

⚠️ **8-4가 표의 축을 바꿨고 그 판정이 아직 안 끝났다** (2026-09-11). 로케일이 행이 되면서 `?ns=*`의 **표 행이 903 → 2,709**가 됐지만 **`<Textarea>` 수는 2,709 그대로다**(축이 바뀌어도 셀 수는 안 변한다) — 늘어난 것은 행 래퍼와 로케일 배지이고, **국기는 CSS `background-image`라 요소가 0개 는다.** 그래서 가상화를 선반영하지 않았다. **게이트는 SAAS §8 원문 그대로 `?ns=*` 첫 착지 2초**이고 기준선이 1.20초(FCP)다 — **미달이면 그 자리에서 가상화를 판정한다**(다음 사이클로 넘기면 게이트가 게이트가 아니다). ⚠️ dev DB에 903키 프로젝트가 없어 `push:local` 적재가 선행이고, 재는 방법은 6a T7과 같아야 한다(같은 프로젝트·같은 머신·DevTools Performance, **FCP 3회**).

✅ **그 고정분의 원인이 나왔고 가상화와 무관했다** (2026-09-09): **Vercel 함수가 `iad1`(워싱턴)에서 돌고 DB는 도쿄**였다 — `x-vercel-id: icn1::iad1::…`(앞이 엣지, **뒤가 실행 리전**). 왕복 일곱이 전부 태평양을 건너 홉당 ~375ms였다. `vercel.json`에 `regions: ["hnd1"]`을 박아 **기본 착지 3.30 → 0.44~0.54초**, **필터 없는 907키 화면 4.66 → 1.20초**다(FCP 3회, PR #24 → `7b029b8`). **2초 목표는 최악 경로에서도 통과했고 수단 셋(`Suspense`·왕복 병합·폰트) 중 아무것도 쓰지 않았다.** ⚠️ **오진을 부른 것은 TTFB다** — 8~78ms를 서버 시간으로 읽으면 "셸은 빠른데 클라이언트가 느리다"가 되는데, 실제로는 헤더만 먼저 나가고 서버가 8KB 본문을 3.4초 붙들고 있었다. 스트리밍 응답에서는 **`responseEnd`와 `transferSize`를 함께** 본다 (POSTMORTEM 2026-09-09).

### 폰트 — Pretendard 동적 서브셋 (생성물)

단일 `PretendardVariable.woff2`는 **2.0MB**다. 동적 서브셋은 92개 구간으로 쪼개져 있고 브라우저가 `unicode-range`로 필요한 구간만 받으므로 ko/en/fr 혼용 UI에서 실 전송량이 150~450KB 수준이다.

- `scripts/copy-fonts.mjs`가 `node_modules/pretendard`에서 `public/fonts/pretendard/`로 복사한다. `predev`·`prebuild`가 자동 실행한다
- **`public/fonts/`는 생성물이라 `.gitignore`에 있다** (3.1MB, 92파일)
- CSS의 `url()`이 `./woff2-dynamic-subset/...` 상대 경로다. **디렉터리 구조를 바꾸면 폰트가 조용히 404가 되고 시스템 폰트로 떨어진다**
- `<link>`로 `app/layout.tsx`가 불러온다 — `globals.css`의 `@import`로 넣으면 스타일시트 체인이 직렬화돼 폰트 요청이 한 단계 늦게 시작된다
- **`.npmrc`의 `enable-pre-post-scripts=true`가 이 자동 실행을 보장한다.** pnpm 버전에 따라 기본값이 달라지고, 안 돌면 에러도 경고도 없이 폰트만 빠진다. 이 파일을 지우지 않는다

**GitHub 자격증명이 셋이고, 섞지 않는다** (2026-09-06에 둘에서 셋이 됐다).

| 무엇 | 어디서 | 무엇을 하나 |
|---|---|---|
| OAuth App 토큰 | Auth.js provider (`AUTH_GITHUB_*`) | **로그인** — 이 사람이 누구인가 |
| GitHub App **user-to-server** 토큰 | `lib/github-connect/user.ts` (`GITHUB_APP_CLIENT_*`) | **연결** — 이 사람이 우리 App의 어느 설치를 볼 수 있는가. **GET만** |
| GitHub App **installation** 토큰 | `lib/github.ts` (`GITHUB_APP_ID`·`GITHUB_APP_PRIVATE_KEY`) | **쓰기** — 커밋·PR |

여기에 `GITHUB_APP_SLUG` 하나가 더 붙는데 자격증명이 아니다 — 설치 링크(`https://github.com/apps/<slug>/installations/new`) 조립용이고 `optionalEnv`라 **없으면 그 링크만 조용히 사라진다**.

OAuth 토큰으로 커밋하면 커밋이 특정 개인 명의가 되고 그 사람이 org를 떠나면 파이프라인이 깨진다. 경계를 넘는 코드가 보이면 리뷰에서 막고, `lib/github-connect/__tests__/credential-separation.test.ts`가 소스에서 상시로 센다 — 개인키가 연결 경로로, 사용자 토큰이 커밋 경로로 가는 것을 양방향으로 막는다.

### 암호화 키도 셋이고, 섞지 않는다 (2026-09-10 전환 완료)

**저장된 것은 전부 봉투·해시이고 원문은 쿠키와 프로세스 메모리에만 있다.** 키가 셋인 이유는 용도가 셋이기 때문이고, `validateCredentialKeys`가 **키 값 셋이 서로 다른지** 검사한다(⚠️ `*_KEY_ID` 셋은 안 본다 — keyring 안의 이름이라 겹쳐도 된다. 그리고 전환 CLI에서만 돈다).

| 무엇 | 환경변수 | 무엇을 여나 |
|---|---|---|
| 토큰 | `TOKEN_ENCRYPTION_KEYS`·`_ACTIVE_KEY_ID` | GitHub App **연결 토큰**(access·refresh) |
| 개인정보 | `PII_ENCRYPTION_KEYS`·`_ACTIVE_KEY_ID` | `User.email`·`name`·`image` · 초대 email |
| 검색 | `EMAIL_LOOKUP_KEY`·`_KEY_ID` | 정확 일치 조회용 HMAC (**복호화가 아니다** — 되돌릴 수 없다) |

- **세션은 키가 없다** — `sha256:v1:` digest는 도메인 분리 해시라 대조만 한다.
- ⚠️ **형식이 갈린다**: `*_ENCRYPTION_KEYS`는 keyring JSON, `EMAIL_LOOKUP_KEY`는 **원시 base64 하나**. 섞으면 base64 디코드가 조용히 깨진다.
- ⚠️ **dev와 prod가 다른 키다** — dev 키가 새도 프로덕션 회원 데이터가 안 열려야 한다. 도구는 *어느 DB*만 검사하고 **키는 target에 안 묶여 있으므로**, prod 명령은 `.env.prod.local`을 셸로 source해 덮는다(`.env.example`). 그 파일에 넣을 수 없는 이유는 이름이 같아 한 파일에 두 벌이 안 들어가고 dotenv가 셸 env를 override하지 않아서다.
- ⚠️ **PII 키를 잃으면 회원 이메일·이름을 복구할 수 없다** — DB 백업을 되살려도 그 시점의 키가 있어야 열린다. **키와 백업을 쌍으로** 보관하고 회전할 때 옛 키를 지우지 않는다.
- 회전·재색인·복구 절차는 [credential 운영 절차](docs/features/credential-storage/operations.md).

## 명령어

| 용도 | 명령 |
|---|---|
| 개발 서버 | `pnpm dev` |
| 프로덕션 서버 (로컬) | `pnpm start` (`next start` — 빌드 산출물 확인용. Vercel이 배포에서 쓰는 명령이라 로컬에선 거의 안 쓴다) |
| 빌드 | `pnpm build` (`prisma generate && next build` — **generate가 앞에 붙어 있다**: `generated/`가 gitignore된 산출물이라 깨끗한 체크아웃에서 `next build`만 돌면 `@/generated/prisma/client`를 못 찾는다) |
| 타입 체크만 | `pnpm typecheck` |
| 테스트 | `pnpm test` |
| 테스트 (watch) | `pnpm test:watch` |
| 마이그레이션 생성·적용 (**dev**) | `pnpm db:migrate` (`DIRECT_URL`) |
| 마이그레이션 프로덕션 반영 | `pnpm db:deploy` (`DIRECT_URL_PROD` — 이름 그대로 **prod 전용**이다) |
| 마이그레이션 상태 (**dev**) | `pnpm db:status` |
| 마이그레이션 상태 (**prod**) | `pnpm db:status:prod` — `/merge` 1단계가 이걸 본다 |
| Prisma 클라이언트 재생성 | `pnpm db:generate` |
| DB 브라우저 | `pnpm db:studio` |
| 로케일 적재 | `pnpm ingest <대상 디렉터리> [--json] [--base <locale>] [--adapter <name>]` (포맷 탐지 → 키 적재 → 왕복 검증). **인자 파싱은 네 CLI가, 리포 훑기는 세 CLI가** `lib/cli/`를 공유한다 |
| 사용처 스캔 | `pnpm scan <대상 디렉터리> [--json] [--wrapper <module>#<export>[()]]...` (`refs` 수집 — **결과가 어떻든 exit 0**, 사용법 오류만 2). 끝의 `()`가 훅이고(`next-intl#useTranslations()`), **여러 번 줄 수 있다** |
| 로컬 push | `pnpm push:local <대상 디렉터리> --project <slug> [--url ...] [--wrapper ...] [--adapter ...] [--base <locale>]` (적재+스캔+POST). ⚠️ `--base`는 2026-09-04 감사가 더했다 — 키 집합의 진실이 base 파일이라 틀리면 진짜 base에만 있는 키가 orphaned로 떨어진다 |
| 어댑터 범용성 측정 | `pnpm adapter-survey <리포목록.txt> [--json] [--verdicts <파일>] [--out <파일>] [--limit N] [--jobs N]` (오픈소스 리포에 detect·read·왕복을 돌려 지표를 낸다 — **읽기 전용, 결과가 어떻든 exit 0** — 사용법 오류만 2. 파이프엔 `pnpm --silent`) |
| GitHub App 스모크 | `pnpm smoke:github <project-slug>` (**읽기만** — App 토큰→base head→트리→글롭 매칭 확인. 실 API라 `pnpm test` 밖이다) |
| 폰트 재복사 | `node scripts/copy-fonts.mjs` (predev·prebuild가 자동 실행) |
| Codex 미러 동기화 | `pnpm sync:agents` (검사만: `pnpm sync:agents:check`) |
| 자격증명 전환 (**dev**) | `pnpm credentials:dev [--mode=verify\|rotate-token\|rotate-pii\|reindex] [--apply --traffic-blocked --writers-drained]` — 기본은 **check-only**(쓰기 0) |
| 자격증명 전환 (**prod**) | `pnpm credentials:prod …` — ⚠️ **prod DB를 직접 겨눈다**(`db:deploy`와 같은 부류). 키도 prod 것이어야 한다: `set -a; . ./.env.prod.local; set +a;`를 앞에 붙인다 |
| 평문 인덱스 제거 (R2) | `pnpm credentials:finalize:dev` / `credentials:finalize:prod` — 전건 검증 뒤 **finalize 하나만 pending**일 때 `migrate deploy`를 부른다 |
| 격리 PostgreSQL 검증 | `pnpm test:credentials:postgres` — ⚠️ **`pnpm test`에 없다**(별도 config + 로컬 PostgreSQL 17). `/push` 게이트가 안 돌리므로 `lib/credentials/**`를 건드렸으면 손으로 돌린다 |

### 새 머신 셋업 (체크아웃 3개 산출물이 전부 gitignore다)

**두 대에서 작업한다.** 새 체크아웃은 `node_modules`·`generated/prisma`·`public/fonts`·`.env.local`이 전부 없고, 앞의 셋은 명령으로 복구되지만 **`.env.local`만 사람이 채운다.**

1. **Node를 `.nvmrc`에 맞춘다** (24). 로컬 게이트와 CI가 `.nvmrc`를 따르므로(위 브랜치·배포 섹션), 로컬과 Vercel의 메이저가 갈리면 두 게이트가 함께 거짓 green이 된다. **어긋났을 때 맞추는 방향은 Vercel 쪽이다** — 프로덕션이 진실이고 `.nvmrc`가 따라간다 (2026-09-03에 반대로 적었다가 고쳤다: `.nvmrc`가 20인데 Vercel 프로젝트는 24.x였다)
2. `pnpm install`
3. `cp .env.example .env.local` 후 값을 채운다. ⚠️ **암호화 키 여섯이 비면 로그인·초대·멤버 조회가 통째로 죽는다**(위 표) — 다른 머신의 값을 옮기거나, 새 dev DB라면 새로 만들고 backfill을 돌린다. **⚠️ 이 파일은 에이전트가 편집하지 않는다** — 편집하면 하네스가 "파일이 바뀌었다" 알림으로 **전문을 컨텍스트에 넣어** 시크릿이 트랜스크립트에 남는다 (2026-09-04에 실제로 그렇게 유출돼 전면 재발급했다). 구조가 필요하면 에이전트가 **다른 경로에 템플릿을 쓰고** 사람이 값을 채워 옮긴다. 값을 꺼낼 때도 `| pbcopy`로 클립보드에만 보낸다. ⚠️ **`vercel env pull`로는 못 가져온다** — 전부 Vercel의 **Sensitive**로 등록돼 있어 CLI도 대시보드도 값을 못 읽는다(`[SENSITIVE]` 플레이스홀더만 내려온다). **다른 머신의 `.env.local`을 옮기는 것이 정상 경로**이고, 그게 불가능하면 전면 재발급이다 (2026-09-03에 한 번 겪었다 — 아래). 시크릿을 리포·채팅에 붙여넣지 않는다
   - ⚠️ **GitHub OAuth 앱이 셋인데 `.env.local`이 갖는 건 하나뿐이다** (2026-09-04 브랜치 분리 뒤). callback URL을 앱당 하나만 등록할 수 있어서 갈렸다:

     | 앱 | callback | 자격증명이 사는 곳 |
     |---|---|---|
     | 프로덕션 | `https://mal-moi.com/api/auth/callback/github` | Vercel **Production** 스코프 |
     | preview | `<dev 브랜치 고정 URL>/api/auth/callback/github` | Vercel **Preview** 스코프 |
     | 로컬 | `http://localhost:3000/api/auth/callback/github` | **`.env.local` — 두 머신이 이 앱 하나를 공유한다** |

     ⚠️ **Google은 반대다 — 클라이언트가 하나다.** Google Cloud의 웹 클라이언트는 redirect URI를 **여러 개** 등록할 수 있어서 로컬·preview·프로덕션 셋(`…/api/auth/callback/google`)을 한 클라이언트에 넣고, `AUTH_GOOGLE_ID`·`AUTH_GOOGLE_SECRET`은 `.env.local`과 Vercel의 Production·Preview 스코프에 **같은 값**이 들어간다. ⚠️ **동의 화면은 External + 테스트**여야 한다: Internal이면 조직 밖 계정이 `403 org_internal`로 막히는데, 비개발자 동료를 초대하는 것이 이 provider를 넣은 이유 전부다.

     **새 머신에 채우는 `AUTH_GITHUB_ID`·`AUTH_GITHUB_SECRET`은 로컬 앱 것이다.** 앞의 둘은 어느 `.env.local`에도 들어가지 않으므로 머신을 옮길 때 따라다닐 필요가 없고, 잃어버려도 GitHub에서 secret을 재발급해 Vercel의 해당 스코프만 갱신하면 된다(전면 재발급이 아니다). Vercel의 **Development 스코프는 쓰지 않는다** — `vercel env pull`을 안 쓰고 이 파일을 손으로 관리하므로 그 스코프를 읽는 곳이 없다
4. `pnpm db:status`로 **dev** 접속을, `pnpm db:status:prod`로 **prod** 접속을 확인한다 (둘 다 5432). ⚠️ 두 명령의 출력이 **같아 보인다** — pooler 호스트가 두 프로젝트에서 동일하고 ref는 사용자명에 있다. 구별 신호는 **적용된 마이그레이션 개수**이고, 새 dev 프로젝트라면 전부 미적용으로 나온다
5. `pnpm db:generate` — 안 하면 `@/generated/prisma/client`를 못 찾는다 (`pnpm build`는 자동으로 한다)
6. `pnpm typecheck && pnpm test`로 셋업을 확인한다. 폰트는 `pnpm dev`의 `predev`가 복사한다

**전면 재발급을 하게 되면 순서가 있다** (2026-09-03 실행). Supabase 비번 재설정 → `.env.local` → **Vercel env(아래 ⚠️ — 환경을 **하나씩**, 값은 stdin으로. `--value`는 `ps`에 노출된다)** → 재배포(`vercel redeploy <최근 prod URL>`).

⚠️ **`PUSH_TOKEN`은 2026-09-07부터 서버 env가 아니다.** 전에는 로컬·Vercel·Actions 세 곳이 **같은 값**을 들어야 했는데, 지금은 **프로젝트별 토큰**이라 짝이 둘로 갈렸다: 대상 리포의 Actions secret ↔ **그 리포가 붙은 프로젝트의 `Project.pushTokenHash`**. 발급은 설정 화면의 [토큰 재발급]이고 서버는 해시만 갖는다 — Vercel에 그 이름의 변수를 둘 이유가 없고, `.env.local`의 값은 **`push:local`이 보낼 그 프로젝트의 토큰 원문**(로컬 전용)이다. 재발급하면 옛 토큰이 즉시 무효이므로 **대상 리포 secret을 같은 세션에 바꾼다** — 안 바꾸면 그 리포 CI가 401로 죽는다. `CRON_SECRET`은 Vercel만, `AUTH_SECRET`은 로컬과 프로덕션이 달라도 된다(세션이 갈릴 뿐이다). ⚠️ **`AUTH_GITHUB_ID`·`AUTH_GITHUB_SECRET`은 Production과 Preview가 서로 다른 OAuth 앱이다** — `--force`로 갱신할 때 스코프를 뭉뚱그리면 preview 로그인이 조용히 깨진다.

⚠️ **`vercel env add`는 환경을 하나씩만 받고, `--force`를 믿지 말고 목록으로 확인한다** (2026-09-06 실측). CLI 59.11이 `production,preview` 같은 묶음을 받지 않아 환경마다 한 번씩 돌려야 하고, **Preview에서 `--force`가 `✓ Overrode`를 출력하고도 값이 그대로였다**(Production은 같은 명령이 먹었다). 갱신 뒤 `vercel env ls <environment>`의 시각 열을 보고, 안 바뀌었으면 `vercel env rm … --yes` 후 다시 넣는다. 성공 메시지가 근거가 아니다.

```bash
# 파일에서 곧바로 파이프 — 값이 셸 히스토리·프로세스 목록·터미널 어디에도 남지 않는다
awk '{printf "%s\n", $0}' key.pem | sed 's/\\n$//' | vercel env add GITHUB_APP_PRIVATE_KEY production --sensitive --force
```

**GitHub App 개인키는 여러 개를 동시에 가질 수 있다.** 새 키를 발급해도 옛 키가 계속 돌아서 무중단으로 갈아탈 수 있다 — **다른 머신이 옛 키를 들고 있으니 폐기는 그쪽을 옮긴 뒤에** 한다.

⚠️ **그 무중단은 "추가"에만 해당한다. 지우면 그 키를 쓰던 네 곳이 동시에 끊긴다** — 로컬 `.env.local` · Vercel Production · Vercel Preview · 다른 머신. 2026-09-06에 옛 키 하나를 지웠다가 전부 죽었고, **증상이 "App이 설치돼 있지 않다"로 보였다**(`probeRepo`가 401을 `not-installed`로 접던 시절 — POSTMORTEM 2026-09-06). 지우기 전에 **그 키를 누가 들고 있는지 세고**, 넷을 전부 옮긴 뒤에 지운다.

**린터 없음** — ESLint/Prettier/Biome 미도입이라 `pnpm lint`는 존재하지 않는다. 스타일 게이트는 `pnpm typecheck` + `pnpm test`뿐이고, 린터 추가는 요청 없이 하지 않는다.

### CI (GitHub Actions)

`ci.yml` 하나뿐이고 job은 `verify`(**`db:generate`** + typecheck + test + Codex 미러 드리프트) 단일이다. ⚠️ **`permissions: contents: read`가 job에 박혀 있고 `uses:` 셋이 40자 SHA로 핀돼 있다** (2026-09-09, sec-audit 발견 13 — 리포 기본값이 지금도 `read`라 동작은 안 바뀌었고, 요지는 그 설정을 **트리 안으로** 옮긴 것이다: 기본값은 대시보드 한 번으로 `write`가 되는데 이 job은 `pnpm test`로 임의 프로젝트 코드를 돈다). 앞의 스텝은 게이트가 아니라 선행 조건이지만, `.env.local`이 없는 환경에서 `prisma generate`가 도는지의 **상시 검증을 겸한다**(POSTMORTEM 2026-08-31 🔁). 트리거는 **push `[main, dev]` + pull_request `[main]` + 수동(`workflow_dispatch`)** 이다.

**✅ CI가 프로덕션 앞의 게이트다** (2026-09-04 브랜치 분리로 되살아났다). `dev→main` PR에 붙는 run이 그것이고, `/merge`는 그 체크가 green이어야 머지한다. 브랜치가 하나였던 동안에는 PR 이벤트 자체가 없어 CI가 배포 **뒤에** 돌았다 — 그때의 유일한 방어선은 `/push`의 로컬 게이트였다.

트리거 셋의 이유가 각각 다르다:

| 트리거 | 무엇을 막나 |
|---|---|
| push `[dev]` | dev에 red가 쌓이는 것. preview 배포와 같은 커밋을 검증한다 |
| pull_request `[main]` | **프로덕션 머지 게이트.** `/merge`가 이 결론을 본다 |
| push `[main]` | 머지 뒤 확인 + 다른 창구(웹 UI·Codex·다른 머신)가 main을 직접 친 경우 |

dev push와 PR이 같은 SHA에 두 번 도는 것은 **의도된 중복**이다 — PR 체크로 표시돼야 머지 게이트가 되고, dev push run은 PR을 열기 전에도 결론을 준다.

⚠️ **GitHub 브랜치 프로텍션은 여전히 없다** (Free 플랜 + private). PR CI가 게이트인 것은 **`/merge`가 그것을 보기 때문**이지 서버가 강제해서가 아니다 — main에 직접 푸시하는 경로를 서버가 막지 않는다.

**CI에서 `next build`를 돌리지 않는다** — 로컬 게이트(`/push` 1단계)가 이미 돌고 Vercel이 preview·프로덕션 배포에서 다시 돈다. CI에 넣으면 같은 걸 네 번 돌리게 된다.

**빌드는 `/push` 1단계 게이트에서만 자동 실행한다.** 개별 작업 중에는 `pnpm typecheck`를 쓴다 — `/implement`가 `pnpm build`를 돌리지 않는 것은 그 때문이고, 게이트가 `/push`에 있어서다.

## 디렉터리 구조

```
app/
  page.tsx              루트 — **랜딩 자리의 redirect 껍데기다** (8-1a, 2026-09-10). 세션 상태만 보고
                        `landingTarget`이 정한 곳으로 보낸다. ⚠️ **로그인 상태면 /projects이고 랜딩이
                        선 뒤에도 그렇다**("로그인 이후 랜딩 못 가게"). 쿼리를 읽지 않는다 — `?error=`·
                        `?sessions=`를 싣는 자리는 전부 routes.signIn({...})으로 /signin에 간다
  signin/page.tsx       로그인 화면(GitHub·Google) — 8-1a가 루트에서 옮겼다. Auth.js의 `pages.signIn`·
                        `pages.error`가 여기라 거부 사유를 `?error=`로 보인다.
                        ⚠️ **`?error=` 없이도 세션이 `unavailable`이면 문구를 띄운다** — 로그인 버튼만
                        보이면 사용자가 헛로그인한다. ⚠️ **matcher에 넣지 않는다**(자기 자신으로 307)
  signin/link/[challenge]/page.tsx
                        계정 병합 안내 (account-linking, 2026-09-12) — **인가가 없고 challenge가
                        대신한다.** `AuthLayout` 320 컬럼 다섯 줄 + 구분선 아래 outlined 버튼.
                        ⚠️ **matcher에 넣지 않는다** — 비로그인이 봐야 하는 화면이라 넣으면 그 순간
                        challenge가 사라진다 (`/invite/[token]`과 같은 판단).
                        ⚠️ **만료를 이 화면으로 말하지 않는다** — `/signin`으로 되돌린다(다시 그리면
                        그 상태가 또 하나의 표면이 된다). 장애는 그것과 **다른 사유**로 간다.
                        ⚠️ **[Confirm]이 일반 로그인 진입점 셋째다** — 버려진 회수 쿠키를 먼저 지운다
                        (`normal-login.test.tsx`의 목록이 셋이 됐다)
  privacy/page.tsx      ⚠️ **placeholder** (8-1a) — 로그인 푸터가 가리켜서 라우트를 먼저 땄다.
  docs/page.tsx         출시 전에 채운다. 둘 다 `components/public-doc.tsx`를 쓰고 **돌아가는 링크가
                        있다**(셸 밖이라 없으면 뒤로가기 말고 길이 없다). Terms는 만들지 않는다
  layout.tsx            루트 레이아웃 (Pretendard <link>). ⚠️ **`lang="en"`** — 화면 문구가 전부
                        영어라 `app/__tests__/screens.test.ts`가 그것을 고정한다 (2026-09-08 ship 4)
  globals.css           Tailwind 4 @theme + shadcn 토큰 (tailwind.config.js 없음)
  __tests__/            **셋이다.** entry-points — ⚠️ **진입점 소스 스캔**: app/ 아래 모든 page·route·actions가
                        인가를 지나는지 fs로 센다. 예외 **아홉**(2026-09-12 — account-linking이 `signin/link/[challenge]`를
                        더했다)을 **이름으로** 고정하고 그 이름이 실재하는지도
                        본다. `lib/adapters/__tests__/contract.ts`와 같은 상시 방어선. ⚠️ **쿼리 수신자
                        검사가 생성기 형태도 본다** (2026-09-08) — 화면이 경로를 `routes.*`로 옮기면서
                        `"/path?key="` 리터럴이 0건이 됐고 그 검사가 조용해졌다(자기 "0건 아님" 가드가 잡았다)
                        + screens — `lang="en"`·설정 화면의 revalidate 안전·초대 수락의 갇힘 없음을 소스로 센다
                        + security-headers — `next.config.ts`의 응답 헤더를 **불러서** 검사한다(`tsc`가 그 함수를 못 본다)
  (edit)/               인증 필요 (1차 차단은 middleware.ts의 쿠키 검사 — GET·HEAD만, Action POST는 통과)
    layout.tsx          셸 — 캔버스 + 헤더 + (사이드바 · children) 행. 2차 방어로 redirect()
                        (조건부 렌더는 차단이 아니다).
                        ⚠️ Publish·breadcrumb이 없다 — /projects 목록도 감싸므로 slug가 없다
                        ⚠️ **`{children}`을 흰 패널로 감싸지 않는다** (8-2) — 감싸면 오른쪽 패널이 그 안에
                        갇힌다. `ContentPanel`은 **각 갈래의 레이아웃**이 든다: projects/[slug]/layout.tsx
                        (+ ProjectPanel) · projects/new/layout.tsx · account/layout.tsx, 그리고
                        **projects/page.tsx만 페이지가 직접** 든다(`projects/`를 `[slug]`와 공유해 그 층에
                        레이아웃을 두면 프로젝트 화면이 두 겹이 된다). `shell-layout.test.ts`가 라우트마다
                        정확히 하나인지 체인을 훑어 센다
    error.tsx           오류 경계 (client) — 셸 안쪽이 통째로 빈 화면이 되는 것을 막는다.
                        `Alert`(unavailable) + [다시 시도](`reset`) 둘뿐이다.
                        ⚠️ **예외 메시지를 그대로 뿌리지 않는다** — 남의 문구를 실어 보내지 않는
                        `classifyFailure`와 같은 츕이고, 화면이 보이는 것은 사전 문구 하나다
    actions.ts          saveTranslation · triggerPullAction — 둘 다 getProjectAccess를 지나고,
                        그 뒤 planProjectReadiness로 첫 적재 전 프로젝트를 not-ready로 거부한다
                        ⚠️ **triggerPullAction에 try/catch가 없다** (7단계) — `runSync`가 던지지 않고
                        오류 접기(남의 메시지 → ref)도 그쪽으로 옮겨갔다
                        ⚠️ **`saveTranslation`의 무효화는 `/projects/<slug>` 서브트리다** (6b-6) — 그 행을
                        읽는 화면이 셋이다(번역 표 · 로케일 진행률 · Home). 경로를 나열하면 넷째가
                        조용히 빠진다 (POSTMORTEM 2026-09-09)
    projects/page.tsx   내 멤버십 목록. **로그인 후 착지점**이자 인가 거부의 redirect 목적지 — 사유는
                        `?e=`로 받아 **isAccessError·isConnectError 둘로** 걸러 한 줄 보인다.
                        ⚠️ 앞의 것만 보면 GitHub 연결 실패 사유가 통째로 무음이다 (POSTMORTEM 2026-09-06)
                        ⚠️ **GitHub 계정 섹션은 2026-09-09에 `/account`로 갔다** (6b-4) — 그것이 여기
                        있었던 이유는 "프로젝트 0개인 사용자에게 도달 가능한 자리가 여기뿐"이어서였고,
                        사용자 축 라우트가 생기며 그 이유가 사라졌다. **옮긴 것이지 복제가 아니다**
    projects/loading.tsx
                        목록 스켈레톤 (2026-09-11 폴리싱) — 행 타일과 **같은 높이**여야 한다.
                        ⚠️ 이 파일이 `PanelHeader`까지 흥내 내면 제목이 두 번 그려진다 — 머리는 서버가 즉시 내므로
                        스켈레톤은 **본문만** 든다
    account/actions.ts  startSessionRevocation — 전체 세션 회수의 시작(인가는 `requireUser`).
                        ⚠️ 서버가 **기존 로그인 Account를 고른다** — 클라이언트가 provider를 정하면
                        공격자가 확인 상대를 고르게 된다. 완료는 callback을 가로채는 `withRevocation`이다
    account/page.tsx    계정 (6b-4) — **사용자 축의 유일한 화면**. `requireUser`만 지난다(인가할 프로젝트가
                        없다). 프로필(이름·이메일 **읽기 전용** — provider가 소유한다) + GitHub 연결·해제·
                        재인가 + 로그아웃. `?e=`는 `isConnectError` 하나로 거른다.
                        ⚠️ **middleware matcher를 늘려야 했다** — 패턴이 `/projects/:path*` 하나여서
                        `(edit)` 아래 모든 페이지가 **우연히** 그 접두를 갖고 있었다
    account/layout.tsx  `ContentPanel` 하나만 둔다 (8-2) — 셸이 그것을 안 드는 이유가 위에 있다.
                        ⚠️ 오른쪽 패널이 없다 — 그것은 프로젝트 축의 것이고 여긴 사용자 축이다
    projects/new/page.tsx
                        온보딩 (SaaS 5단계). 서버가 ①①'(계정 미연결·설치 0·리포 0)를 그리고 ②~⑥은
                        클라이언트 상태다. ⚠️ **maxDuration=60이 여기 있어야 한다** — Server Action은
                        자기를 부른 페이지 세그먼트의 config를 쓴다. `?e=`를 **isOnboardError·
                        isConnectError 둘로** 읽는다 (callback이 착지시킨다).
                        ⚠️ 어댑터 라벨 표(formatLabel)를 **서버가 만들어 내려준다** — 클라이언트가 그
                        모듈을 값으로 import하면 ts-morph가 번들에 들어온다 (POSTMORTEM 2026-09-07)
    projects/new/layout.tsx
                        `ContentPanel` 하나 (8-2). `account/layout.tsx`와 같은 형이고 오른쪽 패널이 없다
    projects/actions.ts createInvitation · changeMember · **revokeInvitation** (OWNER 전용 — member:manage)
                        + **archiveProject · unarchiveProject** (7단계 — `project:settings`. 그 permission이라
                        보관된 프로젝트에서도 지나간다). ⚠️ **둘을 한 함수로 합치거나 인가를 공용 헬퍼로
                        빼지 않는다** — `entry-points.test.ts`가 **각 export 안에서** `getProjectAccess(`를
                        보고, "파일 어딘가에 호출이 있다"로는 부족하다는 것이 그 검사의 존재 이유다.
                        ⚠️ 무효화가 `revalidatePath("/", "layout")`이다 — 보관은 목록·사이드바·Home·번역을
                        다 바꾸므로 경로를 나열하면 다음에 생기는 화면이 조용히 빠진다
                        ⚠️ createInvitation이 **잠금 안에서** 멤버를 세어 `planInvitationCreate`에 넘긴다 (7단계)
                        ⚠️ revokeInvitation은 **행을 지우지 않는다** — `expiresAt`을 당긴다. 스키마가
                        삭제를 금지하고(재사용을 `already-accepted`로 구별해야 한다) 기존 무효화 관용구가
                        `createInvitation`의 토큰 회전이다. `where`에 `projectId`+`acceptedAt: null`이
                        함께 있어 id를 알아도 남의 테넌트를 못 건드린다
                        + 온보딩 일곱 (2026-09-07): startGithubConnectForUser(**6b-4에서 `dest` 인자를 받는다 —
                        `"new" | "account"` 갈래 **이름**만이다. `StateDest`를 통째로 받으면 클라이언트가
                        착지를 골라 open redirect 판정이 생긴다) · disconnectGithub ·
                        listConnectableRepos · detectRepoFormats · createProject · runFirstIngest ·
                        rotatePushToken
                        ⚠️ **앞의 다섯은 requireUser뿐이다** — 생성 경로에는 인가할 프로젝트가 없고
                        `Account` 행은 **사용자 소유**다 (design §3.6). 뒤의 둘은
                        getProjectAccess(project:settings)다
                        ⚠️ **해제가 여기 있는 이유**: 연결이 사용자 수준으로 열려 프로젝트를 하나도 안
                        만든 사용자가 생길 수 있고, 그 사람에게는 설정 화면이 없어 해제에 도달할 길이
                        없었다 — taken-by-other가 영구 잠금이 된다 (2026-09-07 리뷰)
                        ⚠️ **`disconnectGithub`은 `revalidatePath("/", "layout")`이다** (6b-4) — 접두로
                        좁히면 화면이 옮겨갈 때 조용히 못 덮는다 (POSTMORTEM 2026-09-09)
                        ⚠️ **두 GitHub 자격증명이 만나는 유일한 자리다** — 리포 읽기는 App 설치 토큰,
                        "이 사람이 그 설치를 볼 수 있는가"는 사용자 토큰. lib/onboarding/은 둘 다 모른다
                        ⚠️ createProject는 **클라이언트가 보낸 pathTemplate을 저장하지 않는다** — 파일을
                        다시 읽어 detectFormatWith를 돌리고 그 반환값을 저장한다 (design §3.4)
    projects/[slug]/layout.tsx
                        프로젝트 축 레이아웃 (8-2 신설) — `<ContentPanel>{children}</ContentPanel>` +
                        `<ProjectPanel/>`. ⚠️ **이 파일이 생긴 이유는 셸이 `[slug]`를 못 보기 때문이다** —
                        breadcrumb·Publish·오른쪽 패널이 셸에 없던 이유가 그것이고, 8-3이 앞의 둘을,
                        8-P가 패널의 diff를 여기로 가져온다.
                        ⚠️ **지금은 서버 데이터를 안 읽는다** — 레이아웃은 인가의 차단 지점이 될 수 없어
                        (페이지와 병렬 렌더) 여기서 조회를 시작하면 인가 전에 프로젝트 데이터를 만진다
    projects/[slug]/page.tsx
                        Home — **프로젝트 진입의 착지점** (6b-6, 2026-09-09). 게이트 `translation:write`.
                        breadcrumb이 없다(이 화면이 루트다). 로케일별 진행률 + 최근 활동.
                        ⚠️ **착지 클릭 하나를 갚아야 한다** — 진행률 행 전체가 `?locales=` 링크, 활동의
                        편집 항목이 `?ns=`+`?locales=` 링크(8-4가 `?focus=`를 그 이름으로 바꿨다), primary가 [Open translations]다. 개요만 있고
                        링크가 없으면 그 클릭이 순손실이다 (SAAS §7.7 결정 1)
                        ⚠️ **툴바 지표를 복제하지 않는다** — `countUnpublished`·`loadKeys`를 부르지 않는다
                        (`home-screen.test.ts`가 센다). 진행률은 orphaned를 뺀다(그 열은 disabled다)
    projects/[slug]/locales/page.tsx
                        로케일 목록 + 기준 언어 (6b-5, 2026-09-09). ⚠️ **게이트가 `translation:write`다** —
                        열이 사라진 것을 보는 사람이 번역자이므로 `project:settings` 뒤에 두면 설명이
                        그 사람에게 닿지 않는다. **기준 언어 Card와 대기 Alert만 role로 갈리고 판정은 Action**
                        ⚠️ **이 화면이 생긴 이유는 orphaned 로케일이다** — 그때까지 로케일은 번역 표의 열로만
                        존재해 사유·복구를 말할 자리가 없었다 (ARCHITECTURE §5.5.16)
                        ⚠️ **`?e=` 슬롯이 없다**(보내는 자리가 0) · **표는 Card 밖이다**(겹치는 padding, 실측)
    projects/[slug]/locales/actions.ts
                        updateBaseLocale — 인가 `project:settings`. ⚠️ **6b-3이 `updateRepositorySettings`와
                        한 Action에 뒀던 것을 갈랐다** — 인자를 optional로 두면 서버가 "무엇을 안 보냈나"를
                        추측하게 되고 그것이 malmoi#20의 모양이다.
                        ⚠️ **무효화가 `/projects/<slug>` 서브트리다** — `declaredBaseLocale` 소비자가 셋이라
                        (이 화면·번역 배너·**설정의 워크플로 YAML**) 경로를 나열하면 넷째가 조용히 빠진다
                        (POSTMORTEM 2026-09-09). 실물로 셋 다 확인했다
    projects/[slug]/members/page.tsx
                        멤버 관리 (6b-2, 2026-09-09). ⚠️ **게이트가 `translation:write`다** —
                        `member:manage`로 하면 EDITOR가 못 들어오는데 그 사람도 목록을 봐야 한다
                        (user-stories §5). 컨트롤만 role로 갈리고 **판정은 Action**이 한다.
                        ⚠️ **이것이 `/settings` 섹션이 아니라 별도 라우트인 이유다** — 그 페이지는
                        `project:settings` 뒤라 게이트가 갈린다. `github-connect/spec.md`의 반대 결정을
                        뒤집었고 그쪽에 🔴 STALE을 달았다. ⚠️ **`?e=` 슬롯이 없다**(보내는 자리가 0)
    projects/[slug]/logs/page.tsx
                        sync 이력 (7단계, 2026-09-10) — SAAS §7.7 라우트 표의 마지막 칸.
                        ⚠️ **게이트가 `translation:write`다** — "내가 보낸 게 갔나"를 묻는 사람이 번역자다.
                        ⚠️ **`try`가 없다** — 조회 실패는 던져야 "없음"과 다른 화면이 된다
                        (POSTMORTEM 2026-09-03). 그래서 빈 상태는 조회 성공에서만 나온다.
                        ⚠️ **[Send changes]가 없다** — `logs`는 과거 이력이고 "지금 상태 + 행동"은
                        8단계 패널이다. 페이지네이션은 서버 `?cursor=` + 링크 하나
    projects/[slug]/settings/page.tsx
                        리포 연결 + **기준 브랜치** + 상태 + push 토큰 + 워크플로 + GitHub 계정.
                        ⚠️ **기준 로케일 필드와 대기 Alert는 6b-5가 `/locales`로 옮겼다** (2026-09-09).
                        이 화면이 `declaredBaseLocale`에 대해 하는 일은 **워크플로 YAML에 `base-locale:` 한 줄을
                        박는 것뿐**이라 `basePending`은 계속 부르고 **로케일 목록은 조회하지 않는다**
                        (`base-locale-screens.test.ts`가 양방향으로 센다)
                        최상단에서 requireProjectAccess를 던진다. maxDuration=60 (Action이 첫 적재를 돈다).
                        ⚠️ 상태 섹션의 [다시 시도] 컴포넌트는 **readiness 분기 밖**에 있다 — 안에 두면
                        revalidate가 성공 직후 그것을 언마운트해 결과 문구가 사라진다 (POSTMORTEM 2026-09-07)
                        ⚠️ **섹션 둘이 독립적으로 실패한다** — 건강성은 App 토큰, 계정은 사용자 토큰이라
                        묶으면 한쪽 GitHub 장애에 화면이 통째로 빈다
    projects/[slug]/settings/actions.ts
                        startGithubConnect · connectRepository · **updateRepositorySettings** (6b-3 —
                        기준 브랜치를 즉시 쓴다. 바뀐 것이 없으면 `project.update`를 아예 부르지 않는다.
                        ⚠️ **6b-5가 기준 로케일을 떼어냈다** — 이 Action은 선언 컬럼을 아예 모른다)
                        (**해제는 2026-09-07에
                        사용자 수준으로 갔다**: `projects/actions.ts`의 disconnectGithub, 인가는 requireUser)
                        ⚠️ **나가는 쪽은 Server Action이다** — Route Handler는 돌아오는 callback 하나뿐.
                        ⚠️ connectRepository는 **리포를 고르지 않는다** — 리포는 Project에 고정이고
                        installationId는 probeRepo가 GitHub에 물어 얻는다(클라이언트가 보내지 않는다)
    projects/[slug]/translations/page.tsx
                        **키 그룹 — 로케일이 행이다** (8-4). 키 셀 320 + 그 아래 선택된 로케일마다 한 행.
                        최상단에서 requireProjectAccess를 **던진다**.
                        ⚠️ **maxDuration=60이 여기 있어야 한다** (7단계) — Server Action은 자기를 부른
                        페이지 세그먼트의 값을 쓰고, 없으면 기본값 300이 `STALE_AFTER_SECONDS`와 **같아져**
                        정상 실행이 스스로를 stale로 본다
                        그 뒤 planProjectReadiness: ready가 아니면 OWNER는 설정으로, 그 외는 빈 상태.
                        ⚠️ **기본 착지가 pending>0인 첫 네임스페이스다** (6a T7) — 전체는 `?ns=*`.
                        그 판정(`defaultNamespace`)이 축 변경을 **그대로 통과했다** — 로케일을 인자로
                        안 받게 만들어 둔 것이 여기서 값을 했다.
                        `type Search`가 URL 계약이고(**ns·locales·q** — 8-4가 focus·state를 폐기했다)
                        entry-points가 routes.ts와 대조한다.
                        ⚠️ **조립 순서가 계약이다**: parseLocaleSelection → namespaceCountsFor →
                        resolveNamespace → filterRows({locales,q}) → pendingFirst → groupByNamespace.
                        **pendingFirst가 그룹핑보다 앞**이라도 분할이 안정적이라 섹션 안 순서가 보존된다
                        ⚠️ **`chipQuery`가 `query`와 `ns` 하나만 다르다** — 기본 착지의 네임스페이스는
                        화면이 정한 것이지 사용자가 고른 필터가 아니라 칩으로 세우지 않는다
                        ⚠️ **헤더를 무조건 렌더한다** — Publish 결과 Alert가 그 안에 있어 조건부 분기에
                        두면 router.refresh()가 방금 받은 결과를 언마운트한다 (POSTMORTEM 2026-09-07).
                        **표를 그 컴포넌트의 `children`으로 넘긴다** — 배너 둘과 결과 Alert가 스크롤
                        영역 안이어야 해서(셋이 서면 고정 영역이 400px을 넘는다) 머리와 본문을 그것이 든다
    __tests__/          harness.ts(메모리 DB 한 벌) + harness.test.ts(**하네스 자기검사** — 페이크가 실제
                        스키마보다 느슨하면 아무 행이나 집어도 정답이 나온다, POSTMORTEM 2026-09-06)
                        + 흐름·인가·멤버십·연결·게시실패·온보딩·조회·셸레이아웃·**보관·리포설정·sync** 테스트 **열둘**
                        (queries — countUnpublished·loadMemberships의 테넌트 좁힘 / shell-layout — 셸이
                        **뷰포트 고정**인지 소스로, malmoi#13의 상시 방어선)
                        (github-connect·publish-failure·onboarding은 mock 범위가 달라 일부러 갈랐다)
                        (archive — 저장·Publish가 `archived`로 거부되고 `project:settings`만 지나는지 /
                        repository-settings — 6b-5가 갈라낸 Action 둘이 **각자의 컴럼만** 쓰는지 /
                        sync-run — `runSync`의 게이트·RUNNING 행 개폐·CRON trigger·SKIPPED 보존·FAILED 접기)
                        ⚠️ 하네스의 **시드 프로젝트는 `lastCommitSha`가 "적재 완료"**다 — readiness
                        게이트가 붙어서다. `project.create`는 그대로 null을 낸다(스키마 기본값)
  invite/               ⚠️ **(edit) 밖이고 matcher 밖이다** — 비로그인으로 열려야 토큰이 보존된다
    [token]/page.tsx    마스킹한 이메일·프로젝트 이름·역할만 보인다. 실패 분기를 각자 한 줄로.
                        email-mismatch면 "다른 계정으로 로그인"(signOut → 같은 링크) — 없으면 갇힌다
    actions.ts          acceptInvitation — **인가 예외**. 토큰이 인가를 대신한다 (단일 사용)
    __tests__/          page — `renderToStaticMarkup`으로 **손상된 초대**가 unavailable + 링크를 보존한
                        재시도를 내고, **없는 초대**는 그런 재시도를 안 내는지 가른다.
                        ⚠️ 둘을 한 문구로 접으면 재시도해도 소용없는 사람에게 재시도 버튼을 준다
  api/__tests__/        route-diagnostics(인증·JSON·스키마 실패가 각자 응답을 내는지)
                        + github-callback(state 검증 **전에** code 교환·Account 쓰기가 0회인지)
  api/push/route.ts     CI → DB (maxDuration 60). ⚠️ Bearer는 **그 프로젝트의 push 토큰 원문**이고
                        서버 env가 아니다 — sha256으로 Project.pushTokenHash를 **조회**해 프로젝트를 정한다
                        ⚠️ **보관 409가 오배송·표면 검사보다 앞이다** (7단계) — 멈춘 프로젝트에서는
                        페이로드가 맞는지가 답할 질문이 아니고, 사용자가 할 일은 셋 다 같다(워크플로를 뗀다)
  api/auth/[...nextauth]/  Auth.js v5 핸들러
  api/github/callback/  GitHub이 브라우저를 되돌리는 지점 (SaaS 4단계). ⚠️ **matcher에 넣지 않는다** —
                        로그인 화면으로 302되면 `code`가 사라진다. `requireUser`로 스스로 인증하고, state가
                        무효면 slug를 못 믿어 `/projects?e=`로 간다
  api/pull/route.ts     DB → PR — **cron 전용** (CRON_SECRET, maxDuration 60).
                        ⚠️ **두 진입점 모두 `runSync`를 지난다** (7단계) — 편집 UI의 Server Action도 같다.
                        `triggerPull`을 직접 부르는 자리는 이제 그 껍데기 하나뿐이다
middleware.ts           ⚠️ 인증 차단의 유일한 1차 지점 — matcher가 **둘**이다(`/projects/:path*` · `/account`).
                        렌더 요청만 막고 목적지는 `routes.signIn()`이다. 6b-4까지 하나였던 것은 `(edit)`
                        아래가 전부 그 접두였기 때문이다.
                        ⚠️ **`/signin`을 여기 넣으면 로그인이 통째로 죽는다** (8-1a) — 이 파일도
                        `shouldRedirectToLogin`도 **경로를 안 보므로** 쿠키 없는 모든 요청이 자기
                        자신으로 307을 돈다. `entry-points.test.ts`가 부정 단언으로 고정한다
components/
  translation-input.tsx 셀 편집 (client — Textarea, blur/Enter 저장, Shift+Enter 개행, Esc 되돌리기).
                        ⚠️ **셀 안 상태줄은 시각 전용**이고 알림은 표 하나의 live region이 든다.
                        실패 시 포커스는 `shouldRefocus`가 정한다 — 다른 셀을 치고 있으면 뺏지 않고 [Retry]
  publish-button.tsx    Publish (client — 옛 `pull-button`. 버튼과 결과 Alert가 **갈라져 있다**:
                        자리가 툴바 오른쪽 / 배너 아래라 상태는 header가 든다).
                        ⚠️ 실패에는 `router.refresh()`를 부르지 않는다 (POSTMORTEM 2026-09-08)
  reconnect-button.tsx  리포 재연결 (client — pending 라벨 교체, 인라인 오류)
  github-account.tsx    GitHub 계정 연결·해제 (client). ⚠️ reauthorize는 **자동 redirect가 아니라
                        버튼**이다 — 렌더 중 튕기면 callback 실패 시 루프다
                        ⚠️ **두 Action이 서로 다른 파일에서 온다** — 해제(DisconnectGithubButton, export)는
                        사용자 수준이라 slug를 안 받는다. 소비자는 `/account` 하나다(6b-4가 옮겼다)
  public-doc.tsx        `/privacy`·`/docs`가 공유하는 껍데기 (8-1a) — **돌아가는 링크가 요지다**
  search-input.tsx      검색 입력 (client, 2026-09-12) — 소비자 둘(프로젝트 목록·번역 툴바).
                        ⚠️ **IME 조합 확정 Enter를 거른다** — `isComposing`과 `keyCode === 229`를 **둘 다**
                        본다(브라우저마다 하나씩만 주는 경우가 있다). 그 전엔 한글 확정 Enter가 그대로
                        검색으로 나갔다.
                        ⚠️ **`<form>` 암시적 submit을 안 쓴다** — 제출 버튼 없는 폼은 Enter로 submit되지
                        않아 검색이 조용히 무효였다 (POSTMORTEM 2026-09-08)
                        ⚠️ **`w-64`는 인자가 아니다** — 두 툴바가 같아야 하는 값이라 프리미티브가 든다.
                        `className`은 바깥 자리잡기(`ml-auto`)용이다
  submit-button.tsx     `useFormStatus` + `Button loading` (client, 2026-09-12) — 로그인·초대의 폼 넷이 쓴다.
                        ⚠️ **`<form>` 안에 있어야 pending이 참을 낸다** (그 훅의 계약이다)
  session-revocation.tsx
                        전체 세션 회수 버튼 (client, sec-audit-2 #38) — 소비자는 `/account` 하나다.
                        ⚠️ **provider를 안 보낸다** — 확인 상대를 서버가 고른다(`startSessionRevocation`).
                        결과 `?sessionRevocation=`은 갈래 다섯인데 **문구는 넷**이다 — invalid·unavailable을
                        한 문구로 접는다(둘 다 "다시 해달라"라 가르면 사용자가 할 일이 같다)
  project-archived.tsx  보관된 프로젝트 화면 (7단계) — `project-not-ready.tsx`와 같은 형이지만
                        **`redirect()`를 쓰지 않는다**: 보관은 되돌릴 수 있는 상태이고 OWNER가 갈 곳은
                        설정 안의 카드 하나라, 튕기면 자기가 왜 거기 왔는지 모른다. 화면 **다섯**이
                        같은 갈래를 만난다(Home·번역·언어·멤버·이력) — `screens.test.ts`가 전수를 센다.
                        ⚠️ **EDITOR에게 설정 링크를 주지 않는다** — 눌러도 못 들어간다
  project-not-ready.tsx 첫 적재 전 화면 (6b-6) — **정책과 문구를 한 곳이 든다**: OWNER는 설정으로
                        (거기에 [다시 시도]와 워크플로 YAML이 있다), 나머지는 한 줄. Home과 번역 화면이
                        같은 갈래를 만나고 6b-6이 그 사본을 합쳤다.
                        ⚠️ **렌더 중 `redirect()`가 안전한 이유**: 호출부가 이것 **하나만** 반환하고 그
                        시점에 프로젝트 데이터가 페이로드에 없다(인가 차단과 다른 축이다)
  locales/              로케일 화면의 클라이언트 조각 (6b-5). base-locale-form(기준 언어 `Select` +
                        저장 — 필드는 `baseLocaleFieldValue`로 초기화한다. ⚠️ **현실로 초기화하면 대기 중의
                        저장 한 번이 선언을 조용히 지운다**, malmoi#20)
  members/              멤버 관리 화면의 클라이언트 조각 (6b-2, 2026-09-09). member-list(역할 native
                        `Select` + 제거 `Dialog` — 거부 문구는 **행 옆 인라인**이다) / pending-invitations
                        (`revokeInvitation` + 0건 빈 상태) / invite-dialog(옛 `components/invite-form.tsx` —
                        **삭제됐다**. 초대 수단이 둘이면 하나가 낡는다)
                        ⚠️ **대기 초대의 이메일은 `maskEmail`이 아니다** — 그 표에선 마스킹한 주소가 유일한
                        식별자라 서로 다른 둘이 같은 행이 됐다(malmoi#18). 서버가 `maskedInviteLabels`로
                        목록 전체를 보고 라벨을 내려준다
  translations/         번역 화면의 조각 (6a T7 → **8-4가 행 축으로 재작성**). header(제목·Publish·툴바·
                        칩·배너·결과 Alert를 **한 상태 트리**로 들고 표를 `children`으로 받는다.
                        ⚠️ **breadcrumb이 없다** — 8-4가 하위 화면 다섯에서 함께 지웠다.
                        ⚠️ **결과 Alert에 `scrollIntoView`가 붙어 있다** — 버튼은 고정 머리, 결과는
                        스크롤 본문 맨 위라 표를 내린 채 누르면 뷰포트 밖이고 **실패는 다른 신호가 0이다**) /
                        key-group(**서버 컴포넌트** — 키 셀 + 로케일 행들. ⚠️ **2026-09-12에 `div`+`grid`에서
                        `<table>`로 돌아왔다** — 키별 `TableBody` + 키 셀 `th scope="rowgroup" rowSpan`이다.
                        8-4가 그것을 거부한 근거("값이 여러 줄이면 `rowSpan`이 정렬을 어긋나게 한다")는
                        **행 높이 배분에서는 틀렸고**(브라우저가 계산한다) **내부 블록에서는 맞았다** —
                        전환 당일 값 칸의 `border-l`이 늘어난 td 높이를 못 따라가 선이 끊겼다
                        (POSTMORTEM 2026-09-12). **행 전체를 나누는 선은 `td`가, 포커스 표시는 안쪽 div가** 든다.
                        ⚠️ **행에 고정 폭이 로케일 칸 하나뿐이다** — 배지·`Edited by`를 우측
                        `w-40` 슬롯에 두었더니 1280px에서 입력이 **28px**가 됐다(malmoi#33, 실물 실측).
                        메타는 저장 상태와 같은 자리(입력 **아래**)로 내려갔고, 그 예산을
                        `translations-screen.test.ts`가 소스에서 센다 — 폭은 렌더 결과라 스캔이 못 보지만
                        **원인은 소스의 상수**다) /
                        locale-badge(국기 + 코드 + `(base)`. ⚠️ **국기가 CSS `background-image`다** —
                        `?ns=*`에서 2,709개가 서므로 `<img>`면 요소가 그만큼 는다. orphaned는 배지 자체를
                        `danger`로 바꾼다 — 로케일 칸 **68px**(시안 치수)에 별도 배지가 안 들어간다.
                        ⚠️ **코드가 sans다** — mono는 8-P의 diff로 남긴다(DESIGN §4.1).
                        ⚠️ **`LocaleFlag`를 함께 export한다** — 툴바의 로케일 드롭다운이 같은 국기를 쓴다:
                        고르는 자리와 확인하는 자리가 다르면 사용자가 매번 대조하게 된다) /
                        filter-chips(⚠️ **칩 전체가 링크가 아니다** — 라벨은 평문, 제거만 `Button`.
                        ⚠️ **초기화가 칩 옆이 아니라 줄 오른쪽 끝이고 글리프가 `RotateCcw`다** — 칩 옆이면
                        칩이 늘 때마다 그 버튼이 옮겨 다니고, 깔때기면 **검색까지** 지운다는 것을 안 말한다) /
                        filters(?ns=·?locales=·?q= → routes.translations. 네임스페이스 `Select` +
                        로케일 다중 선택(**항목이 국기 + 코드** — `LocaleFlag` 공유) + 검색.
                        ⚠️ **마지막 로케일 하나는 못 뗀다** — 선택이 비면
                        폴백이 걸려 오히려 전체로 넓어진다) /
                        announcer(표 하나의 `aria-live` — 셀마다 두면 903행×3로케일에 2,700개다) /
                        edit-loss-banner(닫기 키가 `lastPulledAt`이라 다음 Publish 뒤 다시 보인다) /
                        base-pending-banner(6b-3 — 조건은 `basePending`, **닫기가 없다**: 할 일이 남은 동안
                        계속 참이다. 문구는 "먼저 보내라" **하나**다 — 검토 표시를 예고하지 않는다,
                        `planPush`가 base 교체 push에서 전파를 건너뛰므로 그 일이 안 일어난다)
                        ⚠️ **filters는 `<form>` 암시적 submit을 안 쓴다** — 제출 버튼 없는 폼은 Enter로
                        submit되지 않아 검색이 조용히 무효였다 (POSTMORTEM 2026-09-08)
  account/              `/account`의 클라이언트 조각 (account-linking T5) — login-methods 하나다.
                        ⚠️ **[Connect]가 없다** — 로그인된 세션을 근거로 `Account`를 붙이는 경로는
                        sec-audit-2 #31이 막은 자리이고, 그 문의 인가 조건을 이 화면에서는 못 적는다.
                        같은 주소 연결은 병합 흐름이 이미 잡는다.
                        ⚠️ **마지막 수단은 비활성 + 행 옆 인라인 사유**(POSTMORTEM 2026-09-06) ·
                        해제에는 확인 `Dialog`가 있다(`DisconnectGithubButton`과 달리 되돌리려면
                        OAuth 왕복 전체가 필요하다 — 멤버 제거와 같은 무게)
  invite/               초대 화면의 프로젝트 카드 (account-linking T4) — `EntityCard`의 박스 규격을
                        공유하되 **프리미티브가 아니다**: 아바타 폴백이 흰 `Box` 글리프이고
                        DESIGN이 그 대체를 이미 거부했다. ⚠️ **숫자를 싣지 않는다**(키·멤버 수는
                        수락 여부를 안 바꾸고 규모만 샌다) · 국기는 복수다
  onboarding/           온보딩 UI (SaaS 5단계, 전부 client). new-project-flow(②~⑥ 상태 기계 — 리포 선택·
                        후보·기준 언어·수동 지정·확정·결과) / connect-github(사용자 수준 연결) /
                        first-ingest-retry · push-token-panel(설정 화면) / workflow-block · copy-button
                        ⚠️ **T5~T8에서 전부 `components/ui/` 프리미티브로 옮겼다** — raw 컨트롤이 0개라
                        "포커스 링을 상수에 숨기지 말라"는 경고의 대상이 이 디렉터리에서 사라졌다
  projects/             목록 화면의 클라이언트 조각 (2026-09-11 폴리싱) — search-input 하나다.
                        ⚠️ **필터는 서버가, 검색어만 여기가 든다** — 둘 다 URL 상태(`?filter=`·`?q=`)이고
                        판정은 `lib/projects/list.ts`의 순수 함수다. 이 파일이 드는 것은 입력 상태 하나뿐이다
  settings/             설정 화면의 클라이언트 조각 (6b-3·7단계). archive-card(보관·되돌리기 —
                        ⚠️ **인라인 결과 Alert가 없다**: revalidate가 방금 받은 문구를 언마운트한다
                        (POSTMORTEM 2026-09-07). 카드가 [Restore project]로 바뀌는 것이 피드백이고,
                        확인 Dialog는 **보관 쪽에만** 있다) / repository-form(**기준 브랜치 하나** — 6b-5가
                        기준 로케일을 `components/locales/`로 옮겼다. 브랜치 형식은 보내기 전에
                        `isValidBranchName`으로도 보고 **방어는 Action**이다.
                        ⚠️ **이 폼이 보내는 값에 언어가 없다** — 그것이 malmoi#20의 구조를 없앤다)
  signin/               셸 **밖** 화면 둘의 조각 (8-1b) — auth-layout(2열 골격: **바깥 padding 8 ·
                        패널 간 gap 8 · 각 패널 radius+연한 border+shadow**. 시안 전체가 이 규칙이고
                        번역 화면에서도 검산했다) / auth-toast(`?error=`·`?sessions=` → 토스트.
                        ⚠️ **아무것도 렌더하지 않는다** — 자리를 차지하면 그것이 곧 인라인 Alert의
                        자리가 된다) / provider-button(`useFormStatus`로 pending을 읽는다 — ⚠️ **`<form>` 안에 있어야
                        참을 낸다**) / dot-field(Canvas 2D — ⚠️ **커서가 없으면 `autoCursor`가 ㄹ자로
                        순회한다**(2026-09-10),
                        `prefers-reduced-motion`이면 1회 렌더) / brand-icons(GitHub·Google 인라인 SVG —
                        ⚠️ `lucide-react`에 브랜드 글리프가 없고 Google 4색은 DESIGN §6.2의 예외다)
  shell/                앱 셸 (6a T6 → **8-2가 시안으로, 8-3이 사이드바를 시안으로 재작성**). ⚠️ **셸 루트는
                        `h-svh overflow-hidden`이고 `min-h-svh`가 아니다** — `min-`은 콘텐츠가 길면 컨테이너가
                        함께 자라 `aside`가 문서 높이만큼 늘고, Sign out이 화면 밖으로 나간다
                        (malmoi#13, `9c94359`). 거기에 **`bg-canvas p-2 gap-2 min-w-[1280px]`**가 붙는다 —
                        ⚠️ `min-w-`가 없으면 1280 미만이 스크롤이 아니라 **잘림**이다. 시각 규칙은 DESIGN §6.5.
                        header.tsx(**전폭 48 — 로고 좌 · 사용자 메뉴 우, 그 둘뿐이다.** 옛 `top-bar.tsx`를
                        대체했고 SAAS §8의 "top bar가 사라진다"를 8-2가 정정했다) /
                        content-panel.tsx(**export 셋** — `ContentPanel`(흰 패널, **`<main>`**) ·
                        `PanelHeader`(`shrink-0`) · `PanelBody`(`min-h-0 flex-1 overflow-y-auto`).
                        ⚠️ **스크롤이 패널이 아니라 본문에 있다**(2026-09-11) — 제목·툴바가 콘텐츠와
                        함께 올라가면 "지금 보고 있는 것"을 말할 것이 사라진다. `head` prop이 아닌 이유는
                        라우트 넷 중 셋이 패널을 **레이아웃**에서 드는데 레이아웃은 페이지 props를 못 받아서다.
                        ⚠️ **본문 랜드마크를 이것이 든다 — 화면은 자기 `<main>`을 안 든다**(라우트당 하나가
                        구조로 보장된다. 8-2에서 `/projects`가 실제로 그것을 잃었다).
                        ⚠️ **셸이 `{children}`을 이걸로 감싸지 않는다**: 감싸면
                        오른쪽 패널이 그 안에 갇힌다. 각 갈래의 레이아웃이 들고 `shell-layout.test.ts`가
                        라우트마다 **정확히 하나**인지 체인을 훑어 센다.
                        ⚠️ **콘텐츠 폭 상한을 이 파일이 든다** (2026-09-11) — `CONTENT_MAX = "mx-auto w-full max-w-7xl"`를
                        `PanelHeader`·`PanelBody`가 **안쪽 래퍼**에 걸어 **1280px**가 라우트 아홉 전부에 걸린다.
                        셸의 `min-w-[1280px]`과 **같은 숫자**인 것이 설계 의도다 — 최소폭에서 상한까지 한 칸이라
                        그 사이에서는 어떤 중간 리플로도 필요 없다. 한쪽만 움직이면 패널이 떠거나 잘린다) /
                        project-panel.tsx(**320 골격 — 세그먼트 컨트롤 + 빈 본문.** 내용은 8-P다) /
                        sidebar.tsx(usePathname으로 프로젝트 컨텍스트·역할별 항목.
                        ⚠️ **배경도 border도 없다** — 캔버스 위에 얹히므로 hover·선택이 `bg-foreground/[0.03]`·`/[0.07]`
                        **알파**다(2026-09-11에 둘 다 한 단계 내렸다 — 배경 없는 표면이라 같은 알파도 진하다.
                        ⚠️ **선택 weight는 항목이 아니라 라벨이 든다** — 항목에 두면 `Badge`가 상속해 개수까지 굵어진다)(`--accent == --muted`라 캔버스 위에서 안 보인다). ⚠️ **8-3이 셋을 지웠다**:
                        접기(레일 + 그 안에서만 렌더되던 `Tooltip`) · 프로젝트 스위처 · `New project` —
                        프로젝트를 옮기는 길이 **목록 하나**로 통일됐다. ⚠️ **구역 라벨이 이름 그대로다**
                        (사용자 이름 / 프로젝트 이름). ⚠️ **개수 배지는 `Projects` 하나뿐**이고 `0`도 보인다 —
                        나머지 셋은 매 페이지 왕복이라 SAAS §8 🔒다. ⚠️ **구역 둘이 각자 `aria-label`을 든다** —
                        라벨이 `<p>`라 접근성 트리에서 이름이 아니다. 하단은 **Docs(`/docs`)·Sign out** 둘 — 라벨이 그 화면 제목과 **같은 키**다) /
                        user-menu.tsx(**항목 둘** — Settings·Sign out. ⚠️ 트리거가 아바타와 같은 32여야
                        한다 — `size="sm"`(28)이면 아바타가 삐져나온다).
                        ⚠️ **breadcrumb은 옮기지 않고 지웠다** (8-4, 2026-09-11 — 이 줄의 절반을 정정한다).
                        프로젝트 하위 화면 **다섯 전부**에서 걷었고 위로 가는 길은 사이드바가 든다
                        (프리미티브 `components/ui/breadcrumb.tsx`는 남는다 — `/projects/new`가 계속 쓴다:
                        프로젝트 컨텍스트 밖이라 사이드바가 길을 못 준다).
                        **Publish는 그대로 셸 밖**이다 — 번역 화면 제목 행 우측이고 8-P가 패널로 가져간다.
                        ⚠️ **항목 노출은 편의이고 차단이 아니다**(방어는 페이지의 requireProjectAccess) —
                        판정은 lib/shell/nav.ts의 순수 함수 넷이 한다
  ui/                   ⚠️ **이 리포가 소유하는 프리미티브 17개 + 헬퍼 하나** (2026-09-08, 6a T5 — shadcn 생성물 4개는
                        삭제됐고 CLI로 신규 컴포넌트 추가는 허용하되 기존 파일을 덮어쓰지 않는다. **8-2가 SegmentedControl을 더했고, 2026-09-11에
                        `Tooltip`이 빠지고**(8-3이 접기 레일을 지우면서 소비자가 0이 됐다) **같은 날 8-4가
                        `DropdownMenuCheckboxItem`을 더했다** — `role="menuitemcheckbox"`와 `aria-checked`를
                        Radix가 주고, `onSelect`의 `preventDefault()`를 **프리미티브가 든다**: 소비자마다
                        기억하게 하면 하나가 빠지고 그 하나는 "고를 때마다 메뉴가 닫힌다"로만 드러난다).
                        Button·Input·Textarea·Select(native)·Radio·
                        FormGroup·Badge·Alert·Card·Table·Breadcrumb·Avatar·EmptyState·DropdownMenu·
                        Dialog·**EntityCard**(account-linking 신설 — 대상 하나를 아바타·두 줄·우측 슬롯으로. ⚠️ **`kind`가 없다**: 소비자가 병합 화면 하나이고, 초대의 프로젝트 카드는 `components/invite/`의 화면 조각이다(아바타 폴백이 이니셜이 아니라 흰 글리프라 DESIGN이 그 대체를 이미 거부했다). ⚠️ **`LocaleFlag`를 물지 않는다** — 프리미티브가 기능 디렉터리를 import하면 `ui/`가 잎에 가깝다는 성질이 깨진다)·**Table**(⚠️ **프리셋이 둘이고 구현은 하나다** — 2026-09-12에 shadcn 원본을 들이면서
                        `Th`·`Td`·`Tr`을 **`TableHead`·`TableCell`·`TableRow`를 감싼 프리셋**으로 내렸다.
                        되눌러야 하는 기본값(`whitespace-nowrap`·`align-middle`·`border-b`·`h-10`)이 각
                        프리셋 위에 적혀 있고 `table-presets.test.ts`가 **렌더해서** 센다 — 안 지워지면
                        긴 사유가 한 줄로 늘어나고 마지막 행 아래에 선이 하나 더 선다.
                        ⚠️ **`TableFooter`·`TableCaption`은 안 들인다** — 소비자 0이다)·SegmentedControl(⚠️ **export가 둘이다** — `SegmentedControl`(버튼, `role="radiogroup"`)과
                        8-3이 더한 **`SegmentedLinks`**(링크, `<nav>` + `aria-current`). **상태가 URL이면 뒤엣것**이다.
                        ⚠️ `tablist`가 아닌 이유: ARIA 탭은 `aria-controls`와 화살표 이동이 계약인데 이 컨트롤은 그걸 안 든다.
                        ⚠️ **라디오의 키보드 계약을 Radix가 든다** (2026-09-12 — 2026-09-11의 손수 구현
                        `nextRovingIndex`를 대체했다). `RadioGroup`이 방향키·roving tabindex·`loop`를 주고,
                        **Home/End만 이 파일이 얹는다**(Radix가 안 준다 — `focus()` + `click()`으로 선택까지
                        옮긴다). 링 검사는 `button[role="radio"]`를 보므로 Radix가 곁들이는 숨은 `<input>`이
                        **보이지 않는 링으로 green**을 만들지 않는다). 치수·색은 DESIGN §6.4가 정본이고 `dark:`는 0곳이다.
                        ⚠️ **`tone.ts`는 그 열여섯에 안 들어간다** (2026-09-11) — 컴포넌트가 아니라 `toneFill(name)`
                        하나다(`lib/tone.ts`가 골라준 색 이름 → `bg-<tone>-600`). **판정은 `lib/`, 클래스는 여기**가
                        든다 — `lib/`가 Tailwind를 알면 그 규칙이 두 층에 걸친다. 소비자는 아바타 폴백과
                        프로젝트 목록 행 아이콘 둘이고, 클래스는 **리터럴 맵**이다(조립하면 Tailwind가 정적 추출을 못 한다)
                        ⚠️ **`DropdownMenuItem`은 `{children}`을 `Slot.Slottable`로 감싼다** (2026-09-09) —
                        `asChild`가 오면 Slot이 **자식 하나만** 받으므로 `selected`의 `Check`가 형제로
                        붙는 순간 던지고 셸이 죽는다. `add099a`부터 프로덕션에 있었다
                        ⚠️ **포커스 링 셋을 여는 태그에 리터럴로 적는다** — cva 베이스나 공유 상수에 모으면
                        focus-ring 스캐너가 그 파일을 통째로 못 본다. `Button`에 `asChild`가 없는 것도
                        같은 이유다(Slot 한 겹이 태그를 지운다). **T6~T8이 붙였다** — 화면 소비자가 21곳이고 `ui/` 밖 raw 컨트롤은 0개다
  __tests__/            focus-ring — button·input·select·textarea가 포커스 링 셋을 드는지 **소스로**
                        센다 (DESIGN §7). ⚠️ 렌더가 아니라 스캔인 이유: 탭으로 지나가야 보이는 결함이라
                        눈으로 두 번 놓쳤다(2026-09-06 버튼 4곳, 2026-09-07 "연결 해제").
                        ⚠️ **ui/ 제외가 풀렸다** (2026-09-08) — 그 디렉터리가 링이 사는 유일한 자리다.
                        축소형 허용 목록은 **2026-09-08 ship 4에서 비었다** — (2)가 이제 "ui/ 밖에 네 태그
                        0개"인 전면 방어선이고, 새 컨트롤은 `components/ui/`에 프리미티브로 만든다.
                        주석은 벗기고 센다(프리미티브가 자기 태그를 설명한다)
                        + translations-screen — 번역 화면의 배선을 소스로 센다(tone→Alert variant 항등 ·
                        `<details>` 파일 목록 · live region 1개 · `shouldRefocus` · 배너 마운트 게이트 ·
                        셀의 `aria-label` · 초대 링크가 `routes.invite`). 렌더 테스트가 없는 자리의 방어선이다
                        + segmented-control — 프리미티브를 **jsdom에 렌더해** `user-event`로 방향키·Home/End·
                        Tab을 실제로 먹인다 (2026-09-11 회귀 → 2026-09-12에 Radix로 옮기며 렌더 테스트가 됐다.
                        순수 판정 `nextRovingIndex`는 Radix가 그 일을 가져가며 함께 사라졌다). ⚠️ `tooltip-provider`는 같은
                        커밋에 `Tooltip`과 함께 지웠다 — 그 교훈(조상 provider를 요구하는 Radix 컴포넌트는
                        프리미티브가 자기 provider를 든다)은 POSTMORTEM 2026-09-08에 남아 있다
                        + auth-toast — 토스트의 **수명**을 잰다. `useEffect`를 가로채 효과를 실제로 돌리고
                        언마운트 정리가 두 id를 거두는지 본다. ⚠️ 정리가 없어 `/signin`의 무기한 오류
                        토스트가 `/docs`까지 따라갔다 (2026-09-11 실측)
                        + multiline-detail — 어댑터 오류를 렌더하는 자리가 `whitespace-pre-wrap`을 드는지
                        **두 축으로** 센다: `adapterErrorMessage(`를 부르는 자리 전수 + 서버가 합친 문자열
                        (`PullResult.warnings`)을 렌더하는 자리 **이름 고정**. ⚠️ **앞쪽만 있으면 절반만 고쳐도
                        green이다** — Publish의 `<details>`엔 그 심볼이 없다(POSTMORTEM 2026-09-08)
                        + base-locale-screens — 두 화면이 `basePending`을 **각자 부르는지**, 배너 둘이 조건부
                        분기 밖의 형제인지, `base-locale:` 리터럴을 화면이 직접 만들지 않는지 센다 (6b-3).
                        ⚠️ 조건을 손으로 다시 쓰면 갈래 넷 중 하나가 빠진다 — 특히 "첫 push 전"이 온보딩 중
                        경고로 새어 나온다
                        + slottable-item — ⚠️ **`asChild`가 닿는 프리미티브가 `{children}` 옆에 형제를
                        렌더하면 Radix Slot이 던지고 그 트리가 죽는다.** 실측: 프로젝트 스위처를 한 번
                        열면 셸이 죽었고 `add099a`부터 프로덕션에 있었다 (POSTMORTEM 2026-09-09 — 툴팁
                        provider와 같은 계보). 두 축으로 센다: `Primitive.*` + `{...props}`로 좁힌 전수 +
                        `DropdownMenuItem` **이름 고정**(형태 검사는 형제를 `<>…</>`로 합치면 통과한다)
                        + home-screen — Home의 배선(진행률·활동이 **링크다** · `countUnpublished`·`loadKeys`
                        를 안 부른다 · 루트 링크 여섯 자리가 `routes.project`다)
                        + client-graph — `"use client"` 파일의 **값 import 그래프**를 따라가 ts-morph·
                        octokit·@prisma/client·node:fs·server-only가 없는지 센다. ⚠️ 없으면 7.2MB 청크가 조용히 나간다
                        (실제로 나갔다 — POSTMORTEM 2026-09-07). `import type`은 지우고 `"use server"`에서 멈춘다
                        + logs-screen — `/logs`가 `try`를 안 써 조회 실패가 "실행 없음"과 다른 화면이 되는지 ·
                        빈 상태가 `EmptyState`인지 · **[Send changes]가 없는지**(이력과 행동의 경계) · 사유 문구에
                        git 어휘가 없는지
                        + members-screen — 최상단 `requireProjectAccess` · `?e=` 생산자 0건 · **마스킹이 서버 전용**
                        (클라이언트가 `maskEmail`을 import하지 않고 반환 타입에 `email`이 없다) · 역할이 native
                        `Select` · 제거가 `Dialog`
                        + projects-screen — 목록이 **서버 컴포넌트**인지(필터가 `useState`가 아니라 `?filter=`) ·
                        행 전체가 `routes.project(slug)` 링크 · 배지 색 맵 + `satisfies` · 본문이 스크롤 규칙을
                        다시 적지 않고 `PanelBody`에 맡기는지
                        + signin-screen — `min-w-[1280px]` · `lg:` 분기 0 · **인라인 Alert 0**(토스트 단일) ·
                        도트 캔버스 `aria-hidden` · 키비주얼이 `next/image` + `alt=""` · 토스트 id 고정
                        + manual-format-hint — 온보딩 수동 지정의 Path 힌트가 어댑터 `layout`으로 갈리는지
                        (2026-09-11). ⚠️ **한 문장으로 고정돼 있었다** — `{locale}` 자리표시자만 말해
                        `ts-dict`(multi-locale, 경로에 로케일이 없다)에서 틀린 안내였고, 그것이 그 포맷으로
                        가는 **유일한 길**이다(자동 탐지에서 빠져 있다). 갈래 누락은 소비자의
                        `satisfies Record<Adapter["layout"], …>`가 잡고, 이 스캔은 **화면이 그것을 쓰는가**를 센다
messages/
  en.tsx                ⚠️ **UI 문자열의 단일 출처** (SaaS 6a). 값은 문자열 **또는 함수**다 — 보간·복수·노드
                        삽입을 헬퍼 셋으로 만들지 않는다(`fmt`·`plural`·`rich`가 없다). `as const`라 접근 자체가
                        타입 검사이고, 갈래 누락은 **소비자가 거는** `satisfies Record<Union, string>`이 잡는다.
                        ⚠️ **잎이다** — `react`의 `ReactNode` 타입 하나만 import한다
                        ⚠️ **`adapterErrors` 스물둘 + 폴백이 여기 있다** (2026-09-08 6b-1) — 어댑터가 코드를
                        내고 문장은 사전이 낸다. **git 어휘를 쓰지 않는다**: `original-file-missing`이
                        Publish의 `<details>`에 실려 번역자가 읽는다
lib/
  i18n/index.ts         사전의 유일한 입구(`m`) + `pick(dict, key, fallback)`. ⚠️ **`DICT[key] ?? fallback`을
                        쓰지 않는다** — 프로토타입 키에서 값이 찾아져 폴백을 우회하고 문자열 자리에 함수가 온다
                        (초대 화면이 `?e=`를 가드 없이 넘긴다). ko를 더할 때 바뀌는 파일이 여기 하나다
  i18n/adapter-errors.ts
                        adapterErrorMessage(error) — 코드 → 문장 + `key`(어느 키인지, 앞) + `detail`(파서
                        원문, 뒤 괄호). ⚠️ **잎이다** — 온보딩 클라이언트 둘이 읽으므로 `@/lib/adapters/types`를
                        **타입으로만** 가져온다(값이면 `ADAPTER_ERROR_CODES`를 따라 그 디렉터리가 열린다)
  home/overview.ts      Home의 순수 판정 둘 (6b-6) — activeLocaleProgress(`localeProgress` 재사용 +
                        **orphaned 제외**: 그 행은 번역 화면에서 disabled라 `?locales=` 링크가 편집할 수
                        없는 곳으로 데려간다) / recentActivity(편집·CI push·Publish를 시각 desc로 병합.
                        ⚠️ **`limit`은 병합 뒤에** 적용된다 — 편집만 자르면 push·publish가 항상 밀려난다.
                        ⚠️ 동시각 정렬이 **결정적**이다: DB `orderBy`에 기대지 않고 여기서 키·로케일로
                        가른다(`Array.sort`가 안정 정렬이라 입력 순서를 보존한다))
  shell/nav.ts          사이드바의 순수 판정 **넷** (8-3이 `navFooterItems`를 더했다) — activeProject(pathname의 slug를 **내 멤버십 안에서** 찾는다,
                        없으면 컨텍스트 없음) / projectSections(**여섯** — Home(6b-6)·Locales(6b-5)·Translations·
                        Members·**Logs**(7단계)·Settings. ⚠️ **앞의 다섯은 `canPerform` 뒤가 아니다**: EDITOR도 목록을 보고
                        컨트롤만 갈린다. ⚠️ 라벨과 URL이 갈리는 자리 둘: "Languages"→`/locales`,
                        "Overview"→`/projects/<slug>`. ⚠️ **`exact`를 항목마다 든다** — 활성 판정이 축이
                        아니라 라우트 모양에 붙는다: `/projects/<slug>`는 그 프로젝트 **모든** 하위
                        라우트의 접두라 접두로 재면 어디서나 Home이 선택돼 보인다)
                        / navZones(6b-4 — **구역 둘**, 사용자 축이 먼저다. 프로젝트 구역은 `projectSections`를
                        그대로 들어 권한표가 두 벌이 되지 않는다. ⚠️ **Home·Logs 항목은 자기 라우트와
                        같은 사이클에 온다** — 없는 라우트를 가리키는 항목은 404다)
  relative-time.ts      relativeTime(then, now) — **잎, import 0** (2026-09-09에 `lib/keys/view.ts`에서
                        내렸다). ⚠️ 그 모듈은 잎이 아니다(`compareKeys` → `lib/adapters/shared`)라서
                        클라이언트가 값으로 읽으면 그래프가 따라온다 — **재수출도 하지 않는다**
                        (POSTMORTEM 2026-09-07 재발). `client-graph`는 그 셋이 무겁지 않아 못 잡는다
  auth/invite-label.ts  maskedInviteLabels — **목록 전체를 보고** 충돌하는 행만 최소한을 더 보인다.
                        충돌이 없으면 출력이 `maskEmail`과 글자 하나까지 같다 (malmoi#18)
  settings/message.ts   RepositorySettingsError 셋 → 문구 (`lib/auth/message.ts`와 같은 형, 잎).
                        ⚠️ **6b-5부터 Action 둘이 이 union을 공유한다** — `updateRepositorySettings`는
                        `invalid-branch`만, `updateBaseLocale`은 로케일 갈래 둘만 낸다.
                        ⚠️ **`noop`이 이 union에 없다** — 거부가 아니라 "쓸 것이 없다"라 화면은 성공으로 보인다
  locale-code.ts        ⚠️ **잎, import 0** — isPathSafeLocale·isPathSafeRepoPath. 로케일 코드와
                        pathTemplate이 리포 **경로 조각**이라 값이 아니라 경로로 검증한다 (sec-audit 발견 2).
                        push 스키마와 pull 판정이 **두 층으로** 같은 함수를 쓴다 — 경계는 새 값을,
                        resolveLocalePaths는 경계가 서기 전에 저장된 행을 막는다
  signin/dot-field.ts   ⚠️ **잎, import 0** (8-1b) — dotGrid(경계 포함 · gap 0이면 빈 배열: `ResizeObserver`
                        콜백에서 불려 무한 루프 한 번이 탭을 얼린다) · dotScale(거리→값 선형 보간.
                        **크기와 알파가 같은 함수를 두 번 부른다** — 곡선이 갈리면 커서 주변에 링이 생긴다)
                        · autoCursor(커서가 없을 때의 ㄹ자 순회. ⚠️ **줄 사이에 세로 전환 구간이 있다** —
                        없으면 y가 줄 인덱스로만 정해져 줄바꿈이 순간이동한다)
  search-params.ts      ⚠️ **잎, import 0** (2026-09-12) — `Raw<K>` 타입 + firstQueryValue·firstQueryValues.
                        Next의 `searchParams`는 반복 파라미터를 **배열로** 주므로 `{ q?: string }`이라고
                        적은 화면의 타입이 `?q=a&q=b`에서 거짓이 된다. **화면 여덟이 전부 이것을 지난다**
                        (`type Search = Raw<"ns" | "locales" | "q">` 꼴) — 하나만 고치면 나머지 일곱이
                        같은 거짓을 든 채 남는다.
                        ⚠️ **`Object.create(null)`로 만든다** — 키를 주소창이 정하므로 평범한 `{}`에
                        `out["__proto__"] = v`를 하면 그 키가 조용히 사라진다 (sec-audit 발견 1·17)
                        ⚠️ **`entry-points.test.ts`가 이 형을 안다** — 그 검사가 `type X = { … }` 리터럴만
                        읽던 시절엔 화면이 `Raw<…>`로 옮기는 순간 수신 키가 0건이 되어 **검사가 통째로
                        무력해졌다**(2026-09-12 실측)
  routes.ts             앱 내부 링크의 단일 출처 (**잎, import 0**). ⚠️ **`ALL_NAMESPACES`가 2026-09-11에
                        `lib/keys/view.ts`에서 여기로 내려왔다** (8-4) — 칩 판정(`lib/keys/filters.ts`)이
                        그 값을 알아야 하는데 그 모듈은 잎이라 `view.ts`를 물 수 없다. URL 값이므로 이
                        파일이 원래 자리이기도 하다. ⚠️ **`signIn()`이 쿼리를 받는다**
                        (8-1a) — `withQuery`를 지나야 `entry-points.test.ts`의 "쿼리 수신자" 검사에
                        걸린다(문자열 연결은 그 검사를 회피한다). `privacy()`·`docs()`도 8-1a다. `logs(slug, {cursor})`는 7단계가
                        **그 페이지와 같은 커밋에** 더했다 (`account()`·`project()`와 같은 판정).
                         `account()`는 6b-4, `project(slug)`는
                        6b-6이 **그 페이지와 같은 커밋에** 더했다 — 페이지 없이 등재하면 404를 가리키는
                        생성기가 되고 죽은 링크 검사의 접두 규칙이 `/projects/*`를 통과시켜 못 잡는다.
                        ⚠️ **쿼리를 받는 생성기가 둘 더 있다** — `projects({ filter, q })`(8-3. `q`는 **이름 검색**이라
                        번역 화면의 `q`와 이름만 같고 대상이 다르다)와 `account({ sessionRevocation })`(2026-09-11 —
                        그전엔 세 자리가 문자열 연결로 `/account?sessionRevocation=…`을 만들어 **위 검사를 통째로
                        회피했다**. 갈래는 다섯: cancelled·wrong-account·expired·invalid·unavailable).
                        ⚠️ **`project(slug)`가 "프로젝트로 간다"의 유일한 답이다** — 목록 행·스위처·
                        breadcrumb 넷·초대 수락 일곱 자리가 그것이고, 하나라도 남으면 같은 동작이
                        어디서 눌렀는지에 따라 다른 곳에 착지한다
                        2026-09-05 하드코딩 사고의 답이고
                        `entry-points.test.ts`가 이 파일의 경로·쿼리 키를 실재 라우트와 대조한다
  adapters/             양방향 로케일 어댑터 — 리포 포맷을 읽고 같은 포맷으로 쓴다
                        ⚠️ layout(경로 모양)과 writeStrategy(write 기계)는 **별개 축**이다
    index.ts            detectFormat / detectFormatWith(명시 지정의 유일한 입구 — ts-dict를 쓰는 길이다)
                        / detectCandidatesAcross / adapterFor / isAdapterName / ADAPTERS
    types.ts            Adapter·DetectedFormat·LocaleEntry 계약 (writeWithErrors는 선택 구현)
                        + ADAPTER_ERROR_CODES 22 · AdapterError = { path, code, key?, detail? } (2026-09-08 6b-1)
                        ⚠️ **갈래를 합치면 지표가 조용히 움직인다** — `lib/survey/one.ts`의 classify가 이
                        코드로 ADAPTER-COVERAGE ③을 가른다. `parse-failed`(구문 진단)와 `parse-crashed`
                        (파서가 던졌다)가 옛 문구 기준으로 다른 통이라 갈라져 있다
    glob.ts             `matchesGlob` — **역추적 없는 DP 매처** (sec-audit-2 발견 35). 비용이
                        `템플릿 × 경로` 길이로 고정된다. ⚠️ 정규식이던 시절엔 비용을 키우는 것이
                        템플릿이 아니라 **매칭 대상 경로**(남이 정한다)라 템플릿 예산으로 상한이 안 섰다.
                        `*`가 `/`를 안 먹는 것이 유일한 특수 규칙이고 `?`도 리터럴이다
    shared.ts           재생성 writer의 결정성 규칙(orderedEntries·compareKeys) + 후보 순위·검증
                        + matchGlobPaths(multi-locale 경로 — push·pull·survey가 공유하는 유일한 규칙)
    quote-style.ts      수술적 어댑터의 인용 부호 보존 (quoteLiteral·dominantQuote)
    json-style.ts       재생성 어댑터의 표현 보존 (들여쓰기·한 줄 컨테이너·비ASCII/슬래시 이스케이프)
                        observeJsonStyle·serializeJson·pathKey + 텍스트 스캐너(scanJson)
                        ⚠️ lib/survey/json-shape.ts가 scanJson을 여기서 import한다 — 스캐너가
                        두 벌이면 지표와 프로덕션이 서로 다른 판정을 한다
    chrome-locales.ts   _locales/{locale}/messages.json (per-locale, 재생성)
                        + dominantFieldOrder(엔트리 안 message·description·placeholders 순서 다수결)
    json-catalog.ts     per-locale, 재생성 — flat|중첩, 배열 인덱스. ⚠️ **경로 모양 3개**:
                        {dir}/{locale}.json · {dir}/{locale}/<name>.json · {dir}/<prefix><.|-|_><locale>.json
    yaml-catalog.ts     {dir}/{locale}.y(a)ml (per-locale, ⚠️ 수술적 — 주석·앵커 보존, Rails 루트 키)
    code-dict.ts        {dir}/{locale}.{ts,js} (per-locale, ⚠️ 수술적 — default export 객체)
    ts-dict.ts          src/i18n/namespaces/*.ts (multi-locale, ⚠️ 수술적 — **자동 탐지 제외**)
  env.ts                환경변수 단일 접근점 — requireEnv(던진다) / optionalEnv(인가 판정용, 던지지 않는다) / PEM 개행 복원
  cli/                  CLI 공통 — args.ts(순수 인자 파싱: 값 플래그 자리 건너뛰기 — **네 CLI**가 쓴다)
                        / walk.ts(SKIP_DIR + 리포 훑기, fs — **세 CLI**)
  db.ts                 getPrisma() — 지연 생성 싱글턴 (pg adapter, 6543, server-only)
  utils.ts              cn() — shadcn 표준 헬퍼
  __tests__/            db·env·failure·githash·utils·routes·github-probe(환경변수 누락이 MissingEnvError로 던져지는지)
                        + locale-code(로케일 코드가 `pathTemplate`에 보간돼 **리포 쓰기 경로**가 되고 그 출처가
                        `/api/push` 페이로드다 — sec-audit 발견 2) · tone(`toneOf`가 순수인지 — "같은 이름은
                        언제나 같은 색", 2026-09-11)
                        + ⚠️ globals-css·no-nul-bytes — 뒤의 둘은 lib/ 아래 어느 모듈에도 대응하지 않는다
                        (앞은 app/globals.css의 라이트 고정 상시 방어선(DESIGN §3.1), 뒤는 소스에 리터럴 NUL 금지)
  failure.ts            500 본문 판정 (classifyFailure·MissingEnvError) — 우리 메시지는 그대로,
                        남의 라이브러리 메시지는 ref만. 응답이 **대상 리포 Actions 로그**로 흘러가고
                        그 리포가 public일 수 있다
                        ⚠️ **`AppError`가 선택 `code`를 든다** (2026-09-10, 7단계) — `SyncRun.errorCode`가
                        될 값이라 `fail(message, code)`로 **던지는 자리**가 정한다. `classifyFailure`는
                        그 필드를 안 본다(축이 다르다 — "실어도 되는가" vs "무엇이 실패했나").
                        `lib/pull/__tests__/error-codes.test.ts`가 코드를 드는 자리 넷과 안 드는 자리
                        열하나를 **양쪽으로** 고정한다 — 새 `fail(`은 둘 중 하나를 골라야 red를 벗는다
  githash.ts            sha1("blob <len>\0" + content) — 로컬 blob SHA
  github.ts             Git Data API 래퍼 (App installation 토큰) — ⚠️ server-only 없음(스모크가 물어야 한다)
                        + openRepoReader(스냅샷·blob — **설치 토큰을 한 번만 발급한다.** 읽기마다 App을 만들면
                          토큰 캐시가 매번 미스라 호출이 2배다). 스냅샷은 트리 항목의 `sha`를 든다 —
                          contents API는 1MB에서 잘려 조용히 빈 내용을 준다
                        + probeRepo(App JWT `/installation` → 설치 토큰 `/repos`) — 설치 토큰만으로는
                        public 리포가 접근 철회 뒤에도 200이라 앞의 호출이 판정 근거다.
                        ⚠️ **createApp()은 try 밖** — 환경변수 누락은 값(error)으로 접지 않고 던진다
  github-connect/       GitHub 계정 연결 (SaaS 4단계). **사용자 토큰 전담 — App 개인키를 모른다**
                        ⚠️ **예외가 하나다**: `repository-id.ts`는 사용자 토큰과 무관하고 소비자가
                        `lib/github.ts`(**설치 토큰 경로**) 하나다 — "연결"이 아니라 "연결된 것의 정체성"이라
                        여기 있다. 그 두 토큰을 섞지 말라는 규정은 그대로고,
                        `credential-separation.test.ts`가 재는 것도 그대로다(이 파일은 `lib/failure`만 묘다)
    origin.ts           requestOrigin·callbackUrl — ⚠️ **redirect_uri와 쿠키 secure가 한 판정에서 나온다.**
                        redirect_uri를 안 보내면 GitHub이 App의 **첫** callback URL(프로덕션)로 되돌려
                        보내 로컬·preview 연결이 원리적으로 불가능했다 (malmoi#7)
    state.ts            OAuth state 서명·검증 (HMAC over AUTH_SECRET, secret은 인자라 순수)
                        + stateCookieName(secure)·stateCookieNames() — ⚠️ 읽는 쪽은 **두 이름을 다 본다**
                        (쓰는 쪽은 x-forwarded-proto, 읽는 쪽은 요청 URL로 판정해 갈릴 수 있다)
                        + STATE_TTL_MINUTES — 쿠키 maxAge와 서명 exp를 함께 정하므로 한 곳에 둔다
                        ⚠️ **payload가 `dest`를 든다** — 갈래 **셋**: `{kind:"settings", slug}` |
                        `{kind:"new"}`(2026-09-07) | `{kind:"account"}`(6b-4). 뒤의 둘은 사용자 축이라
                        프로젝트가 없어 slug가 착지를 겸할 수 없다. **갈래를 늘리는 방향은 안전하다**(옛 쿠키가
                        그대로 파싱된다) — 옛 `{slug}` **모양**은 `state-mismatch`로 거부된다(10분 만료 창)
    account-link.ts     planAccountLink 4갈래 — taken-by-other가 replace보다 앞이다
    account-view.ts     loadAccountView 3갈래 (6b-4) — ⚠️ **화면 둘이 이 함수 하나를 읽는다**(`/account`·설정).
                        설정 화면의 지역 `loadAccount`를 내린 것이고, 다른 것은 연결 버튼의 착지뿐이다
    connect-plan.ts     planRepoConnect — SAAS §5.4 3중 검증의 판정 자리 (5단계가 재사용)
    health.ts           planConnectionHealth 7갈래 + probeFromError·httpStatus
                        ⚠️ **ID 대조가 이름 대조보다 앞이다** (2026-09-10) — 리네임 뒤 같은 조직이 옛
                        이름으로 리포를 새로 만들면 `fullName`·`installationId`가 저장값과 같아,
                        `repositoryId`를 안 보면 초록을 띄우는 동안 Publish만 죽는다. 그 갈래가
                        `repo-replaced`이고 **[다시 연결] 버튼이 없다**(리포는 생성 시점 고정이라
                        `connectRepository`가 재고정을 거부한다 — 눌러도 실패할 버튼이다)
                        ⚠️ **`ProbeResult.repositoryId`는 optional이 아니다** — 부재를 허용하면 판정의
                        `=== null`을 `undefined`가 조용히 지난다. 부재는 **저장된 행**의 성질이다
                        ⚠️ 403(설치 일시중지)은 error가 아니라 not-installed다 — 영구 상태다
    token.ts            planTokenUse 3갈래 + refreshFailure (⚠️ 429는 4xx인데 unavailable이다)
    token-store.ts      ensureUserToken — 회전 결과를 조건부 updateMany로 즉시 쓴다
    log.ts              logFailure — unavailable로 접는 자리마다 부른다 (route·Action·토큰·probe·viewer).
                        화면엔 갈래 이름만 가므로 원인은 여기서만 볼 수 있다
    message.ts          ConnectError 12갈래 + isConnectError·connectErrorMessage (inviteErrorMessage 형)
    user.ts             OAuthApp·Octokit 호출 — ⚠️ authentication에 clientSecret이 섞여 오므로
                        token·expiresAt·refreshToken 셋만 뽑는다. 목록은 paginate로 전 페이지
    repository-id.ts    requirePinnedRepositoryId · requireSameRepository (sec-audit-2 #34) — 쓰기 전에
                        **지금 그 주소가 준 id**가 `Project.repositoryId`와 같은지 본다. ⚠️ **이름은 재사용된다** —
                        리네임 뒤 같은 조직이 옛 이름으로 리포를 다시 만들면 `fullName`도 `installationId`도
                        저장값과 같다. ⚠️ 옛 행은 pin이 null이라 **던진다**(`not-installed`) — OWNER 재연결까지
                        Publish가 거부되는 것이 의도된 전환이다
  scan/                 사용처(`refs`) 수집 전담 — 진실이 아니다 (에러가 아니라 경고)
                        ⚠️ `WrapperId.kind`가 direct(`t("k")`)와 hook(`const { t } = useI18n()`)을
                        가른다. hook은 반환 바인딩을 스코프째 추적하고 next-intl의 namespace
                        상대 키를 절대 키로 되돌린다 (ARCHITECTURE §4.0)
  survey/               어댑터 범용성 실측의 순수 판정층 (I/O는 scripts/adapter-survey.ts만)
                        ⚠️ **one.ts의 classify(code)가 지표 ③을 가른다** — 옛 문구 기반이었고 6b-1이 코드로
                        옮겼다. `__tests__/classify.test.ts`가 **옛 문구 22개 + 옛 분류기 본문**을 픽스처로
                        들고 대조한다(코퍼스가 밟는 갈래는 여섯뿐이라 재측정만으로는 회귀가 0으로 조용하다)
                        select(파일 고르기) / one(리포 하나) / summarize(집계·표) / diff(변경 줄
                        비율·hunk) / json-shape(원본 텍스트의 키 순서·들여쓰기) / ts-shape / stats
                        / merge(detectCandidatesAcross 위임 — 흔적) / types
  push/                 payload.ts(순수 조립 — **생산자는 여기 하나다**) / assemble.ts(select→read→base —
                        **CLI와 서버 첫 적재가 같은 함수를 지난다**) / plan.ts(순수 판정)
                        / apply.ts(벌크 I/O) / auth.ts(fail-closed) / guard.ts(오배송·역행·**보관** 409)
                        / token.ts(generatePushToken·hashPushToken — 해시는 hashInviteToken **그 함수**다, 규칙 한 곳)
  projects/list.ts      목록 필터·상태의 순수 판정 (8-3, **잎에 가깝다** — `planProjectReadiness` 하나만 문다).
                        PROJECT_FILTERS · parseProjectFilter(⚠️ **객체 조회가 아니라 배열 `includes`다** —
                        주소창 값이라 프로토타입 키가 갈래로 새는 부류이고 이 리포가 두 번 밟았다) ·
                        filterProjects(원본 불변 — 호출부가 같은 배열로 **필터 전** 총계를 센다) ·
                        projectStatus(⚠️ **보관이 readiness보다 앞이다** · ⚠️ `repositoryId === null`이면
                        `needs_reconnect`다 — ready일 때만 보는 **셋째 축**이고, 그 컬럼이 막는 것은
                        되돌려보내기라 첫 적재 전엔 답할 질문이 아니다)
                        + PROJECT_STATUSES 다섯 · **searchProjects**(2026-09-11 — 이름만 훑는다. 행에
                        보이는 것 중 질의와 맞은 자리를 사용자가 찾을 수 있어야 한다)
                        ⚠️ **필터 갈래 = 상태 갈래다** — `PROJECT_FILTERS = ["all", ...PROJECT_STATUSES]`.
                        둘이 갈리면 배지가 말하는 상태 중 일부가 **골라낼 수 없는 상태**가 되고,
                        `filterProjects`도 `archivedAt` 비교가 아니라 `projectStatus` 판정을 지난다
  pull/                 branch-name.ts(⚠️ **잎, import 0** — isValidBranchName. `isRefSafeSlug`보다 **넓다**:
                          그쪽은 우리가 만드는 ref라 한 세그먼트고 이쪽은 남의 리포에 있는 브랜치라
                          `release/2.0`이 정상이다. 앞뒤 공백을 **거부**한다 — 트림하면 화면과 저장값이
                          갈려 조용한 409가 된다)
                        / ref-slug.ts(⚠️ **import 0인 잎 모듈** — REF_SAFE_SLUG·isRefSafeSlug. trigger.ts에
                          있던 것을 내렸다: 온보딩이 판정을 공유하면서 그 파일의 그래프(octokit·ts-morph)를
                          클라이언트로 끌고 갔다 — POSTMORTEM 2026-09-07)
                        / plan.ts(순수 판정 — 1층 스킵·경로·entries·2층 SHA)
                          ⚠️ **base 파일의 값 폴백은 빈 문자열까지 잡는다** (2026-09-09) — base 셀을
                          비우면 그 키가 그 파일에서 빠지고 **다음 push가 전 로케일에서 orphan한다**
                          (그 파일이 키 집합의 진실이다). 비-base의 빈 값은 그대로 "미번역"이다 / payload.ts(Git Data API 본문)
                        / render.ts(순수 — DB→파일 내용, multi-locale은 파일×로케일 이중 루프)
                        / run.ts(오케스트레이션 — 의존성 주입). ⚠️ **2층이 변경 0건이면 sync 브랜치를
                          base head로 되돌린다** (2026-09-09) — 그 비교는 **base 트리 대비**라, 편집을
                          되돌려 렌더가 base와 같아지면 브랜치가 옛 스냅샷을 든 채 남고 그 PR을
                          머지하면 되돌린 편집이 적용된다 / load.ts(Prisma 조회 · `lastPulledAt` +
                          `lastPublishedAt`·`lastPrUrl` 쓰기 — ⚠️ **`skipped`는 뒤의 둘을 안 건드린다**:
                          "마지막으로 **보낸**" 것이지 시도한 것이 아니다)
                        / client.ts(GitClient 인터페이스 — 주입 계약, 구현은 lib/github.ts)
                        / targets.ts(selectPullTargets — cron이 순회할 프로젝트 선별: installationId·
                          **repositoryId**·lastCommitSha가 없으면 제외, **보관 제외**(7단계 — `unprocessed`로도 안 센다).
                          ⚠️ 가운데 것은 2026-09-10에 붙었다 — 그 컬럼 이전에 만들어진 행은 전부 null이라
                          남겨 두면 재연결 전까지 **프로젝트마다 매일 밤 실패 `SyncRun`이 쌓인다**. 한 프로젝트의 실패가
                          나머지를 막지 않고 응답은 **배열**이다.
                          ⚠️ **정렬이 slug가 아니라 "마지막 실행이 오래된 것부터"다** (7단계) — 상한에서 잘리는
                          뒤쪽이 매일 밤 같은 프로젝트면 그것은 영원히 안 돈다. 동점 폴백이 slug라 결정성은 그대로다)
                / trigger.ts(진입점 둘이 공유하는 조립 + syncBranchFor — 브랜치가
                          l10n/sync-<slug>다, 같은 리포 두 Project가 서로를 덮지 않게. ref-slug를 재수출한다)
                        / message.ts(결과→문구)
  sync/                 sync 실행의 게이트·결과·화면 판정 (SaaS 7단계, 2026-09-10)
                        run.ts(runSync — **진입점 둘이 지나는 유일한 껍데기**. ⚠️ **던지지 않는다**: 실패도
                          게이트 거부도 `PullOutcome`이라 행 닫기가 한 곳이다(세 벌이면 그 사이 어딘가로 빠진다)
                          / ⚠️ **잠금 트랜잭션 안에서 GitHub을 안 부른다** — 지연이 곧 커넥션 점유이고 pooler에서
                          전 테넌트에 번진다. 트랜잭션은 stale 닫기 + 행 생성까지이고 조회는 **순차**다
                          / ⚠️ **`Project` 컬럼을 아예 안 쓴다** — 실패가 마지막 성공을 덮을 경로를 만들지 않는다
                          / `server-only` 없음(하네스가 직접 부른다))
                        query.ts(loadSyncRuns — server-only. 키셋 페이지네이션(`startedAt`+`id`,
                          **정렬 키 둘이 커서 둘과 같아야 한다** — 어긋나면 페이지 경계에서 행이
                          사라지거나 겹친다) + 한 개 더 읽어 "다음 페이지가 있나"를 조회 하나로 답한다.
                          ⚠️ **원문 이메일을 안 낸다** — `loadMembers`와 같은 규칙이고 마스킹은 로더가 한다)
                        view.ts(syncRunView — 행 → tone·label·triggerLabel·reasonKey + encodeCursor/
                          decodeCursor. ⚠️ **`@/generated/prisma/client`를 값으로 안 읽는다**(상태·트리거를
                          문자열 union으로 다시 적는다) · ⚠️ **무효 커서는 null이지 예외가 아니다**(주소창
                          값이다) · ⚠️ **배지 색이 셋뿐이라 구별은 라벨이 든다**)
                        plan.ts(planSyncStart — ⚠️ **`already-running`이 `too-soon`보다 앞이다**(둘 다 걸릴 때
                          "30초 뒤에"는 거짓이다) · `STALE_AFTER_SECONDS`보다 오래된 RUNNING은 실행 중으로
                          안 치고 껍데기가 닫는다 · ⚠️ **`too-soon`은 cron에 안 건다**(하루 1회라 야간 실행이
                          조용히 안 도는 경로가 생긴다) / planSyncFinish — ⚠️ **`skipped`를 `SUCCEEDED`로
                          접지 않는다**(`lastPublishedAt`이 skipped에서 안 움직인다) · warnings는 둘 다 센다
                          / classifySyncError — 코드는 **던지는 자리**가 든다, `safeMessage`는 `classifyFailure`
                          위임. ⚠️ **`STALE_AFTER_SECONDS`(300)는 `maxDuration`(60)보다 넉넉해야 한다** —
                          같으면 정상 실행이 스스로를 stale로 본다)
  credentials/          저장 시 암호화 (2026-09-10, dev·prod 전환 완료). **축이 셋이고 키도 셋이다**:
                        세션은 `sha256:v1:` **digest**(쿠키만 원문 — DB가 새도 살아 있는 세션이 안 넘어간다) /
                        User·초대의 email·name·image와 GitHub App 토큰은 `enc:v1:` **AES-256-GCM 봉투**
                        (AAD가 테이블·행 id·컬럼을 물어 **행·컬럼 교차 재사용을 인증 태그가 막는다**) /
                        정확 일치 조회는 `hmac:v1:` **별도 컬럼**(초대는 scope에 projectId를 문다)
                        crypto.ts(봉투·keyring·digest — 잎) / storage.ts(AAD 조립 + 키 로드.
                        ⚠️ **`validatePiiReadKeys`가 행 루프보다 먼저다** — 없으면 키 부재가 "전원 정보
                        없음"으로 보인다) / records.ts(User·초대 DTO + `readable` — **`CredentialError`만**
                        삼킨다) / adapter.ts(`credentialAdapter` — `safePrismaAdapter`를 감싼다.
                        ⚠️ `createUser`가 **lookup 존재를 증명한다**: R2가 NOT NULL을 안 걸어서
                        DB가 안 막는다) / access.ts / conversion.ts·migration.ts·command.ts·finalize.ts(전환 도구)
                        ⚠️ **로그인용 github/google 토큰은 아예 저장하지 않는다** — 로그인 뒤 안 쓴다
  login-link/           계정 병합 (account-linking, 2026-09-12). `lib/session-revocation/`과 **같은 형이고
                        목적이 반대다** (하나는 왕복을 멈추고, 하나는 진행시킨다) — 합치지 않는다.
                        ⚠️ **이름이 `account-link`가 아닌 이유**: `lib/github-connect/account-link.ts`가
                        **GitHub App 연결의 소유권**이라 축이 다르다. 파일은 여섯이다.
                        policy.ts(⚠️ **잎에 가깝다 — import가 `lib/routes.ts` 하나다.** `/account`의
                          수단 카드가 **클라이언트**라 이 파일의 그래프가 곧 번들이고, 해시를 여기
                          두었더니 `node:crypto`가 따라 들어갔다(실측 — `client-graph.test.ts`가 잡았다).
                          `Challenge` 조립·파싱 · 쿠키 이름 둘 · `checkChallenge` · `outcomeUrl`(⚠️ **갈래
                          이름만 받는다** — 저장된 문자열을 리다이렉트에 쓰면 open redirect 판정이 생긴다)
                          · `failureUrl`(⚠️ **돌아갈 challenge가 없는 갈래는 이 화면으로 안 보낸다** —
                          `expired`·`invalid`는 화면이 사유 없이 한 번 더 튕겨 문구가 사라진다)
                          · `pickLoginAccount`·`loginMethodRows`·`canUnlink`·`destFromCallbackUrl`)
                        / plan.ts(planLinkOffer 3갈래 + planLinkConfirm 5갈래 — ⚠️ **`expired`가
                          `wrong-account`보다 앞이다**(만료된 challenge가 누구 것이었는지 말하지 않는다) ·
                          ⚠️ **`consume`이 `ok`에서만 참이다**(실패가 소비하면 훔친 URL 한 번으로 남의
                          병합을 태운다))
                        / message.ts(코드 → 문구, `?e=`라 `string`을 받는다) / store.ts(beginLink·
                          finishLink·loadLinkOffer + `challengeTokenHash`. ⚠️ **모든 조회·삭제에 `userId`를
                          건다** — `Account` PK가 `(provider, providerAccountId)`라 그 둘만으로 남의 행에
                          닿는다) / http.ts(withLoginLink·authorizeLoginLink·withLinkStart — ⚠️ **`withRevocation`이
                          바깥, 이것이 안쪽**이고 state 쿠키 이름·salt가 갈린다) / view.ts(loadChallengeView —
                          **보일 값만**: 마스킹 이메일·provider·가입 월·표시 이름·아바타 이미지.
                          ⚠️ **이메일 원문은 반환 타입에 없고 계정 내용(프로젝트 수·멤버)도 안 싣는다** —
                          이름·이미지는 2026-09-12에 열렸다(그 화면에 온 사람은 이미 주소를 검증받았고,
                          가린 대가로 아바타가 셸과 다른 얼굴이 됐다))
                        / clear-cookies.ts(일반 로그인 셋이 부른다 — 배타성은 **양방향** 정리가 만든다)
  session-revocation/   전체 세션 회수 (sec-audit-2 #38). `/account`에서 공급자 재왕복 뒤 **그 사용자의**
                        Session을 전부 지운다 — 확인 요청 소비와 삭제가 한 트랜잭션이다.
                        policy.ts(순수 — Challenge·nonce·state 해시) / store.ts(User 잠금 + 일회 소비) /
                        http.ts(callback 가로채기 — ⚠️ Auth.js state 쿠키를 **다른 이름·salt**로 분리해
                        회수 왕복이 일반 로그인으로 바뀌지 않는다) / clear-cookies.ts
                        ⚠️ `VerificationToken`을 목적 접두로 재사용한다(이메일 provider를 안 써서 비어 있다)
  auth/                 인증·인가. **판정은 순수 함수, 조회·세션은 얇은 껍데기**
                        ⚠️ `allow.ts`(허용 핸들 목록)는 2026-09-06에 삭제됐다 — 인가는 ProjectMember다
    query.ts            getProjectAccess(prisma, …) — slug→project→ProjectMember 두 조회
                        + loadMembers·loadPendingInvitations — ⚠️ **원문 이메일을 안 낸다** (2026-09-09,
                        sec-audit 발견 4): 반환 타입이 `emailLabel`이고 마스킹을 로더가 한다. 클라이언트에서
                        가리면 원문이 이미 RSC 페이로드에 있다 — **안 읽는 것이 아니라 안 돌려주는** 것이다
                        + loadMembers·loadPendingInvitations (6b-2 — 멤버 화면. **`projectId`로만 좁힌다**,
                        인가는 호출부가 이미 지났다. 뒤의 것은 `acceptedAt IS NULL AND expiresAt > now()`
                        **둘 다** 본다 — 한쪽만 보면 이미 멤버가 된 사람의 초대가 "대기 중"으로 보인다).
                        ⚠️ server-only가 **없다**(테스트가 메모리 DB로 직접 부른다)
    session.ts          requireUser · requireProjectAccess — redirect만 한다 (server-only).
                        장애는 /signin?error=Unavailable, 거부는 /projects?e=<status>
                        ⚠️ **보관만 redirect하지 않는다** (7단계) — `archived: boolean`을 값으로 돌려주고
                        페이지가 `ProjectArchived`를 그린다. 되돌릴 곳이 설정 안의 카드 하나라 목록으로
                        튕기면 사용자가 왜 거기 왔는지 모른다. **대가는 호출부가 빠뜨릴 수 있다는 것**이고
                        (빠뜨리면 화면이 정상 렌더된다) `app/__tests__/screens.test.ts`가 다섯을 센다
    safe-adapter.ts     `PrismaAdapter`를 **두 자리에서만** 감싼다 (sec-audit-2 #31·#39).
                        ⚠️ **Auth.js는 세션 만료를 OAuth callback 앞에서 안 본다** — 만료 세션 토큰을
                        수동 Cookie로 보내면 자기 OAuth 계정을 남의 User에 붙일 수 있었다. 조회가
                        만료 행을 아예 안 돌려주는 것이 두 경로를 동시에 덮는 유일한 자리다.
                        ⚠️ **로그인 수단은 User당 하나** — SAAS §5.5의 정책이 여기서 쓰기까지 닿는다
    landing.ts          ⚠️ **잎** (8-1a) — rejectTarget(거부·장애 2갈래) · landingTarget(루트의 착지 3갈래).
                        세 파일에 흩어져 있던 if 문을 모았다. ⚠️ **삼항이 아니라 맵 + `satisfies`다** —
                        갈래가 늘면 키가 없어 컴파일 에러가 나고, 삼항이면 새 갈래가 **사유 없이**
                        로그인 화면으로 떨어지는데 `tsc`가 조용하다(실측). `lib/auth/message.ts`와 같은 관용구
    read-session.ts     readSession — auth()를 장애 표시와 함께 읽는 **유일한 진입점** (ok|none|unavailable).
                        ⚠️ server-only 없음 — Action 테스트가 @/auth만 mock한다
    outage.ts           AsyncLocalStorage + noteAuthError — SessionTokenError만 장애로 표시.
                        auth.ts의 logger.error가 부른다 (POSTMORTEM 2026-09-06)
    public-session.ts   publicSession — session 콜백 반환을 허용 목록으로 새로 만든다. 입력은 Session
                        **행**이라 그대로 돌려주면 sessionToken이 /api/auth/session에 실린다
    profile.ts          githubUserinfo + githubApi — /user + /user/emails를 합친다. ⚠️ HTTP 실패는 **둘 다
                        던지고**(장애 → "잠시 뒤"), 이메일 미검증만 email:""로 정상 거부 경로에 남긴다
    permission.ts       Role·Permission + canPerform (SAAS §3 권한표 6칸). ⚠️ Publish는 별도
                        permission이 아니라 translation:write에 들어 있다
    access.ts           planProjectAccess — "slug 없음"과 "멤버 아님"을 같은 not-found로 접는다
                        (프로젝트 존재를 노출하지 않는다). forbidden은 멤버인데 권한이 모자란 경우만
                        ⚠️ **`archived` 갈래가 붙었다** (7단계) — `project:settings`를 뺀 모든 permission이
                        거기로 떨어진다. **설정만 통과하는 이유는 그것이 되돌리는 길**이어서다.
                        ⚠️ **판정 순서가 권한 → 보관이다** — 뒤집으면 보관 여부가 권한 없는 사람에게 샌다
    invite-label.ts     maskedEmailLabels — **목록 전체를 보고** 충돌하는 행만 접두를 늘린다 (malmoi#18).
                        ⚠️ **두 표가 쓴다** (2026-09-09) — 원문을 와이어에 안 싣기로 하면서 멤버 표의 라벨도
                        서버가 만든다. `maskedInviteLabels`는 그것의 얼은이다(문서 둘이 그 이름을 가리킨다)
    invitation.ts       hashInviteToken(sha256) + planInvitationAccept 5분기
                        + **MEMBER_LIMIT(10)·planInvitationCreate** (2026-09-10, 7단계 — `PROJECT_LIMIT`과
                        같은 형으로 **소비자 옆**이다. ⚠️ **대기 초대는 안 센다** — 세면 만료된 초대
                        때문에 못 부르는 상태가 생기고 그것을 설명할 화면이 없다).
                        ⚠️ not-found를 **가른다** — access.ts와 방향이 반대이고 축이 다르다
    membership.ts       planMemberChange — 마지막 OWNER 보호. 제거와 강등이 같은 판정이다
    email.ts            normalizeEmail(trim+소문자까지만 — gmail 점·+ 태그를 접지 않는다)
                        + verifiedEmailFrom — provider가 검증한 이메일만 통과 (fail-closed)
                        + freshVerifiedEmail·planEmailRefresh — 재로그인마다 User.email을 현재 검증 주소로
                        갱신(keep|update|conflict). 다른 User가 쓰면 병합 없이 건너뛴다
                        + maskEmail — 표시용, 되돌릴 수 없어 대조에 쓰지 않는다. 소비자가 둘이라(초대 화면·
                        셀 메타) 지역 사본을 두면 같은 주소가 화면마다 다르게 보인다
    cookie.ts           hasSessionCookie + shouldRedirectToLogin — 미들웨어 1차 차단용. __Secure- 접두 유무
                        둘 다 보고, GET·HEAD만 돌려보낸다 (Action POST는 통과)
    message.ts          accessErrorMessage · inviteErrorMessage · signInErrorMessage — 거부 사유 →
                        **영어 문구**(`messages/en.tsx`). 갈래 누락은 `satisfies Record<Union, string>`이
                        컴파일 타임에 잡는다(옛 `never` 검사와 같은 힘). ⚠️ **`inviteErrorMessage`는
                        `string`을 받는다** — `?e=`가 주소창 값이라 `pick`이 폴백을 낸다(단언을 걸면
                        그 계약이 검사에서 지워진다). ⚠️ 거부가 화면에 닿지 않으면 사용자에겐 버튼이
                        안 눌린 것으로 보인다 (POSTMORTEM 2026-09-06)
  keys/                 view.ts(순수 — 집계·배지·permalink + collectActorIds·actorLabel + defaultNamespace·
                        resolveNamespace·isUnpublished + **행 축 다섯**(8-4 — parseLocaleSelection ·
                        rowState · namespaceCountsFor · pendingFirst · groupByNamespace, 그리고
                        filterRows가 `{ q, locales }`를 받는다. ⚠️ **옛 `namespaceCounts`와 단일 로케일
                        갈래는 지웠다** — 두 벌이면 하나가 낡는다. ⚠️ **키 단위로 한 번만 센다**: 로케일마다
                        세면 `pending`이 `total`을 넘는다. ⚠️ **검색 대상이 선택된 로케일로 좁혀진다** —
                        안 좁히면 안 보이는 값에 맞은 키가 이유 없이 난다. ⚠️ `groupByNamespace`는
                        **순서를 `counts`에서 받는다**: `rows`만 보면 출처가 Postgres collation이라
                        `compareKeys`와 갈릴 수 있고 그러면 섹션 순서 ≠ 드롭다운 순서다)
                        + relativeTime + **localeProgress**(6b-5 —
                        ⚠️ percent는 **내림**이라 902/903이 100%가 되지 않고, **base도 100%가 아닐 수 있다**;
                        정렬은 base → 살아 있는 로케일 → **orphaned 맨 뒤**)) / save.ts(순수 — 저장 판정)
                        / query.ts(조회, server-only — loadProject·loadKeys·loadActors·countUnpublished·
                        loadMemberships + **loadProjectList**(8-3 — 목록 전용. ⚠️ **`loadMemberships`를
                        넓히지 않고 나눴다**: 그쪽은 셸이 **매 페이지에서** 부르므로 목록 하나를 위한
                        `_count` 서브쿼리를 얹으면 모든 화면이 문다 — SAAS §7.7 결정 5와 같은 축이다)
                        + **loadLocaleCounts**(6b-5 — 분모 `stringKey.count`·분자
                        `translation.findMany` **병렬 한 벌**. ⚠️ `loadKeys` 재사용은 903키에서 이 화면을
                        번역 화면만큼 무겁게 만든다; 필터 둘(`value != ""` · `stringKey.orphaned`)이 판정이다)
                        + **loadRecentEdits**(6b-6 — Home의 활동. `updatedBy: { not: null }`로 **사람의
                        편집만**: push는 그 컬럼을 비우며 전 행의 `updatedAt`을 올려 code push 직후 903건이
                        "편집"이 된다. `take`가 `@@index([projectId, updatedAt])`를 역방향으로 타고, 보조
                        키가 **어느 N건이 오는지**를 고정한다. `value`를 select하지 않는다))
                        / refocus.ts(⚠️ **잎, import 0** — shouldRefocus. `translation-input.tsx` 안에 두면
                          그 파일의 그래프에 server-only가 있어 vitest가 import만으로 죽는다)
                        / filters.ts(8-4 — activeFilters · clearedQuery. 칩 행의 유일한 출처이고 `next`가
                          **그 칩을 뗀 뒤의 쿼리**다. ⚠️ **잎이다 — import가 `lib/routes.ts`까지**:
                          칩 행이 클라이언트인데 `view.ts`는 잎이 아니다(`compareKeys` →
                          `lib/adapters/shared`). ⚠️ **라벨을 만들지 않는다** — 문구는 사전이 든다)
                        / flag.ts(8-4 — flagFor · FLAG_INVENTORY **253**. ⚠️ **잎, import 0** — 로케일
                          배지가 `?ns=*`에서 2,709번 렌더된다. ⚠️ **매핑이 원리적으로 실패한다**: 계약은
                          성공이 아니라 **실패했을 때 코드만 그린다**이고, 언어 표는 `Map`이다(로케일
                          코드가 남이 정한 값이라 객체 조회는 `__proto__`에서 프로토타입을 돌려준다).
                          ⚠️ **판정 순서가 계약이다** — 하위태그가 언어 표를 **이긴다**: `en`→GB는 표가,
                          `en-GB`→GB·`en-US`→US는 순서가 낸다(2026-09-11 사용자 규칙 셋). 표에 지역별
                          항목을 더하면 규칙이 두 벌이 된다.
                          ⚠️ **표에 무엇을 넣는가가 규칙이다** (2026-09-11에 넓혔다) — 기준은 "언어명과
                          나라가 사실상 1:1"이고, **주요 사용국이 둘 이상이면 일부러 뺀다**:
                          `es`·`pt`·`ar`·`sw`·`ta`·`ca`·`eu`·`gl`·`cy`. **틀린 국기는 없는 것보다 나쁜다** —
                          그쪽은 `null`로 떨어져 코드만 그린다. 다만 `es-MX`·`pt-BR`처럼 하위태그가 붙으면
                          이 표를 아예 안 지나 정확히 선다)
                        ⚠️ **`isUnpublished`와 `countUnpublished`는 같은 술어의 두 벌이다** — `updatedBy`가 사람인
                        행만 센다(push가 그것을 비운다). `updatedAt`만 보면 code push 직후 전 키가 미배포로 나온다.
                        `app/(edit)/__tests__/queries.test.ts`가 두 경로에 같은 행을 먹여 맞댄다
                        ⚠️ **updatedBy는 join으로 못 푼다** — FK가 없고 User.id와 옛 GitHub 핸들이 섞여 있어
                        loadActors가 따로 읽고 actorLabel이 못 찾은 값을 원문으로 낸다 (malmoi#3)
  onboarding/           탐지 온보딩 (SaaS 5단계, 2026-09-07). 순수 판정 + DB 껍데기 하나 — **GitHub을 모른다**
                        slug.ts(planSlug·normalizeProjectSlug — 형식은 pull/trigger의 isRefSafeSlug를 **그대로 부른다**)
                        / detect.ts(probeTargets — sampleOrder와 같은 파일 ≤21 · makeProbe · formatLabel · summarizeCandidates
                        · ingestTargets) / confirm.ts(templatePaths · planConfirmedFormat — 저장값은 detectFormatWith 반환)
                        / create-plan.ts(planProjectCreate · PROJECT_LIMIT **3** — 계정당 프로젝트 상한, `MEMBER_LIMIT(10)`과 같은 형으로 **소비자 옆**이다) / readiness.ts(setup|awaiting_first_sync|ready)
                        / base-locale.ts(planBaseLocaleChange 4갈래 — orphaned 거부가 요지다: 그 파일은 리포에서
                        사라졌고 base로 세우면 다음 push가 키 0개를 낸다. `zh_CN` ≠ `zh-CN`)
                        / base-pending.ts(⚠️ **잎, import 0** — basePending + baseLocaleFieldValue.
                        **화면 셋이 앞의 함수를 읽는다**: 로케일 화면·번역 배너·**설정의 워크플로 YAML**)
                        / budget.ts(첫 적재 자원 예산 — 파일 200 · 파일당 2MB · 합계 10MB + 중첩 깊이.
                          초과는 `resource-limit`. ⚠️ `/api/push`는 Zod를 지나는데 첫 적재는 안 지났다)
                        / message.ts(OnboardError 19갈래 · ingestHeadline — ⚠️ 클라이언트 컴포넌트가 이걸
                          import한다. 여기서 **값**으로 끌어오는 것이 곧 클라이언트 번들이다) / workflow.ts(renderWorkflowYaml — ACTIONS.md와 줄 대조)
                        / ingest.ts(서버측 첫 적재 — assemblePushInput→buildPushPayload→applyPush를 **우회하지 않는다**.
                          스냅샷·blob은 값으로 받고, 내려받지 못한 파일을 실패로 센다)
                        ⚠️ `@/lib/github`을 import하지 않는다 — 두 토큰은 Server Action 하나에서만 만난다
                        (`credential-separation.test.ts`가 세 검사로 상시 고정한다)
types/next-auth.d.ts    session.user.id 타입 확장 (login은 DB 세션 전환으로 제거 — Google 사용자엔 핸들이 없다)
prisma/
  schema.prisma         **12테이블** + enum 셋(Role · SyncStatus · SyncTrigger — 7단계가 뒤의 둘과
                        `SyncRun`을 더했다) (Project 테넌트 경계 / 접속 URL 없음 — Prisma 7).
                        ⚠️ **`User.email`은 더 이상 `@unique`가 아니다** (2026-09-10) — 봉투가 nonce
                        때문에 같은 주소마다 다른 바이트라 unique가 성립하지 않는다. **유일성은
                        `emailLookup @unique`**(HMAC)가 들고, 초대는 `@@index([projectId, emailLookup])`다.
                        ⚠️ **그 컬럼이 nullable인 것은 준비 단계여서가 아니다** — R2가 NOT NULL을
                        일부러 안 걸었고(전환 도구가 `null`을 집어야 한다) 값 존재는 `createUser`가 증명한다.
                        ⚠️ **`Project.repositoryId`는 쓰기 대상의 불변 id다** — 이름은 재사용되므로
                        정체성이 아니다. 옛 행은 null이고 OWNER 재연결까지 Publish가 거부된다
                        ⚠️ **`SyncRun`에 `type`·`idempotencyKey`가 없다** — SAAS §8이 두 이름을 적어 뒀지만
                        지금 두 진입점 중 **키를 만들 주체가 없다**(cron은 하루 한 번, UI는 클릭이다).
                        동시성은 `Project` 행 잠금이 막고, 둘은 **push를 이 테이블에 넣을 때** 의미가 생긴다
                        ⚠️ **`Project.archivedAt`은 상태 컬럼이 아니다** — `orphaned`와 같은 "되돌릴 수 있는
                        사실 하나"이고, 거부는 `planProjectAccess`의 갈래가 한 자리에서 한다
                        ⚠️ **`Project`에 base 로케일 컬럼이 둘이다** (6b-3): `baseLocale`은 **현실**(push 소유,
                        pull·`checkFormat`이 읽는다) / `declaredBaseLocale`은 **선언**(설정 화면 소유,
                        `checkFormat`·두 화면의 배너가 읽는다). **합치면 pull이 깨진다**
                        ⚠️ Auth.js 4테이블의 **모양은 어댑터가 정한다** — 컬럼 하나만 빠져도
                        linkAccount가 런타임에 던지고 **타입 검사는 그걸 못 본다**(ARCHITECTURE §5.1)
  __tests__/            schema-contract.test.ts — 어댑터 소스와 스키마를 대조하는 유일한 자동 방어선
                        + push-token-column.test.ts(pushTokenHash가 nullable·unique이고 **원문 컬럼이 없는지**)
                        + declared-base-locale-column.test.ts(6b-3 — nullable이고 `baseLocale`이 **그대로 남았는지**.
                        주석이 "pull은 이 컬럼을 안 읽는다"와 "일회용"을 드는지까지 본다 — 그 구별이 사라지면
                        다음 사람이 두 컬럼을 합친다)
  migrations/           17개 — _init, _add_project_tenant_boundary, _add_project_locale_format,
                        _add_project_last_commit_at, _add_project_last_pulled_at,
                        _add_key_order_and_chrome_fields, _add_project_nested_by_path,
                        _add_locale_orphaned, _add_translation_updated_at_index,
                        _add_tenant_auth_tables, _add_project_push_token
                        ⚠️ 마지막 것은 `migrate dev`가 비대화형을 거부해 `migrate diff`로 만들었다 (`/db` 4c).
                        prod 반영 완료 (2026-09-07, `db:status:prod` 11개 up to date).
                        , _add_project_last_published (2026-09-08, 6a T3 — `Project.lastPublishedAt`·
                        `lastPrUrl`. additive 둘이고 **prod 반영 완료** — `db:status:prod` 12개 up to date)
                        , _add_project_declared_base_locale (2026-09-09, 6b-3 — `Project.declaredBaseLocale`.
                        additive 하나이고 **prod 반영 완료** — `db:status:prod` 13개 up to date)
                        , _add_sync_run (2026-09-10, 7단계 ship 2 — `SyncRun` 테이블 + enum 둘 +
                        `Project.archivedAt`. **전부 additive**(SQL에 `DROP`·`ALTER COLUMN` 0건)이고
                        **dev·prod 반영 완료**)
                        , _pin_repository_id (2026-09-10, sec-audit-2 — `Project.repositoryId`. additive.
                        ⚠️ **옛 행은 null이라 OWNER 재연결까지 Publish가 거부된다** — 의도된 전환이다)
                        , _add_email_lookup (2026-09-10, credential R1 — `emailLookup` 둘 + 인덱스 둘. additive)
                        , _finalize_credential_storage (2026-09-10, credential R2 — ⚠️ **처음으로 additive가
                        아니다**: 평문 `User_email_key`·`ProjectInvitation_projectId_email_idx`를 **DROP**한다.
                        앞에 전제 검증 `DO` 블록이 서서 미변환 행이 하나라도 있으면 트랜잭션째 거부한다.
                        ⚠️ **NOT NULL은 일부러 뺐다** — 걸면 전환 도구의 CAS가 `emailLookup: null`을 못 집어
                        컷오버 이전 백업을 복원할 수단이 사라진다. 그 SQL 주석이 근거다)
                        ⚠️ **마지막 셋은 `/merge` 전에 `db:deploy`로 prod에 먼저 넣었다** — 순서가 뒤집히면
                        프로덕션이 없는 컬럼을 조회한다. dev·prod 모두 17개 up to date
  credential-cutover/   ⚠️ **마이그레이션이 아니라 스테이징 자리다** (credential R2) — SQL 첫 줄이
                        `-- R2 ONLY: stage under prisma/migrations only after blocked backfill + authenticated
                        verification.`다. **Prisma가 이 디렉터리를 안 본다** — 차단 backfill과 인증 복호 검증이
                        끝나기 전에 `migrations/`에 올리지 않기 위해 두 자리를 갈랐다.
                        `scripts/finalize-credentials.ts`가 **검토 SQL과 staged SQL의 바이트 일치**를 재는 상대가
                        이것이고, 지금은 이미 올라가 둘이 같다
prisma.config.ts        마이그레이션 접속 URL (DIRECT_URL) + .env.local 로드
vercel.json             Cron — /api/pull 야간 1회 (UTC 18:00 = KST 03:00). Hobby는 하루 1회다
                        ⚠️ **`regions: ["hnd1"]`이 함수를 DB 옆에 붙인다** (2026-09-09 계측) — 기본값은
                        `iad1`(워싱턴)이고 DB는 도쿄라 왕복 하나가 태평양을 건넜다. 이 앱의 비용은
                        페이로드가 아니라 **홉 개수**다(요청당 일곱, 문서는 8KB) — 엣지는 그대로
                        `icn1`이므로 사용자까지의 거리는 한 홉만 늘고 DB 일곱 홉이 짧아진다
next.config.ts          ⚠️ **보안 응답 헤더가 여기 있다** (2026-09-09, sec-audit 발견 9) — enforce 셋
                        (nosniff · Referrer-Policy · CSP `frame-ancestors 'none'`) + **CSP 본체는 Report-Only**.
                        `tsc`가 이 함수를 못 보므로 `app/__tests__/security-headers.test.ts`가 설정을
                        **불러서** 검사한다. ⚠️ **agentRules: false** — Next가 AGENTS.md에 자기 블록을 덧붙이는 동작을 끈다.
                        그 파일은 sync-agents.mjs가 소유하는 생성물이라, 켜져 있으면 next dev를 돌릴
                        때마다 미러 게이트가 드리프트로 잡고 지우면 Next가 다시 만든다
pnpm-workspace.yaml     ⚠️ **공급망 정책 둘이 설치 동작을 바꾼다** — 아래 게이트웨이 절
generated/prisma/       ⚠️ 생성물 (gitignore) — prisma generate
public/fonts/           ⚠️ 생성물 (gitignore) — scripts/copy-fonts.mjs
public/brand/           ⚠️ **커밋된 원본이다** (8-1a) — 로고 SVG 넷 + 키비주얼 PNG. 위 폰트와 반대다.
public/flags/           ⚠️ **같은 부류의 커밋된 원본** (8-4) — 로케일 배지의 국기 SVG **253개**(16×11,
                        파일명이 ISO 3166-1 alpha-2 소문자, 1.1MB). 2026-09-11에 사용자가 전 세트를
                        줬다 — 로케일은 **고객마다 다른 축**이라 쓸 것만 골라 두면 새 로케일마다
                        에셋을 찾아야 한다(`pt-BR`·`es-MX`가 설정 없이 서는 것이 이 세트의 값이다).
                        ⚠️ **`lib/keys/flag.ts`의 `FLAG_INVENTORY`와 정확히 같아야 한다** —
                        어긋나면 배경이 조용히 빈다(`flag-assets.test.ts`가 양방향으로 센다).
                        ⚠️ **URL은 배지의 인라인 `style`이 만든다** — `globals.css`에 규칙이 없다
                        (253줄이 국기 없는 화면까지 나가고 손으로 쓰는 파일이 생성물이 된다)
app/icon.svg            favicon — `malmoi-icon-black.svg`의 **복사본**이다(Next 파일 규약이 app/ 아래를
                        요구한다). 로고를 바꾸면 둘 다 바꾼다. 리포에 favicon이 없었다
scripts/
  adapter-survey.ts     어댑터 범용성 실측 CLI (네트워크 — 판정은 lib/survey/)
  sync-agents.mjs       Claude Code 원본 → Codex 미러 생성기
  copy-fonts.mjs        Pretendard 동적 서브셋 복사 (predev·prebuild)
  scan.ts               사용처 스캔 CLI
  ingest.ts             로케일 적재 CLI
  push-local.ts         적재+스캔+POST — TASK 7 워크플로가 할 일과 같은 순서
  smoke-github.ts       GitHub App 설정 검증 (읽기만)
  credentials.ts        자격증명·개인정보 전환 CLI — ⚠️ **`CREDENTIAL_TARGET`이 DB를 정한다**(사람이
                        넘기지 않는다, `PRISMA_TARGET`과 같은 형). 기본 check-only이고 `--apply`는
                        `--traffic-blocked --writers-drained`를 함께 요구한다(운영자 확인 표식이지
                        차단 기능이 아니다). ⚠️ **키는 target에 안 묶여 있다** — prod 명령에 dev 키를
                        주면 그대로 돈다. `.env.prod.local`을 셸로 source하는 이유가 그것이다
  finalize-credentials.ts  R2 — 전건 인증 복호화 검증 + 검토 SQL과 staged SQL 일치 + **finalize 하나만
                        pending**일 때만 `migrate deploy`를 부른다. 체크섬을 손대거나 applied로 표시하지 않는다
  __tests__/            required-args.test.ts — push:local·smoke:github의 인자 필수와 **옛 공유 slug env의
                        소비자 0건**을 소스로 고정한다. ⚠️ 그 이름이 테스트에 남아 있어야 방어선이 산다
                        + workflow-pins — `.github/` 아래 모든 yml의 `uses:`가 **40자 SHA로 핀됐는지**를
                        재귀로 센다. ⚠️ `l10n-push`는 **남의 리포 러너에서 돌고** 그 소비자가
                        `secrets.PUSH_TOKEN`을 넘기므로, 움직이는 태그 하나가 곳 그 리포의 즉시 코드 실행이다
vitest.setup.ts         ⚠️ **`server-only`를 전역 mock하고 테스트용 암호화 키 셋을 세운다.** 없으면
                        credentials 테스트가 통째로 죽는다. ⚠️ 그 mock이 "테스트가 죽는다"는 압력을
                        없앴다 — 코드 컨벤션의 `server-only` 항목 참고
vitest.credentials.config.ts  격리 PostgreSQL 스위트 전용 (`pnpm test:credentials:postgres`).
                        ⚠️ `pnpm test`의 include에 안 들어간다 — `/push` 게이트가 못 본다
auth.ts                 Auth.js v5 설정 — 어댑터가 **`credentialAdapter`**(그 아래가 `safePrismaAdapter`)이고
                        세션 토큰은 우리가 만든다(`generateSessionToken`, 32바이트 난수 — DB엔 digest만).
                        signIn 콜백은 검증 이메일 확인·갱신만, 인가는 ProjectMember.
                        handlers는 `withRevocation`으로 감싸 회수 callback을 가로챈다.
                        logger.error가 outage.ts에 장애를 알린다
docs/MVP.md             PoC 스펙 (닫힘 — §8.4가 SAAS.md를 가리킨다)
docs/SAAS.md            **SaaS화 스펙 — 현재 단계의 정본.** 범위·비범위·설계 결정·단계별
                        체크리스트·불변식 9개. 착수 전 필독
docs/ACTIONS.md         **대상 리포**에 붙이는 워크플로 (composite action 사용법·red 조건)
docs/TASKS.md           태스크 체크리스트 (완료 조건 + 🔒 결정 필요)
docs/DESIGN.md          편집 UI 시각 규칙 (라이트 단일, mono 표면 불변식)
docs/ARCHITECTURE.md    설계 상세·함정
docs/ADAPTER-COVERAGE.md 어댑터 범용성 실측 (16차) — 어댑터·탐지 규칙 손대기 전 필독
docs/POSTMORTEM.md      회귀·버그 회고 누적
docs/features/          /feature 산출물. ⚠️ **스펙이 아니다** — 결론은 MVP·ARCHITECTURE로
                        올라가고 여기는 근거로 남는다. 상태·백로그는 README.md
                        ⚠️ **셋의 수명이 다르다**: spec·design은 완료돼도 남기고(왜 그 선택을
                        했나), tasks는 닫히면 지운다(전부 [x]면 남는 정보가 없다 — 2026-09-05에
                        완료된 셋 841줄을 지웠다). 예외는 체크리스트 밖의 기록이 붙은 경우로 **여섯이
                        남아 있다**: pull-to-pr §4(실물 7시나리오) · tenant-auth §6.1(preview 실물 +
                        거기서만 잡힌 결함 넷) · github-connect T5(실물 10시나리오 + **못 밟은 둘의
                        이유**) · project-onboarding T8(실물 14행 표 + **전제 둘이 틀렸다는 실측**) · sync-runs T10 · **translation-ui T7**(96개 전부 `[x]`인데 재측정 기록이 붙어 있다). key-separator-contract는 보류라 애초에 대상이 아니다
                        ⚠️ adapter-generality/의 repos*.txt·verdicts*.json은 **살아 있는 입력**이다
                        (pnpm adapter-survey가 읽는다 — 완료된 산출물이 아니다)
```

## 아키텍처 원칙

설계 상세와 함정은 **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** 가 단일 출처다. `lib/` 아래 코어 모듈(`adapters`·`githash`·`github`·`github-connect`·`db`·`env`·`failure`·`scan`·`push`·`pull`·`keys`·`auth`·`cli`·`survey`·`onboarding`·`i18n`·`shell`·`home`·`settings`·`sync`·`credentials`·`session-revocation`·`login-link`·`projects`·`signin`·`routes.ts`·`locale-code.ts`·`relative-time.ts`·`tone.ts`)을 건드리기 전에 읽는다 — **이 목록은 `.claude/commands/push.md` 4단계 트리거와 같아야 한다** (2026-09-04 감사에서 셋이 전부 달랐다). 요약:

- **export 결정성 3규칙 (재생성 방식)**: 키는 **`LocaleEntry.order`(원본 위치) 오름차순, 없으면 UTF-16 코드 유닛 `<` 비교**(2026-09-03 — `localeCompare` 금지), **들여쓰기는 원본 파일의 폭**(없으면 2칸 — 2026-09-04, ADAPTER-COVERAGE §14), 파일 끝 개행 정확히 1개. `orphaned` 키는 export에서 제외(DB엔 남으므로 되돌릴 수 있다). **수술적 치환(`ts-dict`·`yaml-catalog`·`code-dict`)은 이 규칙을 지나지 않는다** — 원본 순서·공백·주석을 보존하는 것이 그 방식의 요지다 (ARCHITECTURE §1.1).
- **변경 감지는 두 층이다**: **1층**(`Translation.updatedAt` vs `Project.lastPulledAt`)에서 편집이 없으면 GitHub API를 **한 번도** 부르지 않는다 — 야간 cron이 매일 도는데 변경이 없는 날이 대부분이라 이게 기본 경로다. **2층**은 ref·트리·파일별 blob을 읽어(2026-09-04부터 **모든 어댑터**가 — 수술적은 치환 대상, 재생성은 표현) 로컬 blob SHA와 비교하고, 전부 같으면 커밋을 만들지 않는다. "API 0회"는 1층의 성질이고 2층은 읽기 호출이 파일 수만큼 있다 (ARCHITECTURE §2·§3).
- **커밋 parents는 항상 base의 head, 브랜치는 force update**: `l10n/sync`는 누적 히스토리가 아니라 "현재 DB 상태의 스냅샷"이다. 3-way merge를 피하는 게 코어 원칙이므로 fast-forward를 지키려 하지 않는다.
- **커밋 메시지에 `[skip-l10n]`**: 이 마커가 없으면 pull이 만든 커밋이 main에 머지될 때 push가 다시 돌아 무한 루프가 된다.
- **PR은 하나를 재사용**: 열린 PR이 있으면 새로 만들지 않는다. PoC 리포에 PR 수십 개가 쌓이면 사람이 안 본다.

## 브랜치 정책 & 배포

**`main` / `dev` 두 브랜치다** (2026-09-04 분리 — MVP §8.4). 그 아래 작업 브랜치는 두지 않는다: 혼자 작업이라 층을 하나 더 얹으면 스스로 연 PR을 스스로 머지하는 형식만 남는다.

| 브랜치 | 무엇 | 어떻게 들어가나 |
|---|---|---|
| `dev` | 상시 작업 브랜치. **push = Vercel preview 배포** (dev DB를 본다) | `/push` |
| `main` | 프로덕션. **머지 = Vercel 프로덕션 배포** (`https://mal-moi.com`) | `/merge` (dev→main squash PR) |

- **GitHub default branch는 `dev`다.** PR 기본 base가 dev가 되면 실수로 main에 PR을 여는 일이 준다. ⚠️ **대상 리포의 composite action 참조는 `@l10n-push-v1`(불변 태그)이고 `@main`이 아니다** (2026-09-09, sec-audit 발견 3 — 전엔 `@main`이었고 이 줄이 그것을 "안전하다"고 적었다). 그 논거는 *낡음*(action 변경이 dev에 있는 동안 대상 리포가 옛 버전을 쓴다)이었는데 **묻는 축은 가변성**이다 — 그 스텝에 `secrets.PUSH_TOKEN`이 들어가므로 `main`에 닿는 커밋 하나가 대상 리포 러너에서 즉시 돈다. 태그를 옮기는 것이 릴리스다 (docs/ACTIONS.md).
- **`main`에 직접 커밋·푸시하지 않는다.** 프로덕션 앞의 게이트(PR CI)를 통째로 건너뛴다.
- **preview는 dev DB를 본다.** 프로덕션 데이터에 닿지 않는 것이 preview를 쓰는 이유의 절반이다 — Vercel env의 Preview 스코프가 그렇게 갈려 있어야 성립한다.
  - **dev 브랜치 고정 URL**: `https://malmoi-git-dev-ox501501-1046s-projects.vercel.app` (배포별 URL과 별개로 dev의 최신 preview를 항상 가리킨다)
  - ⚠️ **preview에서 GitHub 로그인은 dev 브랜치 고정 URL에서만 된다.** OAuth App은 callback URL을 하나만 갖는데 preview URL은 배포마다 바뀌므로, **preview 전용 OAuth 앱**을 따로 두고 그 callback을 dev 고정 URL에 박았다. 다른 브랜치의 preview가 로그인 화면에서 멈추는 것은 정상이다. 모든 preview에서 로그인이 필요해지면 Auth.js v5의 `redirectProxyUrl`을 넣는다 — 그때가 SaaS UI를 만드는 시점이다.
  - ⚠️ **preview는 Vercel SSO(Deployment Protection) 뒤에 있다.** 프로덕션은 자동화를 위해 껐지만 preview는 켠 채로 뒀다 — preview URL이 새어나가도 Vercel 계정 없이는 못 열고, 열 이유도 없다. **그래서 `curl`로 preview를 찌르면 앱 응답이 아니라 `vercel.com/sso-api`로 가는 302가 온다** — 앱이 깨진 것으로 오진하기 쉽다. 브라우저는 Vercel 세션 쿠키로 그냥 통과하므로 사람이 보는 데는 지장이 없고, 자동화가 필요하면 `vercel curl`이나 protection bypass 토큰을 쓴다.
- **GitHub 브랜치 프로텍션은 없다.** Free 플랜 + private 리포 조합에서 GitHub이 거부한다 (`403: Upgrade to GitHub Pro or make this repository public`). **그래서 PR CI가 게이트인 것은 `/merge`가 그것을 보기 때문이지 서버가 강제해서가 아니다.**
- **버전·tag 없음.** 웹앱이라 semver가 소비자에게 의미를 주지 않는다.

### 게이트가 어디에 서 있나

분리 전에는 전부 로컬에 있었다. 지금은 **둘로 갈렸고, 둘 다 필요하다**:

| 게이트 | 어디 | 무엇을 막나 |
|---|---|---|
| `pnpm typecheck` + `test` + `build` | `/push` 1단계 (로컬) | dev·preview에 red가 나가는 것 |
| PR `verify` 체크 | `/merge` 4단계 (GitHub) | **프로덕션에 red가 나가는 것** |

- **로컬 게이트를 "PR CI가 잡아줄 것"이라며 건너뛰지 않는다.** 그 CI는 커밋 여러 개가 쌓인 뒤에 돌아서, red가 나오면 무엇이 깼는지 특정하는 비용이 지금의 3분보다 크다.
- **로컬 게이트가 `pnpm build`를 포함한다** (2026-08-31 추가). `tsc`는 RSC 경계를 못 본다 — `"use client"` 누락, 서버 컴포넌트의 클라이언트 훅, Server Action 직렬화 위반은 `next build`만 잡는다. 콜드 5초 / 웜 2초다.
- **`/ship`은 dev까지다.** `/merge`를 부르지 않는다 — 브랜치를 나눈 목적이 프로덕션 앞에 사람 판단을 하나 더 두는 것이므로, 그 판단을 파이프라인이 대신하면 나눈 의미가 없다.
- **되돌리는 유일한 방법은 다음 배포다.** revert 커밋을 dev에 얹어 같은 경로로 다시 보낸다.
- **`git push --force`는 main에 금지.** dev는 `/sync`가 머지 후 정기적으로 force update하지만(squash가 해시를 바꾸므로), 그 스킬의 안전 검사 3개를 지나야 한다.

### DB 마이그레이션은 배포와 순서가 얽힌다

**dev DB는 `/push` 전에, prod DB는 `/merge` 전에** 넓힌다 — 각 배포 직전이다 (additive-first).

| 언제 | 명령 | 무엇을 위해 |
|---|---|---|
| `/push`(dev 푸시) 전 | `pnpm db:migrate` (보통 `/db`가 이미 했다) | preview가 없는 컬럼을 조회하지 않게 |
| `/merge`(프로덕션 배포) 전 | `pnpm db:deploy` + `pnpm db:status:prod` 확인 | 프로덕션이 없는 컬럼을 조회하지 않게 |

컬럼 삭제·타입 변경은 코드 배포가 끝난 다음 별도 마이그레이션으로. **`db:deploy`를 `/push` 시점으로 당기지 않는다** — 프로덕션이 코드보다 앞서 있는 창을 필요 이상으로 길게 연다. `/merge` 1단계가 확인을 요구하지만 그건 안전망이고, 순서를 아는 건 `/db`의 책임이다.

## 워크플로우 (스킬 라인업)

스킬 **17개**의 역할·단계별 게이트는 `.claude/commands/<name>.md`에 정의돼 있고, Codex 미러는 `.agents/skills/source-command-<name>/SKILL.md`다 (**`/push`·`/merge`·`/sync`·`/bugshot-qa` 넷은 미러 제외** — 앞의 셋은 원격 상태를 바꾸는 창구를 Claude Code 하나로 두려는 것이고, `/bugshot-qa`는 Codex에 ego-browser 런타임이 없어 실행 자체가 불가능하다).

`/feature` · `/feature-review` · `/tdd` · `/implement` · `/code-review` · `/refactor` · `/audit` · `/doc-check` · `/db` · `/push` · `/merge` · `/sync` · `/pull` · `/postmortem` · `/ship` · `/l10n-roundtrip` · `/bugshot-qa`

권장 흐름: `/feature` → `/tdd interface` → `/implement` → `/code-review` → `/refactor` → (`/db`) → `/push`(dev) → `/merge`(프로덕션). 작은 변경은 `/ship` 하나로 `/push`까지 오케스트레이션하며, **`/ship`은 dev까지다 — 프로덕션 배포는 `/merge`를 따로 부른다.**

**`/audit`은 이 흐름 밖이다.** 변경분이 아니라 **코드베이스 전체**를 불변식·원칙·경계·부채 네 차원으로 감사하고, `docs/POSTMORTEM.md` **전 항목**(2026-09-12 기준 59개 — `grep -c '^### 20'`으로 센다, 템플릿 헤딩은 제외)의 재발 방지 grep을 전수로 돌린다 — `/code-review`는 변경분에 걸린 항목만 소환하므로 손대지 않은 코드에 남은 같은 패턴은 이쪽만 잡는다. **MVP를 닫고 SaaS화에 들어가기 전 부채 정리 라운드용**이고(MVP §8.1), 리포트 전용이라 배포 경로와 무관하다.

- **무엇을 할지는 `docs/TASKS.md`에서 시작한다.** 단계별 태스크와 완료 조건이 거기 있고, `/tdd`는 그 "검증:" 줄을 테스트 케이스로 쓰고, `/push`는 통과한 것만 체크한다. `/feature`는 TASKS의 한 단계가 설계 문서를 요구할 만큼 클 때만 부르고, `/feature-review`는 그 산출물이 커서 4관점 크로스체크가 필요할 때만 부른다.

- **`/merge`·`/sync`는 2026-09-04에 되살렸다** — 브랜치 분리로 대상이 다시 생겼다(dev→main PR, 머지 후 dev 재동기화). 2026-08-31에 삭제했던 것을 그대로 복원하고 dev/prod DB 분리만 반영했다. **`/merge`가 배포 스킬이고 `/deploy`는 없다.**
- **`/sync`는 파괴적이다** — dev를 `origin/main`으로 hard reset + force push한다. 미커밋·미푸시·미머지 세 검사를 전부 통과해야 실행한다. `/merge`가 6단계에서 자동으로 하므로, 손으로 부르는 것은 그게 실패했거나 **다른 머신·창구가 머지한 뒤**다.
- **프로덕션에 보내지 않고 dev에만 쌓고 싶으면 `/push`까지만 하고 `/merge`를 부르지 않는다.** 커밋조차 남기고 싶지 않으면 `/ship` 대신 개별 스킬로 진행한다.
- **스키마를 건드렸으면 `/push` 전에 `/db`** — 마이그레이션 파일이 코드와 같은 커밋에 들어가야 하고, 배포 순서 판정(additive-first)도 여기서 한다. **프로덕션 반영(`db:deploy`)은 `/merge` 1단계다.**
- **회귀·버그를 잡아 고쳤으면 `/postmortem`** 으로 `docs/POSTMORTEM.md`에 회고를 남긴다. 역으로 `/implement`·`/refactor`·`/code-review`는 **착수 전 변경 영역으로 `docs/POSTMORTEM.md`를 grep**해 과거 함정을 소환한다 — 쓰기만 하고 안 읽으면 죽은 로그다.
- **`/doc-check`은 문서 전수 대조다** (2026-09-06 추가 — bugshot-2에서 가져와 이 리포의 문서 11개에 맞췄다). `/push` 4단계가 **푸시될 diff에 걸린 문서만** 보는 것과 반대로, diff와 무관하게 문서 전문 ↔ 코드베이스를 문서별 에이전트가 양방향(틀린 단언 + 누락)으로 대조한다. 같은 날 tenant-auth 리뷰가 잡은 "전환 전 상태를 서술하는" 여덟 곳이 정확히 `/push`가 못 보는 부류였다. 리포트 후 사용자 확인을 거쳐 문서별 커밋까지 한다 — `POSTMORTEM.md`(append-only)와 `docs/features/*`(근거 기록)는 대상이 아니다.
- **`/bugshot-qa`는 편집 UI의 실물 검증 전담이다** (2026-09-06 추가). ego-browser 태스크 스페이스에서 로컬 dev를 훑고, 결함을 BugShot 확장으로 `SinhyeokKang/malmoi` 이슈로 낸다. **`pnpm test`가 값은 보지만 화면은 못 보는 축**이 대상이다 — 라우트 이관, 권한별 UI 노출, 거부 문구, 입력값 유지. `/l10n-roundtrip`이 어댑터 표현 층에 대해 하는 일을 편집 UI에 대해 한다. **리포트+이슈 전용이라 코드를 고치지 않고**, preview가 아니라 **로컬**을 쓴다(preview는 Vercel SSO 뒤라 자동화가 `sso-api` 302를 받는다).
- **`/l10n-roundtrip`은 실물 검증 전담이다** (2026-09-03 추가). 실제 리포·실제 GitHub API로 push→편집→pull→머지→재pull을 한 바퀴 돌린다. **어댑터를 새로 만들거나 `write` 경로를 고쳤으면 이걸 돌린다** — 값이 맞아도 표현이 깨지는 부류는 `pnpm test`가 원리적으로 못 본다(ARCHITECTURE §1.1). 대상은 **폐기용 리포**만이다(`bugshot-i18n-test`·`i18n-format-check`·`i18n-order-check`) — 실물 오픈소스 리포에 검증 PR을 내면 흔적이 남는다. **어느 리포를 고르는지가 판정을 가른다**: 앞의 둘은 수술적 어댑터라 재생성 경로를 한 줄도 지나지 않고, 재생성(`json-catalog`·`chrome-locales`)을 고쳤으면 `i18n-order-check`다 — 그 리포가 표현 5축이 섞이도록 재포맷돼 있다.

## 문서 신선도

두 층이다. `/push`가 **푸시될 diff에 걸린 문서만** 트라이아지하고(대상·트리거는 `.claude/commands/push.md` 4단계), **`/doc-check`이 diff와 무관하게 전수 대조한다** (2026-09-06 추가 — "문서가 일곱 개뿐"이라 두지 않던 것을 열두 개가 되면서 되살렸다. 최근 커밋이 안 건드린 문서에 쌓인 stale은 `/push`가 원리적으로 못 본다). 갱신은 문서별 별도 커밋(`docs(CLAUDE): ...` / `docs(ARCHITECTURE): ...`).

- **docs/DESIGN.md** — UI 시각 규칙. UI를 만들거나 고칠 때 필독. 토큰 값의 유일한 진실은 `app/globals.css`다 — 시드 파일(`components.json`)은 CLI를 버린 2026-09-08에 함께 삭제됐다. 새 raw 색을 늘렸으면 §6.2에 등재한다. **§9가 SaaS 화면의 레퍼런스(GitLab super sidebar — 2026-09-07에 Supabase에서 바꿨다)를 든다 — 레이아웃·밀도·정보구조만 가져오고 색과 다크는 가져오지 않는다.** 커밋 prefix `docs(DESIGN): ...`
- **docs/TASKS.md** — **태스크 체크리스트.** **앞쪽 두 절(§0 "지금 어디에 있나" + "전역 미결")이 살아 있는 부분이고, 그 아래 `# 완료 기록`은 닫힌 단계다** (2026-09-05 재배치 — 미결이 §7과 §8 사이에 끼어 있어 살아 있는 항목을 찾으려면 600줄을 지나야 했다). **`lib/`·`app/`·`prisma/`에 실질 변경이 있으면 거의 항상 걸린다** — 코드를 고쳤는데 체크박스가 그대로면 그 문서는 거짓이다. 검증 조건이 실제로 통과한 태스크만 체크한다. 커밋 prefix `docs(TASKS): ...`
  - 완료 기록은 **압축하지 않는다.** 체크리스트로 보이지만 실제 내용은 "그 결정이 언제 왜 뒤집혔나"이고, ARCHITECTURE·POSTMORTEM과 겹쳐 보여도 그쪽은 현재 불변식이라 시간축이 없다. 순수 검증 목록이었던 §1·§2와 대체된 §5b-old만 접었다
- **docs/SAAS.md** — **현재 단계의 정본.** SaaS 범위·비범위·설계 결정·단계별 체크리스트·불변식 9개. **SaaS 기능을 추가/삭제했거나 단계를 끝냈거나 §10 "아직 안 정한 것"이 결정됐으면 여기부터** 갱신한다. `lib/auth/`·`app/(edit)/`·`prisma/schema.prisma`에 SaaS 관련 변경이 있으면 거의 항상 걸린다. 커밋 prefix `docs(SAAS): ...`
- **docs/MVP.md** — **PoC 스펙 (닫힘).** 범위·기술 선택·세 흐름의 계약·스키마·구현 순서. 기능을 추가/삭제했거나 기술 선택을 바꿨거나 비범위 항목을 범위로 끌어들였으면 **여기부터** 갱신한다 (코드가 스펙을 앞서면 스펙이 거짓이 된다). §10 "아직 안 정한 것"에서 결정된 항목은 본문으로 올리고 목록에서 뺀다. 커밋 prefix `docs(MVP): ...`
- **CLAUDE.md** — 명령어 표, 스택, 브랜치·배포, 스킬 라인업, 코드 컨벤션
- **docs/ARCHITECTURE.md** — export 결정성, blob SHA 비교, 커밋·PR 전략, 스캐너 계약, 스키마
- **docs/ADAPTER-COVERAGE.md** — **어댑터 범용성 측정 결과**(오픈소스 109개 + 홀드아웃 20개, **16차까지**). **§1~§4의 숫자는 학습 코퍼스 값이고, 일반화 여부는 §0 3차(홀드아웃)가 답한다** — 그쪽 오탐률이 6.3%다. §10은 키 순서 보존의 근거(4차). 지원 선언 포맷·§4.1 개정 판정·`ts-dict` 제외 판정·무인 탐지 신뢰 판정이 근거 숫자와 함께 있다. **어댑터를 새로 만들거나 탐지 규칙을 손대기 전에 읽는다.**
  - **⚠️ 재측정 트리거: `lib/adapters/**`·`lib/survey/**`의 실질 변경.** 그때 `pnpm adapter-survey`를 **학습과 홀드아웃 둘 다** 돌리고 이 문서에 회차를 더한다 — §0 3차에서 수정 4건 중 2건이 수정이 만든 회귀였고 그중 하나는 학습 코퍼스에서만 나타났다. 한쪽만 돌리면 못 본다. 판정은 `/push` 4d가 사용자에게 묻는다(네트워크 ~4분이라 게이트가 아니다)
  - **상시 방어선은 `lib/adapters/__tests__/key-order-golden.test.ts`다** — 실측 리포 모양을 인라인 픽스처로 들고 `lib/survey/diff.ts`의 프로덕션 함수로 잰다. 순서·결정성 회귀는 네트워크 없이 `pnpm test`가 잡고, 재측정이 답하는 것은 **일반화**뿐이다
- **docs/ACTIONS.md** — **대상 리포**에 넣는 워크플로. 실제 일은 `.github/actions/l10n-push`(composite action)가 하고 대상 리포는 그것을 부르는 15줄만 갖는다. `inputs`를 바꾸거나 red 조건을 바꿨으면 갱신한다. ⚠️ **말모이 리포가 private이라 Settings > Actions > General에서 접근 허용이 켜져 있어야 대상 리포가 이 action을 쓸 수 있다.** 커밋 prefix `docs(ACTIONS): ...`
- **docs/POSTMORTEM.md** — 회고 누적 (append-only, `/postmortem` 전담)
- **docs/features/README.md** — 기능 문서 15개 + 근거 문서의 상태 + **살아 있는 백로그**. 기능을 끝냈으면 표에 한 줄을 옮기고 **결론을 정본(SAAS — 현재 / ARCHITECTURE — 불변식 / MVP — PoC, 닫힘)으로 올린다** — 안 올리면 정본이 낡고 이 디렉터리가 스펙처럼 읽힌다. 커밋 prefix `docs(feature): ...`
- **README.md** — CLAUDE.md의 요약 미러. 스택·명령·브랜치·현 단계 선언이 바뀌면 같이 갱신한다 — 신규 진입자가 처음 여는 파일이라 여기가 낡으면 닫힌 스펙으로 안내한다. 커밋 prefix `docs(README): ...`

`.env.example`도 문서로 취급한다 — **새 환경변수를 코드에서 읽었으면 같은 커밋에서 `.env.example`에 추가**한다. 빠지면 새 체크아웃·Vercel 재설정에서 원인 불명으로 죽는다.

## 코드 컨벤션

- **커밋 메시지는 영문**, Conventional Commits (`feat:` `fix:` `test:` `refactor:` `docs(scope):` `chore:`).
- **⚠️ 화면 문구는 `messages/en.tsx`를 지난다 — 소스에 한글 UI 리터럴 금지.** `lib/i18n/__tests__/no-korean-ui.test.ts`가 `app`·`components`·`lib`·`messages` + 루트 `auth.ts`·`middleware.ts`를 훑고, 허용 목록은 **하나뿐이다**(`lib/push/apply.ts`의 서버 로그 — 2026-09-08 6b-1이 `lib/pull/render.ts`를 뺐고 **`lib/adapters/**` 제외도 함께 풀렸다**). `auth.ts`의 한글은 전부 주석이라 스캐너가 벗기고 센다. **주석은 벗기고 세므로 아래의 "주석은 한국어로"와 충돌하지 않는다.**
- **주석은 한국어로, "왜"만 쓴다.** 코드가 말하는 "무엇"을 반복하지 않는다. 특히 **비자명한 제약·함정·과거에 밟은 지뢰**를 남긴다 (예: "pooler로 마이그레이션하면 DDL 세션을 못 잡아 실패한다").
- **순수 함수를 먼저 분리한다.** export 생성·blob SHA·키 추출·정렬은 I/O 없는 순수 함수여야 하고, 그래서 테스트가 가능하다. DB·GitHub 호출은 얇은 껍데기로 감싼다.
- **`any` 금지**, `noUncheckedIndexedAccess`가 켜져 있으니 인덱스 접근은 undefined를 처리한다.
- **⚠️ 남이 정한 키로 조회하거나 대입하면 프로토타입을 먼저 끊는다.** 조회는 `Object.hasOwn`(`?? 폴백`은 `Object.prototype`에서 찾아진 값을 못 막는다 — POSTMORTEM 2026-09-08), **대입은 `Object.create(null)`**이다. 평범한 `{}`에 `out["__proto__"] = v`를 하면 setter가 불려 own property가 안 생기고 **그 키가 조용히 사라지며**, 중첩 복원에서는 그 조회가 `Object.prototype`을 돌려줘 다음 세그먼트가 거기 앉는다(프로세스 전역 — 테넌트 경계를 넘는다, sec-audit 발견 1·17). **로케일 파일의 키·`Locale.code`·`pathTemplate`이 전부 이 부류다.**
- **환경변수는 한 곳에서 읽는다** (`lib/env.ts`의 `requireEnv`·`optionalEnv`) — 흩어진 `process.env` 접근은 누락된 변수를 런타임까지 숨긴다. 인가 판정에 넘기는 값(`CRON_SECRET`)은 `optionalEnv`다 — 던지면 fail-closed 판정에 닿기 전에 본문 없는 500이 된다. ⚠️ **`PUSH_TOKEN`은 이 부류가 아니다** — 서버의 인가 판정에 안 들어가고 `scripts/push-local.ts`가 **보낼** 값이다(2026-09-07부터 push 인증은 `Project.pushTokenHash` 조회다).
- **⚠️ 환경변수를 읽는 코드를 모듈 최상위에서 평가하지 않는다.** 함수 안에 두고 호출 시점에 읽는다. 최상위 평가는 "파일을 읽기만 해도 죽는다"를 뜻하고, `.env`가 없는 CI에서 import·빌드만으로 실패한다 (`prisma.config.ts`가 이걸로 CI를 red로 만든 전례 — `docs/POSTMORTEM.md` 2026-08-31). 함수 안에 있어도 그 함수를 최상위 `const`가 부르면 같은 문제다.
- **서버 전용 모듈엔 `import "server-only"`.** 클라이언트 번들 유입을 컴파일 타임에 막는다. **단 테스트가 직접 import하는 순수 모듈(`lib/env.ts` 등)엔 붙이지 않는다** — 이 패키지는 `react-server` 조건 밖에서 던진다.
  - ⚠️ **그 제약이 2026-09-10에 약해졌다** (credential-storage). `vitest.setup.ts`가 `server-only`를 **전역으로 mock**하므로 이제 vitest가 죽지 않는다. 그러니 **"테스트가 죽는다"는 더 이상 잎 모듈을 분리시키는 압력이 아니다** — `lib/keys/refocus.ts`·`lib/relative-time.ts`·`lib/pull/ref-slug.ts`가 그 압력으로 떨어져 나온 것들이고, 지금은 같은 실수가 조용히 통과한다. **남은 방어선은 `components/__tests__/client-graph.test.ts` 하나**이고 그것은 `"use client"` 그래프만 본다.
- **날짜는 UTC로 저장**, 표시 시점에만 로컬로 변환.
- **일회성 실험 스크립트는 `.scratch/`에 둔다.** 리포 **안**이어야 tsconfig·경로 별칭이 잡히고, `.gitignore`에 있어야 `git add -A`에 안 딸려간다 — 2026-09-03에 `.b3-*.ts` 둘이 그렇게 커밋됐다.
- **⚠️ 차단은 두 층이고, 조건부 렌더는 어느 층도 아니다** (2026-09-05 갈렸다). **1차 `middleware.ts`** 는 렌더 요청(GET·HEAD)에 쿠키 이름만 보는 값싼 차단이고(DB 세션이라 그 이상 못 한다 — Action POST는 지나가 스스로 거부한다), **본판정은 진입점**이다 — 페이지는 최상단 `requireProjectAccess`, Server Action은 `getProjectAccess`. 레이아웃·페이지의 조건부 렌더는 차단이 아니다: App Router가 레이아웃과 페이지를 병렬로 렌더해 페이지가 이미 실행되고 RSC 페이로드가 응답에 실린다(실측 1.3MB 노출). 레이아웃에서는 `redirect()`를 던진다. **새 보호 라우트는 `matcher`에 추가한다** (ARCHITECTURE §6.1).
- **⚠️ 로케일 파일이 키의 진실, 코드 스캔은 `refs`만 준다.** 스캔 실패로 적재를 막지 않는다 — 남의 리포 CI를 우리 규칙으로 실패시키지 않는다 (ARCHITECTURE §4).
- **⚠️ 새 writer를 만들면 `lib/adapters/shared.ts`의 결정성 규칙을 쓴다.** 정렬·재조립·들여쓰기·끝 개행 1개를 직접 구현하지 않는다 — 표현은 `lib/adapters/json-style.ts`가, 정렬은 `orderedEntries`가 한 곳에서 든다 (ARCHITECTURE §1.1). **단 수술적 치환 어댑터는 그 규칙을 지나지 않는다** — 원본 보존이 요지다. 어느 쪽인지는 `writeStrategy`가 정하고, `lib/adapters/__tests__/contract.ts`가 `ADAPTERS`를 순회하며 그 매트릭스를 검사한다.
- **⚠️ "원본 내용이 필요한가"는 `writeStrategy`로 판단한다, `layout`이 아니다.** `yaml-catalog`·`code-dict`가 `per-locale`인데 수술적이다 — `layout`으로 가르는 코드가 남아 있으면 그 프로젝트의 PR이 조용히 비어 나간다 (ARCHITECTURE §1).
- **⚠️ 모든 DB 쿼리는 `projectId`로 좁힌다.** 인덱스가 전부 `projectId` 선두 복합이라 안 좁히면 풀스캔이고, 더 중요하게는 **테넌트 간 데이터가 새는 경로가 된다.** RLS가 없어 애플리케이션이 유일한 방어선이다 — 멤버십 판정을 지났더라도 쿼리가 `projectId`를 빠뜨리면 다른 테넌트의 행이 나온다.
  - ⚠️ **"애플리케이션이 유일한 방어선"은 2026-09-09까지 거짓이었다.** 그 문장은 "DB에 닿는 경로가 앱 하나"를 전제하는데 **Supabase는 PostgREST·GraphQL 데이터 API를 기본으로 켜 두고**, `public` 스키마의 `pg_default_acl`이 **`anon`·`authenticated` 롤에 새 테이블 전 권한을 자동으로 준다.** 실측: prod·dev 12테이블 전부 RLS off + `anon`에 `SELECT,INSERT,UPDATE,DELETE,TRUNCATE` — **anon key 하나로 `Account.access_token`·`Session.sessionToken`까지 읽고 지울 수 있었다**(Supabase 주간 advisor 메일이 알려줬다). **조치: `anon`·`authenticated`의 `public` 권한을 REVOKE하고 `ALTER DEFAULT PRIVILEGES`에서도 뺐다** — 후자가 없으면 **다음 마이그레이션이 만드는 테이블이 다시 열린다.** `service_role`은 남겼다(그 키는 비밀이고 공개 전제가 아니다). RLS+정책 대신 REVOKE를 고른 이유: 우리는 그 API를 한 줄도 안 쓰므로 대가가 0이고, 정책을 잘못 쓰면 구멍이 남는다.
  - ⚠️ **그 조치는 절반만 닫는다** (2026-09-09 재실측 — sec-audit 발견 8). `ALTER DEFAULT PRIVILEGES`는 **객체를 만드는 롤별**이라 고친 것은 `postgres` 소유 항목이고, **`supabase_admin` 소유 항목은 `anon`·`authenticated`에 전 권한을 그대로 준다.** 마이그레이션은 `postgres`로 도니 **Prisma가 만드는 테이블은 안 열리고**, 열리는 것은 **대시보드로 만드는 경로**다. ⚠️ **`postgres`로는 그 항목을 못 지운다** — `permission denied to change default privileges`(실측: `rolsuper=false`이고 `supabase_admin`의 멤버가 아니다). 그래서 여기는 **예방이 아니라 탐지**다.
  - **새 마이그레이션 뒤에는 `anon` 권한이 0인지 확인한다** (`/db` 5단계가 그 검사를 든다 — 위 이유로 그것이 대시보드 경로의 **유일한** 방어선이다). Supabase Advisors(Security)가 0 errors인지도 같은 신호다.
  - ⚠️ **런타임 롤이 `postgres`이고 `rolbypassrls=true`다** (실측). 즉 **지금 RLS를 켜도 앱 연결에는 안 걸린다** — "애플리케이션이 유일한 방어선"이라는 위 문장은 그 사실과 함께 읽어야 한다. **최소권한 롤로 옮기는 것은 지금 하지 않는다** (2026-09-09 판정): `DATABASE_URL` 교체가 `.env.local` 두 머신 · Vercel Production · Preview **넷을 동시에** 건드리고(개인키 하나를 지웠다가 넷이 끊긴 것과 같은 형), GRANT가 이미 0이라 인터넷 노출은 닫혀 있다. **RLS를 실제로 켜는 시점에 이 롤부터 바꾼다.**

## 게이트웨이 (알아두면 유용)

- **`prisma`의 npm `latest` 태그가 RC를 가리킨다.** 2026-08 시점 `latest`가 `8.0.0-rc.12`고 stable은 `prev` 태그의 `7.10.0`이다. `pnpm add prisma`로 무심코 깔면 RC가 들어오고 `alchemy`·`cloudflare-runtime` 같은 무관한 의존성이 딸려온다. **버전을 명시해 깐다.**
- **Supabase pooler와 Prisma**: `DATABASE_URL`에 `?pgbouncer=true`가 없으면 prepared statement 충돌로 간헐 실패한다. 증상이 "가끔 되고 가끔 안 됨"이라 진단이 오래 걸린다.
- **Vercel Cron은 Hobby 플랜에서 하루 1회**다. 야간 pull 1회가 요구사항이라 지금은 맞지만, 주기를 늘리려면 플랜을 봐야 한다. **cron은 프로덕션 배포에서만 돈다** — preview 배포가 야간 pull을 중복으로 돌려 대상 리포에 PR을 내지 않는다는 뜻이고, 브랜치 분리(2026-09-04)가 안전한 이유의 하나다.
- ⚠️ **App 설치가 `Only select repositories`다** (2026-09-07 전환 — 그 전엔 `all`이었다). **DB에 `Project` 행을 만드는 것만으로는 부족하고** GitHub 설치의 선택 목록에도 그 리포를 넣어야 한다. 안 넣으면 `probeRepo`가 `not-installed`를 주고 화면은 "App이 제거·일시중지됐거나 이 리포 접근이 철회됐어요"를, 야간 pull은 "base 브랜치를 읽을 수 없다"를 낸다. **현재 목록은 넷**: `bugshot-2` · `bugshot-i18n-test` · `i18n-format-check` · `i18n-order-check`. `skillflo-web`은 일부러 빠져 있다(`Project.installationId`가 `null`이라 pull이 애초에 안 돈다). 전환한 이유는 T5의 접근 철회 시나리오가 `all`에서 재현 불가였기 때문이다.
- **GitHub App 개인키는 개행이 들어간 PEM**이다. Vercel env에 넣을 때 개행이 `\n` 문자열로 이스케이프되므로 읽는 쪽에서 복원해야 한다. 안 하면 JWT 서명이 조용히 실패한다.
- **`.pem`은 `.gitignore`에 있다.** 이 패턴이 뚫리면 리포 쓰기 권한이 새어나간다.
- ⚠️ **`pnpm-workspace.yaml`의 공급망 정책 둘이 "왜 이게 안 깔리지"를 만든다.** `minimumReleaseAge: 1440`은 **publish된 지 24시간이 안 된 버전을 설치 대상에서 제외**하므로 방금 나온 버전을 명시해도 직전 버전이 깔린다(긴급 패치가 필요하면 `minimumReleaseAgeExclude`). `onlyBuiltDependencies`는 pnpm 10이 빌드 스크립트를 기본 차단하는 것의 화이트리스트라, 여기 없는 패키지는 `Ignored build scripts` 경고만 남기고 postinstall이 안 돈다. ⚠️ **목록은 셋뿐이다** (2026-09-09, sec-audit 발견 21 — `@prisma/client`·`sharp`를 뺐다): 스크립트가 **없는** 패키지를 목록에 두면 업스트림이 나중에 추가할 때 자동 승인되어 화이트리스트의 요지가 사라진다. **둘 다 증상이 원인을 안 가리킨다.**
- **`orphaned`는 삭제가 아니다.** export에서만 빠지고 DB엔 남는다. "번역이 사라졌다"는 제보를 받으면 먼저 이 플래그를 본다. **`StringKey`와 `Locale` 둘 다 갖는다** — 리포에서 사라진 로케일도 지우지 않고 표시만 하며, pull이 그 파일을 내지 않는다 (ARCHITECTURE §5.5.16). "로케일 열이 사라졌다"·"지운 로케일 파일이 PR에서 돌아온다"는 둘 다 이 플래그가 답이다.

## 명시적 비범위

**비범위 정본이 둘이다**: PoC는 [docs/MVP.md](./docs/MVP.md) §7, SaaS는 [docs/SAAS.md](./docs/SAAS.md) §4.2다. 요청받아도 먼저 그 목록을 근거로 되묻는다 — 범위를 지키는 게 이 프로젝트의 성패다.

⚠️ **SaaS §4.3은 "1차에서 빼되 2차에 열어두는 것"이라 성격이 다르다** — 이메일 매직링크 로그인과 push 웹훅 둘이고, "필요 없다"가 아니라 "지금 넣으면 면적 대비 얻는 게 작다"는 판정이다. 각자 2차에 열 조건이 적혀 있다.

큰 축만: ICU 복수형, 동시 편집, 다중 프로젝트, 세밀한 권한, in-context 편집, 스크린샷 첨부, 번역자 노트, 승인 워크플로, push 웹훅.

컨텍스트 제공은 **코드 참조 자동 수집 + 네임스페이스 단위 그룹핑** 두 개까지다. 편집 UI의 성패가 컨텍스트에 달려 있지만, 그 답이 "기능을 더 넣기"는 아니다.

## 메모리 & 참고 문서

- **`docs/TASKS.md` — 태스크 체크리스트. 지금 무엇을 해야 하는지의 정본. 착수 전 필독**
- **`docs/DESIGN.md` — 편집 UI 시각 규칙. UI 작업 전 필독**
- **`docs/SAAS.md` — SaaS화 스펙. 현재 단계의 정본. 착수 전 필독**
- **`docs/MVP.md` — PoC 스펙 (닫힘). 범위·근거·세 흐름의 계약 — 코어 원칙의 원문이 여기다**
- `docs/ARCHITECTURE.md` — 설계 상세·함정 (코어 로직 건드리기 전 필독)
- `docs/ADAPTER-COVERAGE.md` — 어댑터가 남의 리포에서 실제로 어떻게 동작하는지의 실측 (어댑터·탐지 규칙 건드리기 전 필독)
- `docs/POSTMORTEM.md` — 과거 함정 (`/implement`·`/refactor`·`/code-review` 착수 전 grep)
- `docs/features/README.md` — 기능 문서 인덱스와 남은 백로그 (`/feature` 착수 전 필독 — 같은 것을 두 번 설계하지 않으려면)
- `~/code/bugshot-2` — 이 하네스의 원본이자, 셋업 완료 후 push/pull 실전 테스트 대상(ko/en/fr 3개 로케일). **하네스를 참고할 때 그 리포의 i18n 구현을 조사 대상으로 삼지 않는다.**
- `~/.claude/projects/<이 체크아웃 경로를 슬러그화한 디렉터리>/memory/` — Claude Code 전용 개인 메모리 (Codex는 읽지 않는다). **머신마다 경로가 다르다** — 두 대에서 작업 중이라 홈 디렉터리 이름이 갈린다. 경로를 문서에 박지 않는다
