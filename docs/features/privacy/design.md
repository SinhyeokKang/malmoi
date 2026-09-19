# privacy — design

## 0. 영향 받는 흐름

**push·편집 UI·pull 어디도 아니다.** 데이터 경로를 한 줄도 건드리지 않는다 — 공개 페이지 하나(`/privacy`)와 **게이트 하나**가 전부다.

```
app/privacy/page.tsx           readSession 한 번 + 사전 → PublicDoc   (이미 있음, L2.0)
components/public-doc.tsx      그릇 — 시행일 줄 + table 블록 추가       (보강)
messages/en.tsx                publicDocs.privacy — 본문               (채움)
lib/privacy/
  collected.ts      (신설, 순수 데이터) MODEL_CLASSES · CLASSIFIED · DISCLOSURE_SECTIONS · REVISIONS
  disclosure.ts     (신설, 순수)        sectionGaps — 양방향 차집합
  doc-text.ts       (신설, 순수)        sections → 정규화 텍스트 → 해시
  __tests__/disclosure.test.tsx         위 셋을 실물에 엮는 단언 + 픽스처 짝
```

**Server Action도 Route Handler도 새로 만들지 않는다.** 쓰기가 0이다. DB 쿼리도 0이라 `projectId` 좁힘은 해당 없음이다.

⚠️ **`lib/privacy/**`에 `import "server-only"`를 붙이지 않는다** — 테스트가 직접 import하는 순수 모듈이고, 이 리포는 그 경계를 문장으로 남기는 습관이 있다(`lib/utc-time.ts`·`lib/i18n/index.ts`의 "잎이다" 주석). 파일 머리에 한 줄 적는다.
클라이언트 그래프 위험은 별도 방어가 필요 없다 — `components/__tests__/client-graph.test.ts`가 클라이언트가 닿는 `lib/**` 집합을 **정확 일치**로 고정하므로 누가 `PublicDoc`에서 `lib/privacy/`를 값으로 물면 즉시 red다.

⚠️ **본문이 클라이언트 번들에 실린다.** `messages/en.tsx`(현재 137KB)를 `"use client"` 컴포넌트들이 값으로 읽고, 방침 본문이 그 위에 얹힌다. **결론은 바꾸지 않는다** — 마크다운으로 빼면 `no-korean-ui`·`brand-spelling` 밖으로 나가는 쪽이 더 무겁다(§7). `/docs`까지 채우면 다시 볼 자리라 적어만 둔다.

## 1. 그릇 보강 둘 (DESIGN §6.61이 SoT)

⚠️ **시안이 없고 §6.61이 정본이다** — 그 절을 먼저 고치고 구현이 따라간다. 시안 없이 화면을 만들어 네 곳이 어긋났는데 4,039개가 green이었던 것이 POSTMORTEM 2026-09-15(`:1781`)다.
⚠️ **본문이 실물로 선 뒤 `/design-sync`를 한 번 돈다** — L2.0이 "절·목록·링크가 실물로 서는 것은 L2.1 이후라 그때 한 번에 돈다"고 **명시적으로 이 기능에 넘긴 부채**이고(`launch-readiness/tasks.md:96`), 표 블록이 새로 들어와 대조 대상도 늘었다.

### (a) 시행일 줄 — **선택 필드다** (결정 2)

`h1` 바로 아래, `intro` **위**. 사전이 `effectiveDate: "2026-09-19"`를 들고 그릇이 `<time dateTime="2026-09-19">`로 그린다. 라벨은 `Effective date`.

⚠️ **`lib/utc-time.ts`를 재사용하지 않는다** (결정 4). 유일한 export가 `utcMinute(at: Date)`이고 출력이 `2026-09-10 12:00 UTC`(분까지)라 날짜 문자열에 안 맞고, 먹이면 시행일에 `00:00`이 붙는다. **날짜 전용 포맷터도 새로 만들지 않는다** — 사전이 든 `"2026-09-19"`를 그대로 보이고 같은 문자열을 `dateTime`에 넣는다(날짜만 든 `datetime` 속성은 올바른 HTML이다). 가져오는 것은 Logs 화면의 **형**뿐이다: `<time dateTime={ISO}>{표시}</time>`.

⚠️ **`effectiveDate?`는 옵셔널이고 `/docs`는 쓰지 않는다.** 그릇이 공유라 자리는 생기지만 **법적 문서가 아닌 도움말에 시행일은 의미가 없다**. `intro`와 같은 형(없으면 아무것도 안 그린다)이라 새 규칙이 아니다.

⚠️ **시행일 줄은 `<section>` 밖이라 본문 링크 규칙(`[&_a]:text-blue-600`)이 안 걸린다.** §6.61에 한 줄 남긴다 — 그 자리에 링크를 넣을 일은 없지만, 다음 사람이 색이 다르다고 고치지 않게.

### (b) `table` 블록

`DocBlock`에 세 번째 갈래를 더한다:

```ts
type DocBlock =
  | { p: ReactNode }
  | { ul: ReactNode[] }
  | { table: { label: string; head: ReactNode[]; rows: ReactNode[][] } };
```

- `head`가 `string[]`이 아니라 `ReactNode[]`인 것은 `rows`와의 **비대칭을 없애기 위해서다** — 헤더에 약어·링크를 넣을 길이 지금 없다.
- `label`은 표의 **접근 이름**이다(필수). 한 페이지에 표가 둘이라 없으면 스크린리더 목록에 "table"만 둘 뜬다. `TableCaption`이 이 리포에 없으므로 `aria-label`로 건다.

⚠️ **`components/ui/table.tsx`를 재사용하되 `scrollable`은 기본값(`true`)을 쓴다** (결정 5 — 초안의 판정을 뒤집었다). 근거로 들었던 두 선례(번역 화면 `translations/page.tsx`, 온보딩 `steps/files.tsx:360`)는 **바깥에 스크롤 컨테이너가 있어서** 끈 것이고, 그 주석의 원문도 "`PanelBody`가 스크롤을 소유하므로 여기서 컨테이너를 하나 더 만들면 스크롤이 중첩된다"다. `/privacy`의 바깥은 `mx-auto max-w-2xl px-8 py-12 min-h-svh` 하나뿐이라 **스크롤을 받을 컨테이너가 없고**, 끄면 3열 표가 페이지 전체를 가로로 밀어 중앙 정렬 본문까지 어긋난다. 부모 높이가 auto면 `h-full`은 계산되지 않아 무해하고, 세로 넘침이 없으니 `overflow-auto`는 **가로만** 받는다 — 이 화면이 원하는 동작이다.
  - 그 래퍼에 `role="region" tabIndex={0} aria-label`을 얹는다(`steps/files.tsx:345-354`가 그 형의 선례이고, 키보드로 가로 스크롤할 길이 그것뿐이다).
  - ⚠️ **좁은 폭에서 성립해야 하는 유일한 화면이다.** DESIGN §5의 "최소 1280 · 모바일 분기 없음"은 셸의 `min-w-[1280px]`에 걸린 규칙인데 `public-doc.tsx`에는 `min-w`가 없다. 1차 독자가 초대 링크를 폰에서 여는 비개발자이고, 320px에서 본문 폭이 256px다. §6.61에 "좁은 폭에서는 표가 자기 컨테이너 안에서 가로 스크롤한다"를 명시한다.

⚠️ **헤더 프리셋은 `Th`가 아니라 `TableHead`를 쓴다.** `Th`는 `bg-muted/50 text-foreground/60 sticky top-0 z-10`을 드는데, 이 화면에는 스크롤 컨테이너가 표 자신뿐이라 sticky가 무의미하고 **반투명 배경이 본문 위에 뜬다**(POSTMORTEM 2026-09-13이 잡은 부류). 게다가 `text-foreground/60` on `bg-muted/50`은 **DESIGN §2.2·§7에 이미 AA 미달로 등재된 조합**이다 — 법적 고지에 새로 심을 자리가 아니다. 배경은 불투명 `bg-primary-foreground`(#fafafa, 온보딩 ②가 쓰는 대체값), 글자는 `text-foreground`.

⚠️ **`<th scope="col">`은 호출부가 넘겨야 붙는다** — `TableHead`·`Th` 둘 다 주입하지 않고, 지금 넘기는 곳은 번역 화면 둘뿐이다. 열 머리 관계가 곧 의미인 표라 그릇이 `scope="col"`을 **직접 박는다**.

⚠️ **`TableRow`의 `hover:bg-muted/50`는 쓰지 않는다** — §6.61이 "읽는 화면이지 조작하는 화면이 아니다"로 연 절이고, hover 강조는 조작 어포던스다. §6.61 표 행에 그 판단을 적는다.

⚠️ **§6.61의 정의문 둘이 표를 배제한다** — "패널도 카드도 없다 … 본문 한 컬럼과 나가는 링크 하나뿐", "`blocks`는 문단 또는 목록이다". **행 하나 추가로 안 끝나고 그 두 문장도 같이 개정한다.** 새 raw 색은 0이지만(`--border`·`--muted`·`--primary-foreground` 전부 기존 토큰) **새 표면은 0이 아니다** — 표면 추가를 명시적으로 허용하는 문장이 필요하다.

⚠️ **`components/ui/table.tsx:34`의 "번역 화면만 `scrollable={false}`다" 주석은 이미 거짓이다**(`steps/files.tsx:360`이 둘째). `docs/DESIGN.md`의 소비자 수와 `components/__tests__/table-presets.test.tsx`의 테스트 이름도 같이 낡았다. 이 기능이 만든 드리프트는 아니지만 P2가 지나는 자리라 같은 커밋에서 고친다.

bugshot-web의 표 스타일은 **참고만 한다** — Tailwind 3 + shadcn HSL 토큰이고 제목 weight가 600이라 그대로 옮기면 DESIGN §4(500이 상한)를 위반한다. 프리미티브의 `font-medium`(500)이 정확히 상한이라 그대로 쓰면 안전하다.

## 2. 게이트 — 1겹 자동 + 1겹 판단

### 2.1 왜 절차가 아니라 단언인가

**bugshot은 방침이 마크다운이라 `pnpm test` 밖이고, 그래서 게이트가 전부 절차다**(`/push` 트리거 + `/doc-check`). malmoi는 방침이 `messages/en.tsx` 안이라 **테스트가 읽을 수 있다** — 같은 방어를 리포에 남는 단언으로 내린다.

⚠️ **POSTMORTEM 2026-09-03 항목의 🔁 재발(2026-09-16) 블록(`:322`)의 규칙을 그대로 적용한다: "재발 방지 grep은 없어야 할 것이 아니라 있어야 할 것을 세는 쪽이 안전하다"** — 전자는 본문이 바뀌면 거짓이 된다. 그래서 이 게이트는 "금지 패턴을 찾는다"가 아니라 **"모든 모델과 필드가 등재돼 있다"를 센다.**

### 2.2 자동 — 검사 셋

**(A) 전수 등재 — `pnpm typecheck`이 든다** (결정 6).

Prisma가 생성한 타입으로 강제한다. `generated/prisma/internal/prismaNamespace.ts`에 모델 13개의 `<Model>ScalarFieldEnum`이 `as const`로 있고 `Prisma`로 재수출되므로, **`keyof typeof Prisma.UserScalarFieldEnum`은 관계 필드가 구조적으로 빠진 스칼라 필드 리터럴 유니온**이다.

```ts
// 모델 전수 — 하나라도 빠지거나 없는 이름을 쓰면 red
const MODEL_CLASSES = { User: "personal", Project: "not-personal", … }
  as const satisfies Record<Prisma.ModelName, "personal" | "not-personal">;

// personal인 모델의 스칼라 필드 전수 — mapped type이라 누락·오타 둘 다 red
const CLASSIFIED: { [P in PersonalFieldPath]: SectionId | typeof NOT_PERSONAL } = { … };
```

- **정규식 스키마 파서를 만들지 않는다.** 초안의 `schema-fields.ts`는 리포의 **세 번째** 스키마 파서가 될 뻔했다 — `prisma/__tests__/schema-contract.test.ts:31-48`의 `block()`·`fieldNames()`가 이미 있고 세 파일에 복붙돼 있다. 타입으로 내리면 파서가 통째로 사라지고, 초안이 열거한 문법 변종(관계·배열·`@@`·`///`·**enum 타입 필드 넷**·`enum` 블록 안의 값 여덟·`generator` 블록)이 **전부 발생하지 않는다.**
- **생성물 의존의 대가**: `lib/auth/permission.ts`의 "생성물에 의존하지 않아야 순수 판정 테스트가 `db:generate` 없이 돈다"가 유일한 반론인데, **`import type`이라 런타임 의존이 0**이고 `.github/workflows/ci.yml`이 이미 `db:generate` → `typecheck` → `test` 순서다.
- ⚠️ **폴백**: `` `${M}ScalarFieldEnum` `` 템플릿 리터럴 인덱싱이 TS에서 안 풀리면 **모델별로 명시적으로 쓴다**(13줄). 파서를 되살리지는 않는다.
- **`only?`를 두지 않는다** (결정 7). `Translation`을 `only: ["updatedBy"]`로 좁히면 그 모델에 새 컬럼이 늘어도 red가 0이고(`pendingEditToken`이 최근 그렇게 들어왔다), "번역 값 컬럼이 신호를 묻는다"는 이유는 `NOT_PERSONAL`이 이미 그 역할을 하므로 성립하지 않는다. 스칼라 12개 중 11개를 `NOT_PERSONAL`에, `updatedBy`만 `DISCLOSED`에 넣으면 끝난다.
- ⚠️ **`VerificationToken.identifier`를 "개인정보 아님"으로 분류하면 틀린다** — 실제 값이 `JSON.stringify([purpose, "v1", userId, provider, providerAccountId, …])`라 **`userId`와 외부 계정 식별자가 한 문자열 안에 있다**(`lib/login-link/policy.ts`·`lib/session-revocation/store.ts`). 타입이 `String`이라 P0.1에서 틀리기 쉬운 칸이다.
- ⚠️ **`Project`는 `not-personal`이 스키마상 맞다**(생성자 컬럼이 없고 소유는 `ProjectMember`로만 표현된다) — 다만 `repoOwner`는 개인 리포일 때 개인 GitHub 계정명과 같은 문자열이고, `repositoryImportToken`·`pushTokenHash`도 경계다. **모델 전수 등재가 이 판단을 한 번 강제하는 것이 요지다.**
- 선례: `app/__tests__/entry-points.test.ts`의 `EXEMPT` — 특히 `:197-200`의 **"예외 목록의 이름이 전부 실재한다"**(낡은 예외 방지)가 베낄 짝이다. ⚠️ `credential-separation.test.ts`는 `toEqual([])`형이라 §2.1이 경계한 "없어야 할 것을 세는" 쪽이다 — **선례로 드는 축은 "테스트가 소스를 읽는다"이지 카운팅 방향이 아니다.**

**(B) 등재 ↔ 본문 대조 — `pnpm test`.** `DISCLOSED`의 값(절 id)이 전부 `publicDocs.privacy.sections`에 존재하고, **거꾸로** 수집 항목을 말하는 절 중 `DISCLOSED`가 한 번도 가리키지 않는 것이 없는지 본다.

- ⚠️ **"어느 절이 등재 대상인가"를 담는 셋째 목록이 필요하다** — 절 일곱 중 `purposes`·`changes`·`deletion`은 `DISCLOSED`가 가리키지 않으므로 전체를 대조하면 무조건 red다. `collected.ts`에 `DISCLOSURE_SECTIONS`(지금은 `collected`·`retention`·`third-parties`·`cookies`)를 두고 `sectionGaps(disclosed, sections, disclosureSections)`가 셋을 받는다.
- ⚠️ **항목 라벨 문자열은 대조하지 않는다** — 결정 1에 따라 표가 필드 여럿을 한 행으로 접으므로 `Account.refresh_token`이라는 문자열은 본문에 나타나지 않는다. **대조 단위는 절 id다.**
- ⚠️ **절 id 중복을 따로 센다** — `sectionGaps`가 Set을 쓰면 중복이 조용히 사라지고 앵커는 첫 절로만 간다.

**(C) 본문 ↔ 개정 이력 — `pnpm test`** (결정 3·8).

```ts
const REVISIONS = [{ effectiveDate: "2026-09-19", digest: "…" }] as const;  // collected.test 쪽이 아니라 테스트 파일이 든다
```

단언은 둘이다: **(a)** 마지막 항목의 `digest`가 현재 본문의 해시와 같다 **(b)** `publicDocs.privacy.effectiveDate`가 그 항목의 `effectiveDate`와 같다. 본문을 고치면 행을 하나 더 써야 하고, 그 행에 날짜를 타이핑하는 것이 곧 시행일 갱신이다 — **"해시만 갱신하고 날짜는 두는" 탈출구가 닫힌다.** 방침의 `changes` 절이 필요로 하는 개정 이력이 같은 배열로 선다.

- ⚠️ **git log 기반 대안을 쓰지 않는다** — `.github/workflows/ci.yml`의 `actions/checkout`에 `fetch-depth`가 없어 CI 체크아웃이 깊이 1이고 파일 이력이 존재하지 않는다. 조용히 통과하거나 조용히 깨진다. 테스트가 git을 부르는 것도 순수성 규칙에 어긋난다.
- ⚠️ **`docText`는 `renderToStaticMarkup` + 태그 제거로 node 환경에서 닫는다** (결정 9). `String(node)`가 `[object Object]`를 주는 것은 맞지만, jsdom을 부르면 **`// @vitest-environment jsdom`이 파일 단위 지시자라** 같은 파일의 다른 검사까지 끌려간다. `react-dom/server`면 `docText(sections)` 시그니처가 그대로 순수 함수로 산다.
- 대가: 오타 하나를 고쳐도 이력에 행이 는다. **법적 문서에서는 그것이 맞는 동작이고**, 커밋 하나당 한 번이라 비용이 작다.

**(D) 0건 방어 셋.** 이 리포의 관행(`entry-points.test.ts`·`credential-separation.test.ts`)을 그대로 건다 — **(i)** 개수 가드(`personal` 모델 수 · 분류된 필드 수 · `docText` 길이. ⚠️ **`sections`가 지금 `[]`라 빈 문자열을 해시해도 green이 된다**) **(ii)** 픽스처 기반 양성/음성 짝 **(iii)** `DISCLOSURE_SECTIONS`의 각 이름이 실재하는지 역검증.

### 2.3 판단 — `/push` 4단계 + CLAUDE.md

자동이 **원리적으로 못 보는 축만** 남긴다.

| 축 | 왜 자동이 못 보나 |
|---|---|
| 같은 데이터의 **새 목적** | 스키마도 필드도 안 바뀐다. bugshot 심사 탈락의 실제 원인이 이것이다 |
| 새 **외부 전송처** | 호스트 리터럴을 세는 검사를 범위에서 뺐다(spec §6) |
| **쿠키·보존 기간** | 값이 코드 상수라 "늘었다"를 셀 기준이 없다 |
| 본문의 **내부 모순** | POSTMORTEM 2026-09-14(`:1607`) — "문장 사이의 모순은 소스 스캔이 못 본다" |

트리거는 문자열 목록이 아니라 **diff 경로**: `prisma/schema.prisma` · `auth.ts` · `lib/credentials/**` · 새 `fetch(` 호스트 리터럴 · `cookies().set`.

⚠️ **`/push`는 Codex 미러가 없으므로(`.agents/skills/`에 `source-command-push`가 없다) CLAUDE.md에도 무조건 한 줄을 박는다** — `scripts/sync-agents.mjs`가 `AGENTS.md`로 미러해 두 런타임이 덮인다. 법적 고지의 신선도 게이트를 한 런타임에만 두지 않는다.

## 3. 순수 함수로 분리 가능한 부분 (= `/tdd` 대상)

| 함수 | 입력 → 출력 | 왜 순수여야 하나 |
|---|---|---|
| `sectionGaps(disclosed, sections, disclosureSections)` | 등재 + 절 목록 + 대상 절 → `{ missingSections, unusedSections, duplicateIds }` | 양방향 + 중복이라 반환이 셋. **배열을 돌려준다**(불리언이 아니다 — 실패 메시지에 이름이 나와야 한다) |
| `docText(sections)` | 절 배열 → 정규화 텍스트 | `renderToStaticMarkup` + 태그 제거 + 공백 압축. I/O가 0이라 node 환경에서 돈다 |
| `docDigest(text)` | 텍스트 → 해시 | 해시가 공백·줄바꿈에 흔들리면 게이트가 거짓 red를 낸다 |

**(A)는 함수가 아니라 타입이라 이 표에 없다** — `collected.ts`는 로직 0의 데이터 파일이고 강제는 `tsc`가 한다. 초안의 `scalarFields()`·`undisclosed()`는 결정 6으로 사라졌다.

## 4. 스키마 변경

**없다.** 이 기능은 스키마를 **읽기만** 한다(정확히는 스키마가 생성한 타입을 읽는다). 반대로 **앞으로 스키마를 바꾸는 쪽이 이 기능에 걸린다** — 그것이 게이트의 요지다. `/db`도 배포 순서 판정도 불필요하다.

## 5. 새 환경변수

**없다.** env를 읽는 코드가 0이라 모듈 최상위 평가 위험도 0이다.

## 6. 불변식 영향

**없다.** ARCHITECTURE §0 열하나 중 어느 것도 지나지 않는다 — 번역 값·키·결정성·blob SHA(1~4)는 어댑터/push/pull 경로이고 이 설계는 읽기만 한다, `projectId` 좁힘(5)은 **DB 쿼리가 0이라 해당 없음**, GitHub 자격증명 분리(6)·`ProjectMember` 인가(7)·`ready` 판정(8)·실패 은닉(9)·경로 주입(10)·`repositoryId`(11) 전부 무관이다.

**인증 경계는 유지된다** — `/privacy`는 `app/__tests__/entry-points.test.ts`의 `EXEMPT`에 남고 `middleware.ts` matcher 밖이며(같은 파일의 `PUBLIC` 부정 단언이 상시 고정한다), matcher는 `["/projects/:path*", "/account"]`뿐이다. `readSession()`을 부르는 것은 **복귀 링크 하나 때문이고 차단이 아니다**.

⚠️ **세션을 못 읽는 장애(`unavailable`)는 `signedIn === false`로 접혀 "Back to sign in"이 선다 — 그리고 화면은 아무 표시도 하지 않는다.** 다른 화면은 전부 `unavailable`을 갈라 처리하지만 공개 문서 둘만 boolean으로 접는 것이 **의도다**(문서가 열리는 것이 우선이다). 다음 사람이 이것을 버그로 고치지 않게 §6에 못을 박는다.

## 7. POSTMORTEM에서 소환한 것

| 회고 | 이 설계에 준 제약 |
|---|---|
| 2026-09-03 항목의 🔁 재발 블록(`:322`) — "재발 방지 grep은 **있어야 할 것**을 세는 쪽이 안전하다" | 게이트를 금지 패턴이 아니라 **전수 등재**로 짰다 (§2.1) |
| 2026-09-14(`:1319`) — 0건/없음 단언은 개수 가드와 양성 짝이 있어야 한다 | (A)·(B)에 **0건 방어 셋**을 넣었다 (§2.2 D) |
| 2026-09-14(`:1607`) — "문장 사이의 모순은 소스 스캔이 못 본다" | 본문 내부 모순을 자동 범위에서 빼고 `/push` 판단으로 넘겼다 (§2.3) |
| 2026-09-15(`:1781`) — 시안 없이 만든 화면이 네 곳에서 어긋났고 4,039개가 green | 그릇 보강 전에 **DESIGN §6.61을 먼저 고치고**, 본문 뒤에 `/design-sync`를 돈다 (§1) |
| 2026-09-15(`:1845`) — "한 곳뿐"이라 적힌 재발 방지 주석이 두 곳이 됐다 | `table.tsx`의 "번역 화면만" 주석과 그 소비자 수를 같은 커밋에서 고친다 (§1 b) |
| 2026-09-13 브랜드 표기 — 한 화면에 `malmoi`와 `Malmoi`가 같이 섰다 (독립 항목이 아니라 2026-09-14 `:1607` 본문의 부연이다) | 방침 본문도 `no-korean-ui`·`brand-spelling` 범위 안이다. 마크다운으로 빼면 그 검사 밖으로 나간다 — 그것이 마크다운을 안 쓰는 이유 중 하나다 |
| 2026-09-16(`:2044`) — 뮤테이션을 되돌리는 `git checkout -- <디렉터리>`가 미커밋 작업을 함께 지웠다 | P4의 뮤테이션 확인에서 그 명령을 쓰지 않는다 |

## 8. 결정 기록

**2026-09-19 사용자 (`/feature` 1차 — 셋 다 추천안)**

| 항목 | 결정 | 반영된 곳 |
|---|---|---|
| 1. 수집 항목 표의 입도 | **등재는 필드별 1:1, 표는 접는다.** 절 id가 둘을 잇고, 대조 단위는 절 id다 | §2.2 (A)·(B) |
| 2. `effectiveDate`의 범위 | **선택 필드. `/privacy`만 쓰고 `/docs`는 안 쓴다** | §1 (a) |
| 3. 본문 해시 상수의 자리 | **테스트 파일** — `collected.ts`가 아니다 | §2.2 (C) |

**2026-09-19 사용자 (`/feature-review` — 전부 추천안)**

| 항목 | 결정 | 반영된 곳 |
|---|---|---|
| 4. 시행일 포맷터 | **새로 만들지 않는다.** `"2026-09-19"`를 그대로 보이고 `dateTime`에 같은 문자열 | §1 (a) |
| 5. 표의 스크롤 | **`scrollable` 기본값(`true`)** + `role="region" tabIndex` + `TableHead`(sticky 없음) + 불투명 헤더 + hover 제거 | §1 (b) |
| 6. 스키마 필드를 읽는 법 | **Prisma `ScalarFieldEnum` 타입.** (A)가 `pnpm typecheck`으로 내려가고 정규식 파서가 사라진다 | §2.2 (A) · §3 |
| 7. 게이트의 등재 단위 | **모델도 전수 등재.** `only?`를 버린다 | §2.2 (A) |
| 8. 본문↔시행일 커플링 | **`{ effectiveDate, digest }` 이력 배열.** 라벨은 `Effective date` 유지 | §2.2 (C) |
| 9. `docText`의 순수성 | **`renderToStaticMarkup` + 태그 제거** — jsdom을 안 부른다 | §2.2 (C) · §3 |
| 10. 절 목록과 id | **일곱, kebab-case 확정**: `collected`·`purposes`·`retention`·`third-parties`·`deletion`·`cookies`·`changes` | spec §3.1 · P3.1 |
| 11. ko 본문 | **en 단일.** 대가를 spec §6에 명시 | spec §6 |
| 12. Google 게시 | **완료 조건에서 뺀다.** P6 태스크로 남기고 판단은 L1.1이 든다 | spec §3 |
| 13. 문의 주소 | **개인 메일** — 구체 주소는 P3.1 착수 시 사람이 채운다 | P0.4 · P3.1 |
| 14. `/push` 트리거 | **CLAUDE.md에 무조건 박는다** (조건부 아님) | §2.3 · P5.1 |

**남은 열린 질문은 하나이고 조사로 닫힌다**: P0.2에서 외부 전송처가 GitHub·Google·Supabase·Vercel Blob **넷이 아닌 것으로 드러나면** spec §6의 "자동 허용목록 검사를 안 만든다"가 근거를 잃는다. 그때는 (A)와 같은 형으로 호스트 전수 등재를 추가한다.
