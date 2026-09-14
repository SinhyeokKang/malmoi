# ARCHITECTURE

**코어 로직(`lib/adapters/`·`lib/githash.ts`·`lib/github.ts`·`lib/github-connect/`·`lib/db.ts`·`lib/env.ts`·`lib/failure.ts`·`lib/scan/`·`lib/push/`·`lib/pull/`·`lib/keys/`·`lib/auth/`·`lib/cli/`·`lib/survey/`·`lib/onboarding/`·`lib/i18n/`·`lib/shell/`·`lib/home/`·`lib/settings/`·`lib/sync/`·`lib/credentials/`·`lib/session-revocation/`·`lib/login-link/`·`lib/account-connect/`·`lib/account/`·`lib/upload/`·`lib/projects/`·`lib/signin/`·`lib/routes.ts`·`lib/locale-code.ts`·`lib/relative-time.ts`·`lib/tone.ts`)을 건드리기 전에 읽는다** — ⚠️ **이 목록은 `.claude/commands/push.md` 4단계 트리거와 같아야 한다**(2026-09-13 전까지 세 곳이었고 실제로 셋이 갈렸다 — CLAUDE.md 쪽 사본을 없애 둘로 줄였다). ⚠️ **목록에 있다고 이 문서에 전용 절이 있는 것은 아니다** — `shell`·`home`·`settings`·`projects`·`signin`·`routes.ts`·`locale-code.ts`·`relative-time.ts`·`tone.ts`는 잎에 가까운 얕은 모듈이라 불변식이 **코드 주석과 [DIRECTORY.md](./DIRECTORY.md)**에 있고, 여기에 사본을 만들면 같은 규칙이 세 곳이 된다. 그 아홉을 건드릴 때 이 문서에서 볼 것은 §6.35(잎 모듈 규칙)다. 무엇을 만드는지는 [PRODUCT.md](./PRODUCT.md), 어떻게 작업하는지는 [../CLAUDE.md](../CLAUDE.md), 디렉터리별 "왜 이렇게 생겼나"는 [DIRECTORY.md](./DIRECTORY.md)다. 이 문서는 **불변식과 함정**만 다룬다.

> 코드가 아직 서지 않은 항목은 `(미구현)` 표시. 구현하면서 실제 동작과 어긋난 부분을 갱신한다.

## 0. 불변식 — 구현 내내 확인한다

**앞의 넷이 코어 엔진, 뒤의 일곱이 테넌시·보안이다.** 이 열하나가 이 코드베이스의 헌법이고,
여기서 파생되지 않는 복잡도는 전부 의심 대상이다. 

1. 번역 값은 DB, 소스 키와 로케일 존재 여부는 리포가 정본이다.
2. push 시점 외에는 리포 값과 DB 값을 비교해 **승자를 고르지 않는다**.
3. 키와 번역을 **삭제하지 않고** 비활성으로 보존한다.
4. 같은 DB 상태와 같은 원본 구조는 **같은 바이트**를 만든다.
5. 프로젝트를 식별하는 모든 DB 쿼리는 **인가된 `projectId`로 제한**한다.
   ⚠️ **"애플리케이션이 유일한 방어선"이라는 전제가 한때 거짓이었다** (2026-09-09, sec-audit 발견 8 —
   ARCHITECTURE §6.6·CLAUDE.md). Supabase의 데이터 API가 기본으로 켜져 있고 `public` default ACL이 `anon`에 전 권한을 줘서,
   이 불변식을 100% 지켜도 **앱을 통하지 않는 경로**가 열려 있었다. REVOKE로 닫았지만 `supabase_admin`
   소유 default ACL은 지울 수 없어 **대시보드로 만드는 테이블은 탐지에 의존한다.** 이 불변식은
   "앱 안의 쿼리"에 대한 것이고, "앱 밖의 경로가 없는가"는 CLAUDE.md의 Supabase 권한 절이 따로 답한다.
6. GitHub 사용자 OAuth와 App installation token의 **역할을 섞지 않는다**.
7. 로그인 provider가 아니라 **`ProjectMember`가 권한을 결정**한다.
8. **`ready`는 설정 저장이 아니라 최초 적재 성공**으로 판정한다.
9. **버린 값을 성공으로 숨기지 않는다** — 실패한 sync는 마지막 성공 상태를 전진시키지 않는다.
   ⚠️ **화면에 닿는 것까지가 이 불변식이다** (2026-09-07 추가, POSTMORTEM 2026-09-07): Server Action의
   결과를 인라인으로 보이는 컴포넌트는 **그 Action의 `revalidatePath`가 바꾸는 조건부 분기 안에 있어서는
   안 된다.** 실제로 `revalidatePath`가 readiness를 `ready`로 바꾸자 재시도 컴포넌트를 감싼 분기가 거짓이
   되어 "M건을 읽지 못했어요"가 한 프레임도 남지 않았다 — 판정은 옳았고 전달이 사라졌다.

10. **리포에 쓰는 경로는 서버가 정한다** — 외부 페이로드(`/api/push`)가 보낸 로케일 코드·
    `pathTemplate`은 **경로 조각**이고, 값이 아니라 경로로 취급해 검증한다 (2026-09-09 추가,
    sec-audit 발견 2). ⚠️ **`..`가 없어도 성립한다**: `pathTemplate: "{locale}"` +
    `locales: [".github/workflows/pwn"]`이면 설치 토큰이 그 워크플로를 커밋하고, 그 브랜치 push가
    **대상 리포의 secret과 함께** 그것을 실행시킨다. 판정은 `lib/locale-code.ts`의 잎 함수 둘이고
    **두 층에 건다** — 스키마 경계는 새 값을, `resolveLocalePaths`는 **경계가 서기 전에 저장된
    행**을 막는다(야간 cron이 읽는 것이 그 행이다).
11. **리포의 정체성은 이름이 아니라 `Project.repositoryId`다** — 이름은 주소일 뿐이라 재사용된다
    (2026-09-10 추가, sec-audit-2 발견 34). 리포를 리네임하고 같은 조직이 옛 이름으로 새 리포를
    만들면 GitHub의 redirect가 사라지고, 저장된 `repoOwner/repoName`이 **남의 리포**를 가리킨다 —
    그 리포가 public이면 이 프로젝트의 번역이 그대로 공개된다. ⚠️ **판정이 세 층에 걸린다**:
    installation 토큰을 그 id 하나로 좁히고(`createGitClient`), 쓰기 직전 `GET /repos`의 id를
    재대조하고, **화면도 이름보다 id를 먼저 본다**(`planConnectionHealth`의 `repo-replaced`).
    쓰기 층에만 두면 설정 화면이 초록인 채 Publish만 죽는다.

**판정을 어디에 두는가도 불변식에 붙는다** (§5.2의 연장, 2026-09-07): 판정은 순수 함수여야 하고,
**클라이언트가 읽는 판정은 잎 모듈이어야 한다.** `lib/onboarding/message.ts`를 클라이언트 컴포넌트가
읽으면서 `slug` → `lib/pull/trigger` → `lib/adapters` → `ts-morph`로 **7.2MB 청크**가 붙었고, 판정을
`lib/pull/ref-slug.ts`로 내려 끊었다. 상시 검사는 `components/__tests__/client-graph.test.ts`다.

## 0.5 자동 검증이 원리적으로 못 보는 층 — 실물 검증이 무엇을 잡나

**`pnpm test` 2,900건과 `tsc`가 green인데 사용자에게는 깨져 있는 부류가 넷이다.** 이 목록이
`/bugshot-qa`·`/l10n-roundtrip`이 따로 있는 이유이고, **각 항목은 한 번씩 실제로 프로덕션에 나갔다**
(개별 사고는 `docs/POSTMORTEM.md`, 그때 선 상시 방어선은 괄호 안).

| 층 | 무엇이 새나 | 잡는 수단 |
|---|---|---|
| **표현** | 값은 맞는데 **바이트가 다르다** — 들여쓰기·인용부호·이스케이프·키 순서. 어댑터 계약 테스트는 "값이 같은가"만 본다 | `/l10n-roundtrip` (재생성 어댑터를 고쳤으면 `i18n-order-check` — 그 리포가 표현 5축이 섞이도록 재포맷돼 있다) |
| **도달** | 판정은 옳은데 **문구가 화면에 안 닿는다** — `?e=`를 페이지가 안 읽거나, `revalidatePath`가 결과 Alert를 언마운트하거나, 죽은 라우트를 링크한다 | `/bugshot-qa` (`entry-points.test.ts`의 죽은 라우트 링크·쿼리 수신자 검사) |
| **번들** | import 그래프가 **서버 전용 모듈을 클라이언트로 끌고 온다**. 7.2MB 청크가 조용히 나갔다 | `components/__tests__/client-graph.test.ts` (그전엔 `@octokit`만 grep해 "트리 셰이킹이 뗐다"는 틀린 결론을 주석으로 남겼다) |
| **배선** | 코드가 아니라 **환경이 틀렸다** — preview가 session 모드(5432) pooler를 써서 `max clients reached`. 경고는 문서에 있었지만 배선에서 안 지켜졌고 부하가 낮아 오래 안 드러났다 | 실물 배포 + `/db` 5단계 |

⚠️ **공통점은 "값은 맞는데 사용자에게 도달하지 않는다"이고, 그래서 단언할 대상이 테스트에 없다.**
새 방어선을 세울 때 이 넷 중 어디에 해당하는지 먼저 고른다 — 소스 스캔으로 막을 수 있는 것(도달·번들)과
실물이 필요한 것(표현·배선)이 갈린다.

## 1. 적재·export와 결정성 (`lib/adapters/`)

**어댑터가 양방향이다** — 리포의 로케일 파일을 읽어 키를 적재하고, 편집된 값을 **같은 포맷으로** 되돌려준다. 크롬 `messages.json`으로 통일하지 않는 이유는 그게 불가능하기 때문이다: `chrome.i18n`은 키에 `[A-Za-z0-9_@]`만 허용하는데 조사한 4개 리포 중 3개가 점 표기를 쓴다.

| 어댑터 | 경로 | 리프 | `layout` | `writeStrategy` | 덮는 대상 |
|---|---|---|---|---|---|
| `chrome-locales` | `<root>/_locales/{locale}/messages.json` | `{message, description?}` | per-locale | regenerate | bugshot-2 (4키 × ko/en/fr), 오픈소스 34개 |
| `json-catalog` | `<dir>/{locale}.json` (flat 또는 중첩) | `string` | per-locale | regenerate | bugshot-web (104키 × 2, 중첩·배열), skillflo (**1446키 × 6**), 오픈소스 38개 |
| `ts-dict` | `<dir>/*.ts` (글롭 — 한 파일에 로케일 여러 개) | 문자열 리터럴 | **multi-locale** | surgical | bugshot-2 (**903키 × ko/en/fr**). ⚠️ **자동 탐지는 내용을 봐야 한다** — 경로만으로는 후보가 0이고 씨앗(`tsDictProbePaths`)이 파일을 내려받게 한다 (§1.9 판정 ③) |
| `yaml-catalog` | `<dir>/{locale}.y(a)ml` | 문자열 스칼라 | per-locale | **surgical** | 오픈소스 17개 (mastodon·decidim·directus·redmine·misskey) |
| `code-dict` | `<dir>/{locale}.{ts,tsx,js,mjs}` | 문자열 리터럴 | per-locale | **surgical** | 오픈소스 12개 (ant-design·element-plus·vuetify·payload) |

### ⚠️ `layout`과 `writeStrategy`는 별개 축이다 (2026-09-02 분리)

전에는 `layout` 하나가 둘을 겸했다 — `multi-locale`이면 수술적, `per-locale`이면 재생성. `yaml-catalog`·`code-dict`가 **`per-locale` + 수술적**이라 그 겸용이 깨졌다.

| 축 | 정하는 것 | 갈리는 지점 |
|---|---|---|
| `layout` | **경로 모양** | `resolveLocalePaths`(`{locale}` 치환 vs 글롭 매칭), `renderLocaleFiles`(로케일당 1회 vs 파일 × 로케일 이중 루프) |
| `writeStrategy` | **write 기계** | 원본 부재 시 처리, 빈 값 필터를 호출부가 지는지, 결정성 규칙(§1.1)을 적용받는지 |

**`layout`으로 "원본이 필요한가"를 판단하는 코드가 남아 있으면 낡은 것이다.** 그렇게 두면 YAML·코드 딕셔너리 프로젝트가 원본 없이 write에 들어가 `null`을 받고 **PR이 조용히 비어 나간다.**

**`layout`이 둘로 갈린다.** `per-locale`은 `pathTemplate`의 `{locale}`을 치환해 로케일당 파일 하나를 만들고, `multi-locale`(`ts-dict`)은 한 파일에 로케일이 여러 개라 `pathTemplate`이 글롭이고 **write를 파일별로 부른다.** 페이로드 검증이 `{locale}` 포함을 요구하지 않는 것은 이 때문이다.

### 1.1 재생성 writer가 지키는 불변식 (`lib/adapters/shared.ts`)

**같은 입력 → 언제나 바이트 단위로 같은 출력.** 깨지면 blob SHA 비교(§2)가 매번 "변경됨"을 뱉어 야간 cron이 무의미한 커밋을 쌓고 PR diff가 노이즈로 덮인다 — 조용히 망가지고 며칠 뒤에 발견되는 종류다.

⚠️ **아래 표는 `writeStrategy === "regenerate"`(`chrome-locales`·`json-catalog`)에만 적용된다.** 수술적 치환(`ts-dict`·`yaml-catalog`·`code-dict`)은 원본의 순서·빈 줄·주석을 보존하는 것이 요지라 정렬·재조립을 하지 않고 `orderedEntries`를 지나지 않는다 — §1.4를 따른다. **`layout`이 아니라 `writeStrategy`로 갈린다** — `yaml-catalog`은 `per-locale`인데도 이 표를 지나지 않는다.

계약 테스트가 `ADAPTERS`를 순회하며 이 매트릭스를 그대로 검사한다 — ⚠️ **판정과 순회가 파일 둘로 갈려 있다**: `lib/adapters/__tests__/contract.ts`는 `Adapter` **하나**를 받는 판정 헬퍼(`writerContractViolations`·`prototypeKeyViolations`)만 들고 `ADAPTERS`를 참조하지 않으며, 순회는 `contract.test.ts`가 한다. 어댑터를 추가하면 검사가 자동으로 늘고, 규칙을 어기는 가짜 어댑터를 잡는 네거티브 테스트가 검사기 자체를 지킨다. **`prototypeKeyViolations`가 프로토타입 키 계약을 `writeStrategy`와 무관하게** 전 어댑터에 건다 — 재생성은 flat·nested 두 갈래를 다 돈다(오염은 중첩 복원에서, 키 소실은 flat 대입에서 난다).

| 규칙 | 값 | 깨지는 방식 |
|---|---|---|
| 키 정렬 | **`LocaleEntry.order` 오름차순, 없으면 `<` 비교** (UTF-16 코드 유닛). 동률은 키로 가른다 | 세 가지로 깨진다. ① `localeCompare`는 Node ICU 빌드·로케일에 따라 순서가 달라져 불변식이 실행 환경에 묶인다. ② 동률을 배열 위치로 가르면 **DB 조회 순서가 바이트에 샌다**. ③ `if (e.order)`로 보면 **0이 falsy라 파일의 첫 키가 맨 뒤로 밀린다** |
| 재조립 | 정렬한 순서로 객체를 새로 만든다. **중첩은 각 층이 `setDeep`의 삽입 순서를 그대로 쓴다** | `JSON.stringify`는 삽입 순서를 따르고, Postgres는 `ORDER BY` 없는 쿼리의 순서를 보장하지 않는다. **각 층을 마지막에 다시 정렬하면 최상위를 고쳐도 하위 층이 통째로 재정렬된다** — diff 비율은 낮은데 hunk가 수십 개가 되는 모양이라 지표로는 안 잡힌다 |
| 들여쓰기 | **원본 폭**, 없으면 2칸 | 2026-09-04 개정 (§14). `observeJsonStyle`이 원본 첫 들여쓴 줄에서 읽고 `serializeJson`이 그 폭으로 낸다. **원본이 없으면 2칸** — 재생성은 원본 없이도 파일을 만들어야 한다(신규 로케일). 고정점이 이 축의 안전 근거다: 우리가 낸 파일을 재관측하면 같은 폭이 나온다. ⚠️ **관측이 끝까지 못 가면 들여쓰기만 남기고 이스케이프 두 축과 `compactPaths`를 버린다** — 반쯤 관측한 표현으로 쓰면 원본과 어긋난 파일이 나간다 |
| 한 줄 컨테이너 (⚠️ 루트 레벨은 **절대** 한 줄로 쓰지 않는다 — 파일 전체가 한 줄이 된다) | **원본에서 한 줄이던 경로만** 한 줄 | 2026-09-04 추가 (§14, 태스크 1b). chrome `_locales`의 `"k": { "message": … }`가 흔한 관례라 펼치면 **순서가 완벽해도 파일 전체가 diff**다(button-stealer 실측 0.964). `JsonStyle.compactPaths`가 그 경로를 든다 — **키는 세그먼트 배열이다**: `.` 조인이면 `{"a.b": [...]}`와 `{"a": {"b": [...]}}`가 같은 키가 되어 엉뚱한 컨테이너가 한 줄로 나간다 |
| 비ASCII | **원본이 `\uXXXX`였으면 그대로** | 2026-09-04 추가 (§14, 태스크 1b). `JSON.stringify`는 비ASCII를 풀어 쓰므로 그 줄 전부가 diff였다. ⚠️ **관측이 문자열 리터럴 안에서 일어나야 한다** — 전역 정규식으로 보면 DB 값이 담은 리터럴 `\u00e9`(여섯 글자)를 이스케이프로 오독하고, 재관측이 `false` → `true`로 뒤집혀 **2차 write가 1차와 달라진다**. 대문자 헥사는 소문자로 한 번 정규화되고 그다음이 고정점이다 |
| 엔트리 필드 순서 | **원본 다수결**, 동률·관측 불가면 `message`→`description`→`placeholders` | 2026-09-04 추가 (§16, chrome 전용). Midnight-Lizard가 전 엔트리를 `description` 먼저 쓰는데 우리가 반대로 내 diff **0.456**이었다. `dominantFieldOrder`가 원본 텍스트의 함수이고 우리 출력이 균일해지므로 2차 관측이 같은 답을 낸다 — `dominantQuote`와 같은 논증(§1.4) |
| 슬래시 | **원본이 `\/`였으면 그대로** | 2026-09-04 추가 (§16). 합법이지만 **선택적인** JSON 이스케이프라 `JSON.stringify`가 절대 안 낸다. 관측은 비ASCII 축과 같은 문자열 리더 안에 있고 같은 함정을 공유한다 — 값이 리터럴 백슬래시-슬래시를 담으면 재관측이 뒤집힌다 |
| 끝 개행 | 정확히 1개 | `JSON.stringify`는 개행을 안 붙인다. 2개면 SHA가 달라진다 |
| `orphaned` | 제외 | DB엔 남는다 — export에서만 빠진다. **`orderedEntries`가 유일한 관문이라 모든 재생성 writer가 이걸 지나야 불변식에 주인이 생긴다** |
| 미번역 | 제외 (빈 문자열 포함) | 남기면 크롬이 빈 값을 그대로 렌더한다. 빼면 폴백한다 |
| 낼 것 0개 | `null` — 파일을 내지 않는다 | 빈 `{}`는 "이 로케일 지원함"으로 읽혀 빈 UI를 보인다 |
| 키 대입 | **프로토타입 없는 객체**(`Object.create(null)`)에만 대입한다 | 2026-09-09 추가 (sec-audit 발견 1·17). 로케일 파일의 키는 남이 쓰므로 `__proto__`가 온다. 평범한 `{}`에서 `out["__proto__"] = v`는 setter를 불러 own property를 안 만들고 **그 키가 조용히 사라지고**, 중첩 복원의 `node[head]` 조회는 `Object.prototype`을 돌려줘 다음 세그먼트가 **거기에 앉는다** — 프로세스 전역이라 같은 인스턴스가 서비스하는 **다른 테넌트**의 pull까지 바꾼다. ⚠️ **재조립 자리도 같다** — `normalizeArrays`가 평범한 `{}`로 되돌리면 `setDeep`이 지킨 키가 한 줄 뒤에 사라진다. 검사는 `prototypeKeyViolations`(`ADAPTERS` 전수) |

**⚠️ 정렬 지점보다 먼저 볼 것은 값이 흐르는 경로 넷이다** (2026-09-03). `StringKey.sortIndex`가
`LocaleEntry.order`까지 가려면 이 넷을 지나고, **하나만 끊겨도 `orderedEntries`가 코드 유닛
폴백으로 떨어져 전 계층의 단위 테스트가 green인 채 기능만 멎는다:**

| # | 위치 | 나르는 것 |
|---|---|---|
| a | `lib/pull/load.ts`의 `select` | `sortIndex` + `translations`의 `description`·`placeholders` |
| b | `lib/pull/render.ts`의 `RenderKey` | 같은 셋 (`cells`에 로케일별 두 필드) |
| c | `lib/pull/plan.ts`의 `PullRow` | 같은 셋 |
| d | `buildWriteEntries` | `sortIndex → order`. **writer에 넘길 entries의 유일한 관문**이다 |

**`lib/pull/__tests__/entry-order.test.ts`가 이 넷을 한꺼번에 지킨다** — `runPull`이 커밋에 실은
파일 바이트를 보므로 어느 홉이 끊겨도 red다. 픽스처를 **일부러 코드 유닛 순이 아니게** 둔 것이
그 판별력의 조건이다: 코드 유닛 순이면 폴백이 정답을 내서 배선이 끊겨도 통과한다.

**⚠️ 순서를 고칠 때 봐야 할 지점이 여섯이다** (2026-09-03). 한 곳만 고치면 조용히 무효가 된다:

| # | 위치 | 성질 |
|---|---|---|
| 1 | `lib/pull/load.ts` `orderBy` | DB 조회 순서. 결정성의 근거가 아니라 **가독성**이다 — `orderedEntries`가 전순서를 만든다 |
| 2 | `lib/adapters/shared.ts` `orderedEntries` | 재생성 writer 전부가 지나는 **유일한 관문** |
| 3 | `lib/adapters/json-catalog.ts` `normalizeArrays`의 마지막 줄 | 중첩 **각 층**. 여기서 다시 정렬하면 #2를 고쳐도 하위 층이 재정렬된다 |
| 4 | 같은 함수의 `isDense` 분기 | 배열 인덱스. **#3은 #4와 별개가 아니라 그 본문 안에 있다** |
| 5 | `yaml-catalog.ts` · `code-dict.ts`의 `missing.sort(compareKeys)` | 수술적 어댑터가 **없는 키를 삽입할 때**. `orderedEntries`를 안 지나지만 정렬 규칙을 공유한다 — **닿으면 회귀다** |
| 6 | 정수형 키 hoisting | `"0"`·`"10"`은 JS 객체가 앞으로 끌어올린다. `.sort(`로 grep해도 안 나오고 **직렬화를 직접 짜지 않는 한 보존 불가**다. ⚠️ **탐지기는 생겼다** — `scanJson.integerKeys`·`isCanonicalIndex`(`json-style.ts`). `normalizeArrays`의 `isDense`와 **다른 판정**이다(#4와 혼동하기 쉬운 자리) |

**`orderBy: { key: "asc" }`는 이제 `lib/keys/query.ts` 한 곳이다** — 편집 UI의 **SQL 기준 순서**다. `lib/pull/load.ts`는 `[{ sortIndex: "asc" }, { key: "asc" }]`로 바뀌었고 `entry-order.test.ts`가 옛 형태의 부재를 단언한다. grep하면 둘 다 잡히므로 어느 쪽인지 이름으로 확인한다.

⚠️ **그것이 화면 순서의 유일한 출처는 아니다** (2026-09-11, 8-4). 그 위에 층이 둘 더 있고 둘 다 `lib/keys/view.ts`에 있다 — `pendingFirst`(남은 일을 앞으로 내는 **안정 분할**이라 그룹 안 상대 순서는 보존된다) · `groupByNamespace`(섹션 배열). ⚠️ **뒤엣것은 `rows` 순서를 일부러 안 쓰고 `counts` 순서를 받는다**: `rows`의 출처는 `loadKeys`의 `orderBy`(**Postgres collation**)인데 집계·드롭다운이 쓰는 것은 `compareKeys`(**UTF-16 코드 유닛**)라 **둘이 같다는 보장이 없다** — `rows`로 섹션을 세우면 **섹션 헤딩 순서 ≠ 드롭다운 순서**가 된다. 이 절의 "`localeCompare` 금지"와 같은 축이다: 순서의 자가 둘이면 어느 쪽이 정본인지 코드가 말해야 한다.

```
grep -n "orderBy\|compareKeys\|\.sort(" lib/pull/*.ts lib/adapters/*.ts lib/keys/*.ts
```

**이 여섯을 지키는 테스트가 셋이다** . 순서를 고칠 때 셋 다 red가 아니면 **고친 층이 프로덕션 경로가 아니었을 가능성**을 먼저 의심한다:

| 층 | 파일 | 잡는 것 |
|---|---|---|
| **L1 진입점** | `lib/pull/__tests__/entry-order.test.ts` | `runPull`이 **커밋에 실은 파일 내용**. 값 전달 4홉 중 하나만 끊겨도 red다 — 어댑터·render 단위 테스트는 전부 green인 채 기능만 멎는 층이다. `orderBy` 두 곳도 여기서 갈린다 |
| **L2 골든 픽스처** | `lib/adapters/__tests__/key-order-golden.test.ts` | 실측 리포 모양에서 첫 write가 **바이트 동일**인지. `lib/survey/diff.ts`의 **프로덕션 함수**로 재므로 코퍼스 지표와 같은 자다 |
| **L3 재측정** | 규칙 (CLAUDE.md 문서 신선도 + `/push` 4d) | 일반화 — 처음 보는 리포에서도 그런가. 네트워크 ~4분이라 게이트가 아니라 판단 지점이다 |

⚠️ **L2가 없으면 완료 조건의 diff 수치가 한 번 재고 끝난다.** `pnpm adapter-survey`는 캐시가 없어 `pnpm test`에도 CI에도 못 들어가므로, 그 수치를 오프라인 단언으로 내리지 않으면 다음 날 `orderedEntries`를 되돌려도 아무 게이트도 안 빨개진다.

**중첩 구조는 write에서 복원한다.** 평탄화만 하고 복원하지 않으면 읽은 포맷과 다른 모양으로 되돌려주게 되어 왕복이 깨진다. 배열은 인덱스 키(`hero.subcopy.0`)로 펼치고, `0..n`이 빈틈없이 채워진 객체만 배열로 되돌린다 — 빈틈이 있으면 객체로 남긴다(배열로 만들면 구멍이 `null`로 직렬화되어 원본에 없던 값이 파일에 나타난다).

**`description`은 로케일마다 그 파일이 실제로 갖고 있던 값을 되돌린다** (2026-09-03 개정 — PoC 시절 개정. 지원하는 어댑터는 `chrome-locales`뿐이고 `json-catalog`은 담을 곳이 없어 DB엔 남지만 파일로 나가지 않는다). 전엔 base에만 냈고 그건 chrome 리포 33개 중 **20개**에서 손실이었다(비-base `description` 실측).

두 값은 **다른 것이다**: `StringKey.description`(소스 키 메타데이터, base 파일에서 온다)과 `Translation.description`(그 로케일 파일이 갖고 있던 값). 합치면 base 값을 비-base에 복제하게 되고 그건 병합이다. **base만** `Translation.description`이 없을 때 `StringKey.description`으로 폴백한다 — `value ?? sourceText`와 같은 축이고, 그 판정은 `lib/pull/render.ts`의 `rowsForLocale(keys, locale, { isBase })`에 있다. ⚠️ **두 폴백의 범위가 2026-09-09에 갈렸다**: 값 폴백은 **빈 문자열까지** 잡고(base 셀을 비우면 그 키가 base 파일에서 빠져 다음 push가 **전 로케일에서 orphan**한다 — 그 파일이 키 집합의 진실이므로 "미번역"이 아니라 **키 삭제**다), description 폴백은 빈 문자열을 잡지 않는다(description은 키 집합이 아니라 메타데이터라 빠져도 키가 사라지지 않는다). **판정 기준은 "그 값이 없으면 키가 사라지는가"다.** ⚠️ 그 `isBase`가 `renderLocaleFiles`에서 빠져 있어 폴백이 **테스트에서만 켜지고 프로덕션에서는 죽어 있었다** (2026-09-04 audit #2 — `rowsForLocale` 단위 테스트가 `{ isBase: true }`를 직접 넘겨 이 홉을 못 봤다. 지금은 `render.test.ts`가 `renderLocaleFiles`를 통째로 지난다).
⚠️ **그 판정은 `render.ts`에만 있어야 한다.** `chrome-locales.write`가 계약(`WriteInput`)에 없는 `isBase`를 필수 파라미터로 들고 있었는데(옛 가드의 잔재), 메서드 파라미터가 **양변성**이라 타입 검사가 침묵했고 호출부가 갈렸다 — `render.ts`는 안 넘기고 `lib/survey/one.ts`는 넘겼다. 본문이 그 값을 안 읽어 우연히 무해했을 뿐, **읽기 시작하면 지표와 프로덕션이 다른 바이트를 낸다.** 2026-09-07에 계약대로 돌렸고 `lib/adapters/__tests__/write-contract.test.ts`가 다섯 어댑터가 `WriteInput`을 **이름으로** 받는지 소스로 센다 (POSTMORTEM 2026-09-07).

**`placeholders`는 chrome에서 그대로 왕복한다** (2026-09-03). `LocaleEntry.placeholders`가 원본 JSON을 **해석하지 않고** 나르고 write가 그대로 되돌린다. 모양이 이상해도 버리지 않는다 — 거르면 원본에 있던 것이 우리 PR에서 조용히 사라지고, 에러로 보고하면 read 에러가 `push:local`을 막아 남의 리포가 우리 규칙으로 실패한다. ⚠️ **왕복 의미 게이트가 이 필드를 원리적으로 못 본다** — 바이트 비교만이 그물이다.

**실물 검증 (2026-09-01)**: bugshot-2 사본에 907키 × 3로케일을 전면 편집해 pull을 돌린 결과 8파일 **`+2745/-2745`** — 줄이 하나도 추가·삭제되지 않았다. `+N/-N` 대칭이 수술적 치환의 증거다: 그 방식에서는 빈 줄·주석이 사라지면 **줄 수가 줄어** 비대칭이 나므로, 대칭이면 잉여가 살아남았다는 뜻이다.

⚠️ **이 신호를 재생성 어댑터로 옮겨오지 않는다.** JSON에는 그 잉여가 없어서 재정렬이 줄을 *이동*시킬 뿐 추가·삭제하지 않는다 — 300키를 값 변경 0으로 전면 재정렬해도 `270 insertions(+), 270 deletions(-)`가 나온다(실측). 재생성에서 순서 보존을 확인하려면 **편집 0건으로 pull해 `0 files changed`를 보고**, 그다음 **키 몇 개만 편집해 변경 줄 수와 hunk 수가 그 키 수와 맞는지** 본다. 그 상태에서 **대상 리포의 `tsc`가 통과**하고 주석·빈 줄·파일 끝 개행이 보존됐다 — 이스케이프가 깨졌으면 여기서 잡힌다. **단위 테스트가 원리적으로 못 보는 층이므로 이 확인을 대체할 수단이 없다.**

### 1.2 왕복의 판정 기준은 바이트가 아니라 의미다

**바이트 차이는 정상이다** — 원본 파일이 우리 정렬 규칙을 따르고 있을 이유가 없다. 실제로 조사한 3개 리포 11개 파일 전부 바이트가 다르고 **의미는 전부 같다.** 첫 pull에서 한 번 정규화되고 그 뒤로는 안정된다.

**의미가 다르면 데이터 손실이므로 실패다.** `pnpm ingest <dir>`가 두 판정을 따로 보고한다.

### 1.3 포맷 탐지는 경로만으로 안 된다

`detect`는 리포 파일 경로 목록에서 포맷을 찾는다. **경로 사전순으로 후보를 고르면 틀린다** — bugshot-web에서 `public/search/{locale}.json`(검색 인덱스, 최상위가 배열)이 `src/lib/i18n/{locale}.json`보다 먼저 잡혔다.

- 후보를 **i18n 계열 경로 신호 → 예제·픽스처 디렉터리 감점 → 로케일 개수 → 경로 모양 → 얕은 경로 → 경로순**으로 순위 매긴다. 비교 함수는 `shared.compareTemplates` **하나**이고 어댑터 내부와 어댑터 간이 그것을 공유한다
- **로케일이 2개 이상**이고 **강한 로케일 코드가 하나 이상**인 후보만 인정한다 (하나뿐이면 `config/en.json` 같은 우연일 수 있다)
- `probe` 콜백을 주면 후보 파일 **여러 개**를 읽어 카탈로그 모양인지 확인한다. **GitHub API에서는 블롭 읽기가 요청 비용**이라 경로로 좁힌 뒤 그 후보만 확인하도록 콜백으로 받는다
- **`detectCandidates`가 후보 전부를 순위순으로 낸다.** `detect`는 그 `[0]`이다 — 두 함수가 같은 관문을 지나므로 어긋날 수 없고, 1순위가 틀렸을 때 정답이 몇 순위였는지를 관측할 수 있는 것은 이쪽뿐이다. **2026-09-14부터 예외가 0이다** — `ts-dict`가 자동 탐지에 들어오면서 다섯이 같은 계약을 진다. 단 그 어댑터는 **probe가 없으면 `[]`** 이고(경로만으로는 판단하지 않는다), 예외가 생기면 `detect-candidates.test.ts`가 red다

#### ⚠️ 예제·픽스처 디렉터리가 진짜 카탈로그를 가린다 (2026-09-02 실측)

오픈소스 109개에서 오탐 4건 중 **2건이 `examples/` 아래**였다:

| 리포 | 1순위로 잡은 것 | 진짜 |
|---|---|---|
| lokalise/i18n-ally | `examples/by-frameworks/chrome-extension/_locales/…` | `locales/{locale}.json` (2순위) |
| payloadcms/payload | `examples/localization/src/i18n/messages/{locale}.json` | `packages/translations/src/languages/{locale}.ts` |

`examples`·`example`·`fixtures`·`__fixtures__`·`demo`·`playground`·`sample(s)`·`test(s)`·`__tests__`·`docs`·`.dumi`·`storybook`·`node_modules`를 경로에 포함하는 후보는 **뒤로 밀린다.** 배제가 아니라 감점이다 — 진짜로 그 디렉터리에만 카탈로그가 있는 리포(예제 모음 자체가 산출물인 경우)를 못 잡으면 안 된다.

#### ⚠️ `catalogVerdict`의 전신은 샘플 하나로 리포 전체를 버렸다 (2026-09-02 실측)

규칙의 주인은 `catalogVerdict`·`verdictFromValues`·`sampleOrder`·`verifySamples`(`lib/adapters/shared.ts`)다 — `looksLikeCatalog`은 그 3값 결과를 boolean으로 접기만 하는 `@deprecated` 껍데기이고(**`lib`·`app`·`scripts`에서 import 0** — 남겨 둔 이름이다), 온보딩(`lib/onboarding/detect.ts`)이 참조하는 이름도 앞쪽이다. ⚠️ **온보딩 판정층이 사전을 문다** (2026-09-08) — `detect.ts`·`message.ts` **둘**이 `@/lib/i18n`의 `m`을 읽고(⚠️ `readiness.ts`는 8-3부터 **잎이다** — 문구 판정이 `lib/projects/list.ts`의 `projectStatus`로 갔다, §6.35), `formatLabel`의 라벨 표가 `m.newProject.formats satisfies Record<AdapterName, …>`로 서 있다. 즉 "어댑터를 추가하면 컴파일 에러"라는 성질이 **사전 키 유무**에 걸려 있다. 사전은 잎이라 무게가 없다(§6.35).

지원 포맷인데 탐지 실패한 4건 중 **셋이 같은 구조**에서 나왔다. probe가 **정렬상 첫 로케일 하나**만 읽는데, 그 첫 로케일이 체계적으로 **가장 덜 관리된 파일**이다:

| 리포 | 샘플 | 떨어진 이유 |
|---|---|---|
| esmBot/esmBot (26로케일) | `locales/bg.json` | 내용이 `{}` — 빈 스텁 |
| jsxc/jsxc (30로케일) | `locales/ar.json` | 최상위에 `"Notifications": null` |
| scratchblocks (78로케일) | `locales/ab.json` | 최상위에 `percentTranslated`(숫자) |

세 규칙으로 완화한다:

1. **샘플을 최대 3개 본다** — base 후보(`en`)를 먼저, 그다음 정렬순. **하나라도** 카탈로그면 통과다. 로케일이 많은 카탈로그에 빈 스텁이 섞이는 건 정상이다.
2. **빈 객체는 판정 보류**다 — "카탈로그 아님"이 아니라 "정보 없음"이다. 다음 샘플을 본다.
3. **최상위 비문자열·비객체 값을 소수 허용**한다(`null`·숫자·불린). `percentTranslated`·`Notifications: null` 같은 메타데이터가 섞이는 건 흔하다. **문자열·객체 리프가 하나라도 있고 그것이 과반이면** 카탈로그로 본다.

`read`는 그대로 엄격하다 — 그 값들은 여전히 `errors`(leaf-type)로 보고된다. 완화한 것은 **탐지 관문뿐**이다.
- **`nested`는 `detect`가 알 수 없다** — 내용의 성질이므로 `read`가 관측해 `ReadResult.nested`로 돌려주고, 호출부가 write 전에 `DetectedFormat.nested`에 실어준다

#### ⚠️ `ts-dict`는 2026-09-02에 자동 탐지에서 빠졌다가 2026-09-14에 돌아왔다

**뺐던 이유**: 오픈소스 109개에서 후보에 **0회** 올랐고, 코드 딕셔너리를 쓰는 12개 리포는 **전부 로케일당 파일 하나**(`code-dict`)였다 — "한 파일에 로케일 여러 개"는 bugshot-2의 관례이지 생태계의 관례가 아니다. 남겨두는 대가가 `.ts` 디렉터리마다 ts-morph를 돌리는 probe 비용뿐이라 뺐다.

**되돌린 이유**: 그 대가를 실물이 냈다 — bugshot-2의 온보딩 ②에 **4키 `_locales`만** 뜨고 903키 딕셔너리는 목록에 없었다. 명시 지정은 **그 포맷을 아는 사람에게만** 길이고, PRODUCT §7.3이 그 상황을 *"작은 `_locales`(4키)가 실제 UI 딕셔너리(903키)를 가렸고 조용히 작은 쪽으로 떨어져 에러가 나지 않았다"* 로 이미 적어 두고 있었다.

**지금 모양**: `detectCandidates`가 `detectByContent`를 그대로 부르고, **probe가 없으면 빈 배열**이다(경로만으로는 판단하지 않는다). 1패스에서 내려받을 파일은 `tsDictProbePaths`가 경로만 보고 고른다 — `I18N_HINT` 통과 · 곁가지 제외 · **파일이 많은 디렉터리 2개 × 8파일**. 판정은 내용이 하므로 씨앗에 들어온 디렉터리도 로케일 객체가 하나뿐이면 스스로 떨어진다(bugshot-2의 `src/i18n/`이 그 예다).

**`--adapter ts-dict` / `Project.adapterName = "ts-dict"` 명시 지정은 그대로 동작한다** — 워크플로 YAML이 이 포맷에만 어댑터를 고정하는 이유도 그대로다: 1순위가 그것이라는 보장이 없다(bugshot-2는 `_locales`가 크롬 버킷이라 언제나 앞선다).

**base 로케일의 기본값은 추정이고 정본은 사용자 확정이다** (2026-09-07, SaaS 5단계). `pickBaseLocale`(`en` 우선, 없으면 사전순 첫 번째)이 **후보 화면의 기본값**을 주고, 온보딩이 키 수와 함께 보여 사용자가 고른 값을 `lib/onboarding/confirm.ts`가 재검증해(`base-locale-missing`) `Project.baseLocale`에 저장한다. push는 `input.baseLocale ?? pickBaseLocale(...)`로 명시값을 우선한다.

#### ⚠️ 경로 모양이 셋이고, `layout`·`writeStrategy`와 또 다른 축이다 (2026-09-02 3차 실측)

홀드아웃 20개 중 **9개**가 아래 두 새 모양이었다. **read·write가 완전히 같고 `pathTemplate`만 다르므로 어댑터를 새로 만들지 않았다** — `json-catalog`·`yaml-catalog`의 **탐지만** 넓혔다.

| 모양 | 어댑터 | `localeFromPath` |
|---|---|---|
| `{dir}/{locale}.<ext>` | 전부 | 접두 `{dir}/`, 접미 `.<ext>` |
| `{dir}/{locale}/<name>.json` | `json-catalog` | 접두 `{dir}/`, 접미 `/<name>.json` |
| `{dir}/<prefix><sep>{locale}.<ext>` | `json-catalog`·`yaml-catalog` | 접두 `{dir}/<prefix><sep>`, 접미 `.<ext>` |

`localeFromPath`가 템플릿의 `{locale}` 앞뒤를 접두·접미로 쪼개는 방식이라 **세 모양 모두 코드 변경 없이 역산된다**(`/`를 품으면 거부하므로 로케일 디렉터리 형태도 안전하다). `chrome-locales`가 애초에 둘째 모양의 특수 사례(`_locales/{locale}/messages.json`)이고, 리프가 `{ message, description }` 객체라 별 어댑터로 남는다.

세 가지 함정:

1. **로케일 디렉터리 형태만 경로에 i18n 신호를 요구한다.** 디렉터리 이름이 로케일처럼 보이는 일이 파일 이름보다 훨씬 흔하다 — n8n의 `packages/@n8n/{ai,di,db}/package.json`이 4로케일 후보로 1순위가 됐다. 실측에서 이 형태의 진짜 카탈로그 7개는 **전부** 경로에 `locale(s)`·`i18n`을 갖는다. 편향이 한 방향이라 과소 탐지일 뿐 오탐을 만들지 않는다.
2. **로케일 디렉터리에 파일이 여럿이면 디렉터리당 하나만 낸다** (`PRIMARY_NAMES` = `translation`·`translations`·`common`·`messages`·`default`, 그다음 로케일 수, 그다음 알파벳순). 알파벳순만 쓰면 zulip이 `legacy_stream_translations.json`을, automa가 `blocks.json`을 집는다. `Project`가 포맷을 하나만 들기 때문이고, Ghost의 네임스페이스 5개 중 1개만 덮는 것은 그 대가다.
3. **접두사는 오른쪽 구분자부터 시도한다** (`shared.splitLocaleSuffix`). `client.bs_BA`는 마지막 `_`에서 자르면 `BA`(대문자라 탈락)이고 그다음 `.`에서 `bs_BA`가 나온다 — 왼쪽부터 자르면 `bs_BA`를 `_`로 다시 쪼갠다.

#### ⚠️ 맨 3글자 이름은 로케일 앵커가 되지 못한다 (2026-09-02 3차 실측)

`looksLikeLocale`이 `[a-z]{2,3}`을 받는데 3글자 영단어와 정면으로 충돌한다. 홀드아웃 오탐 4건 중 2건이 이것이었다:

| 리포 | 1순위로 잡은 것 | "로케일" |
|---|---|---|
| grafana/grafana | `public/app/plugins/datasource/azuremonitor/dashboards/{locale}.json` (대시보드 정의, read 에러 1,799) | `adx`·`arg` |
| n8n-io/n8n | `packages/nodes-base/nodes/Jira/__schema__/v1.0.0/issueAttachment/{locale}.json` (JSON 스키마) | `add`·`get` |

**자동 탐지에 참여하는 **다섯** 어댑터의 후보 그룹이 `hasStrongLocale`을 통과해야 한다** (⚠️ `ts-dict`는 2026-09-14에 들어왔다 — 그 전까지 이 관문 밖이었고, 들어오자마자 `fmt`·`map` 같은 유틸 상수가 로케일로 잡혔다) — 2글자(`en`)·지역 서브태그(`zh-CN`·`fil-PH`)·camelCase(`koKR`) 중 하나가 그룹에 있어야 한다. 3글자 로케일(`fil`·`ceb`)을 버리는 게 아니라 **강한 것 옆에 있을 것**만 요구한다: 실제 카탈로그는 거의 항상 `en` 옆에 있고, 우연히 모인 3글자 영단어 디렉터리에는 그게 없다. **모든 어댑터의 그룹 필터가 이 규칙을 지난다.**

#### ⚠️ 순위 픽스는 파이프라인의 **마지막** 층에 넣어야 한다 (2026-09-02 3차)

`detectCandidatesAcross`(`lib/adapters/index.ts`)가 어댑터가 낸 순서를 **전부 버리고 다시 정렬한다.** 그래서 어댑터 안(`rankTemplateCandidates`)에만 넣은 픽스는 명시 지정 경로에서만 살아 있고 자동 탐지에서는 죽는다 — `liftAncestors`가 정확히 그 상태로 단위 테스트만 통과했다 (POSTMORTEM 2026-09-02).

두 규칙이 그 파이프라인에 있다:

- **`templateShapeRank`** — 다른 신호가 같으면 맨 로케일 파일 > 로케일 디렉터리 > 접두사. rubygems.org의 `config/locales/avo.{locale}.yml`이 앱 카탈로그를 이긴 것이 근거다(마지막 tiebreak인 경로 사전순에서 `a` < `{`). **로케일 수보다 뒤에 둔다** — 앞에 두면 discourse의 1키 테마 카탈로그가 진짜를 이긴다.
- **`liftAncestors`** — 1순위의 **조상 디렉터리**에 있는 후보를 앞으로 끌어올린다. DMPRoadmap/roadmap의 `config/locales/contact_us/contact_us.{locale}.yml`(17로케일 · 11키)이 `config/locales/{locale}.yml`(15로케일)을 이겼고, 자손 쪽 로케일 수가 실제로 더 많아 수 신호로는 안 뒤집힌다. **비교 함수가 아니라 정렬 뒤 후처리다** — "조상이 이긴다"가 추이적이지 않아 `sort`에 넣으면 결과가 구현 정의가 된다. 버킷별로 적용하므로 크롬 최우선은 그대로다.

**고치지 못한 것 하나**: discourse의 `plugins/discourse-cakeday/config/locales/client.{locale}.yml`(27키)이 정본을 누른다. 플러그인 쪽 로케일 파일이 하나 더 많고(50 vs 49) 다른 서브트리라 두 규칙 모두 닿지 않는다. `plugins/` 감점을 넣으면 잡히지만 **관측 1건이라 만들지 않았다** — Ghost·payload가 `packages/`에 진짜 카탈로그를 두므로 "하위 디렉터리 감점"으로 일반화할 수도 없다.

### 1.35 ⚠️ 키에 `.`이 들어 있으면 중첩 복원이 값을 삼킨다 (2026-09-02 실측)

**`json-catalog`의 유일한 데이터 손실 경로다.** 오픈소스 109개에서 왕복 의미 불일치 2건이 났고, 둘 다 **`read` 에러가 0**이었다 — CI 게이트도, 에러 카운터도 잡지 못하고 값만 사라진다.

| 리포 | 손실 | 형태 |
|---|---|---|
| siyuan-note/siyuan | 2,636키 중 1키 | 중첩 객체 안의 키가 점을 품어 `_taskAction.task.database`(문자열)와 `…database.index`가 공존 |
| sugarlabs/musicblocks | 84로케일 중 **81개**에서 각 4키 | `"Clear workspace"`와 `"Clear workspace."`(끝점)가 나란히 있다 |

**뿌리는 하나다: `.`가 우리 조인 구분자이면서 실제 키에 들어 있는 문자다.** ⚠️ **그 구분자의 주인은 `lib/adapters/json-style.ts`의 `KEY_SEP` 하나다** (2026-09-04 감사 #22 — 지역 `const SEP` 네 벌을 대체했다). 주인을 모르면 다음 수정이 지역 사본을 정당하게 되살린다. `flatten`/`setDeep` 쌍이 단사가 아니라, 한 키가 다른 키의 점 경계 접두이면 복원에서 문자열 자리가 객체로 덮인다.

증폭 요인 둘을 함께 고쳤다:

- **`ReadResult.nested`가 포맷 단위 boolean이었다.** musicblocks의 `th.json`은 최상위가 전부 문자열인데 **다른 로케일 파일** 하나에 객체가 있어서 포맷 전체가 nested로 판정되고, th.json의 평평한 키까지 `.`으로 쪼개졌다. → **파일 단위로 관측한다** (`ReadResult.nestedByPath`).
  - ⚠️ **이 수정이 프로덕션 경로에 닿기까지 홉이 넷 더 있었다** (2026-09-04 해소). 고친 직후엔 어댑터·survey만 `nestedByPath`를 썼고 push 페이로드·`Project`·`formatFromProject`는 포맷 단위 boolean만 날라서 **프로덕션 pull이 옛 동작이었다** — `json-catalog.write`가 `nestedByPath` 부재 시 그 boolean으로 폴백하므로 조용했다. 지금은 다섯 지점이 이어져 있고, **하나만 끊겨도 진입점 테스트가 red다**:

| # | 위치 | 나르는 것 |
|---|---|---|
| a | `json-catalog.read` | `ReadResult.nestedByPath` (파일별 관측) |
| b | `buildPushPayload` | `format.nestedByPath` — 없으면 **필드를 만들지 않는다**(빈 객체는 "전부 flat"으로 읽힌다) |
| c | `applyPush` | `Project.nestedByPath Json?` (마이그레이션 `_add_project_nested_by_path`) |
| d | `loadPullState`의 `select` → `formatFromProject` | `DetectedFormat.nestedByPath`. Json 컬럼이라 **boolean이 아닌 값은 버린다** |
| e | `json-catalog.write` | 경로로 조회, 없으면 `nested` 폴백 |

    `ProjectFormatColumns.nestedByPath`를 **optional로 두지 않았다** — 껍데기가 `select`에서 빼면 컴파일러가 막는다 (POSTMORTEM 2026-09-02 "공급 계약은 optional로 두지 않는다"). `lib/pull/__tests__/entry-order.test.ts`가 진입점에서 musicblocks 모양을 단언하고 `lib/push/__tests__/flow.test.ts`가 b→c 홉을 SQL 인자로 본다.
- **`setDeep`이 문자열 자리를 빈 객체로 조용히 갈아끼웠다.** → **판정이 `setDeep` 앞으로 올라갔다** (`lib/adapters/json-catalog.ts` — 키 집합 위에서 그림자를 먼저 계산한다) **그리고 얕은 쪽 키를 버린다**: 얕은 쪽을 살리면 그 아래 전부를 잃는다. `setDeep` 자체엔 판정이 남아 있지 않다. 어느 쪽이든 **어느 키에서 잃었는지 알려주는 것**이 최소 조건이다. 값을 잃더라도 **어느 키에서 잃었는지 알려주는 것**이 최소 조건이다.
  - **키 단위 스킵도 같은 통로로 보고한다** (2026-09-04). 수술적 어댑터 셋이 값을 넣지 못하고 건너뛰는 자리가 있다 — `code-dict`의 비리터럴 자리·구조 변경이 필요한 삽입, `yaml-catalog`의 알리아스·맵·시퀀스 자리, `ts-dict`의 **로케일 객체 부재**(그 로케일 번역이 통째로 반영되지 않는데 호출부가 "변경 없음"으로 읽었다). 건너뛰는 판단 자체는 옳다(구조를 바꾸는 일이고, 알리아스는 값의 출처가 앵커 쪽이다) — 틀린 것은 **조용한 것**이었다.
  - `lib/adapters/__tests__/contract.test.ts`가 `contract.ts`의 헬퍼로 그 계약을 `ADAPTERS` 순회로 고정한다(판정과 순회가 갈려 있다 — §1.1): 수술적 어댑터는 `writeWithErrors`를 **구현해야 하고**, 값이 안 바뀌면 **원본 바이트를 그대로** 내야 하고, 정상 입력에 에러를 내지 않아야 하고, `writeWithErrors`의 `content`가 `write`와 갈라지지 않아야 한다. 마지막 항목이 있는 이유는 한쪽만 고치면 프로덕션(pull)과 측정(survey)이 서로 다른 함수를 부르게 되기 때문이다.
  - 그 에러가 닿는 곳은 `Adapter.writeWithErrors`다. **pull이 이쪽을 우선 쓴다** (2026-09-04 — 전에는 survey만 썼고 프로덕션에서는 아무 데도 보고되지 않았다): `renderLocaleFiles`가 `LocalFile.errors`에 싣고 `runPull`이 `PullResult.warnings`(`파일: 문장`, 있을 때만)로 올린다.
    ⚠️ **`AdapterError`는 문장을 안 든다 — 코드를 든다** (2026-09-08, 6b-1): `{ path, code: AdapterErrorCode, key?, detail? }`이고 문장은 `lib/i18n/adapter-errors.ts`의 `adapterErrorMessage`가 사전(`messages/en.tsx`의 `adapterErrors`)에서 꺼내 조립한다 — `key`는 앞에, `detail`(파서 원문)은 뒤 괄호에. 어댑터가 자유 문자열을 만들던 시절엔 **화면에 닿는 문구가 사전 밖에 있어** en으로 고쳐도 ko가 따라오지 않았다 . ⚠️ **`lib/survey/one.ts`의 `classify`가 같은 코드로 §1.9 지표 ③을 가르므로 갈래를 합치면 회차 간 대조가 무의미해진다** — `parse-failed`와 `parse-crashed`가 옛 문구 기준으로 다른 통이라 갈라져 있고, `__tests__/classify.test.ts`가 옛 문구 22개와 옛 분류기 본문을 픽스처로 들고 그 표를 고정한다 (§20). 편집 UI에서는 **결과 자체가 갈린다** (2026-09-08): `pullMessage`가 warnings ≥ 1이면 tone을 `warning`으로 내리고 "N values couldn't be written — tell your developers." 문장을 낸다 — 성공 문구에 덧붙이는 것이 아니다(그러면 버린 값이 success 안에 숨는다, §0 불변식 9). **2층 스킵에 warnings가 붙어도 같다** — 다만 그때는 "Sent"라고 쓰지 않는다(아무것도 안 갔다). **어느 파일인지는 화면이 직접 보인다** (2026-09-08 ship 3) — `components/publish-button.tsx`가 `outcome`을 들고 `<details>`로 `파일: 메시지`를 편다. 문구의 정본은 `messages/en.tsx`이고 `lib/pull/message.ts`가 그것을 읽는다(cron 응답 JSON·Action 반환에도 그대로 실린다). 수술적 어댑터 셋도 같은 계약으로 **파싱 실패·default export 부재를 에러로 낸다** — 전엔 원본을 그대로 돌려줘 "변경 없음"으로 읽혔고, 그 파일이 PR에서 조용히 빠졌다.

**⚠️ 이 손실 계열은 "에러 건수" 지표로는 원리적으로 안 잡힌다.** 실측에서 충돌 카운터가 *정확히 같은 키*만 봤기 때문에 0을 냈다 — **접두 충돌**(`a.b`와 `a.b.c`)을 세도록 고친 뒤에야 345건이 드러났고, 그 리포 집합이 왕복 실패 리포와 정확히 일치했다. **왕복 검증이 없으면 이 계열은 통째로 안 보인다.**

### 1.4 수술적 치환 (`ts-dict`·`yaml-catalog`·`code-dict`) — 규칙이 반대다

**값만 바꾸고 나머지 소스를 그대로 둔다.** TS 딕셔너리를 재생성하면 사람이 의미 단위로 넣은 빈 줄(bugshot-2에 120개)과 주석(23개)이 첫 pull에서 사라진다 — JSON에선 한 번의 재정렬이지만 TS에선 **구조 파괴**이고, 번역 도구가 남의 코드를 훼손하는 것으로 읽힌다.

| | 재생성 | 수술적 치환 |
|---|---|---|
| write의 입력 | DB 상태 | DB 상태 **+ 원본 파일 내용**(`DetectedFormat.currentFiles`) |
| 결정성의 근거 | 정렬·재조립 규칙 | 원본 보존 — 바뀐 값이 없으면 **원본을 그대로 돌려준다** |
| `orphaned` 키 | 파일에서 뺀다 | **파일에 남긴다**(값을 안 바꾼다). 지우면 코드가 참조하는 키가 사라진다 |
| 낼 것 0개 | `null` | 원본 그대로(파일을 지우지 않는다). `null`은 원본이 없을 때만 |
| 원본에 **없는** 키 | 그냥 쓴다 | `yaml-catalog`·`code-dict`는 **삽입한다**. `ts-dict`는 무시한다 (아래) |
| 값의 **표현** | 우리 규칙대로 낸다 | **원본에서 읽는다** — 인용 부호는 그 리터럴이 쓰던 것, YAML 블록 스타일은 그 노드가 쓰던 것 (아래) |

#### 값은 DB에서, 표현은 원본에서 (2026-09-03)

**같은 값이라도 그것을 소스에 적는 방법이 여러 가지면, 고르는 주체는 원본이다.** 값만 맞추면 편집한 줄이 주변과 다른 스타일로 남아 diff가 번지고, 대상 리포의 Prettier·ESLint가 그 PR을 거부한다.

- **인용 부호** (`code-dict`·`ts-dict`) — `lib/adapters/quote-style.ts`. 이스케이프 안전성은 계속 `JSON.stringify`가 지고, `quoteLiteral`이 그 결과를 원본의 부호로 옮긴다. **대응하는 원본 리터럴이 없는 삽입 키만** 파일의 다수 부호(`dominantQuote`)를 따른다 — 삽입 줄만 튀면 맞춘 의미가 없다.
  - 결정성: `dominantQuote`를 삽입 **전에** 세지만 삽입은 항상 다수 쪽을 늘리므로 판정이 진동하지 않는다. 진동하면 2차 write가 1차와 달라져 blob 비교가 매번 "변경됨"을 뱉는다 — `code-dict.test.ts`의 삽입 바이트 고정점 케이스가 이걸 고정한다.
- **YAML 블록 스타일** (`yaml-catalog`) — CST 노드가 스타일을 들고 있어 값만 갈아끼우면 저절로 보존된다. **단 값 자체가 그 스타일과 모순되면 `yaml`이 지시자를 바꾼다** — 접힌 스칼라 `>`(clip)는 끝 개행을 함의하므로, 개행 없는 값으로 편집하면 `>-`(strip)가 된다. 값을 정확히 표현하기 위한 변경이라 정상이다 (실물 PR `i18n-format-check#1`).

**왜 별도 규칙이 필요한가**: `JSON.stringify`처럼 이스케이프와 표현을 한 덩어리로 정하는 API는 안전성만 보고 고르면 스타일까지 함께 정해버린다. 값이 맞으니 왕복 테스트·바이트 고정점·실측 코퍼스가 전부 통과하고, **실물 PR에서야 드러난다** (POSTMORTEM 2026-09-03).

#### 없는 키를 삽입한다 (2026-09-02 — `yaml-catalog`·`code-dict`)

값 교체만 하면 **그 로케일 파일에 아직 없는 키**는 번역해도 리포에 도달하지 못한다. base에 100키가 있고 `ko.yml`에 60키만 있으면 나머지 40키는 치환할 대상이 없다 — 재생성 어댑터는 그냥 쓰므로, 이 격차가 "수술적이면 번역이 반영되지 않는다"로 읽힌다.

- 없는 키는 **그 키가 속할 맵/객체의 끝에** 넣는다. 중간 경로가 없으면 만든다.
- **결정성**: 추가되는 키를 코드포인트 정렬 순서로 넣으므로 `같은 DB 상태 + 같은 원본` → 같은 바이트다.
- **`ts-dict`는 예외다.** bugshot-2가 세 로케일을 한 파일에 나란히 두어 키 격차가 구조적으로 생기지 않고, 삽입 지점을 고르는 규칙(어느 로케일 객체의 어디)이 파일 형태에 의존해 이득 없이 위험만 늘어난다.

#### `yaml-catalog` 고유

- **`yaml` 패키지의 `parseDocument`로 CST를 들고 스칼라만 갈아끼운다.** 실측으로 주석(독립·줄끝)·빈 줄·앵커·인용 스타일·`---` 문서 마커가 전부 보존된다.
- ⚠️ **`doc.toString()`은 문서 전체를 다시 찍는다 — 편집이 하나라도 있으면 수술적이 아니다** (2026-09-04 7차 측정, §1.9 §13.3). 값이 안 바뀌면 원본을 그대로 돌려주므로 왕복·바이트 고정점·diff 0.000이 전부 통과했고, 실물 PR도 픽스처가 작아 드러나지 않았다. redmine의 `ko.yml`(1,585줄)에 **키 하나**를 편집하면 816줄이 달라진다. **옵션으로 되돌릴 수 있는 축은 원본에서 관측해 맞춘다** — 들여쓰기 폭·줄 접기·시퀀스 들여쓰기(`indentSeq`, Rails는 부모와 같은 열에 `-`를 쓴다)·플로우 컬렉션 여백(`flowCollectionPadding`). **콜론 뒤 정렬 공백처럼 AST에 남지 않는 축은 이 방식으로 못 닫는다** — 편집된 스칼라의 `range`로 원본 문자열을 갈아끼우는 별 기능이 필요하다. `code-dict`·`ts-dict`는 ts-morph가 원본을 스플라이스해 이 문제가 없다(1키 편집 → 1 hunk 실측).
- ⚠️ **들여쓰기 폭과 줄 접기는 CST가 보존하지 않는다** (2026-09-04 audit #4). `doc.toString()`은 기본 2칸·`lineWidth: 80`으로 다시 찍으므로, 4칸 리포에서 값 하나를 바꾸면 파일 전체가 재들여쓰기되고 편집하지 않은 80자 넘는 plain 스칼라가 접혀 나갔다. 들여쓰기는 원본 첫 들여쓴 줄에서 관측하고(`indentOf`) 접기는 끈다(`lineWidth: 0`). 픽스처가 전부 2칸·80자 미만이라 보이지 않았던 축이다 — `yaml-catalog.test.ts` "표현은 원본에서"가 양쪽을 고정한다.
- **알리아스 노드(`*ref`)는 리프로 세지 않는다.** 편집하면 앵커 관계가 깨지고, 애초에 값의 출처가 앵커 쪽이다.
- **Rails식 로케일 루트 키**(`ko:` 하나가 최상위)를 `read`·`write`가 **각자 `rootKeyOf`로 재관측한다** — 계약 필드로 나르지 않는다. ⚠️ 전에는 `read`가 `rootKeyedByPath`로 돌려줬는데 **`write`가 그 값을 안 믿어** 어차피 원본을 다시 읽었고, 안 믿는 값을 계약에 싣는 것이 결함이라 필드를 지웠다(`lib/adapters/yaml-catalog.ts`의 그 주석이 근거다). mastodon·redmine·decidim이 이쪽이고 misskey·directus는 루트에 바로 키가 온다.
- 블록 리터럴(`|`)의 값을 바꾸면 인디케이터가 `|-`로 바뀔 수 있다 — 값 의미는 유지되므로 훼손이 아니다.

#### `code-dict` 고유

- **모듈의 default export 객체 리터럴**을 찾는다. `export default { … }`(element-plus·vuetify·quasar)와 `export default <식별자>` → 그 `const`의 초기화식(ant-design `const localeValues: Locale = { … }`) **한 단계까지** 따라간다. ⚠️ **세 번째 형태가 있다** — default export가 **아예 없으면** export된 `const` 객체 리터럴을 받고, 프로퍼티가 가장 많은 것을 고르며 동률은 소스 순서로 가른다(payloadcms/payload의 40로케일이 그것 없이는 통째로 떨어진다). ⚠️ **`export default flat({…})` 같은 호출식은 일부러 따라가지 않는다.**
- 문자열 리터럴이 아닌 프로퍼티(import 참조 shorthand, 템플릿 리터럴, spread)는 **건너뛰고 `errors`에 남긴다** — ant-design의 `Pagination`·`DatePicker`가 그렇다.
- `.ts`·`.tsx`·`.js`·`.mjs`를 받는다. quasar가 `.js`다.
- ⚠️ **`ts-dict`와 다른 어댑터다.** 같은 ts-morph를 쓰지만 `ts-dict`는 "한 파일 안의 로케일 객체 여러 개"를, `code-dict`는 "파일 하나 = 로케일 하나"를 전제한다.

**함정 둘:**

- **`setLiteralValue`를 쓰면 안 된다** — 이스케이프를 하지 않아 백슬래시·개행·따옴표가 재파싱에서 깨진다(실측: `a"b\c\nd` → `a"bcd`). `JSON.stringify(next)`로 따옴표까지 포함한 유효한 JS 리터럴을 만들고 `replaceWithText`로 갈아끼운다. 비ASCII는 그대로 남아 한글이 유니코드 이스케이프로 바뀌지 않는다.
- **`export`된 선언은 로케일 객체가 아니다** (⚠️ **이것은 `ts-dict`의 규칙이고 `code-dict`는 반대다** — 그쪽은 default export가 없을 때 **export된 것만** 후보로 받는다)**.** `export const ai = { ko, en, fr }` 같은 묶음 객체의 이름이 2~3자 소문자면 `looksLikeLocale`을 통과한다(bugshot-2의 `ai`·`app`이 0키 "로케일"로 잡혔다). 묶음은 항상 export되고 로케일 객체는 항상 파일 내부용이라 그 한 줄로 갈린다.

**빈 값은 호출부가 걸러서 넘기지 않는다** (2026-08-31 결정). `write`가 `orderedEntries`를 지나지 않으므로 빈 문자열이 오면 그대로 치환돼 소스에 `""`가 박히고, TS 딕셔너리엔 폴백이 없어 그대로 렌더된다. **"미번역 제외"만은 두 방식에 똑같이 적용한다** — 그래야 지우기가 원본 값을 남기는 쪽으로 떨어진다 (§0 불변식 1·4).

### 1.9 어댑터 범용성 실측 — 근거와 재측정 규칙

**어댑터·탐지 규칙을 손대기 전에 이 절을 읽는다.** 오픈소스 리포 **학습 109개 + 홀드아웃 20개**에
`detect`→`read`→왕복을 돌려 18회차까지 쟀다(입력은 `docs/adapter-survey/`).

```sh
pnpm adapter-survey docs/adapter-survey/repos.txt          --verdicts docs/adapter-survey/verdicts.json
pnpm adapter-survey docs/adapter-survey/repos-heldout.txt  --verdicts docs/adapter-survey/verdicts-heldout.json
```
회차별 로그는 지웠고 — `git log`가 든다 — 여기 남는 것은 **판정과 그 근거**다.

**최종 지표 (18차, 2026-09-14 — `ts-dict` 자동 탐지 복귀와 함께 다시 쟀다)**

| 지표 | 학습 109 | 홀드아웃 20 |
|---|---|---|
| 지원 포맷 탐지 | 100/101 (99.0%) | 16/17 (94.1%) |
| **오탐** | 0/100 (0.0%) | **2/16 (12.5%)** |
| 왕복 의미 동일 | 99/100 | 16/16 |
| **바이트 고정점(결정성)** | **100/100** | **16/16** |
| 조용한 손실 | **0건** | **0건** |
| **`ts-dict`가 1순위인 리포** | **0** | **0** |

⚠️ **홀드아웃 오탐이 1건 늘었는데 코퍼스 드리프트다** — 새로 틀린 것은 mattermost(1순위
`i18n/glossary/{locale}.json`, 정답 2순위)이고 그 리포에 용어집 디렉터리가 생겼다. **변경 전
코드(`765c20f`)로 같은 리포를 다시 재서 같은 결과를 확인했다** — 탐지 규칙 변경의 영향이 아니다.
17차(2026-09-11)의 값은 학습 쪽이 한 칸도 다르지 않고 홀드아웃 오탐만 1/16 → 2/16이다.

**판정 넷**

- **① 지원 선언 포맷은 넷이다** — `chrome-locales` · `json-catalog` · `yaml-catalog` · `code-dict`.
  근거가 위 표의 "오탐 0% · 바이트 고정점 100%"다. 남은 단서 하나: 중첩 JSON에서 키가 `.`을 품으면
  값이 사라질 수 있고(siyuan 1건), **사라지는 것을 보고하므로 조용한 손실은 아니다.**
- **② 키 정렬 규칙은 개정됐다** — `LocaleEntry.order` 오름차순(없으면 `<` 비교)이다(§1.1). 알파벳
  정렬이던 시절 첫 write diff 중앙값이 **0.784**였고 순서 보존 뒤 **0.001**이다. 수술적 치환 어댑터가
  diff 0.000을 내는 것이 그 판정의 대조군이었다.
- **③ `ts-dict`도 자동 탐지에 참여한다** (2026-09-14 — 2026-09-02 판정을 뒤집었다). 뺐던 근거는
  *"109개에서 후보 0회"* 와 *"`.ts` 디렉터리마다 ts-morph를 돌리는 probe 비용"* 이었다. **그 대가가
  실물에서 드러났다**: bugshot-2에서 4키 `_locales`가 903키 딕셔너리를 가렸고, 그 상황을 PRODUCT §7.3이
  이미 *"조용히 작은 쪽으로 떨어져 에러가 나지 않았다"* 로 적어 두고 있었다. 수동 지정은 그 포맷을
  **아는 사람에게만** 길이다.
  - **되돌린 뒤에도 남의 리포는 안 건드린다** (18차): 학습 109·홀드아웃 20 어디에서도 `ts-dict`가
    1순위가 되지 않았고 오탐률이 그대로다. 그것을 지키는 것이 규칙 둘이다 — **`hasStrongLocale`**
    (유틸 파일의 `fmt`·`map`이 로케일로 잡히는 것을 막는다. 나머지 넷은 원래 지나고 있었다)과
    **글롭 승격 차단**(`liftAncestors`가 `{locale}` 없는 템플릿을 조상이라는 이유로 올리지 않는다 —
    실측에서 2로케일 글롭이 3로케일 카탈로그를 눌렀다).
  - **probe 비용은 `tsDictProbePaths`가 든다** — 경로만 보고 `I18N_HINT` 통과 · 곁가지 제외 ·
    **파일이 많은 디렉터리 2개 × 8파일**만 내려받는다(blob 21 → 37). ⚠️ **얕은 순이 아니라 큰 순이다**:
    네임스페이스 디렉터리는 보통 더 깊고 더 커서, 깊이로 고르면 모노레포에서 진짜가 유틸 디렉터리에
    밀려 **조용히** 빠진다.
  - ⚠️ **셋째 이후 디렉터리는 여전히 흔적 없이 빠진다.** 상한이 2이고 다운로드가 순차라 넓히면 그대로
    응답 시간이다 — 그때의 길이 수동 지정이다.
- **④ 무인 탐지는 가능하되 보고할 오탐률은 12.5%다** (18차 — 17차까지 6.3%였고 늘어난 1건은 코퍼스
  드리프트다) — 학습 코퍼스의 0.0%는 **과적합이다**(처음 보는
  20개에서 수정 전 40%였다). ⚠️ **"사람 확인 한 단계"를 없애지 않는 근거가 그 실패의 성질이다**:
  read/write는 처음 보는 리포에서도 100%였고 **무너진 것은 탐지뿐**이다. 위험은 "값을 잘못 쓴다"가
  아니라 **"엉뚱한 파일을 대상으로 삼는다"** 이고, 그건 사람이 경로 하나 보면 즉시 안다
  (PRODUCT §7.3이 그 화면의 근거다).

**탐지 규칙이 왜 그 모양인가 — 홀드아웃이 만든 것들**

| 규칙 | 무엇을 막나 |
|---|---|
| `hasStrongLocale` | 맨 3글자(`add`·`get`·`adx`·`arg`)가 로케일로 잡혀 대시보드 정의·JSON 스키마가 1순위가 됐다. `en`·`zh-CN`·`koKR`은 강하고, 3글자는 강한 것 **옆에 있을 때만** 인정된다 |
| `PRIMARY_NAMES` | 로케일 디렉터리에서 이름을 알파벳순으로 골라 `legacy_stream_translations.json`·`blocks.json`을 집었다 |
| `templateShapeRank` | 접두사 후보(`avo.{locale}.yml`)가 맨 로케일 파일을 눌렀다. 맨 파일 > 로케일 디렉터리 > 접두사 |
| `liftAncestors` | 하위 카탈로그(`contact_us/contact_us.{locale}.yml` 17로케일)가 정본(`{locale}.yml` 15로케일)을 눌렀다. ⚠️ **비교 함수가 아니라 정렬 뒤 후처리다** — "조상이 이긴다"는 추이적이지 않아 `sort`에 넣으면 결과가 구현 정의가 된다 |
| `I18N_HINT` | `{dir}/{locale}/<name>.json` 모양이 경로에 i18n 계열 디렉터리 이름을 요구한다 — 디렉터리 이름이 로케일처럼 보이는 일이 파일 이름보다 훨씬 흔하다 |
| 버킷별 순위 | 어댑터 가로지르는 순위를 크롬 버킷과 `rest`에 **따로** 돌린다. 가로질러 적용하면 "크롬 최우선"이 무너진다 |

**남은 오탐 둘 다 고치지 않는다** — ① discourse가 플러그인 쪽 로케일 파일을 고른다(그쪽이 로케일 파일이
하나 더 많고 다른 서브트리라 조상 승격이 안 닿는다). `plugins/` 감점을 넣으면 잡히지만 **관측이 1건뿐이라
만들지 않았다**: 근거 없는 규칙 추가가 이 프로젝트에서 결함이고, `packages/`에 진짜 카탈로그를 두는
리포(Ghost·payload)가 있어 "하위 디렉터리 감점"은 일반화할 수도 없다. ② mattermost가 용어집
(`i18n/glossary/{locale}.json`, 22로케일)을 고른다 — 진짜 카탈로그(`i18n/{locale}.json`)보다 로케일이
많고 같은 서브트리의 자손이라 조상 승격이 닿지 않는다. **2026-09-14에 새로 관측됐고 탐지 규칙 변경이
아니라 그 리포가 그 디렉터리를 새로 만든 결과다**(변경 전 코드로 재확인했다).

⚠️ **재측정 트리거: `lib/adapters/**`·`lib/survey/**`의 실질 변경.** 그때 `pnpm adapter-survey`를
**학습과 홀드아웃 둘 다** 돌린다 — 3차에서 수정 4건 중 2건이 수정이 만든 회귀였고 **그중 하나는 학습
코퍼스에서만** 나타났다. 한쪽만 돌리면 못 본다. 네트워크 ~4분이라 게이트가 아니고 `/push` 4d가 묻는다.
⚠️ **상시 방어선은 `lib/adapters/__tests__/key-order-golden.test.ts`다** — 실측 리포 모양을 인라인
픽스처로 들고 `lib/survey/diff.ts`의 프로덕션 함수로 잰다. 순서·결정성 회귀는 네트워크 없이 `pnpm test`가
잡고, **재측정이 답하는 것은 일반화뿐이다.**

⏸️ **보류 중인 후속 하나 — 키 구분자를 계약으로 뺀다** (`nested: boolean` → `tree: {separator, style}`).
2026-09-04에 보류했고 근거는 **실측이 고칠 대상을 줄였다는 것**이다: 손실 2건 중 musicblocks는
`Project.nestedByPath` 배선으로 해소됐고 **도입 대상 bugshot-2는 `ts-dict`라 효과가 0이다**(구분자 고정).
남은 것은 siyuan 하나인데 대가가 스키마 컬럼 + 5홉 배선 + 신규 모듈 + 어댑터 8개 파일이다.
**되살릴 조건은 비-점 구분자 리포가 실제 도입 대상이 될 때**다(i18next의 `:` namespace 구분자가 같은
축이고 코퍼스에 8개 있다).

⚠️ **홀드아웃 20개는 이제 학습 코퍼스다** (여섯 회차를 같이 돌았다). 6.3%는 "회귀가 없다"만 말한다 —
일반화를 다시 재려면 **처음 보는 리포**를 새로 떠야 하고, 그건 아직 안 했다.

### 1.95 번역 화면의 렌더 비용 — 가상화를 넣지 않는 근거 (실측, 2026-09-12)

**키 리스트를 가상화하지 않는다.** `@tanstack/react-virtual`·`react-table`이 없고, 인라인 편집과 가상
스크롤을 섞으면 스크롤 튐·포커스 유실 함정이 붙는다. 그 판정을 실측이 떠받친다 — **숫자를 지우면
다음 사람이 같은 질문을 처음부터 다시 잰다.**

| 잰 날 | 무엇이 바뀌었나 | 기본 착지 | `?ns=*` |
|---|---|---|---|
| 2026-09-07 | 열 축, 필터 없음 | — | **12.7초** (903키 · `<input>` 2,711) |
| 2026-09-08 | 기본 착지(pending>0인 첫 ns) 도입 | 3.30초 | 4.66초 |
| 2026-09-09 | `regions: ["hnd1"]` | 0.44~0.54초 | **1.20초** |
| 2026-09-11 | 행 축(8-4) | 0.34초 | 0.31초 |
| 2026-09-12 | `<table>` 전환 + 조회 순서 | 0.30~0.32초 | 0.29~0.32초 |

⚠️ **2026-09-08 회차가 진단을 뒤집었다** — 24키 프로젝트도 **3.29초**였다. 약 1.9초가 **키 수와 무관한
고정 비용**이었고 가상화도 조회 좁힘도 그것을 못 줄인다. 원인은 **Vercel 함수가 `iad1`(워싱턴)에서
돌고 DB가 도쿄**였던 것이다 — 왕복 일곱이 전부 태평양을 건너 홉당 ~375ms였다 (§8).

⚠️ **게이트(FCP 2초)가 못 보는 축이 있다.** 2026-09-12에 함께 쟀다:

| | 행 | 문서 | DOM 노드 | FCP | **`loadEventEnd`** |
|---|---|---|---|---|---|
| 기본 착지 | 93 | 57KB | 1,513 | 0.30~0.32초 | 0.87~1.00초 |
| `?ns=*` | **2,721** | **1.44MB** | **34,624** | 0.29~0.32초 | **3.89~3.92초** |

- **FCP가 행 수와 거의 무관하다** — 스트리밍이라 첫 페인트는 셸에서 난다. 게이트가 재는 것이 그것이고
  통과는 진짜다.
- ⚠️ **`loadEventEnd` 3.9초는 `<Textarea>` 2,721개와 노드 34,624개의 하이드레이션 비용**이고 로컬이라
  네트워크가 0인데도 그렇다(preview에서는 1.44MB 전송이 더해진다).
- **그래도 가상화를 넣지 않는다** — 판정 조건이 "게이트 미달"인데 통과했고, `?ns=*`는 기본 경로가
  아니라 사용자가 일부러 고르는 전체 보기다(기본 착지는 load까지 1초). **다음에 이 화면이 느리다는
  제보가 오면 FCP가 아니라 이 표의 `loadEventEnd`부터 본다.**

⚠️ **절대값 판정에 `pnpm dev`를 쓰지 않는다.** 같은 화면을 dev 서버로 재면 FCP가 688ms인데
`responseEnd`가 **10,086ms**이고 본문이 1MB다 — 헤더와 셸이 먼저 나가고 서버가 표를 10초 붙들고 있다.
같은 코드가 Vercel 빌드에서 0.74초·181KB다. **스트리밍 응답에서는 `responseEnd`와 `transferSize`를
함께 본다** (POSTMORTEM 2026-09-09 — TTFB만 보고 "셸은 빠른데 클라이언트가 느리다"로 오진했다).

## 2. blob SHA 로컬 계산 (`lib/githash.ts`)

```
sha1("blob " + byteLength + "\0" + content)
```

**`byteLength`는 문자 수가 아니라 UTF-8 바이트 수다.** 한국어·프랑스어 번역이 들어가므로 `content.length`를 쓰면 즉시 틀린다 — `Buffer.byteLength(content, "utf8")`.

이 함수의 목적은 **API 호출을 건너뛰는 것**이다. base 트리의 blob SHA와 비교해 전부 같으면 GitHub API를 한 번도 더 부르지 않는다. 변경 없는 날이 대부분이라 이게 기본 경로다.

⚠️ **이 층만으로는 부족하다 — 이제 모든 어댑터가 그렇다** (2026-09-04). write가 원본 내용을 요구하므로 로컬 SHA를 계산하려면 **먼저 파일별로 blob을 읽어야** 한다. 이유가 방식마다 다르다: 수술적은 **치환 대상**이 필요하고(§1.4), 재생성은 **표현**(들여쓰기)을 거기서 읽는다(§1.1). 전에는 재생성이 그 읽기를 건너뛰어 파일당 1회를 아꼈고, **그 대가가 재생성 리포 71개 중 30개에서 "값 편집 0건인데 모든 줄이 바뀌는" diff였다** (§14).

`writeStrategy`가 가르는 것은 이제 **원본이 없을 때**뿐이다 — 수술적은 파일을 안 내고, 재생성은 기본값으로 계속 낸다. `layout`으로 가르면 `per-locale` + 수술적인 `yaml-catalog`·`code-dict`가 그 판정을 틀려 조용히 빈 PR을 만든다 (§1).

**그래서 판정이 두 층이다** (2026-08-31 결정 — §2):

| 층 | 무엇을 보는가 | 통과 못 하면 |
|---|---|---|
| **1. DB 측 스킵** | `Translation.updatedAt` 최대값 vs `Project.lastPulledAt` | **GitHub을 한 번도 부르지 않고 종료** |

⚠️ **1층의 최대값 쿼리는 인덱스와 짝이다** (2026-09-04). `@@index([projectId, updatedAt])`이 있어야 `aggregate({ where: { projectId }, _max: { updatedAt } })`가 역방향 인덱스 스캔 첫 행에서 멈춘다 — 없으면 그 프로젝트의 `Translation` 전체를 훑는다(실측 skillflo 7,261행). **야간 cron이 매일 부르는 쿼리라 인덱스가 사라져도 게이트에는 안 나타난다.** `[projectId, localeCode, needsReview]`로는 대체되지 않는다(`localeCode`가 제약되지 않아 MAX가 스킵 스캔을 못 한다). `entry-order.test.ts`가 쿼리와 인덱스를 함께 고정한다.

⚠️ **그 인덱스의 소비자는 셋이다** (2026-09-11 정정 — 전엔 둘로 적혀 있었다): 1층 판정 · 미배포 집계(`countUnpublished`) · **Home 활동의 `loadRecentEdits`**(`lib/keys/query.ts`). 셋째는 `take`로 역방향 스캔을 타는 것에 더해 **보조 정렬 키를 요구한다** — `orderBy: [{ updatedAt: "desc" }, { keyId: "asc" }, { localeCode: "asc" }]`다. ⚠️ **`updatedAt`만 남기면 동시각 행에서 "어느 N건이 오는지"가 비결정적이 된다** — push가 전 행의 시각을 한꺼번에 올리므로 동시각이 예외가 아니라 **기본 경로**다. 소비자를 둘로 세고 인덱스나 보조 키를 정리하면 Home이 조용히 흔들리거나 풀스캔한다.
| **2. blob SHA 비교** | 로컬 export vs base 트리 | 커밋·PR 경로로 가지 않음 |

⚠️ **2층으로는 "변경 없음"을 관측할 수 없다** (2026-09-01 실측). 2층은 **base 브랜치**와 비교하므로 pull PR이 머지되기 전까지 매번 "변경됨"을 낸다 — `l10n/sync`와 비교하지 않는 것이 "parents는 항상 base head"(§3)의 결과다. 따라서 **export 결정성의 판정은 두 커밋의 tree SHA 동일성**이고, "두 번째 pull이 no-op"은 1층 이야기다. 실측: 3줄 변경 상태와 2745줄 변경 상태 양쪽에서 tree SHA가 같았다.

1층이 어댑터 방식과 무관하게 성립하는 것이 요지다 — 편집이 없는 날이 대부분이므로 기본 경로가 여기서 끝나고, 재생성 어댑터도 트리 조회 한 번을 아낀다. **대가**: 리포 파일을 직접 고치고 push를 안 돌린 경우를 놓친다(정상 흐름에선 push가 strict로 DB에 반영하므로 `updatedAt`이 움직인다).

검증: `lib/__tests__/githash.test.ts`가 골든 **4건**(빈 문자열·ASCII·한글·이모지)을 `GOLDEN` 배열에 박고 있고, **마지막 블록이 그 배열을 `git hash-object --stdin` 실측과 매 실행마다 재대조한다.** ⚠️ **실제 `messages.json` 형태의 다섯째는 그 배열 밖의 독립 `it`이라 앵커를 지나지 않는다** — 아래 경고가 정확히 그 상수에 해당한다(배열에 넣는 것이 코드 과제다). 박제된 상수는 대조 대상이 바뀌어도 계속 통과하므로, 이 앵커가 없으면 골든이 낡는 것을 아무도 모른다.

한글 `안녕하세요`는 문자 5개·**바이트 15개**, `🎉`는 UTF-16 코드 유닛 2개·**바이트 4개**다. `content.length`를 쓴 구현은 정확히 이 두 케이스에서 깨진다.

앵커는 `git` **바이너리**만 요구하고 저장소는 필요 없다(`git hash-object --stdin`은 리포 밖에서도 동작한다). CI에는 `actions/checkout`이 있으므로 문제없다.

## 3. GitHub Git Data API 흐름 (`lib/github.ts`)

clone하지 않는다.

**판정과 I/O를 나눈다** (`lib/push/`와 같은 형태): `lib/pull/plan.ts`가 무엇을 낼지 정하고(1층 스킵·경로·entries·2층 SHA 비교), `lib/pull/render.ts`가 파일 내용을 만들고(어댑터 `write`도 I/O가 없어 이 층까지 순수하다), `lib/pull/payload.ts`가 요청 본문을 조립하고, `lib/pull/run.ts`가 순서를 잡고, `lib/github.ts`는 **보내기 + 연결 근거 읽기**(`probeRepo` — §6.5) + **온보딩 스냅샷 읽기**(`openRepoReader` — §3.1)를 한다. DB 조회는 `lib/pull/load.ts`다. 오케스트레이션이 클라이언트를 **인자로 주입받으므로**(`lib/pull/client.ts`의 `GitClient`) 테스트가 fake로 호출 수를 셀 수 있다 — "편집이 없으면 API 0회"를 판정할 다른 방법이 없다. `lib/github.ts`에 `server-only`를 붙이지 않은 것은 `scripts/smoke-github.ts`가 그 모듈의 실제 코드 경로를 검증해야 하기 때문이다(§5.5.4와 같은 축).

순서 — ⚠️ **0단계가 GitHub 앞에 있다**: `Project.installationId`가 `null`이면 부르기 전에 던진다(`lib/pull/run.ts`·`trigger.ts`). App이 설치되지 않은 프로젝트에 대해 조용히 빈 PR을 내는 대신 즉시 알린다. 그 값이 `createGitClient`의 인자다.

1. `GET /repos/{o}/{r}/git/ref/heads/{base}` → base head SHA
2. `GET /repos/{o}/{r}/git/trees/{sha}?recursive=1` → 기존 로케일 파일의 blob SHA. 경로는 `Project.pathTemplate`이 정한다(`per-locale`은 `{locale}` 치환, `multi-locale`은 글롭 매칭 — §1.1)
2.5 **여기서 파일별 blob을 읽는다** (`GET /git/blobs/{sha}`) — 어느 방식이든 write에 원본이 필요하다. 수술적은 **치환 대상**이(§1.4), 재생성은 **표현**(들여쓰기·한 줄 컨테이너·이스케이프)이 거기서 온다(§1.1). **2026-09-04까지 재생성은 이 단계를 건너뛰었고**, 그 대가가 재생성 리포 71개 중 30개의 "값 편집 0건인데 모든 줄이 바뀌는" diff였다 (§14)
3. 로컬 export + blob SHA 계산 → 비교. **전부 같으면 종료** (`multi-locale`은 write를 파일별로 부른다)
4. `POST /git/trees` — **`base_tree`를 반드시 넘긴다.** 빼면 트리가 새로 만들어져 리포의 나머지 파일이 전부 삭제된 커밋이 된다. **항목의 `content`가 blob을 암묵 생성하므로 `POST /git/blobs`를 따로 부르지 않는다** — 파일 8개면 호출 9회가 1회로 줄고, `buildTreePayload`가 이미 `content`를 싣는다
5. `POST /git/commits` — `parents: [baseHeadSha]`, 메시지에 `[skip-l10n]`
6. `PATCH /git/refs/heads/{l10n/sync-<slug>}` — `force: true`

결과 `PullResult`에 writer가 버린 항목이 `warnings`로 실린다(있을 때만 — §1.35). 커밋이 없어도(2층 스킵) 실린다.

**커밋이 나갔으면 `pr: "created" | "updated"`가 함께 실린다** (2026-09-08). 재사용 판정은 이미 하고 있었고
(`findOpenPrUrl`) 값으로만 안 내고 있었다 — 편집자에게 "새로 보냈다"와 "먼저 보낸 것을 갱신했다"는 다른
사실이다. **`Project`에 컬럼 둘이 따라온다**: `lastPublishedAt`·`lastPrUrl`은 `committed`일 때만 쓰고
(`saveLastPulledAt`의 같은 `update` 한 번), `skipped`는 건드리지 않는다. ⚠️ **`lastPulledAt`과 뜻이 다르다** —
그쪽은 벽시계가 아니라 캡처된 `max(updatedAt)`이고 **변경 없는 스킵에도 전진한다.** 미배포 집계의 기준은
그쪽이고(진행 판정), 툴바의 "Last sent"가 읽는 것은 이쪽이다(사건 기록). 섞으면 아무것도 안 보낸 밤마다
"보냈다"가 갱신된다.

⚠️ **`warnings`는 실행별 진단이고 큐가 아니다** (2026-09-04). 2층까지 통과하면 `lastPulledAt`이 갱신되므로 다음 밤은 1층에서 끝나고 같은 경고가 다시 나오지 않는다. **경고가 있으면 `lastPulledAt`을 안 쓰는 쪽은 택하지 않았다** — `missingOriginal`(리포에 그 로케일 파일이 없다)처럼 **지속 상태**인 경고에서 매일 밤 트리·blob 전량 읽기가 영구화된다. 대신 `lib/pull/trigger.ts`가 `console.warn`으로도 낸다 — 진입점 둘이 공유하는 조립층이라 한 곳이면 되고, cron 응답 JSON을 놓쳐도 Vercel 로그에 남는다.

### 함정

- **⚠️ ref의 슬래시를 직접 인코딩하지 않는다 — `octokit`이 담당한다.** `heads/dev`를 그대로 넘기면 octokit이 `.../git/ref/heads%2Fdev`를 만든다. 우리가 먼저 `heads%2Fdev`로 바꾸면 `%252F`가 되어 **조용한 404**다(실측). 이 항목은 원래 raw `fetch` 전제로 쓰여 있었고, 그대로 따르다 함정을 스스로 만들었다 (`docs/POSTMORTEM.md` 2026-09-01). **`Project.baseBranch`가 슬래시를 포함하지 않는 것과 무관하게** `l10n/sync`가 있으므로 이 층은 항상 걸린다.
- **⚠️ 브랜치 이름에 프로젝트 slug가 들어간다 — `l10n/sync-<slug>`** (2026-09-05, `syncBranchFor`). 상수 `l10n/sync` 하나였을 때는 **같은 리포를 가리키는 Project 둘이 서로를 force update로 덮었다.** 한 리포에 번역 표면이 둘이면 Project가 둘이 되는 것이 정책이고(PRODUCT §7.1) bugshot-2가 정확히 그 모양이라(`_locales` 4키 + `ts-dict` 903키), 이 이름이 갈리지 않으면 첫 다중 프로젝트에서 터진다. 그때의 실물 검증은 순차 실행으로 피해 갔다.
  - `Project.slug`에 형식 제약이 없어(`slug String @unique`) **`syncBranchFor`가 유일한 방어선이다** — git이 거부할 이름(`..`·`/`·공백·`~^:?*[\`·`@{`·앞뒤 `.`)을 화이트리스트로 막고 던진다. 안 막으면 `createRef`가 422로 죽고 원인이 "GitHub이 거절함"으로만 보인다.
  - **이름을 쓸 수 없는 곳(composite action의 YAML·스모크 스크립트)은 같은 접두 + input으로 조립한다** — `SYNC_BRANCH: l10n/sync-${{ inputs.project }}`. 이름이 갈린 뒤 action의 "열린 PR 경고"가 옛 상수를 조회해 **항상 "없음"을 찍었다**(2026-09-06 Codex 감사 #8) — 손실 창의 유일한 신호가 하루 동안 죽어 있었다. `lib/pull/__tests__/sync-branch-consumers.test.ts`가 생산자와 소비자 셋(action.yml·`smoke-github.ts`·ACTIONS.md)을 텍스트로 묶는다.
  - 아래 서술의 `l10n/sync`는 전부 이 이름을 가리킨다.
- **브랜치가 없으면 `PATCH`가 아니라 `POST /git/refs`다.** 첫 실행 경로를 반드시 다뤄야 한다.
- **parents는 항상 base head다.** `l10n/sync`의 기존 head를 parent로 쓰면 누적 히스토리가 되고, base가 앞서 나간 뒤엔 3-way merge가 필요해진다 — 코어 원칙 위반.
- **force update는 의도된 것이다.** `l10n/sync`는 히스토리가 아니라 "현재 DB 상태의 스냅샷"이다.
  - ⚠️ **그 불변식을 지키는 코드가 커밋 경로에만 있었다** (2026-09-09, 6b-3 T6이 프로덕션에서 찾았다). 2층이 비교하는 것은 **base 트리**이므로 사용자가 편집을 되돌려 렌더가 base와 같아지면 변경 0건이 되고, 그때 커밋을 만들지 않으니 **브랜치는 직전 스냅샷을 그대로 들었다** — 그 PR을 머지하면 되돌린 편집이 리포에 적용된다. **"변경 0건"은 base 대비 0건이고 브랜치 대비 0건이 아니다.** 지금은 그 경로가 sync ref를 읽어 base보다 앞서 있으면 **base head로 되돌린다**(PR은 재사용 규칙대로 열린 채 diff만 0이 된다). 읽기 1회가 늘지만 **편집이 있었던 실행만** 그 줄에 닿으므로 1층 스킵의 "API 0회"는 그대로다.
  - ⚠️ 화면 문구는 아직 그 경우를 구별하지 않는다 — `skipped/no-changes`가 "Nothing to send"라 **사용자의 열린 PR이 방금 비워진 사실을 말하지 않는다** (미해결).
- **`[skip-l10n]` 마커가 없으면 무한 루프**: pull이 만든 커밋이 main에 머지되면 push가 돌아 다시 DB에 쓰고, 그게 pull을 트리거한다.
- **PR은 하나를 재사용한다.** `GET /pulls?head={owner}:l10n/sync&state=open`으로 먼저 조회. **`head`가 `owner:branch` 형식이어야 필터가 걸린다** — 브랜치명만 넘기면 GitHub이 조용히 무시해 전체 목록이 오고 PR이 중복 생성된다. PoC 리포에 PR 수십 개가 쌓이면 사람이 안 본다.
- **⚠️ `multi-locale`의 write는 파일 × 로케일 이중 루프다** (2026-09-01 발견 — 그전 서술은 "파일별"까지만 말했다). `ts-dict.write`는 `currentFiles[0]`만 보고 **`input.locale`로 로케일 객체 하나를 고르므로**, 파일 하나를 완성하려면 로케일마다 한 번씩 부르며 **직전 결과를 다음 호출의 원본으로 넘겨야** 한다. 파일 축만 돌면 나머지 로케일이 조용히 원본으로 남아 PR에 ko만 바뀐 채 나간다.
- **⚠️ `l10n/sync`를 삭제하면 GitHub이 그 head를 가진 PR을 자동으로 닫는다** (2026-09-01 실측). 첫 실행 경로를 재현하려고 브랜치를 지우면 닫힌 PR이 남고, 다음 pull은 그것을 재사용하지 않고 새로 만든다(`state=open` 필터라 정상). PR 번호가 늘어나는 것을 버그로 오진하지 않는다.
- **base 브랜치 조회가 `null`이면 던진다.** GitHub은 권한 없는 리소스에 404를 주므로 설치 취소·권한 누락도 `null`로 온다. `l10n/sync`의 `null`만 정상 입력이다(첫 실행 경로).

### 3.05 cron은 **전 프로젝트를 순회한다** (`lib/pull/targets.ts`, SaaS 5단계)

`/api/pull`은 프로젝트 하나를 받지 않는다. `project.findMany` → `selectPullTargets` → 프로젝트별
`runSync`를 돌고 **`{ results, unprocessed }`**로 응답한다.

- **선택 규칙**: `installationId`·`repositoryId`·`lastCommitSha`가 **셋 다 있고 보관되지 않은** 프로젝트만이다 —
  앞의 둘은 App이 그 리포를 볼 수 있고 **어느 리포인지 고정돼 있다**는 뜻이고(§9), 뒤는 최초 적재가
  끝났다는 뜻이다(`ready`의 판정 근거와 같다). 준비 안 된 행을 순회에 넣으면 매일 밤 실패 로그가
  쌓이고 진짜 장애가 그 안에 묻힌다. ⚠️ **`repositoryId`가 조건에 들어간 것은 2026-09-10이다** —
  그 컬럼이 생기기 전에 만들어진 행은 전부 null이고 `createClient`가 확실히 던지므로, 남겨 두면
  재연결 전까지 **프로젝트마다 매일 밤 실패 `SyncRun`이 하나씩** 쌓인다.
- **최근 실행이 오래된 순서이며 동점은 slug `compareKeys`**다(§5.6.5).
- **한 프로젝트의 실패가 나머지를 막지 않는다** — 항목별 try/catch이고 실패도 배열의 한 항목으로 나온다.
  ⚠️ 그래서 **HTTP 200이 전부 성공을 뜻하지 않는다**: 항목의 `status`를 봐야 한다.

### 3.1 온보딩 — 2패스 탐지와 첫 적재 (SaaS 5단계, `lib/onboarding/`)

pull과 **같은 App 설치 토큰**을 쓰지만 방향이 반대다(읽기 전용) 그리고 **판정층이 GitHub을 모른다** —
`lib/onboarding/*`는 스냅샷과 blob을 **값으로** 받고, 두 자격증명이 만나는 자리는 Server Action 하나다
(`credential-separation.test.ts`가 상시로 센다).

**리더는 설치 토큰을 한 번만 발급한다** (`openRepoReader`). ⚠️ 읽기마다 `createApp()`을 부르면 토큰 캐시가
인스턴스마다 새로 생겨 **`POST /app/installations/{id}/access_tokens`가 호출마다 하나씩 더 붙는다** — 예산이
2배가 되고 50로케일 첫 적재는 `maxDuration=60`에서 잘린다 (code-review 2026-09-07 🔴). 스냅샷은 트리 항목의
**`sha`를 함께 든다** — 경로만 들면 blob을 contents API로 읽어야 하고 그쪽은 **1MB에서 잘려 조용히 빈 내용**을
준다.

**탐지가 두 번 도는 이유는 `FileProbe`가 동기 함수이기 때문이다.** CLI는 `readFileSync`라 문제가 없지만
서버는 GitHub API라 그럴 수 없다 — 경로만으로 1차 후보를 얻고, 내려받을 파일을 고른 뒤, 내용을 들고 다시 돈다.

⚠️ **"probe 없는 후보 ⊇ probe 있는 후보"는 거짓이다.** probe의 역할이 어댑터마다 다르다:

| 어댑터 | probe 없이 | probe의 역할 |
|---|---|---|
| `chrome-locales` · `json-catalog` · `yaml-catalog` | 경로 모양으로 후보를 낸다 | **필터** — `verifySamples`가 샘플이 카탈로그 모양이 아니면 떨어뜨린다. 단 probe가 전부 `undefined`면 `false`라 **미검증 = 탈락**이다 |
| `code-dict` | **후보 0개** (`if (!probe) return []`) | **생성** — `hasDictionary`가 default export 객체를 실제로 봐야 후보가 된다 |
| `ts-dict` | 후보 0개 (자동 탐지 불참 — §1.9 판정 ③) | 수동 지정만 |

- **1패스 결과를 사용자에게 보이지 않는다.** probe 없는 1순위는 검색 인덱스 같은 무관한 JSON 묶음일 수 있다
  (bugshot-web 실측) — 후보를 고르기 위한 중간값이지 화면에 쓰는 값이 아니다.
- **내려받는 파일은 재탐지가 읽을 파일과 바이트 단위로 같아야 한다.** `verifySamples`·`hasDictionary`가
  `sampleOrder(locales)`(en 우선 → 코드포인트 순, 3개)를 읽으므로 `probeTargets`가 **그 함수를 import해 쓴다** —
  다른 3개를 받으면 후보가 검증 실패가 아니라 **미검증으로 통째로 떨어진다**.
- **상한은 비용이 아니라 응답 시간이다**: JSON류 상위 5 × 3 + code-dict 상위 2 × 3 = **blob ≤ 21**.
  온보딩 한 번의 호출은 `ref 1 + commit 1 + tree 1 + blob ≤21`이다.

**첫 적재는 기존 push 경로를 그대로 지난다** (`lib/onboarding/ingest.ts`):

```
snapshot → ingestTargets(순수) → readBlob × M
  → assemblePushInput   (selectLocaleFiles + adapter.read + base 판정 — push-local과 **같은 함수**)
  → buildPushPayload    (페이로드의 **유일한 생산자**)
  → applyPush           (키·번역·refs·lastCommit* 를 한 배열형 트랜잭션으로)
```

- ⚠️ **셋을 우회하지 않는다.** 리터럴로 조립했다가 필수 필드가 늘어도 컴파일러가 침묵한 전례(POSTMORTEM
  2026-08-31)와 껍데기가 파일을 안 골라 어댑터가 "존재하지 않았던" 전례(2026-09-02)가 각각 있다.
- ⚠️ **`commitAt`은 base head 커밋의 시각이다.** `new Date()`면 그 시각이 커밋보다 미래라 **CI의 첫 push가
  `stale-commit` 409로 거부된다**(`checkCommitOrder`는 동일 시각만 통과시킨다). 그래서 스냅샷이
  `headCommittedAt`을 함께 읽는다 — `GET /git/commits/{sha}` 한 번이 더 든다.
- ⚠️ **`refs`는 빈 배열이다.** 서버가 리포를 체크아웃하지 않아 ts-morph를 돌릴 수 없다. `applyPush`가 refs를
  전체 교체하므로 "참조 없음"으로 저장되고 CI 첫 push가 채운다 — **화면이 그 사실을 한 줄로 알린다**(조용히
  비어 있으면 "코드 참조 기능이 고장났다"로 읽힌다).
- ⚠️ **내려받지 못한 파일을 실패로 센다.** "다운로드 실패"와 "리포에 없음"을 같게 접으면 로케일 12개 중 3개가
  5xx일 때 DB엔 9개만 들어가는데 화면은 "N개 키를 적재했어요"를 쓴다 — 그래서 `targets`(시도한 경로)를 함께
  받아 `blobs`에 없는 것을 센다 (§0 불변식 9 · code-review 2026-09-07 🔴).
  - ⚠️ **그 "시도한 경로"는 `templatePaths`에서 나온다, `ingestTargets`가 아니다** (2026-09-07 리뷰 🔴2).
    후자는 `confirmed.format.locales`를 순회하고 그 locales는 **성공한 blob에서 나온 값**이라, 못 받은
    로케일이 목록에서 함께 사라져 `missing`이 0이 된다 — 방어선이 자기 입력에서 무력화되는 모양이었다.
    Action은 둘의 **합집합**을 넘긴다.
- **`Project.baseBranch`는 `ProbeResult.defaultBranch`로 채운다.** 스키마 기본값이 `"main"`이라 안 채우면
  default branch가 `develop`인 리포의 pull이 `main`을 찾아 죽는다.

#### 온보딩의 쓰기 쪽 판정층 넷 — 순서가 판정이다

읽기(탐지)와 달리 이쪽은 **거부 순서 자체가 계약**이다.

- **`create-plan.ts`의 `planProjectCreate`** — 연결 거부 → **OWNER 개수**(`PROJECT_LIMIT = 3`) → slug 선점
  순서다. 제한을 나중에 보면 접근 없는 리포로도 카운터를 소진시킬 수 있고, slug를 먼저 보면 남의 slug
  존재 여부를 탐색할 수 있다. ⚠️ **분자는 OWNER 행이다** — 멤버십 전체를 세면 EDITOR로 초대만 받은
  사람이 하나도 못 만든다.
  - ⚠️ **그 카운트는 선조회이고 방어선이 아니다** (2026-09-07 리뷰 🟡7). 트랜잭션 밖이라 두 탭이 동시에
    통과하면 슬롯이 셋인데 넷이 생기고, 삭제가 비범위라 사용자가 되찾을 수 없다. 그래서 `createProject`의
    트랜잭션이 **`User` 행을 잠그고 다시 센다** — 생성 경로에는 잠글 프로젝트가 없으므로 대상이 User다
    (`createInvitation`·`changeMember`가 프로젝트 행을 잠그는 것과 같은 이유). 선조회를 남기는 이유는
    거부될 요청이 GitHub을 읽지 않게 하는 것이다.
- **`slug.ts`의 `planSlug`** — 형식·길이(`PROJECT_SLUG_MAX = 40`)·예약어(`RESERVED = {"new"}`)를 거른다.
  형식 판정은 `lib/pull/ref-slug.ts`의 `isRefSafeSlug` **한 벌**을 쓴다(브랜치 이름에 그대로 들어가므로).
- **`confirm.ts`의 `planConfirmedFormat`** — ⚠️ **클라이언트가 보낸 `adapter`·`pathTemplate`을 파일 재조회로
  재검증한다.** 이건 편의가 아니라 **보안 통제다**: 그 값이 그대로 저장되면 pull이 임의 경로를 겨눈다.
  저장하는 것은 `detectFormatWith`의 **반환값**이고 사용자가 보낸 문자열이 아니다.
  - 온보딩 미리보기는 **확정과 조회를 분리**한다. `planConfirmedFormat`은 blob 내용이 필요하므로
    다운로드 전 검증으로 쓸 수 없다. 탐지·`confirmManualFormat`이 재검증한 포맷에 `AUTH_SECRET`으로
    용도를 구분한 HMAC 확인값을 발급한다. 확인값은 사용자·repositoryId·installationId·ref·headSha에
    묶이고 파일 내용은 담지 않는다. `loadCandidateSample`은 현재 인가와 스냅샷을 다시 확인하고 서명을
    대조한 뒤 경로를 트리와 교차한다. per-locale은 요청 언어의 blob **하나만** 읽는다.
    확인값은 인가를 대신하지 않으며, 브랜치 head가 바뀌면 재탐지해야 한다. 서버 캐시는 없다.
  - 직접 소비자는 `createProject`·`runFirstIngest`·`detectRepoFormats`·`confirmManualFormat`이다.
    `loadCandidateSample`은 그중 탐지·수동 확정이 발급한 확인값을 검증한다. `templatePaths`는
    초기 재검증에 필요한 다운로드 목록을 고르는 헬퍼이며 확인값 검증을 대신하지 않는다.
- **`ref`는 네 온보딩 진입점 전부 `isValidBranchName`을 지난다** — `detectRepoFormats` ·
  `loadCandidateSample` · `confirmManualFormat` · `createProject`. 샘플의 `locale`과 수동 지정의
  `baseLocale`은 `isPathSafeLocale`도 지난다.
- **`workflow.ts`의 `renderWorkflowYaml`** — 사용자에게 보이는 Actions YAML. ⚠️ **정본은
  `docs/ACTIONS.md`의 첫 ```yaml 블록**이고 `lib/onboarding/__tests__/workflow.test.ts`가 그 블록을 읽어
  줄 단위로 대조한다 — 한쪽만 고치면 문서를 보고 붙인 리포와 화면을 보고 붙인 리포가 다르게 동작한다.

⚠️ **Server Action의 `maxDuration`은 호출한 페이지 세그먼트가 정한다.** `app/api/*`의 세그먼트 config가
Action에 적용되지 않으므로 **네 페이지가 각자** `export const maxDuration = 60`을 든다 — `app/(edit)/projects/new/page.tsx` ·
`app/(edit)/projects/@modal/(.)new/page.tsx` · `[slug]/settings/page.tsx` · **`[slug]/translations/page.tsx`**(7단계). **새 Action 화면을 만들 때마다 선언한다** — 안 하면 기본값에서
첫 적재가 잘리고, 증상이 "큰 리포에서만 실패"라 재현이 어렵다.

⚠️ **번역 화면의 이유는 시간이 아니라 판정이다** (§5.6.2) — 번역 화면의 [Send changes]가 그 세그먼트를 쓰고,
선언이 없으면 기본값 300이 `STALE_AFTER_SECONDS`(300)와 **같아져 정상 실행이 스스로를 stale로 본다.**
즉 이 줄을 지우면 첫 적재가 아니라 **동시 실행 방어가** 깨진다.

## 4. 사용처 스캔 (`lib/scan/`) — 진실이 아니다

**출력은 `refs`뿐이다.** `ScanResult`에 `errors` 필드가 **없는 것이 이 층의 요지다** — 키의 존재·원문·키 이름 합법성은 전부 §1의 적재 층이 로케일 파일을 읽어 정한다. 이 층은 편집 UI의 컨텍스트("이 문자열이 어디 나오는지")만 만든다.

`pnpm scan`은 **스캔이 돌기 시작한 뒤에는 항상 exit 0이다** — 사용법 오류(대상 디렉터리 누락·`--wrapper` 스펙 파싱 실패)만 2다. CI를 실패시킬 수 있는 건 `pnpm ingest`뿐이다.

bugshot-2 실측: 이름 기반 매칭 시절 **0키 / 에러 1391건** → 지금 **115키 / 참조 273건 / 경고 9건 / exit 0**. 경고 9건은 전부 그 리포의 실제 동적 키다. 훅 기반 두 리포의 실측은 §4.0.2.

**따라서 실패가 경고다.** 스캐너가 못 찾은 키는 동적으로 조립됐거나 아직 안 쓰이는 키다 — 컨텍스트가 빠질 뿐 적재는 정상이다. 남의 리포 CI를 우리 규칙으로 실패시킬 근거가 없다.

**AST를 쓰는 이유**: 정규식은 주석 속 호출·문자열 리터럴 안의 `t(`·템플릿 조립을 구분하지 못한다. ts-morph는 주석을 AST 노드로 만들지 않으므로 주석 속 호출은 애초에 순회 대상이 아니다. 이 프로젝트에서 리뷰 grep이 두 번 그 오탐을 냈다(주석 속 `content.length`, `echo`의 이스케이프 해석).

### 4.0 호출 형태는 둘이다 — `kind`가 가른다 (2026-09-03)

`WrapperId.kind`가 **호출 형태**를 가른다. 이 축이 없던 동안 실측 3개 리포 중 둘의 `refs`가 0건이었다.

| kind | 형태 | 실측 |
|---|---|---|
| `direct` | `import { t } from "@/i18n"` → `t("k")` | bugshot-2 |
| `hook` | export를 부른 **반환값**이 호출자다 | skillflo, bugshot-web |

`hook`이 인식하는 것:

- **구조분해** `const { t } = useI18n()` — 별칭(`{ t: tr }`)도 따라간다. 찾는 프로퍼티 이름은 `t` 고정이고, 이건 실측 관례다(vue-i18n·react-i18next·skillflo가 전부 그렇다). 다른 이름을 쓰는 리포가 나오면 그때 옵션이 된다
- **직접 대입** `const t = useTranslations("hero")` / `const t = await getTranslations({ locale, namespace: "meta" })` — `await`를 벗기고, 객체 인자의 `namespace` 프로퍼티를 읽는다
- **namespace 상대 키를 절대 키로 되돌린다** — `useTranslations("hero")` 스코프의 `t("title")`은 `hero.title`이다. next-intl의 키 체계가 그렇다

⚠️ **바인딩은 스코프를 안다.** 한 파일에 컴포넌트가 여럿이면 같은 이름의 `t`가 서로 다른 namespace를 갖는다(bugshot-web 실측). 호출 위치를 담는 **가장 좁은** 바인딩을 고르고, 스코프 밖의 같은 이름은 남의 것으로 둔다(props로 받은 `t`).

⚠️ **namespace가 리터럴이 아니면 경고를 내고 그 바인딩의 호출을 버린다.** 접두사를 모르는 채 잡으면 **존재하지 않는 키가 `refs`에 실린다** — 0건이 낫다. 훅 반환을 인식할 수 없는 형태(배열 구조분해 등)로 받아도 같다. `lib/scan`이 "실패는 경고"인 층이라 조용한 0건이 가장 나쁜 결과다.

### 4.0.1 래퍼는 여럿이다

`scanSources`는 **wrapper 목록**을 받는다. bugshot-web이 한 리포에서 `next-intl#useTranslations()`(클라이언트)와 `next-intl/server#getTranslations()`(서버)를 함께 쓴다 — 하나만 받으면 절반이 0건이 된다. CLI는 `--wrapper`를 여러 번 받고, 끝의 `()`가 hook을 뜻한다.

**스펙 파싱은 `lib/scan/wrapper.ts` 하나다.** 전에는 `scripts/scan.ts`와 `scripts/push-local.ts`가 각자 파싱했고, 형식이 늘어나면 한쪽만 못 읽는 상태가 조용히 생긴다.

⚠️ **CLI가 `--wrapper` 값 자리를 소비한다.** 값이 `--`로 시작하지 않아, "플래그가 아닌 첫 인자"를 대상 디렉터리로 삼으면 `pnpm scan --wrapper @/i18n#t ./dir`이 래퍼 스펙을 디렉터리로 읽는다.

### 4.0.2 실측 (2026-09-03)

세 리포 모두 **오탐 0**이다. 오탐 판정은 스캔이 낸 키를 그 리포의 로케일 파일 키와 대조한 것이다.

| 리포 | 형태 | 전 | 후 | 로케일 키 대비 | 오탐 |
|---|---|---|---|---|---|
| bugshot-2 | direct | 115키 / 273건 | **변화 없음** | 903키 중 111 (12.3%) | 0 |
| skillflo | hook (구조분해) | **0** | 1144키 / 1643건 | 1446키 중 1144 (**79.1%**) | 0 |
| bugshot-web | hook + namespace, 래퍼 2개 | **0** | 30키 / 46건 | 104키 중 30 (28.8%) | 0 |

**커버리지가 낮은 쪽은 스캐너 결함이 아니라 그 리포의 키 구성이다.** bugshot-web의 미검출 74건은 전부 동적 조립(`t(\`faq.items.${id}.q\`)`)이거나 배열 인덱스(`hero.subcopy.0`)이고, 경고 13건이 그 자리를 신고한다. 원리적으로 못 잡으며 답은 대상 리포의 `// @l10n-keys`다. bugshot-2의 12.3%도 같은 이유이고, 그 리포는 포맷이 둘이라(`_locales` 4키 + ts-dict 903키) 대조 대상을 잘못 고르면 오탐 96.5%로 보인다.

### 4.1 래퍼 매칭은 이름만으로 하지 않는다

대상 리포에 이미 다른 `t()`가 있을 수 있다. bugshot-2가 정확히 그렇고(`t(key, params?)`), 이름만 보고 매칭했을 때 기존 호출 **1391건이 오탐**으로 잡혔다.

- **모듈 경로 + export 이름**으로 식별한다. `import { t } from "<module>"`이 있는 파일만 검사하고, 별칭(`t as translate`)도 따라간다
- **모듈 경로도 충돌한다** — bugshot-2의 래퍼가 하필 `@/i18n#t`다. 그래서 호출부가 값을 넘기고 CLI는 `--wrapper <module>#<export>[()]`로 받는다. 대상 리포의 관례를 스캐너가 알 수 없다
- **래퍼 지원은 선택사항이다.** 적재가 래퍼에 의존하지 않으므로, 래퍼가 없는 리포도 `__MSG_` 토큰과 `chrome.i18n.getMessage("k")`로 사용처를 얻는다. `getMessage` 직접 호출은 import 게이트를 타지 않는다 — 전역 `chrome` API라 import가 없다
- **같은 `path:line`이 두 경로에서 잡히면 접는다.** `manifest.config.ts`의 토큰이 AST·정규식 양쪽에 걸릴 수 있다

### 4.2 두 경로는 독립이다

`__MSG_key__` 토큰 훑기는 **파일 종류와 무관하게** 돈다. `manifest.config.ts`는 `.ts`인데 토큰을 문자열 리터럴로 담고 있어서, AST 경로에만 보내면 AST가 문자열이라 무시하고 토큰이 전부 누락된다 — 실전 스캔에서 발견됐다.

**`namespace` 파생은 이 층이 아니라 어댑터 층(`lib/adapters/shared.ts`)에 있다.** 로케일 파일에서 읽은 키에 대한 판정이고, 구분자가 둘이다 — chrome은 `[A-Za-z0-9_@]` 제약 때문에 밑줄(`popup_title`), json-catalog은 점(`common.viewAll`)을 쓴다. 먼저 나오는 구분자 앞이 namespace이고, 없거나 맨 앞이면 `_root`다.

**`refs`는 push마다 전체 교체한다.** 증분 갱신은 삭제 케이스를 놓치기 쉽고, 스캔이 전수라 교체가 더 정확하고 단순하다.

**출력은 정렬한다** (키·refs 모두, §1과 같은 `<` 비교). 스캔 결과가 push 페이로드라 결정적이지 않으면 서버 쪽 diff가 노이즈가 된다.

## 5. 스키마 결정 (`prisma/schema.prisma` — 테넌트 경계는 `20260831033609_add_project_tenant_boundary`)

테이블 정의는 `prisma/schema.prisma`가 든다. 여기엔 *왜* 그렇게 했는지만.

- **`Project`는 경계이지 기능이 아니다.** 테넌트별 **과금**은 없다 — **인증·권한은 2026-09-05에 §5.1이 additive로 붙였다**(`ProjectMember`·`enum Role`·`canPerform`). 지금 넣은 이유는 `StringKey.key`의 복합 unique와 `Locale`의 복합 PK가 **나중에 바꾸면 실데이터 이관**이 되기 때문이다. 마이그레이션 시점의 행 수는 0이었다.
- **`Translation.projectId`는 테넌트 격리 장치다.** `keyId`·`localeCode`를 독립 FK로 두면 프로젝트 A의 키 + B의 로케일 조합을 DB가 허용한다. 두 FK가 같은 `projectId`를 공유하게 만들어 막았고(`StringKey`의 `@@unique([projectId, id])`가 그 복합 FK의 대상이다), 실제로 insert가 FK 위반으로 거부되는 것을 확인했다.
- **`KeyRef`엔 `projectId`가 없다.** FK가 하나뿐이라 테넌트 간 참조가 성립할 수 없고, 프로젝트 단위 삭제는 관계를 타면 된다. 쓰지 않을 비정규화는 하지 않는다.
- **`Project` 관계는 `onDelete: Restrict`.** Cascade면 프로젝트 삭제가 키·로케일을 타고 번역까지 조용히 날린다(`Project`에 `translations` 역관계가 없어 경로가 그렇다). 프로젝트 삭제가 필요해지면 soft delete로 푼다.
- **`namespace`는 파생값인데도 컬럼으로 저장한다.** 사이드바 쿼리가 이 컬럼 하나로 끝나고, 키에서 매번 파싱하면 인덱스를 못 탄다.
- **`sourceHash`를 따로 둔다.** 원문 문자열 비교로도 stale을 감지할 수 있지만, 해시면 인덱스가 작고 비교가 싸다. 긴 원문이 많다.
- **`Translation`에 `UNIQUE(keyId, localeCode)`.** 이게 없으면 중복 행이 생겨 export가 비결정적이 된다 — §1 불변식이 스키마에 의존한다. **위생이 아니라 하중 부담 제약이라 지우면 안 된다.**
- **`Translation`의 외래키는 둘 다 `ON DELETE RESTRICT`.** "키를 삭제하지 않고 `orphaned`로 둔다"는 코어 불변식을 **DB가 강제**한다 — 번역이 달린 `StringKey`를 지우려 하면 Postgres가 거부한다. `Cascade`면 실수로 키를 지우는 코드가 번역까지 조용히 날린다. `Locale` 쪽도 같은 이유로 `Restrict`다(로케일을 지워 번역이 사라지는 걸 막는다).
- **코어 5테이블 중에서는 `KeyRef`만 `ON DELETE Cascade`다** (Auth.js 쪽 `Account.user`·`Session.user`도 Cascade다 — §5.1). refs는 push마다 전체 교체되는 파생 데이터라 보존할 이유가 없다 — 여기서 `Restrict`를 쓰면 교체 자체가 막힌다.
- **`updatedBy`는 2026-09-05부터 `User.id`를 담고, 그 전 행은 GitHub 핸들을 그대로 들고 있다.** 처음 핸들을 쓴 이유는 "JWT 세션이라 사용자 테이블이 없다"였고 그 이유는 사라졌다(`User` 테이블이 생겼다). 그런데도 **FK를 걸지 않는다**: **한 컬럼에 두 종류 값이 섞여 있다.**
  참조 무결성을 주장할 수 없고, `User`에 join하는 화면은 못 찾는 경우를 다뤄야 한다. `User.id`를 쓰는
  이유는 이메일이 재할당될 수 있어서다 (§6.02).
  ⚠️ **push는 이 컬럼을 비운다** (2026-09-08, SaaS 6a). strict 덮어쓰기에서 **값의 저자는 리포**이므로
  사람 이름이 남는 것이 거짓이다 — `applyPush`의 `ON CONFLICT … DO UPDATE SET`에 `"updatedBy" = NULL`이
  있다(`flow.test.ts`의 SQL 캡처가 고정한다). 귀결이 둘이다: 셀 메타는 사람이 저장한 값에만 붙고,
  **미배포 집계가 이 조건 위에 선다** — `updatedAt`만 보면 push가 전 행의 시각을 올리므로 code push
  직후 903키 전부가 "안 보낸 편집"으로 세어진다(`countUnpublished`·`isUnpublished`가 `updatedBy`를
  함께 본다). PoC 시절의 미결 하나가 여기서 닫혔다.
  ⚠️ **그래서 이 컬럼을 읽는 쪽은 폴백을 갖는다** — `loadActors`가 id로 `User`를 따로 읽고(join이 아니다,
  옛 행이 전부 떨어진다) `actorLabel`이 **못 찾은 값을 원문 그대로** 낸다. 옛 핸들과 지워진 `User`의 id가
  그 갈래로 살아남는다. cuid 모양으로 갈라내려 하면 후자가 함께 사라진다. **이 폴백이 없던 동안 화면이
  cuid를 그대로 찍었다** (malmoi#3, POSTMORTEM 2026-09-07) — 타입이 같은 채로 의미만 바뀐 컬럼은
  어느 게이트에도 신호를 주지 않는다.
- **`orphaned`는 `StringKey`와 `Locale` 둘 다에, `needsReview`는 `Translation`에.** 키의 존재 여부도 로케일의 존재 여부도 코드(리포)가 정하고, 번역의 신선도는 값마다 판정되기 때문이다. 로케일 쪽은 §5.5.16이 든다.
- **`projectId`를 가진 테이블의 조회용 인덱스는 전부 `projectId` 선두 복합이다.** 그 조회는 프로젝트로 먼저 좁혀지므로 단독 컬럼 인덱스가 쓸모없다. ⚠️ **전부는 아니다** — 진입 키(`Project.slug`·`Project.pushTokenHash`·`User.emailLookup`·`Session.sessionToken`·`ProjectInvitation.tokenHash`)와 `Translation(keyId, localeCode)`·`KeyRef(keyId)`는 프로젝트를 모르는 상태에서 찾는 값이라 예외다. `(projectId, namespace)`(사이드바), `(projectId, orphaned)`(orphaned 필터), `(projectId, localeCode, needsReview)`(검토필요 필터 — 편집 UI 필터 3개를 떠받친다), `KeyRef_keyId_idx`(키 상세의 참조 목록), **`(projectId, updatedAt)`**(소비자 **셋** — pull 1층 판정 · 미배포 집계 · `loadRecentEdits`, §2), **`(projectId, startedAt)`**(`SyncRun` — `loadSyncRuns`의 키셋 페이지네이션이 그 위에 선다). `UNIQUE(keyId, localeCode)`가 키+로케일 단건 조회 인덱스를 겸한다.

### 5.1 SaaS 인증·인가 테이블 (2026-09-05, `20260904182548_add_tenant_auth_tables`)

**여섯이 additive로 붙었다** — `User`·`Account`·`Session`·`VerificationToken`(Auth.js 어댑터가 요구하는
모양) + `ProjectMember`·`ProjectInvitation`(우리 것). 기존 다섯 테이블의 컬럼·제약은 한 줄도 바뀌지
않았다(마이그레이션 SQL에 그 다섯을 대상으로 하는 `ALTER`·`DROP` 0건).

- ⚠️ **앞의 네 테이블의 모양은 우리가 정한 것이 아니다.** `@auth/prisma-adapter`가 부르는 델리게이트와
  `where` 키가 그것을 정한다 — 현재 `credentialAdapter.getUserByEmail`은 `emailLookup @unique`를 요구하고, `account`의
  `where:{provider_providerAccountId}`가 복합 키를 요구하는 식이다. `Account`의 snake_case 컬럼 일곱은
  어댑터 스키마 계약을 유지하지만 현재 로그인 linkAccount는 식별자 네 필드만 저장한다.
- ⚠️ **그 계약을 타입 검사가 못 본다.** 어댑터 시그니처의 `PrismaClient`는 `@prisma/client`에서 오고, 그
  패키지는 `.prisma/client/default`를 re-export하는데 Prisma 7의 `prisma-client` 생성기는 그 경로를 만들지
  않는다(우리 산출물은 `generated/prisma`다). `skipLibCheck: true`가 해결 실패를 삼켜 **파라미터가 사실상
  `any`가 된다** — `PrismaAdapter({ nope: true })`도 컴파일되는 것을 실측했다. 이건 2026-08-31
  「외부 계약 페이로드를 리터럴로 조립해…」와 같은 형태다(계약의 한쪽만 타입으로 이어져 있다). 거기서
  얻은 규칙(`z.infer`를 생산자에 붙인다)은 남의 패키지라 쓸 수 없어 **`prisma/__tests__/schema-contract.test.ts`가
  대신 선다** — 기본 어댑터의 상속 메서드와 credential 어댑터의 User override·lookup 조회를 각각 스키마와 대조한다.
- **`onDelete`가 둘로 갈린다.** `Account`·`Session` → `User`는 **Cascade**다 — 어댑터의 `deleteUser`가
  `p.user.delete` 하나만 부르므로 `Restrict`면 그 메서드가 항상 실패한다. `ProjectMember`·`ProjectInvitation`은
  기존 `Project` 관계와 같은 **Restrict**다: 삭제가 조용히 번지면 **마지막 OWNER가 사라진 프로젝트를
  되살릴 수 없다.**
- **`Session`·`VerificationToken`·`ProjectMember`에 PRIMARY KEY가 없다.** 각자의 unique 제약이 Prisma의
  식별자 역할을 한다. 단일 행은 unique로 조회하며 전체 세션 회수는 `Session.userId`와 `VerificationToken.identifier` 목적 접두로 조회·삭제 범위를 제한한다.
- **`ProjectInvitation`의 `(projectId, emailLookup)`은 index이지 unique가 아니다.** `acceptedAt`을 남기는 설계라
  수락·만료된 행이 이메일을 점유하는데, unique면 **멤버를 뺐다가 다시 부르는 정상 경로가 제약 위반**이
  된다. 행이 여럿이어도 `planInvitationAccept`가 `expired`·`already-accepted`를 가른다.
- **`ProjectMember`에 `userId` 단독 인덱스를 두지 않는다.** ⚠️ **`loadMemberships`는 이제 `(edit)` 레이아웃도 부른다** (2026-09-08 — 셸 사이드바가 같은 조회를 쓴다) — 그 스캔이 그룹 전 페이지의 매 렌더에 붙는다. 판정의 근거는 화면 수가 아니라 **행 수 상한**이다. 목록이 그 컬럼으로 조회하지만
  고정 제한(사용자당 프로젝트 3 · 프로젝트당 멤버 10)이 이 테이블을 수십 행으로 묶는다.
  "인덱스는 전부 `projectId` 선두"(위 §5)를 여기서도 지키고, 실제로 느려지면 그때 예외를 만든다.

**신규 github/google 로그인 Account는 OAuth 토큰을 저장하지 않는다** (2026-09-10).
`safePrismaAdapter.linkAccount`가 `userId`·`type`·`provider`·`providerAccountId`만 저장한다.
현재 credential 구현은 Session을 도메인 분리 SHA-256 digest로, GitHub App 토큰과 User.email/name/image·초대 email을 독립 AES-256-GCM 키로 저장한다. 검색은 별도 키의 HMAC emailLookup을 사용한다. User DTO는 서버에서 복호화하고 타인 이메일의 기존 마스킹을 유지한다. 조회·복호화 장애는 unavailable이며 자동 계정 생성이나 평문 fallback은 없다.

**✅ 2026-09-10에 dev·prod 양쪽 전환이 끝났다.** R1(`_add_email_lookup`)이 nullable lookup과 새 인덱스만 넣어 옛 코드가 계속 돌았고, 차단 backfill·전건 검증 뒤 R2(`_finalize_credential_storage`)가 **평문 email 인덱스 둘을 제거**했다.

⚠️ **`emailLookup`은 nullable로 남는다 — 준비 단계가 아니라 최종 형태다.** R2 초안의 `NOT NULL`은 전환 도구와 **상호 배타적**이다: 도구의 CAS가 아직 안 채워진 행을 `where: { emailLookup: null }`로 집는데, 컬럼이 non-nullable이 되는 순간 Prisma가 그 **입력**을 거부한다(`Argument \`emailLookup\` must not be null.`). **읽기는 관대해서 NULL을 그대로 돌려주므로 조회로는 안 드러난다** — 막히는 곳은 쓰기뿐이라 실측 전까지 보이지 않았다. 걸면 컷오버 이전 백업을 복원했을 때 다시 채울 수단이 사라진다. 유일성은 R1의 unique 인덱스가 들고, **"lookup 없는 행이 안 생긴다"는 유일한 생성자 `credentialAdapter.createUser`가** 쓰기 전에 증명한다(단언이 아니라 던진다 — 빠진 행은 unique에 안 걸려 **이메일로 영영 못 찾는 사용자**가 되고 같은 주소의 재가입이 조용히 중복 계정을 만든다).

자세한 실행·회전·복구 순서는 [OPERATIONS.md](./OPERATIONS.md)다. 키는 지연 로드하며 DB와 별도로 백업한다. 키/DB 백업 쌍을 보존하지 않으면 복구할 수 없다.

2026-09-09 확인한 public 스키마의 anon/authenticated GRANT 0건은 계속 필요한 방어선이다. 저장 암호화는 앱 서버나 암호 키까지 탈취한 경우를 방어하지 않으며, 접근 통제의 대체가 아니다.

⚠️ **런타임 롤은 `postgres`이고 `rolbypassrls=true`다**(실측). **지금 RLS를 켜도 앱 연결에는 안 걸린다** —
"RLS가 없어 애플리케이션이 유일한 방어선"이라는 서술은 이 사실과 함께 읽는다. 최소권한 롤로 옮기는
것은 **RLS를 실제로 켜는 시점**의 선행 작업으로 미뤘다 (2026-09-09 판정 — `DATABASE_URL`이 사는 네 곳을
동시에 건드리는 변경이고, GRANT 0이라 지금 얻는 것이 작다).

## 5.5 push 적용 (`lib/push/`)

**판정과 I/O를 나눈다.** `payload.ts`가 로케일 파일에서 페이로드를 조립하고, `plan.ts`가 순수 함수로 계획을 세우고(`toInsert`/`toUpdate`/`toOrphan`/`toUnorphan`/`staleKeyIds`), `apply.ts`가 그것만 실행한다. `PushPlan`에 **`toDelete`가 없는 것이 요지다** — 코드에서 사라진 키는 `orphaned`로 표시만 한다.

### 5.5.0 페이로드 생산자는 하나다 (`payload.ts`, 2026-09-03)

`buildPushPayload`·`selectLocaleFiles`·`pickBaseLocale`이 **호출부가 아니라 `lib/`에 있다.** 전에는 `scripts/push-local.ts`의 리터럴이라 계약이 넓어져도 컴파일러가 붙잡을 지점이 없었고, 필수 필드 둘이 늘었는데 typecheck·test가 전부 green이었다 (POSTMORTEM 2026-08-31). **스키마(zod)와 소비자(`applyPush`)는 타입으로 이어져 있었는데 생산자만 끊겨 있었다.**

- **`selectLocaleFiles`가 "어댑터에게 무엇을 먹이는가"를 정한다.** 축은 `layout`이다(`writeStrategy`가 아니다 — 그쪽은 write 방식과 원본 부재 시 처리를 정한다). 먹이지 않으면 어댑터는 없는 것과 같다 (POSTMORTEM 2026-09-02).
- **`pickBaseLocale`은 추정이고 정본이 아니다** — `en` 우선, 없으면 사전순 첫 번째. 🔒는 2026-09-07에 해소됐다: 온보딩이 사용자에게 확정받아 `Project.baseLocale`에 저장하고 push가 `input.baseLocale ?? pickBaseLocale(...)`로 그것을 우선한다. 이 함수는 **후보 화면의 기본값**으로 남았다.
- ⚠️ **그 위에 층이 하나 더 있다** — `lib/push/assemble.ts`의 `assemblePushInput`이 `selectLocaleFiles` →
  `adapter.read` → base 판정을 한 묶음으로 들고, `scripts/push-local.ts`와 온보딩의 첫 적재가 **둘 다 이걸
  지난다**(셋을 직접 부르지 않는다). 생산자가 하나인 이유와 같은 이유로 그 입구도 하나여야 한다.
- `scripts/ingest.ts`는 **`selectLocaleFiles`·`pickBaseLocale`을 그대로 import한다** (2026-09-04 — 전엔 바이트 동일한 복사본이었다). ⚠️ **그 CLI는 `assemblePushInput`을 지나지 않는다** — 두 함수를 각자 부르므로 단일 입구를 우회한다(통일은 미결). ⚠️ **`lib/survey/select.ts`엔 같은 층이 따로 있다** — survey가 측정 전용이고 요구가 다르기 때문이다. 새 어댑터를 추가하면 **둘 다** 고친다.
- **`multi-locale` 파일 선택은 `shared.matchGlobPaths` 하나다** (2026-09-04 통일). 전에는 셋이 각자 규칙을 들었다 — push·ingest가 `startsWith(dir) && /\.tsx?$/`(하위 디렉터리·`.tsx` 포함), pull의 글롭은 둘 다 제외, survey는 하위 제외·`.tsx` 포함. **그 차이에 걸린 파일은 키가 DB에 적재되고 편집 UI에 뜨는데 pull이 영영 쓰지 않았고 에러도 없었다.** 정본은 `pathTemplate`이다: `*.ts`는 `.ts`만 잡고 `*`는 `/`를 먹지 않는다 — `.tsx`를 담아야 하면 `detect`가 `*.tsx`를 내야 한다(선택 층에서 확장자를 넓히면 그 층만 아는 규칙이 다시 생긴다). `lib/adapters/__tests__/multi-locale-paths.test.ts`가 push·pull의 결과를 같은 집합인지 대조한다.

### 5.5.05 외부 페이로드가 **경로와 크기**를 정하지 못한다 (2026-09-09, sec-audit 발견 2·10)

`locales[]`와 `format.pathTemplate`은 `applyPush`가 **그대로** 저장하고, 야간 pull이 그것을 보간해
**설치 토큰으로** 커밋한다. 그래서 그 둘은 값이 아니라 **경로 조각**이고, `z.string().min(1)`뿐이던
동안 push 토큰 하나가 리포의 임의 파일에 쓰는 원시체였다.

⚠️ **`..`가 필요 없다.** `pathTemplate: "{locale}"` + `locales: [".github/workflows/pwn"]`이면 그 경로가
그대로 나가고, `l10n/sync-<slug>` 브랜치 push가 그 워크플로를 **대상 리포의 secret과 함께** 실행시킨다
(`[skip-l10n]`은 우리 push 루프만 막는다). 권한 격차가 이 항목의 무게다 — `planRepoConnect`는 설치
목록에 리포가 보이는 것만 요구하므로 **읽기 전용 협력자**가 프로젝트를 만들어 토큰을 받는다.

판정은 `lib/locale-code.ts`의 `isPathSafeLocale`·`isPathSafeRepoPath`이고 **import가 0인 잎**이다 —
push 스키마와 pull 판정이 서로의 그래프를 안 끌고 같은 규칙을 쓴다. ⚠️ **`looksLikeLocale`을
재사용하지 않는다**: 그것은 *탐지* 규칙이라 "우연히 로케일로 보이는 디렉터리인가"를 묻고 2~3자
소문자를 받는데, 여기 축은 "경로에 넣어도 되는가"다. 그 함수가 `lib/adapters/**`에 있어 재측정
트리거가 붙는 것도 이유의 하나다.

**방어가 두 층인 것이 요지다.** 스키마 경계(`lib/push/plan.ts`)는 새 값이 저장되는 것을 막고,
`resolveLocalePaths`(`lib/pull/plan.ts`)는 **경계가 서기 전에 저장된 행**을 막는다 — 야간 cron이 읽는
것이 정확히 그 행이다. 트리에 없는 파일을 만드는 갈래는 그대로다(신규 로케일이 그것으로 생긴다);
막는 것은 **템플릿의 디렉터리 밖으로 나가는 것**뿐이다.

**온보딩 첫 적재도 `PushPayload.safeParse`를 통과한 뒤 `applyPush`를 호출한다**
(`lib/onboarding/ingest.ts`). 빈 키 집합과 스키마 거부는 DB에 쓰지 않는다.
탐지·포맷 확정·첫 적재는 `lib/onboarding/budget.ts`의 공통 예산을 적용한다:
최대 200파일, 파일당 2,000,000바이트, 합계 10,000,000바이트. Git tree의 크기를 다운로드 전에
검사하고 실제 UTF-8 본문을 다시 센다. 크기 누락도 거부한다. YAML은 Lexer/CST Parser의 구성
스택으로 중첩 100을 제한하고, JSON·코드 리터럴은 문자열·주석을 제외한 구분자 깊이를 검사한다.
코드 구문 검사는 완전한 CPU 격리가 아니다. Action은 예산 초과를 `resource-limit`으로 표시한다.

크기 상한(발견 10)은 같은 자리에 있다 — 키 20,000 · 로케일 200 · 문자열 10,000자 · 행 200,000이고
근거는 실측이다(prod 최대 903키 · `Translation` 12,783행 — **20배 여유**). ⚠️ **`placeholders`엔 안
건다**: `z.unknown()`으로 두는 것이 계약이고, 상한은 개수·길이 축에서만 건다.

### 5.5.1 pooler가 구현을 규정한다

- **push는 배열형 `$transaction([...])`을 쓴다 — 왕복 수 때문이다.** 한 번에 배치로 보내 문장 수만큼의 왕복이 없다. ⚠️ **"대화형 `$transaction(async tx => …)`은 pooler에서 못 쓴다"는 서술은 틀렸었다** (2026-09-06 정정): pgbouncer transaction 모드는 `BEGIN…COMMIT` 동안 서버 커넥션을 고정하고 Prisma는 대화형 tx를 커넥션 하나에 묶으므로 안전하다. 대화형 사용처에는 다음이 있다 — `changeMember`(`SELECT … FOR UPDATE` + 재집계) · `createInvitation`(같은 잠금) · **`createProject`**(`SELECT … "User" … FOR UPDATE` + `PROJECT_LIMIT` 재집계 — §3.1이 그 방어선을 설명한다) · `acceptInvitation`(조건부 소비 + 멤버 생성) · GitHub callback의 `Account` 연결. 잠금과 롤백이 필요한 자리다. 로그인 Account 연결과 sync 실행 등록도 대화형 트랜잭션을 쓴다. 배열형은 그 둘이 필요 없고 문장이 많을 때 고른다.
- **키마다 왕복하면 타임아웃이다.** skillflo가 1446키다. `unnest()`로 배열을 넘겨 문장 하나가 전체를 처리한다. 실측 1446키 + 2892번역 + 1446refs가 **약 1.6초**(라우트 한도 60초).
- **키 id를 JS에서 만든다.** 스키마의 `@default(cuid())`는 Prisma 클라이언트가 적용하는 값이라 raw SQL에는 오지 않는다. 현재 `randomUUID()`를 쓰고, 형식 혼재를 통일할지는 미결이다.

### 5.5.15 적용은 한 트랜잭션이다 (2026-09-04)

**배열형 `$transaction` 하나가 Locale·StringKey·Translation·KeyRef·Project를 전부 커밋한다.**
전에는 둘이었다 — 키 id를 확보하려고 중간에 `stringKey.findMany`를 한 번 더 쳤기 때문이다. 두 번째가
실패하면 **키·`orphaned`·`needsReview`만 새 상태이고 번역·refs·`Project.lastCommit*`은 옛 상태인
혼합 DB**가 남는다.

- **삽입 id를 JS에서 만들어 들고 있으면 그 조회가 없어진다.** 이미 `randomUUID()`로 만들고 있었고
  (`@default(cuid())`는 Prisma 클라이언트가 적용해 raw SQL엔 오지 않는다) 그 값을 버렸을 뿐이다.
  `idByKey`는 `existing` + 생성한 id로 조립한다.
- **문장 순서가 곧 결과 인덱스다.** 보고값(`staleTranslations`·`translationsFilled`·
  `orphanedLocales`)을 꺼내려면 그 순서를 알아야 하므로 인덱스를 조건별로 세어 계산한다.
  문장을 끼워 넣으면 그 계산도 같이 고친다.
- ⚠️ **중복 키가 이 트랜잭션을 거부시킨다.** `json-catalog`의 `flatten`은 중복을 검사하지 않아
  `{"a.b": …, "a": {"b": …}}`가 같은 평탄화 키를 두 번 낸다(§1.35). 그 쌍이 한 `INSERT … ON CONFLICT
  DO UPDATE`에 들어가면 Postgres가 `cannot affect row a second time`으로 문장을 거부해 **지원 포맷
  리포가 push를 아예 못 끝낸다.** 생산자(`buildPushPayload`)와 `applyPush` **양쪽**이 접는다 —
  와이어 계약이 중복을 허용하므로 옛 CI의 페이로드도 받아야 한다. 규칙은 **마지막이 이긴다**(YAML
  로더·`read`와 같다). ⚠️ **접는 것은 양쪽이지만 보고는 생산자 쪽뿐이다** — `duplicateKeys`는 `buildPushPayload`의 반환에만 있고 `PushOutcome`·라우트 응답에는 실리지 않는다(**소비자가 둘이다** — `push:local`의 콘솔 경고와, 온보딩 첫 적재의 `failed` 집계: `lib/onboarding/ingest.ts`가 `errors.length + duplicateKeys`로 세고 `ingestHeadline`이 그것을 **화면 문구로** 낸다, §0 불변식 9).

### 5.5.16 사라진 로케일은 `orphaned`다, 삭제가 아니다 (2026-09-04)

**로케일 목록의 정본은 어댑터가 탐지한 파일 목록이다** (§0 불변식 2). 사라진 로케일을 표시하지 않으면
DB에 영구 잔존하고 **pull이 그 파일을 되살린다** — 개발자가 지운 `fr.json`이 다음 PR에서 돌아온다.
행은 남아 있고 번역도 남아 있으므로 write가 내용을 만들어 커밋에 싣기 때문이다.

키의 `orphaned`와 같은 모양으로 푼다. **지우지 않는 이유가 둘이다**: 파일을 되살리면 번역이 그대로
돌아와야 하고, `Translation`의 FK가 `RESTRICT`라 지우려면 번역을 먼저 지워야 한다.

| 지점 | 무엇 |
|---|---|
| `applyPush`의 Locale upsert | 페이로드에 있는 로케일은 `"orphaned" = false`로 **되돌린다** |
| 같은 트랜잭션의 `UPDATE "Locale"` | 페이로드에 없는 로케일에 `orphaned = true`, **`isBase = false`** |
| `loadPullState`의 `select` | `where: { orphaned: false }` — pull이 그 경로를 아예 만들지 않는다 |
| `saveTranslation` | orphaned 로케일 저장을 거부한다 — 받으면 `updatedAt`만 올라 pull이 헛돈다 |

- **`isBase`를 함께 내리는 이유**: base 파일이 삭제되면 push가 남은 파일에서 새 base를 고르는데, 옛
  행의 `isBase`가 남으면 `true`인 행이 둘이 된다. `app/(edit)/projects/[slug]/translations/page.tsx`가 그 값으로
  **키 그룹 안의 행 순서와 로케일 선택 목록의 선두**를 정하므로 **화면이 사라진 로케일을 base로 세운다** —
  원문이 맨 위에 있다는 전제가 깨져 번역자가 빈 칸을 원문으로 읽는다.
  - ⚠️ **8-4 전에는 "열 정렬과 기본 열 선택"이었다** (2026-09-11 정정). 로케일이 행이 된 뒤로 **"기준 열"에
    대응물이 없고**(`lib/keys/view.ts`) 보일 로케일은 `parseLocaleSelection`의 **다중 선택**이다. 정렬 자체는
    그대로 `isBase` 우선이므로 **위험은 한 줄도 줄지 않았고 자리만 옮겼다.**
- ⚠️ **목록이 비면 표시 문장을 내지 않는다.** `<> ALL('{}')`은 전 로케일을 orphan시킨다.
- **편집 UI는 그 열을 보이되 편집을 막는다** (2026-09-06) — 헤더에 키와 같은 어휘의 `orphaned` 배지, 그 열의 입력은 `disabled`. `loadProject`가 `orphaned`를 함께 싣는다. 셋(저장 거부 + 배지 + 비활성)이 한 축이다 — 전에는 저장 거부만 있어 편집자가 **내부 토큰**을 봤다.
- ✅ **이 상태를 설명하는 화면이 생겼다** (2026-09-09, 6b-5 — `/projects/[slug]/locales`). 그때까지 이 절이 정의한 상태를 **사용자가 볼 수 있는 형태는 "열이 사라졌다" 하나뿐**이었다: 배지는 왜인지 말하지 않고, 되살리는 방법은 어디에도 없었다. 그 화면이 행마다 **사유와 복구 방법**을 함께 내고 진행률도 계속 낸다(되살리면 돌아온다는 것의 근거다). ⚠️ **게이트가 `translation:write`인 이유가 이것이다** — 열이 사라진 것을 보는 사람이 번역자이므로, `project:settings` 뒤에 두면 설명이 그 사람에게 닿지 않는다.
  - ⚠️ **기준 로케일 선택 목록에서는 빼고, 거부는 Action이 한다** (`planBaseLocaleChange`의 `orphaned-locale`). 감추는 것은 편의이고 **렌더 뒤에 orphaned가 된 경우**가 그 갈래가 실제로 닿는 경로다 — orphaned를 base로 세우면 다음 push가 그 파일을 못 읽어 **키 집합이 0**이 되고 살아 있던 키 전부가 orphan한다.

### 5.5.2 번역값은 strict 덮어쓰기다

**`INSERT ... ON CONFLICT DO UPDATE`.** 리포 파일의 값이 push마다 DB를 덮는다 — 변경 감지도, 병합도, 예외도 없다 (§0 불변식 2). base 로케일 행도 같이 쓴다.

> **⚠️ 2026-08-31 정책 반전.** 이전 구현은 `DO NOTHING`(없을 때만 채우는 콜드 스타트)이었고, 그전 스펙은 "번역 값을 어떤 경로로도 건드리지 않는다"였다. **문서에서 이 둘 중 하나를 서술한 대목을 보면 낡은 것이다.** 반전 이유는 §0 불변식 2에 있다 — 진실의 방향을 한 번에 하나로 두는 것이 "병합 없음"을 지키는 가장 단순한 형태다.

**대가는 편집 손실 창이다.** 번역자의 편집은 pull PR이 머지되기 전까지 리포에 없으므로, 그 사이 push가 오면 사라진다. 이 위험을 코드에서 지우려 하면 곧 변경 감지·병합이 되어 코어 원칙을 깬다 — 완화는 pull 주기를 줄이는 쪽에서만 한다.

**따라서 `Translation.value`의 쓰기 주체는 둘이다**: 편집 UI의 `saveTranslation`과 push. 셋째가 생기면 어느 쪽이 이기는지 다시 판정해야 하므로 늘리지 않는다.

### 5.5.3 보고값은 실제 영향 행수다

`$executeRaw`가 돌려주는 영향 행수를 배열형 트랜잭션 결과에서 읽는다. 후보 수를 보고하면 실제로 쓰이지 않은 행까지 세어 CI 로그에 거짓이 남는다 — `DO NOTHING`이던 시절 재전송마다 "번역 2892건 채움"이 찍혔다. strict에서는 재전송도 전 행을 갱신하므로 두 수가 대개 같지만, 보고 경로는 그대로 실측을 읽는다.

### 5.5.4 `applyPush`는 클라이언트를 주입받는다

`lib/db.ts`를 직접 import하면 그 파일의 `server-only` 때문에 스크립트·테스트가 이 모듈을 **열 수조차 없다** — `lib/env.ts`에서 이미 밟은 함정이다. 라우트가 `getPrisma()`를 넘긴다.

### 5.5.5 오배송·역행을 페이로드로 막는다 (2026-08-31 결정, 구현됨)

**네 검사 모두 거부이지 병합이 아니다** — 어긋난 요청을 어떻게든 반영하려 들면 그게 diff 동기화가 되어 코어 원칙을 깬다. 전부 **409**로 떨어뜨린다.

| 검사 | 비교 대상 | 막는 것 |
|---|---|---|
| `Project.archivedAt` ≠ null | DB 컬럼 | **보관.** ⚠️ **판정이 넷 중 맨 앞이다**(7단계, `checkArchived`) — 멈춘 프로젝트에서는 페이로드가 맞는지가 답할 질문이 아니고, 사용자가 할 일은 나머지 셋과 달리 "워크플로를 뗀다"다 |
| `projectSlug` ≠ 토큰이 정한 `Project.slug` | DB 행 (`pushTokenHash` 조회) | **오배송.** 남의 프로젝트 키가 전부 orphan되고 이물 키가 삽입되는데, `PushPlan`에 `toDelete`가 없고 FK가 `RESTRICT`라 **지울 수 없다** |
| `format`(adapter·pathTemplate·baseLocale) ≠ 저장된 셋 | DB 컬럼 셋 | **표면 교체.** 같은 프로젝트인데 **다른 번역 표면**을 보낸 경우다 (2026-09-07 추가). ⚠️ `baseLocale`만 예외가 하나 있다 — 아래 |
| `commitAt` < `Project.lastCommitAt` | DB 컬럼 | **역행.** 오래된 run을 Re-run하면 strict가 그 시점으로 DB를 되돌린다(키 orphan + 번역값 회귀 + permalink가 옛 SHA) |

⚠️ **표면 교체 검사(`checkFormat`)가 왜 필요한가** (2026-09-07): `applyPush`가 페이로드 포맷으로
`Project.adapterName`·`pathTemplate`·`nested`·`nestedByPath`·`baseLocale`을 **덮어쓴다.** 그런데 온보딩은
후보를 사용자에게 확정받아 재검증한 값을 저장하고(`planConfirmedFormat`), **자동 후보의 워크플로 YAML은
`adapter:`·`base-locale:`을 박지 않는다**(`renderWorkflowYaml` — 탐지가 같은 답을 낸다는 전제였다).
그 전제는 **1순위 후보에만 참이다**: 2순위를 확정한 프로젝트의 CI는 `detectFormat`의 1순위를 보내고,
strict 덮어쓰기가 그 프로젝트의 키를 전부 orphan시킨 뒤 이물 키를 넣는다 — 오배송과 같은 피해이고 같은
이유로 되돌릴 수 없다. 한 리포에 표면이 둘인 `i18n-format-check`가 실물이다 (PRODUCT §7.1).

- **`baseLocale`도 본다** — 키 집합의 진실이라, 확정한 base와 다른 base로 적재하면 진짜 base에만 있는
  키가 빠져 orphaned로 떨어진다 (2026-09-04 audit #1의 손실).
- ⚠️ **`baseLocale`은 `Project.declaredBaseLocale`과도 대조한다** (2026-09-09, 6b-3).
  그 컬럼은 OWNER가 설정 화면에서 세운 **일회용 허가**("다음 CI push가 이 base를 가져오면 받아들이겠다")이고,
  없으면 기준 로케일을 바꾸는 순간 그 리포의 push가 **영영 409**다 — 워크플로를 고쳐도 저장값은 옛 base라
  되돌릴 경로가 DB 직접 수정뿐이다. **느슨해지는 것은 base 하나이고** `adapter`·`pathTemplate`은 그대로
  엄격하다(오배송을 막는 것은 그 둘이다). **선언을 "전부 null" 판정에는 넣지 않는다** — 현실이 비어 있고
  선언만 있는 행은 온보딩 중이고 그 첫 push는 아래 규칙으로 통과해야 한다.
  - **소비는 `applyPush`가 하고 조건은 "그 값을 실제로 가져왔는가"다** — `baseLocale`이 바뀐 push만
    선언을 `null`로 비운다. push마다 비우면 워크플로를 고치기 전의 평범한 CI push 한 번이 허가와 두 화면의
    대기 배너를 함께 지우고, 그 실패가 무음이다 (POSTMORTEM 2026-09-09).
  - **그 push에서는 `needsReview` 전파를 건너뛴다** (`planPush`의 `baseChanged`). 살아남는 키 전부의
    `sourceHash`가 달라지지만 원인이 "원문 수정"이 아니라 **"원문 언어 교체"**라 다른 로케일의 번역은
    여전히 정확하다 — 전파하면 903키 프로젝트에서 `needsReview` 필터가 통째로 죽는다.
  - **pull은 이 컬럼을 읽지 않는다.** 그래서 대기 중에도 pull이 옛 base로 정상 동작하고 편집 손실 창이
    늘지 않는다 — 같은 컬럼에 선언을 쓰는 안을 기각한 근거다.
- **셋이 다 null이면 통과시킨다** — "포맷은 push가 채운다"가 원래 계약이고 온보딩 밖에서 만들어진 행은
  첫 push가 심는다. 좁아지는 것은 한 번 채워진 뒤부터다.
- ⚠️ **정당한 이전(리포가 로케일 파일을 옮겼다)도 409가 된다.** 이 라우트는 GitHub을 부르지 않으므로
  오배송과 구별할 수 없다. 조용히 덮는 것보다 시끄럽게 멈추는 쪽을 고른다 — 손실이 되돌릴 수 없는
  방향이다. ⚠️ **그 409를 푸는 재설정 UI는 아직 없다** (2026-09-10 정정): 7단계가 `needs_configuration`을
  **후속으로 미뤘고** 구현은 0건이다 — 복구는 손으로 포맷 컬럼을 고치는 것뿐이다.

- **같은 커밋의 재전송은 통과시킨다.** strict라 결과가 같고, 스캐너를 고쳐 같은 커밋을 다시 올리는 것은 정당한 조작이다. 그래서 판정 기준이 `commitSha` 동일성이 아니라 **`commitAt` 역행**이다.
- **GitHub API로 조상 관계를 확인하지 않는다.** 더 정확하지만 지금 GitHub을 전혀 부르지 않는 push 라우트에 App 토큰과 네트워크 왕복이 들어온다. 커밋 시각은 Actions가 `git show -s --format=%cI`로 공짜로 얻는다.
- ⚠️ **프로젝트별 토큰으로 바뀌었다** (2026-09-07, SaaS 5단계). 원래는 "토큰↔프로젝트 매핑을 DB에 둬야 하고 시크릿이 프로젝트 수만큼 는다"는 이유로 거부했는데, SaaS가 프로젝트를 여러 개 받는 순간 서버 env 하나로는 대상을 가릴 수 없어 그 대가를 치르기로 했다. 매핑은 `Project.pushTokenHash`(sha256, `@unique`)다.
  - **조회 순서가 판정의 요지다**: `sha256(Bearer)` → 행 조회 → 그 행의 slug와 페이로드 대조. **페이로드 slug로 행을 찾으면 안 된다** — 오배송된 페이로드가 인증 대상을 스스로 고르게 되어 검사가 순환이 된다.
  - **`pushTokenHash`가 `null`인 프로젝트는 어떤 해시로도 조회되지 않는다** — fail-closed가 컬럼의 성질로 성립한다. 무효 토큰·미발급 프로젝트·없는 프로젝트가 전부 **401 하나**이고 404는 없다(프로젝트 존재를 노출하지 않는다).
  - `timingSafeEqual`이 사라진 것은 누락이 아니다 — 비교가 아니라 **조회**이고, 토큰은 32바이트 난수라 해시 역산이 불가능하다 (`lib/auth/invitation.ts`와 같은 판단).

**7단계(Actions 배선) 전에 서 있어야 했고, 서 있다** (Actions 배선은 2026-09-03에 끝났다). `lib/push/guard.ts`가 세 판정을 들고 `app/api/push/route.ts`가 409로 떨어뜨린다. ⚠️ **오배송 판정의 근거가 2026-09-07에 바뀌었다** — 전에는 "서버가 아는 프로젝트와 다른가"였고 지금은 **"이 토큰이 그 프로젝트의 것인가"** 다. prod `Project` 행은 여섯이고 그중 둘이 같은 리포를 가리킨다.

**발급 쪽도 여기 있다**: `generatePushToken`(32바이트 난수 → base64url 43자)·`hashPushToken`(sha256, 초대 토큰과 같은 함수)이고 **원문은 발급 응답에 한 번만 실린다** — 서버는 해시만 갖는다. ⚠️ **회전(`rotatePushToken`)은 옛 토큰을 즉시 무효로 만들므로 대상 리포 secret 교체와 짝이다**: 해시를 먼저 쓰고 secret을 나중에 넣으면 옛 해시로 도는 창이 생기고, 반대로 하면 그 리포 CI가 401로 죽는 창이 생긴다.

### 5.5.6 흐름 검증은 SQL 인자를 캡처한다 (`__tests__/flow.test.ts`, 2026-09-03)

**홉마다 단위 테스트가 있어도 이어 붙인 것을 보는 테스트가 없으면 값이 홉 사이에서 사라진다** — 이 리포의 반복 실패 유형이다 (PoC B단계). `lib/push/__tests__/flow.test.ts`가 로케일 파일 → `detect` → `read` → `buildPushPayload` → `planPush` → **`$executeRaw`가 받은 값**까지를 한 테스트에서 단언한다.

- **실 DB를 치지 않는다.** prisma 스텁이 태그드 템플릿 인자를 캡처한다 — 실 DB 왕복은 재현 가능한 게이트가 아니다 — 붙는 DB가 머신·환경마다 갈리므로(로컬·Preview는 dev, 프로덕션은 prod) 테스트가 어느 쪽을 쳤는지가 결과를 바꾼다.
- **컬럼 이름 개수 = 값 배열 개수를 매번 검사한다.** `unnest` 인자 순서가 컬럼 목록과 어긋나면 값이 옆 컬럼으로 들어가는데, 타입이 같으면(`text[]`끼리) 런타임도 조용하다.
- 덮는 손실 지점: `sortIndex`의 0(falsy), 키 description과 로케일 description의 분리, `placeholders`의 JSON 직렬화, `refs`의 keyId 연결, 빈 값 번역 제외, orphan·unorphan·`needsReview` 전파.

## 5.6 sync 실행 (`lib/sync/`)

**7단계가 pull 바깥에 껍데기를 하나 얹었다** (2026-09-10). `runPull`의 판정층은 한 줄도 안 바뀌었다 —
1층 스킵·2층 blob 비교·`captured = maxUpdatedAt`이 그대로다. 새로 생긴 것은 **"돌려도 되는가"**와
**"무엇으로 끝났는가"** 둘뿐이고, 진입점 둘(편집 UI [Send changes] · 야간 cron)이 같은 함수를 지난다.

### 5.6.1 동시 실행은 `Project` 행 잠금이 막는다

```
$transaction(tx):
  tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = … FOR UPDATE`
  running     = 최신 RUNNING 행
  lastSettled = 최신 SUCCEEDED|SKIPPED 행        ← FAILED는 안 집는다
  planSyncStart(...)  → 거부면 값으로 반환(행 없음)
  stale이면 updateMany로 옛 RUNNING을 FAILED/"stale"로 닫는다
  syncRun.create({ status: RUNNING })
```

- ⚠️ **잠금은 `Project` 행이지 `SyncRun`이 아니다** — 막으려는 것이 "이 프로젝트에 대한 두 번째
  실행"이고, **아직 존재하지 않는 행은 잠글 수 없다.** `createInvitation`·`changeMember`·`createProject`가
  같은 형이다.
- ⚠️ **부분 유니크 인덱스(`WHERE status='RUNNING'`)를 쓰지 않는다** — Prisma가 그 문법을 못 내서
  마이그레이션에 raw SQL을 손으로 넣어야 하고, 스키마와 실제 DB가 갈리는 자리가 하나 는다.
- ⚠️ **잠금 트랜잭션 안에서 GitHub을 부르지 않는다.** 여기까지가 수 ms이고 실제 pull은 밖에서 돈다 —
  안 그러면 GitHub 지연이 곧 DB 커넥션 점유이고 pooler에서 그것은 전 테넌트에 번진다.
  `app/(edit)/__tests__/sync-run.test.ts`가 그 배선을 소스가 아니라 **호출 시점으로** 잰다.
- ⚠️ **트랜잭션 안 조회는 순차다.** 대화형 트랜잭션은 커넥션 하나라 `Promise.all`이 왕복을 못 줄이고,
  엔진 내부 직렬화에 기대는 모양이 된다.
- ⚠️ **하네스로는 진짜 동시성을 못 잰다** — 메모리 `$transaction`에 직렬화가 없고 `$executeRaw`가
  no-op이다 (POSTMORTEM 2026-09-05). 테스트가 고정하는 것은 **배선**(잠금 SQL이 행 생성보다 앞이다,
  GitHub이 트랜잭션 밖이다)이고, 실제 직렬화는 실물 검증의 몫이다.

### 5.6.2 행은 시작한 실행에만, stale은 닫는다

- **게이트에서 거부된 것은 행이 없다** — `already-running`의 증거는 **첫 실행의 `RUNNING` 행**이고,
  거부마다 행을 만들면 `logs`가 "눌렀지만 아무 일도 안 일어난 것"으로 가득 찬다.
- **중단된 프로세스가 남긴 `RUNNING`은 다음 실행이 `FAILED`/`errorCode: "stale"`로 닫는다** — 지우지
  않는다. 영구 RUNNING이 안 남는 것과 "무슨 일이 있었나"가 남는 것을 함께 얻는다.
- ⚠️ **`STALE_AFTER_SECONDS`(300)는 `maxDuration`(60)보다 넉넉해야 한다.** 같거나 작으면 **정상 실행이
  스스로를 stale로 보고** 두 번째 실행을 허용한다. 그 전제가 수동 경로에서 서려면 번역 페이지가
  `export const maxDuration = 60`을 들어야 한다 — Server Action은 **자기를 부른 페이지 세그먼트**의
  값을 쓰고, 없으면 프로젝트 기본값(300)이라 두 수가 같아진다.
- **`SKIPPED`를 `SUCCEEDED`로 접지 않는다** — `lastPublishedAt`이 skipped에서 안 움직이므로
  ("마지막으로 **보낸**" 것이지 시도한 것이 아니다) 그 구별이 행에도 남아야 `logs`가 "어제 밤엔 보낼
  게 없었다"와 "어제 밤에 보냈다"를 가른다. `warnings`는 **둘 다** 센다 (§0 불변식 9).
- **실패해도 마지막 성공을 안 덮는다** — 껍데기가 `Project` 컬럼을 **아예 안 쓴다**. `lastPulledAt`·
  `lastPublishedAt`·`lastPrUrl`은 `runPull`이 성공 경로에서만 쓰고, 행을 `FAILED`로 닫는 것은 다른
  문장이라 실패가 성공 상태에 닿을 경로가 생기지 않는다.

### 5.6.3 오류 코드는 **던지는 자리**가 든다

`AppError`에 선택 `code`가 붙었고 `fail(message, code)`가 그것을 넘긴다. 잡는 쪽에서 메시지를
매칭하면 문장 하나가 바뀔 때 분류가 조용히 `unknown`으로 무너진다 — pull 실패는 전부 메시지만
다른 `AppError`다.

- `classifyFailure`는 이 필드를 **안 본다.** 그 함수는 "본문에 실어도 되는가"를, 코드는 "무엇이
  실패했나"를 답한다 — 축이 다르므로 판정도 따로다(`classifySyncError`). `safeMessage`는 앞의 것을
  그대로 부른다: 그 값이 대상 리포의 (public일 수 있는) Actions 로그로 흘러가므로 규칙이 두 벌이면 안 된다.
- **생산자 없는 코드는 두지 않는다.** 일곱뿐이고, `lib/pull/__tests__/error-codes.test.ts`가 **양방향으로**
  고정한다 — 코드를 드는 자리 **다섯**(sec-audit-2가 `repository identity is not pinned`을 더했다)과 **안 드는 자리 열하나**를 이름으로 박아, 새 `fail(`은 둘 중 하나를
  골라야 red를 벗는다(`entry-points.test.ts`가 예외를 이름으로 고정하는 것과 같은 형).
- 안 드는 자리는 **불변식 위반**(`unreachable:`)이거나 **readiness가 이미 막는 설정 부재**다 — sync 층에서
  가를 이름이 없고, `unknown`이 정직하다.

⚠️ **`retryable`은 계산되지만 아직 아무 데도 안 간다** (2026-09-11 등재). `classifySyncError`가 `RETRYABLE`
표로 코드마다 그 값을 정해 `SyncFinish`에 싣는데, `runSync`의 `syncRun.update`가 그것을 쓰지 않고
**`SyncRun`에 컬럼이 없으며** `loadSyncRuns`도 안 읽는다 — 즉 **소비자 0인 생산자**이고, 이 절의
"생산자 없는 코드는 두지 않는다"의 정확히 반대 방향이다. 적어 두는 이유는 두 오독을 막기 위해서다:
UI·자동 재시도가 이미 배선돼 있다고 믿는 것, 그리고 `RETRYABLE`을 "미사용"으로 지우는 것.

- **그 표가 담은 사실은 진짜다** — `base-unreadable`·`not-installed`·`glob-matched-nothing` 셋은
  **사람이 고치기 전까지 cron이 매일 밤 같은 실패를 반복한다**(리포 상태·설치·경로 설정이라 시간이
  해결하지 않는다). 나머지 넷(`db-unavailable`·`github-error`·`stale`·`unknown`)만 다음 실행에서 저절로 풀린다.
- **표시하기로 하면 컬럼이 먼저다.** 지금 화면이 그 구별을 흉내 내려면 `errorCode`로 다시 분기해야 하고,
  그 순간 판정이 두 벌이 된다 — `lib/sync/plan.ts`가 그 축의 주인이다.

### 5.6.4 보관은 인가 union의 갈래 하나다

`Project.archivedAt`은 **되돌릴 수 있는 사실 하나**이지 상태 머신이 아니다 (`Locale.orphaned`와 같은 형 —
PRODUCT §7.5가 "별도 상태 컬럼을 즉시 만들지 않는다"고 이미 정했다).

- 거부는 `planProjectAccess`가 한다. **`project:settings`를 제외한 모든 permission이 `archived`로 떨어지고**,
  그래서 페이지·Server Action 전부가 **한 자리**에서 거부된다 — `entry-points.test.ts`가 진입점 전수를
  세므로 새 갈래를 빠뜨린 화면이 없다. 설정만 통과하는 이유는 **그것이 되돌리는 길**이어서다.
- ⚠️ **판정 순서가 권한 → 보관이다.** EDITOR가 보관된 프로젝트의 설정을 열려 하면 답이 `forbidden`이지
  `archived`가 아니다 — 그래야 보관 여부가 권한 없는 사람에게 새지 않는다.
- **목록에서 숨기지 않는다** — 숨기면 되돌릴 링크에 도달할 길이 없다. `loadMemberships`가 `archivedAt`을
  함께 내고 행에 배지가 붙는다.
- **CI push는 409**(`checkArchived`) — 보관의 뜻이 "멈춘다"인데 리포가 계속 덮으면 보관 중에 번역이
  조용히 바뀌고, strict push라 그 덮어쓰기는 되돌릴 수 없다. 대상 리포 CI가 red가 되는 것은 의도된
  신호다(워크플로를 떼라는 뜻).
- **cron 순회에서 빠진다**(`selectPullTargets`) — 게이트까지 가지도 않고 `unprocessed`로도 세지 않는다.
- **`PROJECT_LIMIT` 슬롯을 비운다** — 삭제가 비범위라 그것이 슬롯을 되찾는 유일한 길이다.
  ⚠️ **선조회와 트랜잭션 안 재집계가 같은 조건이어야 한다**: 하나만 좁히면 증상이 같다(선조회 통과 뒤
  재집계가 거부하거나, 그 반대).
- ⚠️ **열린 PR을 닫지 않는다** (PRODUCT §7.9) — 보관은 GitHub 상태를 정리하는 일이 아니다.

### 5.6.5 cron 순회 순서는 아사 대책이다

`selectPullTargets`가 **마지막 `SyncRun.startedAt`이 가장 오래된 것부터** 돈다(한 번도 안 돈 프로젝트가
맨 앞, 동점은 slug). 전에는 `slug` 오름차순이라 `PULL_BATCH_LIMIT`에서 잘리는 뒤쪽이 **매일 밤 같은
프로젝트**였고 — 그 프로젝트는 영원히 안 돈다. `project-onboarding`이 "7단계가 큐로 가른다"고 넘긴
자리이고, **큐 없이 정렬로** 풀었다. 동점 폴백이 slug인 것은 결정성을 잃지 않기 위해서다.

## 6. 인증 경계

**세 GitHub 자격증명을 섞지 않는다** (2026-09-06에 둘에서 셋이 됐다 — 4단계가 "이 사람이 어느 설치를 볼 수 있는가"를 묻기 시작했다).

| 용도 | 자격증명 | 이유 |
|---|---|---|
| 편집 UI **로그인** | GitHub·Google OAuth **App** (Auth.js, DB 세션 / `AUTH_GITHUB_*`) | 신원 확인까지다 — **무엇을 할 수 있는지는 정하지 않는다** |
| 편집 UI **인가** | `ProjectMember` 행 (`getProjectAccess`) | 로그인 provider가 권한을 정하지 않는다 (§0 불변식 7). 허용 핸들 목록은 2026-09-06에 사라졌다 |
| GitHub **연결** | GitHub App **user-to-server** 토큰 (`GITHUB_APP_CLIENT_*`, `lib/github-connect/user.ts`) | "이 사람이 이 설치·리포를 볼 수 있는가"를 묻는 데만 쓴다. **GET만 부른다** — 이름에 OAuth가 들어가지만 로그인 토큰과 client id가 다르다 |
| `l10n/sync` 쓰기 | GitHub App **installation** 토큰 (`GITHUB_APP_ID`·`GITHUB_APP_PRIVATE_KEY`) | OAuth 토큰으로 커밋하면 커밋이 개인 명의가 되고 그 사람이 org를 떠나면 깨진다 |
| `/api/github/callback` | 세션(`requireUser`) + userId에 묶인 **state HMAC** + state 쿠키 | 브라우저가 돌아오는 지점이라 CSRF 축이 초대 토큰과 같다 (§6.4) |
| `/api/push/failure` 호출 | Bearer **같은 프로젝트별 토큰** (2026-09-13) | CI가 **적재에 실패했다는 사실**만 남긴다. 로케일 파일을 파싱하지 못하면 `/api/push`는 아예 안 불리므로, 그 실패는 여태 대상 리포의 Actions 로그에만 있었다. ⚠️ **새 토큰을 만들지 않았다** — 같은 `PUSH_TOKEN`이고, 그래서 인증 경로가 하나 더 늘지 않는다. ⚠️ **아무것도 적재하지 않는다**: 키·번역은 물론 `lastCommitSha`·`lastCommitAt`도 안 움직인다(전진시키면 다음 정상 push가 자기 커밋으로 `stale-commit` 409를 받는다). 본문은 **4 KiB 상한 + `strictObject`**이고 코드 넷만 받는다 — 파서 원문·소스 문자열·로컬 절대경로는 보고에도 DB에도 들어가지 않는다 |
| `/api/push` 호출 | Bearer **프로젝트별 토큰** (생성·해싱은 `lib/push/token.ts`, **조회는 `app/api/push/route.ts`**) | Actions는 사람이 아니다. **fail-closed** — 해시가 없는 프로젝트는 어떤 토큰으로도 통과하지 못하고(컬럼이 `null`), 거부 응답은 어느 쪽이 틀렸는지 알려주지 않는다(토큰 존재 여부·프로젝트 존재 여부를 탐색할 단서를 주지 않는다). ⚠️ 2026-09-07 전에는 서버 env 하나였고 그 값이 비면 500이었다 — 지금은 그런 변수가 없다 |
| `/api/pull` cron 호출 | `CRON_SECRET` | 공개 엔드포인트면 아무나 커밋을 유발할 수 있다. **`checkBearer`를 재사용한다** — fail-closed가 이미 그 시그니처에 있다. 실측: 시크릿 없음·틀림 모두 401이고 응답이 구별되지 않는다 |

⚠️ **경계를 소스에서 상시로 센다** — `lib/github-connect/__tests__/credential-separation.test.ts`가 양방향으로 본다(개인키가 연결 경로로 / 사용자 토큰이 커밋 경로로) + 연결 경로의 쓰기 금지 + **스캐너 자신이 red를 낼 수 있는지**까지 검사한다. ⚠️ **축이 둘 더 있다** (2026-09-07 이후): ① **세 번째 경계** — `lib/onboarding/`은 두 자격증명 어느 쪽도, `@/lib/github`도 import하지 못한다(두 토큰이 Server Action 하나에서만 만나는 성질이 여기서 선다). ② **쓰기 검사가 네 입구로 넓어졌다** — `request(...)`/`paginate(...)`의 라우트 문자열, `rest.*`의 이름 기반 writer(`create*`·`update*`·`delete*`·`replace*`·`add*`·`remove*`·`merge`·`set*`), `graphql` mutation. 2026-09-07까지는 리터럴 `request("POST"…)`만 봐서 "GET만 부른다"가 근거 없이 서 있었다. `lib/adapters/__tests__/contract.ts`·`app/__tests__/entry-points.test.ts`와 같은 계열이다.

⚠️ **막는 것은 디렉터리가 아니라 토큰을 쥔 모듈이다**(`user.ts`·`token-store.ts`). `lib/github.ts`가 `lib/github-connect/health.ts`의 `probeFromError`를 import하는 것은 **필수**다 — 금지하면 403·404 분류가 두 벌이 되어 설치 일시중지가 한쪽에서만 `app-uninstalled`가 된다.

### 6.00 보안 모델 — 정책 선언 

> **모든 서버 요청에서 사용자·프로젝트·GitHub 설치의 관계를 다시 확인하고, 일치하지 않으면 거부한다.**

아래 넷은 *구현*이 아니라 *정책*이다. 구현과 함정은 §6.0~§6.6이 든다.

**① 차단의 층이 둘이고 조건부 렌더는 어느 층도 아니다.** `middleware.ts`는 로그인하지 않은 사용자의
페이지 렌더(GET·HEAD)를 막는 1차 방어이고 프로젝트 인가를 대신하지 않는다. Page·Server Action·
Route Handler가 **각각 자기 경계에서** 확인한다 (§6.1). SaaS에서 이 실수의 형태는
**"middleware가 로그인을 확인했으니 프로젝트 접근도 됐겠지"** 다.

**② 장애는 거부가 아니다.** `auth()`는 DB 예외를 삼키고 `null`을 돌려주므로 모든 진입점은
`readSession`을 쓴다 — `unavailable`이면 "일시적인 오류"를 보이고 **로그인을 시키지 않는다**
(§6.1.2). 같은 축이 연결 경로에도 있다: probe error → `unknown`(≠`app-uninstalled`), 토큰 429 →
`unavailable`, DB 장애 → `unavailable`이고 **`unavailable`만 재시도를 권한다.** "모르는 것을 거부로
말하지 않는다"가 두 층에서 같은 규칙이다.

**③ 인가 판정의 주인은 하나다.**

```ts
requireProjectAccess({ slug, permission: "translation:write" })   // 페이지 — 실패하면 redirect
getProjectAccess(prisma, { userId, slug, permission })            // Server Action — union 반환
```

⚠️ **인자가 `projectId`가 아니라 `slug`다.** 프로젝트를 정하는 것이 URL이므로 호출부가 아는 것은
slug뿐이고, `projectId`는 **판정이 돌려주는 값**이다 — 그 뒤의 모든 쿼리가 그 `projectId`로 좁혀지고,
클라이언트가 보낸 id는 어디에서도 신뢰 경로에 들어가지 않는다. **클라이언트가 보낸 role·owner 여부·
projectId의 정당성을 믿지 않는다.** ⚠️ 갈래 하나(`archived`)만 redirect하지 않고 값으로 돌아온다
(§5.6.4) — **대가는 호출부가 빠뜨릴 수 있다는 것**이고 `app/__tests__/screens.test.ts`가 그 갈래를
만나는 화면 다섯을 전수로 센다.

**④ 세션은 DB에 있다 — 권한 회수가 다음 요청부터 반영된다.** PoC의 JWT 결정이 여기서 뒤집혔다:
JWT는 권한 회수가 최대 24시간 지연되는데 SaaS에서는 **멤버 제거와 역할 변경이 즉시 반영돼야 한다.**
세션에는 **안정적인 `userId`만** 담고 프로젝트 목록과 role은 매 요청 DB에서 조회한다 — 토큰에
`projectIds`나 role을 넣는 순간 JWT의 지연 문제가 그대로 돌아온다. 대가는 요청마다의 DB 왕복이고,
그것이 PoC에서 JWT를 고른 이유였다. **그 대가를 지금 지불한다.** 정책 상세는 §6.1.1·§6.6.

#### 6.02 초대 — 토큰은 해시만 저장한다

- 초대 토큰 **원문을 DB에 저장하지 않는다**(해시만). 안전한 난수 · 단일 사용 · 만료형이고 수락 성공과
  동시에 무효화한다.
- 초대 대상 이메일과 **provider가 검증한 이메일이 일치**해야 수락된다. 대조 기준인 `User.email`은
  **재로그인마다 provider의 현재 검증 주소로 갱신한다** — OAuth 재로그인은 Auth.js가 `updateUser`를
  부르지 않아 첫 로그인 값으로 굳고, primary를 바꾼 사람이 새 주소로 온 초대를 영영 못 받았다.
  새 주소를 **다른 User가 쓰면 갱신도 병합도 하지 않고 로그인은 허용한다**(§6.2.1 우회 금지).
  ⚠️ 로그인 `Account`가 둘 이상인 User는 `planEmailRefresh`가 언제나 `keep`이다 — 아니면 `User.email`이
  마지막으로 로그인한 provider에 따라 뒤집히고 초대 대조가 그 위에 선다 (account-linking).
- 단일 사용은 `updateMany`의 `acceptedAt: null` · 조회한 `expiresAt` 동등 조건 · 소비 직전 미만료
  조건의 count로 강제한다 — 만료가 소비 조건에 들어 있어 판정~소비 사이에 재초대로 회전된 옛 행이
  옛 role로 멤버를 만들지 않는다.
- Project에는 **항상 OWNER가 한 명 이상** 있어야 한다. 강제 수단은 `changeMember`의 대화형 트랜잭션이다:
  `Project` 행 `FOR UPDATE` 잠금 → 판정 → 쓰기 → OWNER 재집계 → 0이면 롤백. **FK Restrict는 멤버 행
  변경을 막지 않는다** — OWNER 둘이 동시에 각자를 강등하면 count 검사만으로는 0명이 된다.
- membership은 이메일이 아니라 **`User.id`를 참조**한다 (이메일 주소는 재할당될 수 있다).
- ⚠️ `(projectId, emailLookup)`은 unique가 아니라 **index**다. unique로 걸면 수락·만료된 행이 이메일을
  점유해 **재초대가 막힌다.** 대신 `createInvitation`이 미수락 행을 먼저 만료시켜 **토큰을 회전**시키고,
  회전과 생성은 `Project` 행을 잠근 한 트랜잭션이다 — 갈라 두면 동시 발급이 유효 링크를 둘 남긴다.
- ⚠️ **토큰이 URL 경로에 실린다** — 브라우저 히스토리·리퍼러·전달된 링크에 남는다. **단일 사용과 7일
  만료로 수용한 위험**이고, 없애려면 수락 폼에 토큰을 POST해야 하는데 그러면 비로그인 열람 화면이
  성립하지 않는다.

#### 6.03 보안 회귀 체크리스트 — 아래가 **전부 거부**돼야 한다

인증·인가 경로를 고쳤으면 이 목록으로 되짚는다. 각 항목에 대응하는 상시 테스트가 있다
(`app/(edit)/__tests__/authorization.test.ts`·`membership.test.ts`·`onboarding.test.ts`·
`github-connect.test.ts`·`publish-failure.test.ts`, `app/api/__tests__/github-callback.test.ts`).

- 비로그인 사용자의 프로젝트 조회·수정·Publish
- 프로젝트 A 멤버가 프로젝트 B의 URL·ID를 직접 전송
- 다른 프로젝트의 `keyId`·`localeCode`·`translationId` 조합
- EDITOR의 멤버·리포 설정 변경
- 설치되지 않은 리포를 Project로 등록 / 설치에 접근할 수 없는 사용자의 프로젝트 생성
  — 사용자 쪽 목록 둘을 **제출 시점에 다시 부른다**(렌더 때 본 것을 인가 근거로 쓰지 않는다)
- **제거된 멤버가 기존 세션으로 재접근**
- 같은 이메일이라는 이유만의 provider 계정 자동 병합 (§6.2.1)
- 초대받은 이메일과 다른 계정으로 초대 수락 · 초대 토큰 재사용·만료 후 사용
- **state 없이·위조한 state로 연결 callback 도착** (§6.4) — code 교환과 `Account` 쓰기가 **0회**여야 한다
- 로그·클라이언트 응답에 토큰·PEM·DB URL 노출 (§6.0)

### 6.0 ⚠️ 500 본문은 우리 메시지만 담는다

**두 라우트의 `catch`는 던진 메시지를 그대로 싣지 않는다** (2026-09-04). ⚠️ **Publish Server Action은 7단계부터 `catch`가 없다** — `runSync`가 던지지 않고 오류 접기가 `lib/sync/`로 옮겨갔다(§5.6). 아래 규칙은 그 껍데기 안에서 그대로 산다. `lib/failure.ts`의
`classifyFailure`가 가른다:

⚠️ **`/api/pull`은 `catch`가 둘이다** (§3.05의 프로젝트별 격리와 이어진다) — 외곽 하나와 프로젝트별 `failureItem` 하나. `lib/pull/**`의 실패는 대개 `safe`(`fail()`)이고 개별 실행 결과는 **HTTP 200의 results 배열**이며 cron이 본문을 버리므로, 조용한 `safe` 갈래는 전면 장애를 성공과 구별 불가로 만든다. 그래서 프로젝트별 실패도 분류를 지나 항목으로 남는다.

| 오류 | 본문 | 전문 |
|---|---|---|
| `AppError`(`fail()`) · `MissingEnvError`(`requireEnv`) | 메시지 그대로 | — |
| 그 밖(Prisma·octokit·unknown) | `{ error: "internal", ref }` | `console.error`로 서버 로그(Vercel) |

⚠️ **첫 구현은 `MissingEnvError` 하나만 안전으로 봤고 그게 진단을 한 단계 늦췄다** (2026-09-04 실측). 프로덕션이 `프로젝트를 찾을 수 없다: order-check`로 죽었을 때 본문이 `{error:"internal",ref}`뿐이어서 Vercel 로그를 뒤져야 원인(Production `DATABASE_URL`이 dev를 가리킴)을 알았다. 우리가 문구를 정한 오류는 slug·경로 템플릿·어댑터 이름만 담고 그건 CI가 이미 입력으로 아는 값이다 — `lib/pull/**`의 `throw`를 전부 `fail()`로 바꿔 그 자리들이 본문에 남는다.

⚠️ **`fail(String(err))`로 남의 오류를 감싸지 않는다.** 감싸면 그 순간 이 방어가 무의미해진다 — 판정이 막을 수 없고 규율로만 지켜진다.

⚠️ **`/api/push/failure`의 쓰기는 조건부다** (2026-09-13). 위 검사 셋(보관·오배송·커밋 역행)을
통과해도 **무조건 쓰지 않는다** — 그 사이에 성공한 push가 들어왔으면 오래된 실패가 그것을 덮는다.
같은 조건(`id` · 인증에 쓴 토큰 해시 · `archivedAt IS NULL` · `lastCommitAt <= commitAt`)을 UPDATE의
`where`에 다시 싣고 **갱신 건수로 판정한다**. 앞의 검사는 진단 가능한 409를 만들기 위한 것이고,
실제 방어선은 그 조건부 쓰기다. **수신 순서의 의미는 "마지막으로 받은 실패"** 하나이고 실행 이력이
아니다 — 같은 커밋의 재실행 실패도 표시하며, 같은 커밋의 성공 뒤 늦게 도착한 실패는 표시될 수 있다.

⚠️ **성공의 원자성도 같은 축이다.** 완전 성공이면 이전 실패를 **적재와 같은 트랜잭션에서** 비운다 —
`applyPush` 뒤에 따로 쓰면 데이터는 들어갔는데 목록만 실패로 남는 창이 생긴다. 그 비움은 **자기 실행의
시작 시각을 대조해서만** 일어난다: 먼저 끝난 실행이 나중에 시작한 실행의 진행 표시를 지우면, 그 나중
실행의 실패 기록이 조건부 쓰기에서 탈락한다 (POSTMORTEM 2026-09-13).

⚠️ **`/api/push`에는 대응하는 사건이 없다** (2026-09-07). 전에는 같은 사건("그 slug의 `Project` 행이 없다")을 404 + 본문(`project '<slug>' not found`)으로 냈는데, 프로젝트를 **토큰이 정하게** 되면서 그 갈래가 사라졌다 — 조회되지 않으면 무효 토큰과 구별하지 않고 **401 하나**다(프로젝트 존재를 노출하지 않는다, §5.5.5). pull이 5xx인 것은 그대로다: 그쪽은 **자기 설정**을 읽는다.

전에는 전부 그대로 실었고, 근거는 POSTMORTEM 2026-09-03의 **"본문 없는 500이 원인을 지웠다"** 였다.
그 결정의 전제가 "로그를 읽는 사람이 우리뿐"이었는데 **`.github/actions/l10n-push`는 임의의 대상
리포에서 돌고** `scripts/push-local.ts`가 응답 본문을 stdout에 찍는다 — 대상이 public이면 Prisma
접속 오류 한 번이 pooler 호스트와 DB 유저를 **공개 Actions 로그**에 박는다(`bugshot-2`가 public이다).
회고의 요구("원인이 남는다")는 `ref`로 지킨다: 운영자가 그 값으로 Vercel 로그를 찾는다.

⚠️ **Server Action도 같은 규칙이다** (2026-09-06 Codex 감사 #7). `triggerPullAction`이 `error.message`를 그대로 직렬화해 **외부 초대자의 화면**에 Prisma 접속 오류가 갈 수 있었다 — 읽는 사람이 우리가 아닌 것은 Actions 로그와 같다. ⚠️ **7단계가 그 `catch`를 `runSync` 안으로 옮겼다**(`classifySyncError` → `safeMessage`가 `classifyFailure`에 위임한다) — 규칙은 같고 **자리가 하나로 줄었다**. `app/(edit)/__tests__/publish-failure.test.ts`가 원문 부재와 `ref` 존재를 검사한다.

⚠️ **판정은 문구가 아니라 타입이다.** 남의 오류가 우리 문구를 담아도 안전이 아니고, 우리 문구가
바뀌어도 판정이 흔들리지 않는다. `instanceof`가 아니라 `name` 비교인 이유는 모듈 인스턴스가 둘이
되면(번들 경계·mock) 조용히 false가 되어 설정 누락이 `internal`로 접히기 때문이다.

### 6.05 시크릿 비교는 **고정 길이 digest**로 한다 (2026-09-09, sec-audit 발견 6)

`timingSafeEqual`은 길이가 다른 버퍼에 **던진다.** 그래서 두 자리(`lib/push/auth.ts`의 `checkBearer` ·
`lib/github-connect/state.ts`의 `equalConstantTime`)가 앞에 길이 검사를 뒀는데, **재는 자가 어긋나
있었다** — 검사는 `String.length`(UTF-16 코드 유닛)이고 비교는 `Buffer`(UTF-8 바이트)다. `"가"`는
코드 유닛 1 · 3바이트라 `"a"`와 같은 길이로 통과하고 `RangeError`가 난다.

⚠️ **두 입력 모두 공격자가 정한다** — Bearer 헤더와 state 쿠키다. 던지면 라우트의 `catch`가 500으로
접어 **거부가 장애로 위장된다**(§6.3의 반대 방향).

**해시하면 양쪽이 항상 32바이트라 길이 검사 자체가 사라진다.** 규칙을 고치는 것이 아니라 **없애는**
쪽이고, 그래서 세 번째 비교 자리가 생겨도 같은 함정을 복사하지 않는다. 두 파일이 각자 `sha256`
헬퍼를 들고 서로를 "같은 규칙"으로 참조한다.

⚠️ **호스트 판정도 같은 절에 있다** (발견 25): `requestOrigin`은 모양 검사 위에 **기대 호스트 허용
목록**을 든다. 실측으로는 Vercel 엣지가 `Host` 위조를 404로 막고 `X-Forwarded-Host`를 반영하지
않지만(2026-09-09 프로덕션), 그 방어는 **플랫폼 설정의 성질이지 우리 코드의 성질이 아니다.**

### 6.1 ⚠️ 차단은 미들웨어, **인가는 진입점** (2026-09-05 갈렸다)

**레이아웃의 조건부 렌더는 차단이 아니다.** App Router는 레이아웃과 페이지를 병렬로 렌더하므로, 레이아웃이 `children`을 쓰지 않아도 페이지는 이미 실행돼 DB를 조회하고 RSC 페이로드를 응답에 싣는다. 실측으로 세션 없는 `/keys` 응답 **1.3MB에 1446키가 노출**됐다 — 화면엔 로그인 버튼만 보이므로 눈으로는 안 보인다 (`docs/POSTMORTEM.md` 2026-08-31).

⚠️ **DB 세션으로 바뀌면서 층이 둘로 갈렸다.** 전에는 미들웨어가 JWT를 검증해 **완전한 판정**을 했지만, 지금 미들웨어가 하는 일은 **쿠키가 있는지 보는 것**뿐이다. SaaS에서 같은 실수의 형태는 **"middleware가 로그인을 확인했으니 프로젝트 접근도 됐겠지"** 다 (§6.00 ①).

| 층 | 무엇을 하나 | 무엇을 못 하나 |
|---|---|---|
| **1차 `middleware.ts`** | `shouldRedirectToLogin` — **렌더 요청(GET·HEAD)에** 세션 쿠키가 없을 때만 **`/signin`으로** 돌린다(8-1a 전에는 `/`였다). 쿠키 이름은 `authjs.session-token`(http) / `__Secure-authjs.session-token`(https) **둘 다 검사한다**: 로컬은 접두가 없고 preview·프로덕션은 있다. ⚠️ **Server Action POST는 통과시킨다** (2026-09-06) — 307을 내면 `fetch`가 POST를 로그인 화면으로 재전송해 action id를 못 찾고 **페이지 오류**가 된다. Action은 스스로 `readSession`으로 `unauthorized`를 내므로 여기서 막아 얻는 것이 없고, 세션이 만료되면 브라우저가 쿠키를 지우므로 "쿠키 없는 POST"는 매일 일어나는 경로다 | 쿠키가 위조·만료됐는지 모른다. **프로젝트 인가는 전혀 모른다** |
| **본판정: 페이지·Server Action** | `requireProjectAccess`(redirect) / `getProjectAccess`(union 반환) → `planProjectAccess` | — |

- ⚠️ **미들웨어에서 `auth()` 래퍼를 쓰지 않는다.** `strategy: "database"`에서 그 래퍼는 `adapter.getSessionAndUser`를 부르고 `updateAge`를 넘으면 세션 갱신 **쓰기**까지 한다(`next-auth/lib/index.js`, `@auth/core/lib/actions/session.js`) — 미들웨어가 Prisma·pg를 물게 되고 "값싼 1차 차단"이 거짓이 된다.
- **새 보호 라우트를 추가하면 `matcher`에 추가한다.** ⚠️ **반대로 `/api/push`·`/api/pull`은 넣지 않는다** — 외부(CI·cron)가 부르는 진입점이라 세션이 없고, 넣으면 야간 pull이 조용히 리다이렉트된다. 그쪽 방어는 Bearer 토큰이다. **`/invite/[token]`도 넣지 않는다**: 비로그인으로 열려야 초대 링크의 토큰이 보존된다. **`/api/github/callback`도 넣지 않는데 이유가 다르다** — 로그인 화면으로 302되면 쿼리의 `code`가 사라져 연결이 성립하지 않는다. ⚠️ **`/signin`·`/privacy`·`/docs`도 넣지 않는다** (8-1a): 앞의 것은 넣으면 **로그인이 통째로 죽는다** — `shouldRedirectToLogin`도 `middleware()`도 **경로를 한 번도 보지 않으므로**(목적지 제외 규칙이 한 줄도 없다) 쿠키 없는 모든 `GET /signin`이 자기 자신으로 307을 돈다. 바로 위 "새 보호 라우트를 추가하면 matcher에 추가한다"가 그 함정을 부르는 문장이라, `app/__tests__/entry-points.test.ts`가 **부정 단언**으로 상시 고정한다. 대신 그 라우트가 스스로 `requireUser`를 지난다(§6.4).
- ⚠️ **`/account`는 matcher를 늘려야 했다** (2026-09-09, 6b-4). 그때까지 패턴이 `/projects/:path*`
  **하나**였고 `(edit)` 아래 모든 페이지가 **우연히** 그 접두를 갖고 있었다 — 사용자 축이 생기면서 그
  우연이 끝났다(PRODUCT §7.7). 그 한 줄을 빼면 `entry-points.test.ts`의 "(edit) 아래 모든 페이지가 어느
  패턴에든 걸린다"가 red다(실측으로 확인했다 — 검사가 공허하지 않다).
- ✅ **`/projects/:slug/members`는 matcher를 안 늘렸다** (2026-09-09, 6b-2). 패턴이 `/projects/:path*`라
  이미 덮는다 — `entry-points.test.ts`가 그것을 실제로 대조한다(패턴을 정규식으로 바꿔 보호 페이지 전수에 먹인다).
  ⚠️ **그 화면의 게이트가 `translation:write`다** — 멤버 관리 Action은 `member:manage`인데 **페이지는 아니다.**
  EDITOR도 "누가 이 프로젝트에 있나"를 봐야 하고(user-stories §5), 컨트롤 노출은 role로 갈리되 **판정은
  Action**이 한다. 즉 **한 화면 안에서 페이지 permission과 Action permission이 다른 첫 사례**다 — 노출을
  차단으로 착각하면 그 차이가 구멍이 된다(§6.1의 "조건부 렌더는 차단이 아니다"가 여기서도 같다).
- ⚠️ **라우트가 살아 있는 동안 matcher에서 빼지 않는다.** 빼는 순간 그 페이지의 방어가 레이아웃 `redirect()` 하나로 줄고, 그게 위 회고가 배운 부류다. `/keys`는 `/projects/[slug]/translations`로 **옮겨지는 같은 커밋에서** 함께 빠졌다 — 라우트가 사라진 뒤의 matcher 항목은 방어가 아니라 낡은 이름이다.
- **2차: 레이아웃의 `redirect()`** — 조건부 렌더가 아니라 `redirect`를 던져야 응답이 중단된다. matcher 누락 시의 안전망이다. **페이지 최상단의 `await requireProjectAccess()`도 같은 성질이다** — 실패하면 던지므로 페이로드가 만들어지지 않는다. `if (!access) return <Denied/>`로 되돌아가면 2026-08-31의 실수를 그대로 반복한다.
- **검증은 화면이 아니라 응답 본문으로 한다**: `curl -s <라우트> | grep <민감 데이터>`가 0건이어야 한다.

**Server Action도 같은 계열이다** — Action 호출은 레이아웃을 지나지 않으므로 Action이 스스로 인증·인가·테넌트 격리를 한다 (`app/(edit)/actions.ts`). ⚠️ **예외가 하나다**: `app/invite/actions.ts`는 프로젝트 인가를 지나지 않고 **토큰이 그것을 대신한다**(단일 사용). `app/__tests__/entry-points.test.ts`의 **`EXEMPT_ACTIONS`**(`"invite/actions.ts#acceptInvitation"`)에 이름으로 고정돼 있고 — ⚠️ **같은 파일의 `EXEMPT`는 다른 목록이다**(인가를 안 지나는 **페이지·라우트** 여덟이고 Action이 아니다) — 같은 테스트의 `GUARDS`가 `requireUser`도 인정하므로 **세션만 확인하는 진입점**(두 부류다: **사용자 소유 자원**을 다루는 것(`/api/github/callback`·`/account` 계정 연결·`disconnectGithub`·전체 세션 회수 시작)과 **인가할 프로젝트가 아직 없는 생성 경로**(`/projects/new` + `projects/actions.ts`의 연결·목록·탐지·생성 넷))도 자동 검사를 통과한다. ⚠️ **편집 중 저장 Action에서는 `redirect()`를 쓰지 않는다**: blur 저장 중의 redirect는 입력 중인 셀을 날린다. **나가는 OAuth 시작은 예외다** — `startGithubConnect`는 성공 시 GitHub으로 `redirect`하고 실패만 값으로 돌아온다(목적지가 우리 화면이 아니라 남의 사이트라 값으로 돌려줄 것이 없다). `getProjectAccess`가 결과를 union으로 돌려주고 화면이 문구로 보인다. **입력은 인가보다 먼저 zod로 거른다** — 타입 시그니처는 클라이언트를 구속하지 않고, 조작된 `role`이 Prisma enum에 닿으면 digest 오류가 된다(§6.3).

#### 6.1.1 세션 정책 — 마지막 활동 뒤 24시간 (2026-09-06)

`credentialAdapter`는 32바이트 난수 세션 원문을 HttpOnly 쿠키와 Auth.js 내부 반환에만 유지하고 DB에는 `sha256:v1:<digest>`를 저장한다. 조회 입력을 항상 다시 해시하므로 DB digest를 쿠키로 제출해도 인증되지 않는다. 갱신은 현재 미만료 행만 바꾸고 삭제된 세션을 생성하지 않는다. 공개 `publicSession` 허용 목록은 그대로다.

`session: { strategy: "database", maxAge: 24h, updateAge: 1h }`. ⚠️ **`updateAge`를 명시하지 않으면 기본값(24h)이 `maxAge`와 같아** `session.js`의 갱신 조건이 `expires <= now`가 되고 **세션이 한 번도 연장되지 않는다** — 로그인 정각 24시간 뒤 편집 도중 끊기고, 브라우저가 쿠키를 지워 blur 저장이 미들웨어에 걸렸다(Codex 감사 #6). 지금은 활동 중인 세션이 시간당 한 번 DB 쓰기로 연장된다. `provider-config.test.ts`가 `strategy: "database"`와 `updateAge` 리터럴을 고정한다 — ⚠️ **`maxAge`는 검사하지 않으므로** 7일로 바꿔도 green이다.

**`session` 콜백은 입력을 돌려주지 않는다.** DB 세션에서 콜백이 받는 `session`은 `Session` **행**이라 `sessionToken`이 들어 있고, 반환값이 곧 `/api/auth/session` 본문이다 — 입력에 `id`만 얹어 돌려주면 HttpOnly 쿠키의 값이 JSON으로 샌다(Codex 감사 #1, 2026-09-06까지 열려 있었다). `lib/auth/public-session.ts`가 `user.{id,name,email,image}`·`expires`만 허용 목록으로 새 객체에 담는다.

**전체 세션 회수(#38, 2026-09-10)**: `/account` Server Action이 기존 로그인 Account를 서버에서 선택하고 새 OAuth 왕복을 시작한다. VerificationToken의 목적별 identifier에 userId/provider/account ID/session digest/state digest, token에는 nonce digest를 저장하며 5분간 유효하다. User 잠금 아래 현재 계정·세션·TTL을 재검사한 뒤 확인 요청의 조건부 소비와 사용자 Session 전체 삭제를 한 트랜잭션으로 처리한다. 다음 인증부터 거부되고 이미 실행 중인 요청은 중단하지 않는다.

`lib/session-revocation/http.ts`는 요청별 AsyncLocalStorage로 Auth.js state 쿠키를 별도 이름과 salt로 분리한다(기본 15분). nonce가 사라지거나 확인 요청이 교체/소비돼도 일반 로그인으로 전환되지 않는다. signIn의 고정 URL 반환이 handleLoginOrRegister 전에 끝내므로 새 세션·계정·이메일 갱신이 없다. 응답 wrapper는 내부 완료 결과만 성공 근거로 삼아 nonce/state 쿠키를 지우고, 성공 때만 세션 쿠키도 지운다. 일반 로그인 두 시작(`/signin`, 초대)은 이전 회수 쿠키를 정리한다. 시작과 완료의 Secure 판정은 host/forwarded-proto를 함께 사용한다. ✅ **프로덕션에서 실물 확인했다** — 그 사용자의 세션 둘이 지워지고 다른 사용자의 세션은 남았으며 새 세션은 생기지 않았다. 남은 것은 Google 왕복·취소 경로·키보드/포커스이고를 따른다.

#### 6.1.15 ⚠️ 키 부재는 던지고 행 하나는 살린다 — **순서가 판정이다** (2026-09-10)

암호화 전환 뒤 목록 로더 넷이 행마다 복호화한다: `loadMembers`·`loadPendingInvitations`(`lib/auth/query.ts`) · `loadSyncRuns`(`lib/sync/query.ts`) · `loadActors`(`lib/keys/query.ts`).

- **한 행이 못 열려도 목록은 산다.** 전환 중에는 **부분 변환이 정상 상태**이고(backfill이 행 단위 CAS다) 키를 회전하고 옛 키를 폐기하면 옛 세대가 남는다. 던지면 멤버 아홉이 멀쩡한데 화면이 통째로 500이다. 못 읽은 행은 **자기 문구**(`m.common.unreadable` = "Unavailable")를 들고, 이름은 비운다 — 옛 값을 그럴듯하게 보여줄 자리가 없다. `loadActors`만 다르다: map에서 **빼면** `actorLabel`이 `updatedBy` 원문으로 폴백하므로 셀이 비지 않는다(옛 GitHub 핸들을 위해 이미 있던 갈래다).
- ⚠️ **`null`(정보 없음)로 접지 않는다.** 그것이 POSTMORTEM 2026-09-03의 "실패한 조회를 '없음'으로 읽어 경고가 존재하지 않는 것과 구별되지 않았다"이고, 화면 층으로 내려온 같은 축이다 — 이력 표에서 `—`(부재)와 "Unavailable"(못 읽었다)이 **같은 열에서 갈린다**.
- ⚠️ **`validatePiiReadKeys()`가 행 루프보다 먼저다.** 순서가 뒤집히면 **키가 통째로 빠진 장애가 "전원 정보 없음"으로 보인다** — 정상 화면과 바이트 단위로 같아진다. 키 부재는 행의 손상이 아니라 서브시스템 장애이므로 던진다. 이 순서가 §6.1.2("세션 없음 ≠ 못 읽었다")와 정확히 같은 판정이다.
- `readable()`(`lib/credentials/records.ts`)은 **`CredentialError`만** 삼킨다. Prisma 오류나 프로그래밍 실수를 함께 접으면 그것도 조용해진다.

#### 6.1.2 ⚠️ "세션 없음"과 "세션을 못 읽었다"는 다르다 (POSTMORTEM 2026-09-06)

`auth()`는 어댑터 예외를 `logger.error(new SessionTokenError(e))`로 삼키고 `null`을 돌려준다(`@auth/core/lib/actions/session.js:123`). `next-auth`의 `parseSessionResponse`도 non-OK를 `null`로 접는다. **반환값으로는 DB 장애와 비로그인을 원리적으로 구별할 수 없다** — 프로덕션 전면 장애가 "리다이렉트 100% = 정상"으로 읽혔다.

- **모든 서버 진입점은 `auth()` 대신 `readSession()`을 쓴다** (`lib/auth/read-session.ts`) — `ok | none | unavailable`. `app/__tests__/entry-points.test.ts`의 "세션 읽기 단일 진입점"이 `app/`·`lib/`·`middleware.ts`를 스캔해 그 밖의 `auth()` import·호출을 red로 만든다.
- 통로는 `logger`다. `auth.ts`의 `logger.error`가 `noteAuthError`를 부르고, `withOutageFlag`가 **AsyncLocalStorage**로 요청 스코프에 표시를 남긴다 (`lib/auth/outage.ts`). 모듈 변수 하나면 다른 요청의 장애가 이 요청의 거부로 둔갑한다.
- `unavailable`이면 `requireUser`·레이아웃은 `/signin?error=Unavailable`로(비로그인의 `/signin`과 **다른 응답**), Action은 `error: "unavailable"`로, 로그인 화면은 `m.errors.signIn.Unavailable`("Something went wrong. Try opening this again in a moment.")을 보인다. **로그인을 시키지 않는다** — 장애 중 "다시 로그인하라"는 틀린 지시다.
- 같은 모양이 하나 더 있었다: GitHub `/user/emails` HTTP 실패가 "미검증 이메일"로 접혀 처음 로그인하는 사람만 거부됐다. 지금은 `githubApi`가 non-OK를 `fail()`로 던져 `Configuration`("잠시 뒤 다시")으로 간다.

### 6.2 이메일 검증 — **저장되는 값을 만드는 자리에서** 한다 (2026-09-05)

로그인은 provider가 **검증한** 이메일이 있을 때만 통과한다. 초대 대조(§6.02)가 그 값 위에 서기 때문이다.

⚠️ **`signIn` 콜백에서 검사만 하면 안 된다.** 그 콜백이 받는 `user`는 기존 사용자일 때 **DB 행**이고, 어댑터가 쓰는 것은 `userFromProvider`다(`@auth/core`의 callback 라우트). 검사와 저장이 다른 값을 보게 되고, GitHub은 공개 이메일이 있으면 그걸 쓰므로 **검증한 주소와 저장되는 주소가 갈린다.** 그래서 판정을 **provider의 `profile`/`userinfo.request`** 로 올렸다 — 거기서 나온 값이 곧 `User.email`이다. `signIn`은 그 결과가 비어 있는지 보고, **기존 사용자면 저장된 `User.email`을 지금 검증된 주소로 맞춘다** (POSTMORTEM 2026-09-05, 갱신은 2026-09-06).

⚠️ **OAuth 재로그인은 `updateUser`를 부르지 않는다** (`@auth/core` handle-login — email provider 분기만 갱신한다). 그래서 `User.email`이 첫 로그인 값으로 굳고, primary를 바꾼 사람은 새 주소로 온 초대를 영영 `email-mismatch`로 받고 옛 주소로 온 초대는 수락한다(Codex 감사 #5). `signIn`이 `Account` 행으로 기존 사용자를 판정하고(`user.id`는 새 사용자일 때 provider의 id라 못 믿는다) `planEmailRefresh`로 `keep | update | conflict`를 가른다 — **새 주소를 다른 User가 쓰면 갱신도 병합도 하지 않고 로그인은 허용한다**(2026-09-06 결정). 여기서 합치면 `allowDangerousEmailAccountLinking`을 우회한 자동 병합이 된다.

⚠️ **GitHub provider의 기본 동작을 대체한다.** 그쪽은 공개 이메일이 없을 때만 `/user/emails`를 조회하고, 조회해도 `emails.find(e => e.primary) ?? emails[0]`로 **주소만 뽑고 `verified`를 버린다**. 우리는 항상 조회해 **primary이면서 verified**인 것만 받는다 — primary가 미검증이면 다른 검증 주소로 넘어가지 않고 거부한다(계정의 정본 주소는 primary 하나다). 대가는 **primary와 다른 주소로 초대받은 사람이 수락하지 못하는 것**이고, 회피는 primary 주소로 초대하는 것이다.

⚠️ **`allowDangerousEmailAccountLinking`을 어느 provider에도 켜지 않는다.** 어댑터는 이메일이 같은 User가 있고 그 provider의 Account가 없으면 `OAuthAccountNotLinked`를 던지는데, **이것은 이메일 기반 자동 병합을 거부하는 기본 방어선이다** (§6.2.1 — 잘못된 자동 병합은 불편이 아니라 계정 탈취). `lib/auth/__tests__/provider-config.test.ts`가 그 대입의 부재를 검사한다. ⚠️ **계정 병합(2026-09-12)이 그 옵션을 켜지 않는다** — 아래 절.

⚠️ **두 provider에 `checks: ["pkce", "state"]`를 건다** (2026-09-10, sec-audit-2). Google은 OIDC PKCE를 지원하고, **GitHub도 `code_challenge`를 받는다** — 실물 왕복으로 확인했다(`code_challenge_method=S256`이 authorize URL에 실려 나가고 토큰 교환이 통과한다). `lib/credentials/__tests__/sign-in.test.ts`가 그 설정을 고정한다.

## 계정 병합 — `signIn` 콜백의 갈래 둘 (2026-09-12, account-linking)

**`signIn` 콜백이 세 판정을 순서대로 지난다: 회수 → 병합 확인 → (이메일 갱신) → 병합 제안.** 순서가
계약이다 — 앞의 둘은 로그인이 아니라 **다른 왕복**이고, 뒤에 두면 그 왕복이 세션을 만든 뒤에 판정하게
된다.

- **제안**(`planLinkOffer`): 처음 보는 `Account`인데 같은 **검증 이메일**의 User가 이미 다른 로그인
  수단을 갖고 있으면, `OAuthAccountNotLinked`로 떨어뜨리지 않고 **문자열을 반환**해
  `/signin/link/<challenge>`로 보낸다. ⚠️ **문자열 반환이 요지다** — `@auth/core`의 `callback/index.js`가
  `handleLoginOrRegister`를 **통째로 건너뛰므로** `createUser`·`linkAccount`·`createSession`이 전부
  0회다. 거부된 로그인이 고아 행을 남기지 않는 것과 같은 성질이다.
- **확인**(`planLinkConfirm`): challenge 쿠키를 든 callback에서, `(provider, providerAccountId)`로
  조회한 `Account.userId`가 challenge의 `userId`와 같아야 붙인다. ⚠️ **`user.id`를 쓰지 않는다** —
  처음 보는 계정일 때 그 값은 갓 만들어진 난수라 DB의 어떤 행과도 안 맞는다.

확인 callback은 요청 복사본에서 기존 세션 쿠키를 제외하고 Auth.js에 전달한다. 기존에 다른 사용자로
로그인돼 있어도 새 OAuth로 확인한 사용자의 세션을 발급하며, 실패하면 브라우저의 기존 세션은 유지한다.
연결 트랜잭션과 Auth.js의 세션 생성은 별개이므로, **연결 뒤 로그인 실패를 성공 URL로 덮지 않는다**.
이때 Account 추가는 남고 `/signin?error=Unavailable`에서 일반 로그인을 다시 시작한다
(2026-09-12 리뷰 수정). 소비된 challenge로 보내면 `LinkExpired`가 장애 사유를 지운다.

**challenge의 수명**: `VerificationToken`을 `malmoi/login-link` 접두로 재사용하고 **10분**이다. URL에
싣는 것은 난수 원문, DB에 남는 것은 `hashInviteToken`의 해시다. **성공만 소비한다** — 실패가 소비하면
훔친 URL 한 번으로 남의 병합을 태울 수 있고, 상한은 TTL이 든다. 소비는 조건부 `deleteMany`의 count가
강제하므로 동시 요청 둘 중 **정확히 하나만** 성공한다.

⚠️ **`safePrismaAdapter.linkAccount`의 게이트는 한 줄도 안 바뀌었다** — 확인 왕복은 **기존 계정으로 하는
평범한 로그인**이라 그 메서드에 도달하지 않고(`handle-login.js`가 `getUserByAccount` 뒤 반환한다),
붙일 행은 `finishLink`가 직접 쓴다. **그 게이트가 문서화한 정책의 뜻만 좁아졌다**: *"로그인 수단은
User당 하나"* → *"Auth.js 경유로 둘째 행이 생기지 않는다"*. `finishLink`의 인가 조건은
이메일 동등 · 두 provider의 소유 증명 · 단일 사용 challenge다.

**account-connect 로컬 구현 · 배포 대기**: 둘째 옆문 `lib/account-connect/store.ts`의 `finishConnect`는
살아 있는 기존 세션 · 새 provider의 검증된 동일 이메일 · 세션/state에 묶인 일회용 challenge를 요구한다.
User 락 뒤 challenge를 다시 읽고 조건부 소비와 Account 생성을 한 트랜잭션으로 처리한다.
`account.create` 허용 목록은 `safe-adapter` · `login-link/store` · `account-connect/store` · GitHub App
callback 네 곳이며, Auth.js의 추가 Account 거부와 GitHub App 자격증명 경계는 그대로다.
연결 가로채기는 회수와 병합 사이에 놓고, 모든 시작점이 `clearAuthRoundtripCookies()`로 세 목적의
nonce/state 쿠키를 먼저 지운다. 제품 완료 표식과 정본 전면 반영은 프로덕션 반영 뒤에 한다.

⚠️ **세 가로채기의 배타성은 순서와 쿠키 정리가 만든다.** 로컬 구현의 중첩 순서는
`withRevocation(withConnect(withLoginLink(...)))`이며 각자 state 쿠키의 이름·salt를 가른다.
시작점은 인자 없는 `clearAuthRoundtripCookies()` 한 자리에서 세 목적의 쿠키를 전부 지운다.
intent는 쿠키 존재로도 켜지므로, 연결 시작이 OAuth state를 쓴 뒤 실패하면 같은 정리를 다시 한다.
버려진 왕복이 다음 callback을 먹는 POSTMORTEM 2026-09-10 계열을 막기 위한 계약이다.

⚠️ **로그인 `Account`가 둘 이상이면 `planEmailRefresh`가 언제나 `keep`이다.** 아니면 `User.email`이
**마지막으로 로그인한 provider에 따라 뒤집히고** 초대 대조가 그 값 위에 선다. 대가는 병합한 사용자의
이메일이 provider를 안 따라간다는 것이다.

**로그인된 세션에서 추가 provider를 연결하는 경로는 별도로 막는다** (sec-audit-2 #31).
`safePrismaAdapter` 기반의 `credentialAdapter`는 OAuth callback의 `getSessionAndUser`부터 만료 세션을 반환하지 않고,
현재도 만료인 행만 조건부 삭제한다. `linkAccount`는 User 행을 잠근 뒤 기존 github/google
Account가 있으면 거부한다. 신규 로그인 Account는 식별자 네 필드만 저장해 OAuth 토큰을 남기지 않는다.
GitHub App 연결은 별도 callback이며 User 행 잠금으로 직렬화하고 UPDATE/DELETE에 `userId`를
포함한다. P2002 재조회는 실패한 트랜잭션 밖에서 수행한다.

⚠️ **그 거부 위에 [Connect] 경로가 섰다** (2026-09-13 — `lib/account-connect/`). 셋을 드는 자리가
각각이다: ①·②는 `finishConnect`가 세션의 `User.email`과 provider가 검증한 이메일을 대조하고,
③은 `VerificationToken`의 **세 번째 접두**를 쓰는 단일 사용 challenge다(`beginConnect`). 화면 쪽
버튼은 `components/account/login-methods.tsx`의 미연결 행에 선다. ⚠️ **여기 "아직 안 만들었다"가
남아 있었다** — PRODUCT §4.1의 같은 표기는 **프로덕션 기준**이라 그대로지만, 이 문서는 코드 기준이다.
`/account`에서 로그인 수단을 붙이는 문이 생겨도 **`linkAccount`의 거부는 그대로다**:
그것은 Auth.js 콜백을 지나는 **모든** 로그인에 걸린 방어선이고, 예외를 뚫어 통과시키면 sec-audit-2
#31이 막은 모양이 그대로 돌아온다. 새 경로가 통과해야 하는 것 셋 — ① 현재 세션의 `User.email`과 새
provider가 **검증한** 이메일이 같을 것 ② 새 provider의 소유를 그 왕복에서 증명할 것 ③ **단일 사용
challenge**가 그 둘을 묶을 것. 셋을 다 통과한 뒤에야 `Account`를 쓰고, 쓰는 것은 식별자 네 필드뿐이다
(토큰을 남기지 않는 것은 같다). ⚠️ **`lib/login-link`의 challenge를 그대로 재사용할 수 있다고
전제하지 않는다** — 그쪽은 세션이 **없는** 흐름이라 challenge가 담는 것이 다르다(누구를 인증시킬
것인가 vs 누구에게 붙일 것인가).

**인가는 fail-closed다.** 로그인은 이제 **누구에게나 열려 있고**(검증된 이메일만 요구한다), 그것이 아무것도 열지 않는다 — 멤버십이 없는 사용자는 `/projects`에서 "어느 프로젝트의 멤버도 아니다"를 보고, 어떤 slug를 직접 쳐도 `not-found`로 돌아간다.

⚠️ **허용 핸들 목록(`AUTH_ALLOWED_LOGINS`)이 2026-09-05에 사라졌다.** 전환과 제거가 **같은 커밋**이었던 이유: 목록을 남긴 채 멤버십을 붙이면 두 인가가 AND로 걸려 좁은 쪽이 이기고, **초대받은 비개발자가 핸들이 없어 로그인 단계에서 막힌다** — 이 단계가 존재하는 이유가 그 구간 동안 성립하지 않는다.

### 6.2.1 계정 병합 방어선은 경로마다 다르다 (2026-09-06, SaaS 4단계)

`allowDangerousEmailAccountLinking`을 켜지 않는 것은 **Auth.js를 지나는 로그인 경로**의 방어선이고,
`provider:"github-app"` 연결은 그 경로를 지나지 않으므로 **그 설정이 아무 역할도 하지 않는다.**

- **`planAccountLink`의 `taken-by-other`가 `replace`보다 앞이다.** 뒤였으면 옛 행을 지운 다음 거부해
  "실패했는데 연결까지 풀렸다"가 된다 — 판정 순서 자체가 방어다.
- **Account 쓰기는 `upsert`가 아니라 `create` + P2002 재조회다.** `upsert`는 동시 요청이 `userId`를
  덮어써 **소유권이 이동**할 수 있다. 어떤 update도 `userId`를 인자에 넣지 않는다.

### 6.3 거부는 값으로 흐른다 — 예외로 죽지 않는다

Server Action의 거부 사유(`unauthorized`·`not-found`·`forbidden`·`last-owner`·`not-member`·`unavailable`·**`archived`**·초대 분기)는 **응답에 실려** 화면이 `accessErrorMessage`로 문구를 정한다(`isAccessError`가 문자열을 가른다 — 화면 셋이 각자 `Set`을 들던 것을 한 곳으로). `unavailable`만 재시도를 권하고 로그인을 시키지 않는다(§6.1.2). ⚠️ **`archived`는 7단계에 union으로 들어왔고 `forbidden`과 일부러 갈려 있다**(§5.6.4) — 권한은 그대로이고 프로젝트가 멈춘 것이라, "권한이 없다"고 말하면 사용자가 OWNER에게 권한을 달라고 한다. **`AccessError`·`ACCESS_ERRORS`·사전 셋이 함께 움직인다** — 하나만 늘리면 새 사유가 화면에서 무음이다. **페이지의 거부도 사유를 버리지 않는다** — `requireProjectAccess`는 `/projects?e=<status>`로 보내고 목록 화면이 `isAccessError`로 걸러 한 줄 보인다(주소창 값이라 모르는 값은 무시). ⚠️ **존재 비노출의 근거는 문구가 아니라 분기 순서다** (2026-09-08 정정 — 이 문장은 반대를 말하고 있었다). 두 문구는 **일부러 다르다**(`messages/en.tsx` — forbidden "Ask the project owner." vs not-found "Check your invite link."). 노출을 막는 것은 `planProjectAccess`가 **멤버가 아니면 무조건 `not-found`**를 내는 것이고(`lib/auth/access.ts`), 그래서 `forbidden`은 **멤버에게만** 도달한다 — 실측: EDITOR가 `/projects/:slug/settings`를 직접 열면 `?e=forbidden`, 비멤버는 `not-found`다. 문구를 같게 맞추거나 `forbidden` 판정을 멤버 검사 앞으로 옮기면 이 성질이 깨진다. 처리되지 않은 throw는 사용자에게 digest만 있는 일반 오류가 되고, 판정 함수가 만들어 둔 사유가 통째로 무시된다.

⚠️ **`ready`가 아닌 프로젝트의 번역 Action은 `not-ready`다** (2026-09-07, SaaS 5단계). 첫 적재 전에는
저장할 키가 없어 화면으로 도달하지 않으므로 이것이 막는 것은 **URL 직접 호출**과 적재 실패 후의
재방문이다. 판정은 `planProjectReadiness`(`lib/onboarding/readiness.ts`)이고 **`ProjectAccess` union에
넣지 않았다** — 넣으면 `ACCESS_ERRORS` Set을 손으로 늘리게 되고 컴파일러가 그것을 잇지 않는다.
그래서 문구는 `onboardErrorMessage`가 들고, `pullMessage`·`translation-input`이 `isAccessError` 다음에
`isOnboardError`를 본다 — 한쪽만 보면 번역자 화면에 내부 토큰(`not-ready`)이 그대로 뜬다.

⚠️ **`/projects`는 두 union을 함께 읽는다** (2026-09-06, SaaS 4단계). GitHub 연결 실패도 그 화면에 착지한다 —
state가 무효면 돌아갈 slug를 믿을 수 없어 callback이 거기로 보낸다. `isAccessError` 하나만 보면 연결 사유
열한 개가 통째로 무음이므로 `isConnectError`·`connectErrorMessage`를 함께 걸러 한 줄 보인다. 두 union이
겹치는 값은 `unavailable` 하나이고 뜻이 같아 먼저 보는 쪽이 이겨도 문제가 없다. **같은 쌍을 설정 화면도 읽는다** — 연결이 실패해 slug를 아는 채로 돌아오면 그쪽 `?e=`에 실린다.
**`/account`의 연결 왕복 사유는 `isConnectError`로 검사한다** (2026-09-09, 6b-4). `sessionRevocation` 결과는 **별도 고정 비교**로 검사한다 — 쿼리 슬롯이 둘이다.
인가 거부는 `requireUser`가 **`/signin`으로** 보낸다 — 판정은 `lib/auth/landing.ts`의 `rejectTarget` 하나이고, **삼항이 아니라 맵 + `satisfies`다**(갈래가 늘면 키가 없어 컴파일 에러가 난다; 삼항이면 새 갈래가 사유 없이 로그인 화면으로 떨어지고 `tsc`가 조용하다 — 8-1a에서 실측). ⚠️ **읽는 쪽이 셋에서 넷이 됐다** — 실어 보내놓고 안 읽으면
거부가 통째로 무음이다.
**`/projects/new`는 `isOnboardError`·`isConnectError` 쌍이다** (2026-09-07) — callback이 `ConnectError`를
실어 보내고 온보딩 Action은 `OnboardError`를 낸다. 겹치는 값은 `unavailable`·`unauthorized` 둘이고 뜻이 같다.

⚠️ **무효화 범위는 "이 값을 보이는 화면 집합"에 대한 단언이고, 컴파일러도 테스트도 그것을 안 본다** (2026-09-09). 접두로 그 집합을 표현하면 **라우트가 옮겨질 때 조용히 깨진다** — `disconnectGithub`이 `/projects` 접두를 골랐는데 계정 카드가 `/account`로 가면서 주 화면을 놓쳤고(POSTMORTEM 2026-09-09), 같은 회고가 예고한 자리를 6b-6이 닫았다. 지금 **서브트리를 무효화하는 쓰기가 여섯**이다 — 보관 둘이 목록·사이드바·Home·번역을 한꺼번에 바꾸고, 마지막 하나(첫 적재)는 프로젝트의 **준비 상태**를 바꾸므로, 어느 쪽이든 경로를 나열하면 다음에 생기는 화면이 조용히 빠진다:
- `saveTranslation` → `/projects/<slug>` **layout**. 그 행을 읽는 화면이 셋이다(번역 표 · 로케일 화면의 진행률 · Home의 진행률·활동).
- `updateBaseLocale` → 같은 범위. `declaredBaseLocale`을 읽는 화면이 셋이다(로케일 화면의 필드·대기 Alert · 번역 화면의 배너 · **설정의 워크플로 YAML**이 대기 중 `base-locale:`을 박는다).
- `disconnectGithub` → `/` **layout**. slug를 모르는 자리이므로 좁힐 수단이 없다.
- `archiveProject`·`unarchiveProject` → `/` **layout** (7단계). 보관은 목록 행의 배지·사이드바·Home·번역 화면을 **한꺼번에** 바꾼다 — 경로를 나열하면 다음에 생기는 화면이 조용히 빠진다.

- `runFirstIngest` → `/projects/<slug>` **layout**. 첫 적재가 바꾸는 것은 `Project.lastCommitSha` 하나인데 **그 값을 읽는 것은 `planProjectReadiness`이고 소비자가 넷이다** — Home · 번역 화면 · 설정 · 목록(`lib/projects/list.ts`의 `projectStatus`).
  - ⚠️ **접두로는 못 덮는다** (2026-09-11 등재). `/projects/<slug>/settings` + `/projects` 둘만 무효화하면 **Home과 번역 화면이 캐시된 "준비 안 됨"으로 남는다** — 사용자는 방금 "N개 키를 적재했어요"를 읽고 들어가서 빈 화면을 본다. 목록 화면은 `/projects` 접두라 갱신되므로 **증상이 화면마다 갈려** 캐시 문제로 안 보이고 적재 실패로 읽힌다. 이 절의 첫 문장이 말하는 부류 그대로다: 무효화 범위는 경로가 아니라 **"이 값을 보이는 화면 집합"**이고, readiness는 그 집합이 `/projects/<slug>` 서브트리 전체다.

**나머지는 좁힌 채 둔다** — 멤버·초대 셋은 그 상태를 멤버 화면만 보이고, `rotatePushToken`·`connectRepository`·`updateRepositorySettings`는 설정만 보이며, `createProject`는 아직 그 프로젝트의 화면이 없어 `/projects`(목록) 하나다. **화면을 옮기거나 새로 만들면 그 화면이 보이는 상태를 쓰는 Action의 범위를 함께 본다**(grep: `revalidatePath(`).

⚠️ **`requireProjectAccess`는 `userId`도 돌려준다** (2026-09-06). `{ projectId, role }`만 주면 그 반환값이
"이 요청에 대해 아는 전부"처럼 보이고, 호출부가 세션 주체를 조건에서 빼 버린다 — 설정 화면이
`account.findFirst({ provider })`로 **남의 GitHub 계정을 집을 뻔했다**(POSTMORTEM 2026-09-06).
**규칙은 두 축이다: 프로젝트에 속한 행은 `projectId`로, 사용자에 속한 행(`Account`·`Session`)은 `userId`로
좁힌다.** 둘 다 인가가 돌려준 값이어야 하고 클라이언트가 보낸 값이면 안 된다.

⚠️ **판정과 쓰기 사이에 상태가 바뀌는 자리는 조건부 쓰기로 닫는다** (POSTMORTEM 2026-09-05). `acceptInvitation`은 `updateMany`의 `acceptedAt: null`·조회 당시 `expiresAt` 동등 조건·소비 직전 시각보다 미래인 조건의 count로 단일 사용을 강제한다 — **만료도 소비 조건에 넣는다**(2026-09-06): 판정 뒤 OWNER가 재초대로 옛 행을 만료시켜도 진행 중인 요청이 옛 role로 멤버를 만들지 않는다(Codex 감사 #3). 진 쪽은 행을 다시 읽어 `already-accepted`/`expired`를 가른다. `delete`/`update`를 쓰면 행이 사라졌을 때 P2025로 던지는데, 두 요청이 같은 행을 동시에 건드리는 것은 실제 경로다.

⚠️ **`changeMember`는 count로 부족하다** (2026-09-06 Codex 감사 #2). OWNER 둘이 **동시에 각자를** 제거·강등하면 둘 다 OWNER 2명인 목록을 읽어 통과하고 서로 다른 행을 쓰므로 count도 각각 1이다 — OWNER 0명이고 아무도 되살릴 수 없다. FK Restrict는 멤버 행 **변경**을 막지 않는다(스키마 주석이 그렇게 주장했었다). 그래서 판정·쓰기·재집계가 **한 대화형 트랜잭션**이고 `SELECT "id" FROM "Project" WHERE "id" = $1 FOR UPDATE`로 프로젝트 행을 먼저 잠근다. 쓰기 뒤 OWNER를 다시 세어 0이면 던져 롤백하고 `last-owner`로 낸다 — 재집계는 잠금이 새는 경로(다른 쓰기 경로)의 그물이다. 테스트 하네스의 `$transaction`이 롤백을 흉내내야 이 경로를 볼 수 있다. **`createInvitation`도 같은 잠금을 쓴다** (2026-09-06, Codex 감사 #4) — 회전(`updateMany` 만료)과 `create`가 갈라져 있으면 두 OWNER가 같은 이메일을 동시에 초대할 때 유효 링크가 둘 남는다. 잠금 없는 트랜잭션은 "회전할 행이 없는 동시 발급"을 못 막는다.

### 6.35 ⚠️ 판정을 오케스트레이션 파일에 두지 않는다 — 클라이언트 번들이 그 그래프를 따라온다 (2026-09-07)

거부 사유가 화면에 닿아야 하므로(§6.3) **문구 모듈은 클라이언트 컴포넌트가 import한다** —
`accessErrorMessage`·`connectErrorMessage`·`onboardErrorMessage`·`pullMessage`에
**`repositorySettingsErrorMessage`**(`lib/settings/message.ts` — 로케일 폼·리포 폼)와
**`adapterErrorMessage`**(`lib/i18n/adapter-errors.ts` — 온보딩 둘)를 더해 **여섯이다**(2026-09-11 정정 — 넷으로 적혀 있었다).
그래서 그 모듈들이 **값으로 끌어오는 것이 곧 클라이언트 번들**이 된다. ⚠️ **새 `*ErrorMessage`를 만들 때마다 여기 더한다** —
숫자가 낡으면 "문구 경로는 전부 가볍다"가 실측 없이 서 있게 된다.

`lib/onboarding/message.ts`가 문구의 숫자를 맞추려고 `./slug`의 `PROJECT_SLUG_MAX`를 읽고, `slug.ts`가
형식 판정을 **한 벌로 두려고** `lib/pull/trigger.ts`의 `isRefSafeSlug`를 불렀다. 둘 다 옳은 결정인데,
`trigger.ts`가 **판정과 I/O를 같은 파일에** 들고 있어서 그 한 줄이 `lib/github`(octokit)과
`lib/adapters`(→ `ts-dict` → **ts-morph = TypeScript 컴파일러**)를 클라이언트로 데려왔다 — 실측 **7.2MB
청크**가 세 페이지에 붙었다 (POSTMORTEM 2026-09-07).

- **판정은 잎 모듈에 둔다.** `lib/pull/ref-slug.ts`는 **import이 0**이고 `trigger.ts`가 재수출한다 —
  규칙은 한 벌이고 무게는 따라오지 않는다.
- ⚠️ **화면 문구는 영어 단일이고 출처가 `messages/en.tsx` 하나다** (2026-09-08, SaaS 6a). 화면은 `@/lib/i18n`의 `m`으로 읽고 `<html lang="en">`이며, **소스의 한글 UI 리터럴을 `lib/i18n/__tests__/no-korean-ui.test.ts`가 상시로 0으로 고정한다**(허용 목록 셋은 화면이 아니다). ko를 여는 시점은 PRODUCT §10에 있다.
- ⚠️ **잎이 다섯 늘었다** (2026-09-08, SaaS 6a): **`lib/i18n/`**(→ `messages/en.tsx`) · **`lib/routes.ts`** · **`lib/shell/nav.ts`** · **`lib/auth/permission.ts`**(⚠️ 사이드바 → `nav.ts` 경로로 **권한표가 브라우저에 나간다** — 판정만 담고 조회가 없어 안전하다) · **`lib/keys/refocus.ts`**. ⚠️ **마지막 하나는 동기가 다르다** — 번들 무게가 아니라 **테스트 가능성**이다: `translation-input.tsx`가 Server Action을 물어 그 그래프에 `server-only`가 있고, 판정을 그 안에 두면 vitest가 import만으로 죽는다.
- ⚠️ **그 뒤로 아홉이 더 생겼다** (6b~8단계): **`lib/tone.ts`**(이름 해시 → 색 여덟 — 셸 헤더가 매 페이지에서 렌더하는 클라이언트 트리가 읽는다. 클래스 맵은 `components/ui/tone.ts`가 들어 판정과 층이 갈린다) · **`lib/locale-code.ts`**(§5.5.05) · **`lib/pull/branch-name.ts`**(설정 폼이 읽는다) · **`lib/relative-time.ts`**(멤버·이력 화면 — ⚠️ `lib/keys/view.ts`에서 **내린** 것이고 그쪽은 잎이 아니다, 재수출도 하지 않는다) · **`lib/onboarding/base-pending.ts`** · **`lib/signin/dot-field.ts`**(Canvas 판정) · **`lib/projects/list.ts`**(목록 필터·상태) · **`lib/keys/filters.ts`**(8-4 — 칩 판정. import가 `lib/routes.ts` 하나이고, **이웃한 `lib/keys/view.ts`는 잎이 아니다**(`compareKeys` → `lib/adapters/shared`) — 같은 디렉터리에 있다는 것이 안전을 뜻하지 않는다) · **`lib/keys/flag.ts`**(8-4 — 로케일 코드 → 국기 id. **import 0**이고, 로케일 배지가 `?ns=*`에서 2,709번 렌더되는 트리에 산다). **명부가 낡으면 규칙이 실측 없이 서 있다** — 잎을 새로 만들면 여기 더한다.
- ⚠️ **문구 모듈 둘이 명부에서 빠져 있었다** (2026-09-11 등재): **`lib/settings/message.ts`**(`RepositorySettingsError` → 문구. `@/lib/i18n` 하나만 문고 `lib/auth/message.ts`와 같은 형이다 — 클라이언트 소비자가 `components/locales/base-locale-form.tsx`·`components/settings/repository-form.tsx` 둘) · **`lib/i18n/adapter-errors.ts`**(어댑터 오류 코드 → 문장. ⚠️ **`@/lib/adapters/types`를 타입으로만** 가져온다 — 값이면 `ADAPTER_ERROR_CODES`를 따라 그 디렉터리가 통째로 열리고 `ts-dict` → ts-morph가 온다. 소비자는 온보딩 클라이언트 둘). **둘 다 위 "문구 모듈 여섯"의 새 식구다** — 문구 경로가 곧 클라이언트 경로라 그 둘은 같은 목록의 양면이다.
  ⚠️ **뒤의 둘은 `client-graph.test.ts`가 파일 목록을 `toEqual`로 고정한다** (8-4). 그 검사의 기본형은 **패키지 이름만** 보는데, `lib/keys/view.ts`가 무는 것은 전부 리포 안 모듈이라 npm 패키지가 하나도 안 나온다 — **클라이언트가 그것을 값으로 읽어도 green이다.** `lib/i18n`에 걸어 둔 정확 일치 단언이 그 구멍을 메우는 형이고, 이 배송이 같은 형을 둘 더 걸었다.
- ⚠️ **`lib/onboarding/readiness.ts`도 8-3에 잎이 됐다** — `readinessLabel`이 나가면서 `@/lib/i18n` import가 사라졌다. 잎이 된 것은 의도가 아니라 **결과**이고, 그래서 §1.3의 "온보딩 판정층이 사전을 문다"가 셋에서 둘로 줄었다.
  앞의 것은 위 문구 모듈 **넷이 전부** 물게 됐으므로 — 즉 클라이언트가 문구를 읽는 모든 경로가 사전을
  지난다 — 사전이 `@/lib/**`를 하나라도 물면 그 무게가 세 화면에 붙는다. 그래서 `messages/en.tsx`의
  import는 `react`의 `ReactNode` **타입 하나**이고, `client-graph.test.ts`가 그 잎 성질을 직접 건다
  (실 소비자가 생기기 전에도 공허하지 않도록 `lib/i18n/index.ts`에서 출발하는 케이스를 따로 둔다).
- ⚠️ **사전 조회는 `Object.hasOwn`을 지난다** (`lib/i18n`의 `pick`). `DICT[key] ?? fallback`은
  프로토타입 키(`constructor`·`toString`…)에서 값이 찾아져 폴백을 우회하고, **문자열 자리에 함수가
  돌아간다** — 그 값이 JSX 자식이 되면 화면이 죽고, `?e=`를 그대로 넘기는 초대 화면(외부인이 연다)에서
  주소창으로 도달 가능하다.
- **`pnpm build`는 이것을 오류로 보지 않는다.** 라우트 표에 청크 크기가 없고 typecheck·test도 침묵한다.
  **`components/__tests__/client-graph.test.ts`가 상시로 센다** — `"use client"`에서 시작해 값 import만
  따라가고(`import type`은 지운다) `"use server"` 파일에서 멈춘다(Action은 스텁으로 대체된다).
- ⚠️ **판정은 금지 목록이 아니라 허용 목록이다.** `client-graph.test.ts`의 `ALLOWED`에 없는 패키지는 전부
  걸린다 — 금지 목록은 "자기가 고른 패턴만 답한다"라 `yaml`·`zod` 같은 무게를 통과시켰다. **2026-09-08에 셋이
  늘었다**(`radix-ui`·`class-variance-authority`·`lucide-react`): 이 리포가 `components/ui/` 프리미티브를
  소유하면서 들어온 **의도된 결정**이다. ⚠️ **8-1b가 `sonner`를 되돌려 넷이 됐다** — 2026-09-08에 "사용 0"으로
  빼면서 이 파일의 **메타 반례**로 남겨 뒀던 패키지이고, 8단계가 피드백을 토스트로 통일하며 뒤집었다
  (경계는 규약 8 · DESIGN §6.25). 메타 테스트가 **넷**을 각자 고정하고, 반례 목록에서는 그만큼 빠졌다. `SKIP_DIR`의 `ui`는 **진입점 탐색만**
  건너뛰고 import는 따라가므로, **프리미티브가 무는 것이 곧 이 목록의 결정**이 된다.
### 6.36 목록 필터의 순수 판정 (`lib/projects/list.ts`, 2026-09-10 8-3)

- ⚠️ **`parseProjectFilter`가 객체 조회가 아니라 배열 `includes`다.** 입력이 주소창 값이라 **남이 정한
  문자열을 객체 키로 쓰는** 부류이고, 이 리포는 그것을 두 번 밟았다(POSTMORTEM 2026-09-08 조회 ·
  2026-09-09 대입). 배열은 프로토타입 체인을 안 본다. §1.1의 "키 대입" 규칙과 같은 계보인데 그쪽은
  어댑터 축에만 적혀 있어 여기 다시 적는다.
  - ⚠️ **세 번째 자리가 8-4에 생겼다** (`lib/keys/view.ts`, 2026-09-11 등재): `parseLocaleSelection`이 `?locales=`를
    **배열 `includes`**로 거르고(주소창 값이라 같은 부류다), `namespaceCountsFor`·`groupByNamespace`의 누산기가
    **`Map`이다** — 평범한 `{}`에 `out["__proto__"] = v`를 하면 setter가 불려 own property가 안 생기고 **그
    네임스페이스 그룹이 조용히 사라진다**(POSTMORTEM 2026-09-09). 네임스페이스는 로케일 파일의 키에서
    파생되므로 **남이 정하는 문자열**이다.
- **`searchProjects`는 이름만 훑는다.** 설명·slug로 넓히지 않는 이유는 **행에 보이는 것 중에서만 맞아야**
  사용자가 "왜 이게 걸렸는지"를 화면에서 확인할 수 있기 때문이다 — 안 보이는 필드로 맞으면 결과가
  임의로 보인다. `filterProjects`와 합치지 않는다: 축이 둘(상태·질의)이고 호출부가 **필터 전 총계**를
  같은 배열로 센다.
- ⚠️ **`projectStatus`는 보관을 readiness보다 먼저 본다.** 멈춘 프로젝트에서 "첫 적재를 기다리는 중"은
  답할 질문이 아니다 — `planProjectAccess`가 권한 → 보관 순으로 보는 것(§5.6.4)과 같은 형이고,
  뒤집으면 보관된 신규 프로젝트가 `Setting up`으로 보여 사용자가 되돌리는 대신 온보딩을 고치러 간다.
- ⚠️ **`repositoryId === null`이 셋째 축이고 `ready`일 때만 본다** (2026-09-11). readiness와 독립이라
  그전까지 목록에서 `Active`로 보였다 — Publish만 조용히 거부되고 야간 순회에서도 빠지는 상태다.
  **`ProjectReadiness` union을 늘리지 않고 여기서 본 이유**: 그 union은 설정 화면·`ProjectNotReady`의
  정책까지 물고 있어서, 갈래 하나가 화면 셋을 건드린다. ⚠️ **`ready`가 아니면 안 보는 것이 판정의
  절반이다** — 그 컬럼이 막는 것은 되돌려보내기이고, 첫 적재도 안 끝난 프로젝트에서 "다시 연결하라"는
  답할 질문이 아니다.

- ⚠️ **grep 한 번으로 확인했다고 하지 않는다.** T6에서 이 경계를 의심해 산출물을 grep했는데 `@octokit`만
  봤고 그건 정말로 없었다 — 그래서 "트리 셰이킹이 떼어냈다"는 **틀린 결론을 주석으로 남겼다.** 한 번의
  grep은 자신이 고른 패턴만 답한다.

### 6.4 GitHub 연결의 왕복 — state와 착지 지점 (SaaS 4단계, `lib/github-connect/`)

연결은 **브라우저가 남의 사이트를 다녀오는 유일한 흐름**이다. 그래서 초대 토큰(§6.2)과 같은 급의 서명
축이 필요하고, 실패 모드도 초대와 닮았다 — 다만 실패가 "쿠키가 없다"로 보여 서명을 의심하게 만든다.

- **⚠️ `redirect_uri`를 반드시 싣는다** (`origin.ts`, malmoi#7). 생략하면 GitHub이 App에 등록된 **첫**
  callback URL로 돌려보낸다. 우리는 셋을 등록했으므로(localhost·preview·프로덕션) **로컬에서 시작한
  연결이 프로덕션에 착지하고**, state 쿠키는 시작한 origin에 있으니 그 왕복은 **영원히**
  `state-mismatch`다. **origin과 쿠키의 `secure`가 한 판정에서 나오는 것**이 그 파일의 요지다 — 따로
  읽으면 한쪽만 바뀌어도 심은 이름과 찾는 이름이 갈린다.
- **state는 HMAC-SHA256 over `AUTH_SECRET`** + 용도 라벨. ⚠️ 세션 서명과 **키를 공유**하므로 회전하면
  진행 중인 연결이 전부 죽는다. 10분 만료 · nonce 대조 · 고정 길이 SHA-256 digest의 `timingSafeEqual` 비교.
- **판정 순서는 서명 → nonce → 만료 → 사용자다.** 만료를 사용자보다 **앞**에 둬 만료된 state가 누구
  것이었는지 말하지 않는다 — `planInvitationAccept`와 같은 축이다.
- **목적지를 서명 payload에 싣는다.** 그래서 `safeNext` 같은 open redirect 판정이 아예 없다.
  ⚠️ **2026-09-07에 slug 하나에서 `dest` 갈래 둘로, 2026-09-09에 셋으로 넓어졌다**: `{kind:"settings",
  slug}` · `{kind:"new"}`(SaaS 5단계) · `{kind:"account"}`(6b-4). 뒤의 둘은 **사용자 축이라 프로젝트가
  없고** slug가 착지를 겸할 수 없으며, 갈래를 쿼리로 빼면 공격자가 착지를 정한다. **옛 `{slug}`
  payload는 `state-mismatch`로 거부된다** — 관대하게 받으면 "slug가 있으면 설정 화면"이라는 세 번째
  규칙이 영구히 남는다. 10분 만료라 배포 직후 그 창의 사용자는 버튼을 다시 누르면 된다.
  - ⚠️ **갈래를 늘리는 방향과 payload 모양을 바꾸는 방향은 다르다.** 늘리기는 안전하다 — 옛 쿠키가
    그대로 파싱되므로 진행 중인 왕복이 깨지지 않는다. 모양 변경(`{slug}` → `{dest}`)은 그 창의 왕복을
    전부 죽인다. `state.test.ts`가 **양방향을 각각** 고정한다(옛 둘은 ok, 옛 모양은 mismatch).
  - ⚠️ **나가는 Action은 `StateDest`를 인자로 받지 않는다** (6b-4). `startGithubConnectForUser`가 받는
    것은 갈래 **이름**뿐이고(`"new" | "account"`, zod enum) payload는 서버가 만든다 — 클라이언트가
    `{kind:"settings", slug}`를 통째로 보낼 수 있으면 남의 설정 화면으로 착지를 정할 수 있고, 그러면
    이 자리에 open redirect 판정이 생긴다. 그 판정이 없는 것이 "목적지를 서명에 싣는" 설계의 값이다.
- **⚠️ 빈 `AUTH_SECRET`은 `state-mismatch`로 접지 않고 던진다.** `createHmac("sha256", "")`이 던지지
  않으므로, 이 층이 `requireEnv`에만 기대면 호출부의 실수 하나로 **누구나 재현 가능한 서명**이 통과한다
  (`checkBearer`가 `expected === ""`를 `not-configured`로 가른 것과 같은 판단). 설정 오류를 "다시 눌러
  주세요"로 위장하지 않는다.
- **쿠키 이름은 읽는 쪽이 둘 다 본다** (`stateCookieNames()`). 쓰는 쪽은 `x-forwarded-proto`, 읽는 쪽은
  요청 URL로 프로토콜을 판정해 **갈릴 수 있고**, 갈리면 연결이 100% `state-mismatch`가 된다.
  `__Host-` 접두를 https에서만 붙이는 이유는 **Safari가 `http://localhost`에서 Secure 쿠키를 버리기**
  때문이다 — `lib/auth/cookie.ts`의 `__Secure-` 이중 검사와 같은 계열이다.
- **착지는 넷으로 갈린다** (2026-09-09): `dest`가 `settings`면 `/projects/<slug>/settings?e=`,
  `new`면 `/projects/new?e=`, `account`면 `/account?e=`, **state가 무효면 `/projects?e=`**다 —
  목적지를 서명에서 얻으므로 무효한 state의 목적지는 믿을 수 없다. **넷 다 `?e=`를 읽는 쪽이
  있다**(§6.3). ⚠️ 갈래가 넷이 되면서 삼항 사슬을 `landingPath`로 내렸다 — 사슬로 두면 새 갈래를
  더할 때 어느 조건이 기본값(`null` = state를 못 믿는다)인지 보이지 않는다.

#### `planRepoConnect` — 3중 검증이 판정 자리 하나에 모여 있다 (`connect-plan.ts`)

"이 사용자가 이 리포로 무엇을 해도 되는가"를 **한 함수가** 답한다. 4단계가 만들고 **5단계의 프로젝트
생성 경로가 그대로 재사용한다** — 재사용이 목적이라 애초에 `Project` 행을 모르는 순수 함수다.

셋을 각각 다른 갈래로 낸다: 사용자가 그 **설치**를 못 보면 `installation-forbidden`, 그 **리포**를 못
보면 `repo-forbidden`, App이 그 리포에 **설치되지 않았으면** `repo-not-installed`. HTTP 실패는
`unavailable`로 접고 로그에는 고정 단계·ref·HTTP 상태만 남긴다. ⚠️ **세 갈래를 하나로 접지 않는 이유는 화면 문구가
아니라 판정이다** — "권한이 없다"와 "설치가 없다"는 사용자가 할 일이 다르다(관리자에게 요청 vs 설치
목록에 리포 추가).

#### 사용자 토큰 회전은 **조건부 쓰기**다 (`token-store.ts`)

GitHub의 refresh token은 **단일 사용**이다. 그래서 `ensureUserToken`은 회전 결과를 `updateMany`로 쓰면서
**직전에 읽은 `refresh_token`을 조건에 넣는다** — 동시 요청 둘이 같은 토큰으로 회전하면 한쪽만
`count: 1`을 받고 다른 쪽은 0을 받아 자기 결과를 버린다. 조건 없이 쓰면 나중 쓰기가 이미 무효가 된
토큰으로 행을 덮어 **그 사용자의 연결이 통째로 죽는다**. `planTokenUse` 3갈래와 `refreshFailure`가 그
앞의 판정이고, ⚠️ **429는 4xx인데 `unavailable`이다**(영구 거부가 아니다).

### 6.5 `probeRepo`가 두 번 부르는 이유 — 200이 접근을 증명하지 않는다

**installation 토큰으로도 public 리포는 접근을 철회한 뒤에 200을 준다.** `GET /repos/{o}/{r}`만 보면
`ok`로 오판하므로, **App JWT의 `GET /repos/{o}/{r}/installation`이 "설치돼 있는가"를 결정적으로 답하고**
두 번째 호출은 **이름과 불변 repository ID 확인용**이다(리네임이면 octokit이 301을 따라가 새 `full_name`을 준다).
2026-09-07에 실물로 확인했다 — 설치의 선택 목록에서 리포를 빼자 `probeRepo`가 `not-installed`로 바뀌었다.

- **`try`가 토큰 발급까지 감싼다.** 설치가 삭제되면 `GET /repos`가 아니라
  `getInstallationOctokit`의 **토큰 발급**이 404로 죽는다.
- **⚠️ `createApp()`은 `try` 밖이다** (2026-09-07). 환경변수 누락(`MissingEnvError`)은 GitHub 실패가 아니라
  우리 설정 오류인데, 값으로 접으면 화면이 `m.settings.repository.health.unknown`을 **영원히** 보이고 로그도
  없다 — 2026-09-06 개인키 사고가 정확히 그 화면이었다. 그래서 던지고, **호출부(설정 화면 `loadHealth`·
  `connectRepository`)도 그것을 잡지 않는다** — Server Action에서는 digest만 있는 일반 오류가 되지만
  사용자가 할 수 있는 일이 없는 오류라 §6.3("거부는 값으로")의 예외다. `state.ts`의 `requireSecret`이
  빈 키를 `state-mismatch`로 접지 않고 던지는 것과 같은 판단이다.
- **⚠️ 예외를 삼켜 `not-installed`로 접지 않는다.** 분류는 `probeFromError` **한 곳**이고, **403·404만
  `not-installed`, 401·429·5xx는 `error`**다. 401을 접었더니 로컬 App JWT가 깨진 상태에서 화면이
  "App이 제거됐어요 + 설치 링크"를 보여 **재설치해도 안 고쳐지는** 안내가 됐다(2026-09-06, `d9255a0`).
  **404가 설치 부재이고 401은 우리 자격증명 실패다.**
- **403(설치 일시중지)은 `error`가 아니라 `not-installed`다** — 영구 상태이고 사람이 GitHub에서 풀어야
  한다.

#### 6.5.1 장애를 거부로 접지 않는다 — §6.1.2와 같은 축

연결 경로 전체가 §6.1.2("세션 없음 ≠ 못 읽었다")와 **같은 규칙 위에 서 있다**: 모르는 것을 거부로
말하면 사용자가 고칠 수 없는 일을 하게 된다.

| 신호 | 판정 | 왜 |
|---|---|---|
| probe `error` | `unknown` (≠`app-uninstalled`) | 조회 실패를 "제거됨"으로 보여주면 멀쩡한 설치를 다시 만든다 |
| 사용자 토큰 401 | `reauthorize` | 인가 철회다. "잠시 뒤 다시"로 안내하면 사용자가 갇힌다 |
| 사용자 토큰 **429** | `unavailable` | **4xx인데 장애다** — 재시도하면 풀린다 |
| DB 장애 | `unavailable` | 토큰을 못 읽은 것이지 없는 것이 아니다 |

**`unavailable`만 재시도를 권한다.** `connectErrorMessage`가 12갈래를 **사전 키의 `satisfies Record<ConnectError | "fallback", string>`**으로 덮으므로(옛 `never` 검사가 그 형태로 바뀌었다 — `accessErrorMessage`도 같다)
갈래를 늘리면 컴파일이 red다.

⚠️ **`unavailable`·`error`로 접는 자리는 전부 `logFailure`를 부른다** (`lib/github-connect/log.ts`,
2026-09-07; 2026-09-10부터 원인 **메시지** 대신 **HTTP 상태(`http-<status>`) 또는 오류 생성자 이름**만 기록한다 — 상태가 없으면 `error.constructor.name`(예: `PrismaClientKnownRequestError`), 그것도 아니면 `typeof`다. ⚠️ **전부 한 단어로 접지 않는 것이 요지다**: 메시지엔 Prisma 인자·암호문이 실릴 수 있어 원문은 못 쓰지만, 생성자 이름은 우리와 라이브러리가 정한 상수이지 사용자 데이터가 아니다). 화면에는 갈래 이름만 가므로 GitHub 5xx·네트워크·Prisma가 사용자 제보에서 구별되지 않는다 —
callback 라우트만 로그가 있고 Action·토큰 껍데기·probe는 없던 것을 한 곳으로 모았다. `reauthorize`는
남기지 않는다(화면이 다음 행동을 말한다). `token-store.test.ts`·`github-connect.test.ts`가 `console.error`
호출을 단언한다.

⚠️ **`repo-moved`·`installation-changed`를 자동으로 따라가지 않는다.** 리네임·소유자 이전을 서버가
조용히 받아들이면 "내가 모르는 사이에 다른 리포로 PR이 갔다"가 성립한다. 사람이 다시 연결한다.

**GitHub App 개인키는 개행이 든 PEM이다.** Vercel env에 넣으면 개행이 `\n` 문자열로 이스케이프되므로 읽는 쪽에서 복원해야 한다. 안 하면 JWT 서명이 **조용히** 실패한다.

### 6.6 Credential 저장 경계 (2026-09-10, dev·prod 전환 완료)

`refreshVerifiedEmail`은 기존 User 잠금 아래 HMAC 조회·복호화 이메일 대조 후 암호문과 lookup을 함께 갱신한다. 이미 사용 중인 주소 또는 동시 unique 충돌이면 옛 이메일·userId로 로그인을 허용하며 병합하지 않는다. 새 가입의 unique 충돌은 거부한다.

GitHub refresh는 외부 일회용 토큰 소비 전에 쓰기 키를 확인한다. CAS 비교값은 **조회한 refresh 암호문 원본 + userId + providerAccountId**이며, 새 access/refresh 쌍은 각기 난수 nonce로 암호화해 함께 저장한다. 키/복호화 오류는 reauthorize와 구별되는 unavailable이다.

`credentialIO`는 Prisma/crypto 예외를 원인 객체 없는 고정 오류로 바꾼다. `auth.ts`는 오류 타입만, `logFailure`는 HTTP 상태 또는 **오류 생성자 이름**만 기록한다(§6.5.1). 메시지·cause·암호문·lookup·키를 로그에 남기지 않는다. Auth.js SessionTokenError를 통한 readSession 장애 판정은 유지한다.

### 6.7 프로필 이미지 저장 경계 (2026-09-13, 구현 완료·실 Blob 검증/배포 대기)

`lib/upload/`는 사용자 프로필 사진 전용이다. `uploadProfileImage`·`deleteProfileImage`는 세션의
`userId`로만 User 행을 읽고 쓰며, 프로젝트 멤버십을 요구하지 않는다. **검증된 이메일로 가입한
비멤버도 공개 Vercel Blob 쓰기에 접근할 수 있고, 호출 빈도 제한은 없다.** 파일당 800,000바이트
상한은 요청 횟수·비용 상한이 아니다. 화면 소비자 유무를 인가로 간주하지 않는다. 이번 구현에는
쿨다운·추가 스키마를 넣지 않았으며, 배포 시 이 노출과 저장소 사용량을 확인한다.

PNG/JPEG 시그니처만 검사하고 본문·EXIF는 그대로 저장한다. 난수 키로 교체마다 URL이 바뀌며
`User.image`는 PII 봉투에 넣는다. 쓰기 키 검증은 Blob 업로드보다 먼저다. 사용자 행 잠금 안에서
이전 URL 조회와 DB 갱신을 직렬화하고, 이전 파일은 커밋 이후에만 지운다. 삭제는 복호화된 URL에
대한 Blob 호스트·키 형식 allowlist와 **실제 삭제 직전 세션 사용자 경로 검사**를 모두 통과해야 한다.
실패 로그에는 단계·사용자 ID만 남기고 SDK·DB 오류 원문과 URL을 기록하지 않는다.

### 6.8 표시 이름의 소유권 (2026-09-13)

`User.name`은 **사용자 소유**이고 `User.email`은 provider 소유다. 이메일을 고칠 수 없는 근거는
초대 대조가 검증된 주소 위에 선다는 것이고(§6.02), **그 논증은 이메일 축에서만 성립한다** — 이름은
멤버 목록·초대에서 남이 나를 알아보는 값이라 provider의 표시 이름이 그 자리에 맞지 않을 수 있다.

`updateProfileName`은 세션의 `userId`로만 행을 쓰고, `requireUser` 뒤에 `planNameSave`(트림 · 빈
문자열 거부 · 코드포인트 상한)를 지난다. 거부는 **값**으로 돌아온다 — 던지면 사유가 `unavailable`로
뭉개져 화면이 무엇을 고치라고 말하지 못한다. 무효화는 `revalidatePath("/", "layout")`이다(셸
아바타·사용자 메뉴가 같은 값을 읽는다).

⚠️ **`User.name`·`User.image`는 `User.email`과 같은 PII 봉투 대상이다** — `encodeUserFields` /
`decodeUser`의 `["name","image"]` 루프가 그 둘을 봉인·복호한다. **평문을 직접 쓰면 다음
`decodeUser`가 `CredentialError`로 죽고 그 사용자의 로그인·멤버 조회가 통째로 막힌다.**
`prisma/schema.prisma`가 2026-09-13까지 그 사실을 `email`에만 적어 두어 스키마만 읽고 구현하면
틀리는 자리였고, 지금은 세 컬럼 모두 주석을 든다.

⚠️ **그 값을 덮을 수 있는 통로는 `credentialAdapter.updateUser` 하나이고, OAuth 재로그인은 그
메서드를 부르지 않는다**(§6.6의 `planEmailRefresh` 문단과 같은 사실). 이름을 지키는 것이 그 계약
하나뿐이므로 **양쪽을 따로 고정한다** — `adapter.test.ts`가 "부르면 덮는다", `access.test.ts`가
"재로그인의 쓰기는 `email`·`emailLookup` 둘뿐"이다. **둘이 한 왕복에서 만나는 것을 보는 자리는
`postgres.integration.ts`의 `relogin` 경로뿐이고 그것은 `pnpm test` 밖이다.**

## 7. Supabase / Prisma

**Prisma 7은 접속 URL이 스키마에 없다.** `url`·`directUrl` 모두 제거됐고 두 곳으로 갈렸다 — 마이그레이션은 `prisma.config.ts`(`DIRECT_URL`, 5432 session), 런타임은 `lib/db.ts`의 driver adapter(`DATABASE_URL`, 6543 transaction). 클라이언트는 `generated/prisma/`로 생성되며 gitignore된 산출물이라 CI가 typecheck 전에 `db:generate`를 돌린다.

**⚠️ dev DB와 prod DB가 갈렸다** (2026-09-04). Supabase 프로젝트가 둘이다 — `malmoi-dev`(로컬·Preview) / `malmoi`(프로덕션). `pnpm db:migrate`는 dev만 치고 **프로덕션에 닿을 수 없다**; prod를 겨누는 것은 `pnpm db:deploy`·`pnpm db:status:prod`(`PRISMA_TARGET=prod`)뿐이다. 분리가 만든 새 실패 모드는 **dev에만 적용하고 `db:deploy`를 잊는 것**이고(배포 순간 프로덕션이 없는 컬럼을 조회한다), 그래서 `/merge` 1단계가 `db:status:prod`를 확인한다(`/push` 3단계는 dev만 본다). 얻은 것은 dev에서 리셋을 승인해도 된다는 것이다 — 그 DB엔 폐기용 리포 적재분밖에 없다. 상세는 `/db` 스킬. *(2026-09-05 정정: 이 문단이 분리 뒤로도 "인스턴스가 하나뿐"이라고 가르치고 있었다.)*

**`prisma.config.ts`는 `.env.local`을 명시적으로 읽는다.** `dotenv`의 기본은 `.env`인데 이 프로젝트의 시크릿은 Next.js 관례에 따라 `.env.local`에 있다. 경로를 안 주면 URL이 `undefined`가 되고 `P1001 Can't reach database server`가 떠서 네트워크 문제로 오진하게 된다.

- **⚠️ 비밀번호의 특수문자는 URL 인코딩해야 한다.** 접속 문자열은 URI라서 비밀번호에 `@`가 들어가면 호스트 구분자와 충돌해 파서가 userinfo/host 경계를 잘못 잡는다 (`:pw@@host`가 된다). `@`→`%40`, `!`→`%21`, `#`→`%23`, `/`→`%2F`, `?`→`%3F`, `%`→`%25`. **이미 인코딩된 값을 두 번 인코딩하면 `%40`이 `%2540`이 되어 조용히 인증 실패한다** — 증상이 "비밀번호가 틀렸다"로만 나와 진단이 오래 걸린다. 애초에 **특수문자 없는 영숫자 비밀번호를 발급받는 게 이 함정을 없애는 방법이다.**
- **런타임 `DATABASE_URL`은 pooler(6543) + `?pgbouncer=true`.** 이 쿼리 파라미터가 없으면 prepared statement 충돌로 **간헐** 실패한다 — "가끔 되고 가끔 안 됨"이라 진단이 오래 걸린다.
  - ⚠️ **포트를 바꿔 넣으면 부하가 붙을 때까지 안 드러난다** (2026-09-05 실측). Preview 스코프의 `DATABASE_URL`이 session 모드(5432)를 가리키고 있었고, 요청이 적은 동안은 멀쩡히 돌다가 인가가 요청마다 DB를 치기 시작한 순간 `EMAXCONNSESSION max clients reached in session mode - pool_size: 15`로 전면 실패했다. **환경변수 값은 문서가 아니라 배선이므로, 경고를 문서에 적는 것으로 지켜지지 않는다** (POSTMORTEM 2026-09-05). Vercel의 Sensitive 변수는 값을 되읽을 수 없어 **의심되면 원본에서 다시 복사해 덮는 것이 유일한 확인법**이다.
- **`getPrisma()`의 전역 캐시는 환경으로 가르지 않는다** (2026-09-06). 전에는 `NODE_ENV !== "production"`일 때만 저장해 **프로덕션이 호출마다 새 `PrismaClient`와 `pg.Pool`을 만들었다** — 번역 화면 한 번에 `auth()` 둘 + 인가 + 조회로 풀 4개, 핸드셰이크 4회이고 dev는 캐시가 있어 로컬에서는 보이지 않았다(Codex 감사 #9). "dev에서만 전역에 붙인다"는 Prisma 관용구는 모듈 최상위 `const`가 프로덕션의 단일 인스턴스를 보장할 때의 것이고, 지연 생성에는 그 보장이 없다. `lib/__tests__/db.test.ts`가 두 환경 모두 동일성을 본다.
- **마이그레이션 `DIRECT_URL`은 session 모드 pooler(5432).** transaction 모드 pooler(6543)는 advisory lock·DDL 세션을 못 잡아 마이그레이션이 실패한다. 직결 `db.<ref>.supabase.co`는 IPv6 전용이라 쓰지 않는다 (CLAUDE.md 스택 표).
- **배포 순서는 additive-first.** 스키마를 먼저 넓히고(`db:deploy`) 코드를 배포한다. 컬럼 삭제·타입 변경은 코드 배포 후 별도 마이그레이션. 순서를 어기면 배포 순간 프로덕션이 없는 컬럼을 조회한다.

## 8. Vercel

- ⚠️ **함수는 DB 옆(`hnd1`)에서 돈다 — 기본값이 아니라 `vercel.json`이 정한다** (2026-09-09). `regions`를
  안 주면 함수가 **`iad1`(워싱턴)**이고 DB는 도쿄라 **요청마다의 왕복 일곱이 전부 태평양을 건넌다**
  (홉당 ~375ms → 번역 화면 첫 착지 3.30초). 이 앱의 비용은 페이로드가 아니라 **홉 개수**다 — 문서는
  8KB인데 본문이 3.4초 걸렸다. **엣지는 그대로 `icn1`**이므로 사용자까지의 거리는 한 홉만 늘고 DB
  일곱 홉이 짧아진다.
  - **실행 리전은 `x-vercel-id`의 두 번째 필드다** (`icn1::hnd1::…` — 앞이 엣지, 뒤가 함수).
    `curl -sD- https://mal-moi.com/ | grep -i x-vercel-id`.
  - ⚠️ **TTFB로 서버 시간을 재지 않는다.** 스트리밍 응답은 헤더를 먼저 보내므로 TTFB가 8ms여도 서버가
    본문을 3.4초 붙들고 있을 수 있다 — `performance`의 **`responseEnd`와 `transferSize`를 함께** 본다
    (POSTMORTEM 2026-09-09: 그 오독이 원인을 "순차 DB 왕복"으로 진단하게 만들었다).
- **Cron은 Hobby 플랜에서 하루 1회.** 야간 pull 1회가 요구사항이라 지금은 맞다.
  - ⚠️ **한 실행이 도는 프로젝트에 상한이 있다** (2026-09-09, sec-audit 발견 26 — `PULL_BATCH_LIMIT` 50).
    전에는 준비된 전 프로젝트를 직렬로 돌았고, `maxDuration = 60`을 넘으면 **slug 정렬 뒤쪽이 통째로
    안 돌았다.** 응답이 항상 200이라 cron 실행은 성공으로 표시되고 요약에도 그 사실이 없어 **관측값이
    정상과 같았다.** 지금은 `selectPullTargets`가 못 돈 수를 함께 내고 응답이 `{ results, unprocessed }`다 —
    **상한이 잘림을 없애지 않는다, 시끄럽게 만든다.** 거기 닿으면 그때 cron 분할을 본다.
- **응답 보안 헤더는 `next.config.ts`의 `headers()`가 낸다** (2026-09-09, sec-audit 발견 9). enforce 셋
  (`X-Content-Type-Options: nosniff` · `Referrer-Policy: strict-origin-when-cross-origin` ·
  `Content-Security-Policy: frame-ancestors 'none'`) + **CSP 본체는 Report-Only**다.
  - ⚠️ **`Referrer-Policy`가 이 중 실질이 가장 크다** — `/invite/<token>`은 토큰이 **URL에** 있어, 그
    화면에 외부 링크가 하나 추가되는 순간 토큰이 `Referer`로 나간다.
  - ⚠️ **CSP를 바로 enforce하지 않는다** — Next가 인라인 스타일·스크립트를 넣고, 깨지면 **콘솔에만**
    난다. 이 리포엔 렌더 테스트가 없어 `pnpm build`로도 못 본다. 콘솔을 읽은 뒤에 올린다.
  - ⚠️ **`tsc`는 이 함수를 못 본다** — 없어도, 헤더 이름 오타도 타입은 통과한다.
    `app/__tests__/security-headers.test.ts`가 **설정을 불러서** 검사한다.
- **서버리스 함수 타임아웃**: **blob 읽기는 이미 `BLOB_CONCURRENCY`(8) 청크 제한 병렬이다** — 실측 최대 106로케일이고 직렬이면 그 한 리포가 cron을 넘긴다 (2026-09-04 audit #18). 남은 순차 구간은 ref·tree·commit이고 파일 수와 무관하다.

## 9. sec-audit-2 저장소 쓰기·스냅샷 경계 (2026-09-10)

- **리포 이름은 주소, `Project.repositoryId`는 정체성이다.** 최초 생성·OWNER 재연결 때 GitHub가
  반환한 ID를 저장한다. 재연결은 기존 ID가 다르면 거부하고 기존 ID·owner/name을 조건으로 갱신한다.
  Publish는 ID 미고정 상태를 거부한다. installation 토큰도 해당 ID 하나로 범위를 제한하고,
  이름으로 조회한 저장소의 ID를 재대조한다. 검사 뒤 이름이 재사용되어도 다른 저장소에 쓸 권한이 없다.
  - ⚠️ **그 판정이 화면에도 서야 한다** (2026-09-10 보완). 처음엔 쓰기 직전에만 대조해서,
    이름을 재사용한 리포에서 `planConnectionHealth`가 `fullName`·`installationId`만 보고 **초록을
    띄우는 동안 Publish만 죽었다.** 지금은 ID 대조가 이름 대조보다 **앞**이고 갈래가 하나 늘었다
    (`repo-replaced`) — 리네임(같은 ID·다른 이름)만 `repo-moved`로 남는다. ⚠️ **그 화면에
    [다시 연결]을 두지 않는다**: 리포는 프로젝트 생성 시점에 고정이라 `connectRepository`가 다른
    ID로의 재고정을 거부하므로, 눌러도 실패할 버튼이 된다.
  - ⚠️ **`ProbeResult.repositoryId`는 optional이 아니다.** `probeRepo`는 항상 채우는데 타입이 부재를
    허용하면 판정 쪽 `=== null` 검사를 `undefined`가 조용히 지나간다. 부재를 표현할 곳은 **저장된
    행**이지 방금 받은 응답이 아니다 — 필수로 바꾸자 픽스처 넷이 컴파일에서 걸렸다.
  - ⚠️ **미고정 행은 cron 순회에서도 빠진다** (§3.05). 화면이 `not-connected`로 할 일을 말하는 동안
    `/logs`가 실패로 채워지면 7단계 이력의 첫 화면이 무의미해진다.
- nullable 컬럼 추가 마이그레이션 `20260910030000_pin_repository_id`를 앱 배포보다 먼저 적용한다.
  기존 프로젝트는 자동 고정하지 않는다. OWNER 재연결 전까지 Publish가 차단된다.
- `loadPullState`는 프로젝트·키·번역 값·최대 수정 시각을 **같은 RepeatableRead 트랜잭션**에서 읽는다.
  이 트랜잭션은 GitHub 호출 전에 종료된다. 값을 A에서 읽고 완료 기준 시각을 B에서 읽는 경합을 막는다.
  프로젝트 실행 직렬화(`SyncRun`)와는 별개의 보장이다.
- 글롭 `*`는 `/`를 넘지 않는 DP 매칭(`lib/adapters/glob.ts`)이며 시간은 템플릿 길이 × 경로 길이에
  비례한다. 기존 템플릿 길이 200·양자 4개 상한을 유지한다. 온보딩 `{locale}` 캡처는 2~8자로 묶는다.
  ⚠️ **DP 뒤에도 양자 예산이 남는 이유는 갈래가 둘이기 때문이다** — `matchGlobPaths`는 역추적을 안
  하지만 `lib/onboarding/confirm.ts`의 per-locale 갈래는 여전히 `RegExp`이고 `{locale}` N개를 인접
  캡처 N개로 이어 붙인다. 두 갈래가 `exceedsGlobBudget` 하나를 지난다.
- ⚠️ **`lib/onboarding/budget.ts`가 `yaml`의 `Parser.stack`을 읽는다** — 공개 API가 아니다. YAML의
  plain/block scalar 의미가 따옴표 스캐너와 달라 직접 구문을 추정하면 우회와 오탐이 함께 났고
  (POSTMORTEM 2026-09-10), 실제 Lexer·CST로 옮기면서 내부 구조에 붙었다. 버전을 올릴 때 red를
  내는 것은 `budget.test.ts`뿐이라 스택 표에 그 사실을 적었다.
