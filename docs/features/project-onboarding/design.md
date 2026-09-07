# project-onboarding — 설계

> 착수 전 읽은 것: SAAS §5.4·§5.7·§7.1~§7.9·§8 5단계 · ARCHITECTURE §1·§2·§3·§4·§6.1 ·
> ADAPTER-COVERAGE §0 3차 · POSTMORTEM 7건(§8에 인용) · `features/github-connect/design.md`.
>
> 2026-09-07 `/feature-review` 반영. 🔴 둘이 설계를 바꿨다 — §3.1(2패스 탐지의 전제가 틀렸다)과
> §3.4(확정 대조를 "목록 포함"에서 "파일 재검증"으로). 나머지는 §3.11~§3.13이 새로 생겼다.

## 1. 영향 받는 흐름 — 셋 다다

| 흐름 | 무엇이 바뀌나 |
|---|---|
| **push** | 인증 근거가 `PUSH_TOKEN`(서버 env 하나) → `Project.pushTokenHash`(프로젝트별)로 바뀐다. 오배송 판정의 기준도 "서버가 아는 프로젝트"에서 **"이 토큰의 프로젝트"** 로 바뀐다 (SAAS §7.8 — 그쪽 서술이 반대라 T8이 고친다). 서버는 `PUSH_TOKEN` env를 **더 읽지 않는다** (§10) |
| **pull** | `/api/pull`이 slug 하나가 아니라 **준비된 전 프로젝트를 순회**한다. `triggerPull` 자체는 그대로다. 응답이 단건에서 **배열**로 바뀐다 |
| **편집 UI** | `/projects/new`가 생기고, `/projects` 목록이 상태를 보이며, 번역 화면이 `ready`가 아닌 프로젝트를 막고, 설정 화면에 상태·토큰 섹션이 생긴다 |

**새로 생기는 흐름이 하나 있다 — 서버측 첫 적재.** CI 없이 GitHub App 토큰으로 base 트리를 읽어
`applyPush`까지 간다 (§4). 지금까지 적재는 항상 리포를 체크아웃한 CLI가 했다.

## 2. 화면 흐름

```
/projects  ──[새 프로젝트]──▶  /projects/new
                                  │
                    ① GitHub 계정이 연결돼 있나  ──아니오──▶ [GitHub 연결] (왕복 후 /projects/new로 복귀)
                                  │ 예
                    ①' 설치가 하나도 없나 / 설치에 선택된 리포가 없나
                                  │        ──예──▶ 빈 상태 + App 설치 링크 (GITHUB_APP_SLUG) — GitHub에서 돌아오면 다시 ②
                                  │ 아니오
                    ② 내 설치의 리포 목록에서 하나 고르기 (텍스트 필터)
                                  │
                    ③ 탐지 결과 — 후보 N개(형식·경로·언어·키 수) + 기준 로케일(미리 채움, 선택) + 수동 지정
                                  │ 확정
                    ④ 이름·주소(slug) 확인  ──▶ createProject: 행 + OWNER + 토큰 (한 트랜잭션, 수백 ms)
                                  │
                    ⑤ push 토큰 원문 + 워크플로 YAML (한 번만) ── 동시에 runFirstIngest 진행 ("적재하는 중…")
                                  │
                    ⑥ 첫 적재 결과 — 키 N개 (+ 읽지 못한 M건) · "코드 참조는 CI 첫 push 뒤 채워져요"
                                  │
                                  ▼
                    /projects/<slug>/translations
```

**②~⑥이 한 라우트(`/projects/new`)다.** 단계를 URL로 쪼개지 않는다 — 중간 상태를 서버에 저장하지
않으므로(§3.4) 새로고침하면 처음부터인데, 라우트를 쪼개면 그것이 "깨진 것"으로 보인다. **④가 지나면
행은 있다** — 그 뒤 새로고침·세션 만료로 ⑤⑥을 잃어도 프로젝트는 `/projects`에 "첫 적재 대기"로
보이고 설정 화면의 상태 섹션(§3.7)이 이어받는다. 토큰 원문만 다시 못 보고, 그건 재발급이다.

**대기 문구는 버튼 라벨 교체다** (DESIGN §6.4) — "탐지하는 중…"·"만드는 중…"·"적재하는 중…" + 폼
disabled. pull-button의 옆 문구 방식은 예외로 남은 형이라 새 화면에서 쓰지 않는다.

⚠️ **Server Action에는 `app/api/*`의 `maxDuration`이 붙지 않는다.** Action은 그것을 부른 **페이지
세그먼트**의 config를 쓴다 — `/projects/new/page.tsx`와 `/projects/[slug]/settings/page.tsx`에
`export const maxDuration = 60`을 둔다. §3.1·§4의 예산은 그 60초를 전제로 세운 것이다.

## 3. 설계 결정

### 3.1 탐지는 **두 번 돈다** — probe가 동기 함수이기 때문이다. 단 probe의 역할이 어댑터마다 다르다

`FileProbe = (path: string) => string | undefined`는 **동기**다. CLI는 `readFileSync`라 문제가
없지만 서버는 GitHub API라 그럴 수 없다. 그래서 경로만으로 1차 후보를 얻고, 내려받을 파일을 고른 뒤,
내용을 들고 다시 돈다.

⚠️ **"probe 없는 후보 ⊇ probe 있는 후보"는 거짓이다** (2026-09-07 검토에서 정정). probe의 역할이
둘로 갈린다:

| 어댑터 | probe 없이 | probe의 역할 |
|---|---|---|
| `chrome-locales` · `json-catalog` · `yaml-catalog` | 경로 모양으로 후보를 낸다 | **필터** — `verifySamples`(`shared.ts:336`)가 샘플이 카탈로그 모양이 아니면 떨어뜨린다. 단 probe가 전부 `undefined`면 `false`라 **미검증 = 탈락**이다 |
| `code-dict` | **후보 0개** — `code-dict.ts:126` `if (!probe) return []` | **생성** — `hasDictionary`가 default export 객체를 실제로 봐야 후보가 된다 |
| `ts-dict` | 후보 0개 (자동 탐지 불참 — ADAPTER-COVERAGE 판정 ③) | 수동 지정(§3.4)만 |

그래서 파이프라인이 이렇다:

```
1) readTree(baseHeadSha)                         → 경로 전부 (lib/github.ts, §3.10)
2a) detectCandidatesAcross(paths)                → JSON·YAML·chrome 후보 (probe 없음 — 상위집합)
2b) codeDictCandidatePaths(paths)                → code-dict 경로 그룹 { pathTemplate, locales } — probe 없이 나오는 부분
3) probeTargets(2a, 2b, limits)                  → 내려받을 blob 경로 (순수, 상한)
4) readBlob × N                                  → Map<path, content>
5) detectCandidatesAcross(paths, makeProbe(map)) → 최종 후보 = "내려받은 상위 N개 중 검증을 통과한 것"
```

- **2b는 `lib/adapters/code-dict.ts`의 `detectCandidates` 앞부분(`CODE_FILE` + `looksLikeLocale` →
  `byDir`)을 함수로 분리해 export하는 것이다.** 정규식을 `lib/onboarding/`에 복사하지 않는다 —
  공급층이 두 벌이면 POSTMORTEM 2026-09-02의 형태다. **판정은 한 줄도 바뀌지 않는다**(같은 코드를
  `detectCandidates`가 그대로 부른다) — `lib/adapters/**` 변경이지만 재측정 트리거가 아니다. 그
  사실을 커밋 메시지와 ADAPTER-COVERAGE에 한 줄 적는다.
- **3)이 고르는 파일은 5)의 검증이 읽을 파일과 바이트 단위로 같아야 한다.** `verifySamples`는
  `sampleOrder(locales)`(en 우선 → 코드포인트 순, 3개)를 읽고, `hasDictionary`(`code-dict.ts:149`)도
  같은 순서 3개를 읽는다. 다른 3개를 받으면 후보가 검증 실패가 아니라 **미검증으로 통째로
  떨어진다.** `probeTargets`는 `sampleOrder`를 import해 쓴다.
- **5)의 결과는 "전체 재순위"가 아니다.** 내려받지 않은 후보(N+1순위 이하)는 probe가 `undefined`라
  탈락한다. `liftAncestors`(`shared.ts:268`)가 헤드 의존 후처리라 probe로 하나가 빠지면 순위가
  비단조로 바뀔 수 있다. **그래서 확정 시 대조를 "재탐지 후보 목록에 있는가"로 하지 않는다** (§3.4).
  사용자에게는 후보 목록 아래에 "더 있을 수 있어요"를 한 줄 둔다 (spec §5).

⚠️ **`detectFormat`을 서버에서 probe 없이 부르지 않는다.** probe 없는 1순위는 검색 인덱스 같은
무관한 JSON 묶음일 수 있고(bugshot-web 실측), 그 상태로 확정하면 온보딩이 잘못된 표면을 붙인다.
2a)의 결과는 **후보를 고르기 위한 중간값이지 사용자에게 보여주는 값이 아니다.**

**상한**: JSON·YAML·chrome 후보 상위 5개 × 3파일 + code-dict 경로 그룹 상위 2개 × 3파일 = **blob ≤ 21**.
`readTree`는 재귀 1회이므로 온보딩 한 번의 GitHub 호출은 `ref 1 + tree 1 + blob ≤21`이다. 상한을
두는 이유는 비용이 아니라 **응답 시간**이다 — 페이지 `maxDuration`이 60초다 (§2).

### 3.2 키 수를 보여주려면 base 파일을 실제로 읽어야 한다

완료 조건 ②("작은 후보가 큰 표면을 조용히 가리지 않는다")의 유일한 재료가 키 수다. 경로와 로케일
수만으로는 `_locales`(4키)와 `ts-dict`(903키)를 사람이 구별할 수 없다. 그래서 3.1의 4)에서 받은
blob으로 **후보마다 `adapter.read`를 돌려 추천 기준 로케일의 키 수를 낸다.** 추천 기준 로케일은
`pickBaseLocale`(`lib/push/payload.ts:22`, en 우선)이고 `sampleOrder`의 첫 파일과 같으므로 그 blob은
항상 있다 — 규칙을 두 벌 만들지 않는다.

**기준 로케일은 미리 채우되 사용자가 고른다** (2026-09-07 결정). 후보의 `locales` 중 하나를 라디오로
고르고 기본 선택이 `pickBaseLocale`이다. 키 집합의 진실이 base 파일이라 틀리면 진짜 base에만 있는
키가 orphaned로 떨어진다(2026-09-04 감사) — 그 판단을 사람에게 남긴다.

읽기 실패는 후보를 떨어뜨리지 않고 "키 수 확인 실패"로 표시한다 — 남의 리포를 우리 파서 규칙으로
탈락시키지 않는다 (ARCHITECTURE §4의 연장).

### 3.3 사용자에게 어댑터 이름을 보이지 않는다 (SAAS §3)

| 내부 | 화면 | 수동 지정 셀렉트의 경로 예시 |
|---|---|---|
| `chrome-locales` | 크롬 확장 메시지 | `_locales/{locale}/messages.json` |
| `json-catalog` | JSON 카탈로그 | `src/locales/{locale}.json` |
| `yaml-catalog` | YAML 카탈로그 | `config/locales/{locale}.yml` |
| `code-dict` | 코드 딕셔너리 (언어마다 파일 하나) | `src/locales/{locale}.ts` |
| `ts-dict` | 코드 딕셔너리 (여러 언어가 한 파일) | `src/i18n/namespaces/*.ts` |

`pathTemplate`·`layout`·`writeStrategy`·`nestedByPath`는 화면에 없다. **단 경로는 보인다** —
`src/locales/{locale}.json`은 사용자가 자기 리포에서 확인할 수 있는 유일한 단서라서 숨기면 후보를
고를 근거가 사라진다. `{locale}` 자리는 그대로 두되 "언어 자리"라고 한 줄 붙인다. 셀렉트에 "코드
딕셔너리"가 둘이라 경로 예시가 구별자다.

**mono 표면**: 경로 템플릿·`owner/name`·slug·토큰은 DESIGN §6.4 값 칩(`text-mono bg-muted rounded px-2 py-1`).
다중 행 YAML은 등재된 패턴이 없어(리포에 `<pre>` 0곳) `<pre className="text-mono bg-muted rounded-md p-3 overflow-x-auto">`를
**"코드 블록"으로 DESIGN §6.4에 등재**하고 옆에 [복사] 툴바 버튼(`h-8 px-3 text-xs font-medium` + 링 셋)을 둔다.

### 3.4 중간 상태를 서버에 저장하지 않는다 — 확정은 **파일을 다시 읽어 재검증**한다

탐지 결과를 `Project` 행에 미리 쓰지 않는다. 확정 시점에 **클라이언트가 고른 값을 다시 보내고 서버가
그 값이 이 리포에서 실제로 성립하는지 검증한다.**

⚠️ **클라이언트가 보낸 `adapterName`·`pathTemplate`을 그대로 저장하면 안 된다** — 그것은 SAAS §5.4가
`installationId`에 대해 막은 것과 같은 형태다. 임의의 `pathTemplate`을 저장할 수 있으면 pull이 그
리포의 아무 파일이나 덮어쓰는 커밋을 만든다.

**대조 규칙 — 자동 후보와 수동 지정이 한 경로다** (2026-09-07 결정. 전에는 "재탐지 후보 목록에 있는가"
였는데 §3.1의 순위가 비단조라 화면에서 본 후보가 확정 시 거부될 수 있었다):

1. `adapterName`은 `isAdapterName`을 지난다.
2. `pathTemplate`에서 **그 템플릿이 가리키는 파일 경로**를 산출한다 — `per-locale`은 `{locale}`을
   트리의 파일명으로 치환해 `paths`와 교집합, `multi-locale`은 `matchGlobPaths(pathTemplate, paths)`.
   0개면 `manual-no-match`.
3. 그 파일들을 내려받아(`readBlob` — 2단계 예산, §4) `detectFormatWith(adapterName, paths, probe)`를 돈다.
   반환이 없거나 반환된 `format.pathTemplate !== 입력`이면 거부다.
4. `baseLocale`은 **반환된 `format.locales`** 에 있어야 한다.
5. **저장하는 것은 `detectFormatWith`의 반환값이다** — 클라이언트 입력이 아니다 (POSTMORTEM 2026-09-05:
   검증한 값을 저장하지 않으면 검증이 장식이다). `layout`·`writeStrategy`·`nestedByPath`는 그 반환값과
   `adapterFor(format)`에서 나온다.

재검증 비용은 확정 클릭 한 번당 blob 몇 개(그 템플릿의 파일)이고, 그 대가로 "브라우저가 보낸 값이
설정이 된다"는 표면이 사라진다. `ts-dict`는 `detect`가 그 디렉터리 `.ts` 최대 4개를 읽어야 매치하므로
(`ts-dict.ts:110-116`) **이 경로가 아니면 수동 지정이 항상 거부된다** — 완료 조건 ②(903키)가 여기서 성립한다.

### 3.5 수동 지정 — `ts-dict`의 유일한 경로 (UI만 다르고 판정은 §3.4와 같다)

후보 목록 아래에 "찾는 파일이 없나요?"를 두고 어댑터 선택(§3.3 표의 화면 이름 + 경로 예시) + 경로
템플릿 입력을 받는다. 판정은 §3.4 그대로다.

**노출 수준**: 후보가 있으면 `<details>` 접힘, `no-candidates`면 **펼친 채 첫 화면의 주 행동**이다 —
그때는 이것이 유일한 길이고, 이유 문구("언어가 2개 이상인 로케일 파일이 필요해요")를 함께 낸다.

### 3.6 GitHub 계정 연결이 **프로젝트 없이** 성립해야 한다

지금 `startGithubConnect(slug)`는 `getProjectAccess(slug, "project:settings")`를 지난다. 생성
경로에는 프로젝트가 없으므로 그대로는 못 쓴다.

**서명 payload에 착지 지점을 넣는다** (`lib/github-connect/state.ts`). 지금 `slug`가 그 역할을
겸하고 있는데(`StatePayload = { userId; slug; nonce; exp }`, `parsePayload`가 `slug` string을 요구한다)
갈래가 둘이 되므로 명시적으로 가른다:

```ts
type StateDest = { kind: "settings"; slug: string } | { kind: "new" };
// StatePayload.slug → StatePayload.dest,  StateCheck.ok → { status: "ok"; dest: StateDest }
```

`parsePayload`의 필드 검사와 `StateCheck` 반환을 함께 바꾼다 — callback이 `dest`로 착지를 고른다.

⚠️ **착지 지점은 계속 서명 안에 있어야 한다** — 쿼리로 실으면 공격자가 정할 수 있고, 그러면
open redirect 판정이 필요해진다 (github-connect design §3.1이 없앤 것을 되살리는 셈이다).
payload 모양이 바뀌므로 **진행 중인 연결 왕복은 전부 `state-mismatch`가 된다.** 10분 만료라
배포 직후 10분의 창이고, 그 창의 사용자는 버튼을 다시 누르면 된다.

이 Action(`startGithubConnectForUser`)의 인가는 `requireUser`뿐이다 — `Account` 행은 사용자 소유이므로
프로젝트 권한을 요구할 근거가 없다. **6단계 백로그의 "GitHub 계정 섹션을 사용자 수준으로"의 절반이
여기서 먼저 온다** (연결만. 해제는 `project:settings` 뒤에 그대로 남고 6단계가 옮긴다).

⚠️ **callback이 `kind:"new"`로 실어 보내는 실패는 `ConnectError`다** (`denied`·`exchange-failed`·…).
`/projects/new`는 `?e=`를 **`isConnectError`와 `isOnboardError` 둘로** 걸러 읽는다 — `/projects`가
`isAccessError`·`isConnectError` 둘을 읽는 것과 같은 함정이다 (POSTMORTEM 2026-09-06, ARCHITECTURE §6.3).
state가 무효면 slug를 못 믿으므로 지금처럼 `/projects?e=`다.

### 3.7 `ready` 판정 — 컬럼을 만들지 않는다 (§7.5)

```
setup               installationId == null    (연결 전 — 온보딩이 만들면 이 상태로 안 남는다. skillflo-web이 여기다)
awaiting_first_sync lastCommitSha == null     (행은 있는데 적재가 안 끝났다)
ready               lastCommitSha != null
```

**`lastCommitSha`가 "첫 적재가 성공했다"의 유일한 증거다** — `applyPush`가 그 컬럼을 쓰고, 그 쓰기는
키·번역·refs와 **한 배열형 `$transaction`** 이다 (`lib/push/apply.ts:229-255`). 그래서 부분 성공 상태가 없다.

⚠️ **설정 저장과 `ready`를 가르는 것이 요지다** (불변식 8). 확정한 어댑터·경로·기준 로케일은
`Project` 행 생성과 같은 트랜잭션에서 저장하지만 그것으로 `ready`가 되지는 않는다 — 저장하는 이유는
"다시 시도"가 재탐지 없이 돌 수 있게 하기 위해서다.

**판정의 자리** (2026-09-07 결정): `ProjectAccess` union에 넣지 않는다 — 넣으면 `saveTranslation`·설정
화면까지 그 값이 흘러가고 `ACCESS_ERRORS` Set을 손으로 늘리는 것이 따라온다(`lib/auth/message.ts`,
컴파일러가 안 잇는다). 대신 `planProjectReadiness(project)`를 **셋에만** 붙인다:

| 어디 | `ready`가 아니면 |
|---|---|
| `/projects/[slug]/translations/page.tsx` — `requireProjectAccess` **뒤** | OWNER → `redirect(/projects/<slug>/settings)`. EDITOR·VIEWER → 리다이렉트 없이 한 줄 "소유자가 설정을 마치는 중이에요" (설정에 못 들어가므로 보낼 곳이 없다) |
| `saveTranslation` · `triggerPullAction` | `not-ready` 거부 (`ready` 전에 저장할 키가 없지만 URL 직접 호출을 막는다) |
| `runFirstIngest` | `awaiting_first_sync`가 **아니면** `not-awaiting` 거부 — `ready`에서 돌리면 strict push라 번역자 편집을 버튼 하나로 덮는다 |

**"온보딩 결과 화면"은 라우트가 아니다.** 생성 직후의 얼굴(토큰 원문 + YAML + 적재 진행)은 `/projects/new`의
클라이언트 상태이고, 재방문·not-ready 착지의 얼굴은 **설정 화면의 상태 섹션**이다 — "첫 적재 대기" +
[다시 시도] + 토큰 재발급 + YAML. 토큰 원문은 여기서 다시 못 본다(해시만 저장). 첫 적재 실패 사유는
중간 상태 무저장(§3.4)이라 Action 반환값에만 있다 — 재방문 화면은 사유를 모르고, [다시 시도]의 인라인
결과로 돌아온다.

`/projects` 목록의 상태 표시는 **raw 색 없이** 간다 (DESIGN §6.2 원칙): `ready`는 가장 흔한 상태라
표시 없음(`ok`·"번역됨" 전례), `awaiting_first_sync`→"첫 적재 대기"·`setup`→"준비 중"은 오류가 아니라
`text-muted-foreground` 텍스트(`not-connected`·`unknown` 전례). 번역자도 보는 목록이므로 내부 이름 금지.

### 3.8 push 인증 — 토큰이 프로젝트를 정한다

```
Authorization: Bearer <원문>
  → sha256(원문)  →  Project.pushTokenHash (unique) 조회
      없음                     → 401  (프로젝트 존재를 노출하지 않는다)
      slug ≠ payload.projectSlug → 409  (오배송 — 기준이 "토큰의 프로젝트"로 바뀐다)
      commitAt < lastCommitAt    → 409  (역행 — 그대로다)
```

**해시로 조회하는 것이 `timingSafeEqual`보다 낫다.** 지금은 서버가 아는 한 값과 문자열 비교를
하는데, 프로젝트별이 되면 "어느 프로젝트의 토큰인지"를 먼저 알아야 비교할 대상이 정해진다 —
페이로드의 slug로 행을 찾으면 **오배송된 페이로드가 인증 대상을 고르게 된다.** 해시 조회는 그
순서를 뒤집는다: 토큰이 프로젝트를 정하고, slug는 그 뒤에 대조된다. 토큰은 32바이트 난수라 타이밍
비교 문제가 없고 해시 충돌은 무시한다(주석만).

⚠️ **fail-closed를 유지한다** — `pushTokenHash`가 `null`인 프로젝트는 어떤 요청도 통과시키지
않는다. `checkBearer`의 `not-configured`(500)와 같은 축이지만, 여기서는 서버 설정이 아니라 그
프로젝트의 상태이므로 **401**이다.

⚠️ **`checkProjectSlug`의 시그니처는 그대로 두고 인자만 바꾼다.** 두 번째 인자가
`ACTIVE_PROJECT_SLUG`에서 `project.slug`가 된다 — 순수 함수라 판정 자체는 변하지 않고, 바뀌는 것은
"무엇과 대조하는가"다 (SAAS §7.8의 경고 그대로).

**과도기 이중 수용을 만들지 않는다** (2026-09-07 결정). 대상 리포 넷이 전부 내 것이라 배포와 같은
세션에 Actions secret을 바꿀 수 있고, 이중 수용은 한 번 넣으면 지워지지 않는 부류다. **preview 배포는
영향이 없다** — `action.yml`의 `api-url` 기본값이 프로덕션이라 CI가 preview를 치지 않는다.

**서버 `PUSH_TOKEN` env는 사라진다** — `checkBearer`는 `CRON_SECRET`용으로만 남는다. Vercel 세 스코프에서
지우고, `.env.example`의 `PUSH_TOKEN`은 "`push:local`이 보낼 **그 프로젝트의** 토큰 원문(로컬 전용)"으로
설명을 바꾼다 (§10).

### 3.9 `/api/pull` 순회 — 한 프로젝트의 실패가 나머지를 막지 않는다

```ts
for (const slug of targets) {
  try { results.push({ slug, ...await triggerPull(prisma, slug) }); }
  catch (e) { results.push({ slug, status: "failed", ref }); }   // 전문은 서버 로그로
}
```

- **대상**: `installationId != null AND lastCommitSha != null` (= `ready`). 준비 안 된 프로젝트를
  돌리면 던진다 — `installationId` null은 `lib/pull/run.ts:78`, 포맷 컬럼 null은
  `lib/pull/plan.ts:78-83`(`formatFromProject`)이 던지고(`loadPullState`는 프로젝트 부재만 `fail()`한다),
  그 실패가 매일 밤 로그를 채운다. `skillflo-web`은 이 필터가 **의도적으로** 뺀다.
- **순서는 `slug` 오름차순.** 결정적이어야 실패 지점을 재현할 수 있다.
- **응답이 배열이다.** 대상 0개면 `[]` 200. 읽는 코드는 없다(cron은 무시) — 사람이 보는 곳은
  `/l10n-roundtrip` 스킬 문서(`:54`)라 그 기대 출력을 고친다.
- **1층 스킵이 기본 경로다** — 편집이 없는 프로젝트는 GitHub을 한 번도 부르지 않는다
  (ARCHITECTURE §2). 그래서 프로젝트가 늘어도 야간 실행 시간은 거의 늘지 않는다.
- ⚠️ **`maxDuration = 60`은 그대로 둔다.** 실제로 편집이 쌓인 프로젝트가 여럿이면 넘칠 수 있고,
  그 한계는 **7단계의 `SyncRun`이 답한다**(프로젝트당 실행을 큐로 가른다). 지금은 "몇 개까지
  가능한가"를 세지 않고, 넘치면 나머지가 다음 밤에 도는 것으로 둔다 — `lastPulledAt`은 성공한
  프로젝트에만 쓰이므로 실패·미실행이 편집을 잃지 않는다.

### 3.10 트리 읽기는 `lib/github.ts` 하나가 든다 — 잘림은 값으로, pull은 그 위에서 던진다

`GitClient.getTree`는 `truncated`면 **던진다** (부분 트리로 blob SHA 비교를 하면 전부 틀어진다).
온보딩은 같은 상황에서 "이 리포는 파일이 너무 많아 자동 탐지를 할 수 없어요"라고 말해야 한다.

**두 호출자가 원하는 것이 다르지만 App 자격증명 자리는 하나여야 한다** (2026-09-07 결정 — 전 안은
`lib/onboarding/snapshot.ts`가 자기 트리 읽기를 갖는 것이었는데, 그러면 개인키를 만지는 파일이 둘이 되고
`credential-separation.test.ts`가 `lib/github-connect/`·`lib/github.ts` 두 경로만 하드코딩이라 자동으로
안 덮인다). 그래서:

- `lib/github.ts`에 **값을 돌려주는** 읽기를 둔다 — `readRepoSnapshot(owner, repo, installationId, baseBranch)`
  → `{ status: "ok", headSha, headCommittedAt, paths } | { status: "truncated" } | { status: "base-branch-missing" } | { status: "unavailable" }`
  와 `readBlob(installationId, owner, repo, sha)`. `createApp()`은 `probeRepo`와 같이 **try 밖** — 환경변수
  누락은 값으로 접지 않고 던진다.
- `lib/pull/client.ts`의 계약은 그대로다 — `GitClient.getTree` 구현이 `readRepoSnapshot`을 감싸
  `truncated`면 던진다. 그쪽에서 잘린 트리는 진단이 아니라 **중단 사유**다.
- **`lib/onboarding/`은 순수 판정과 DB 껍데기(`ingest.ts`)만 갖고 GitHub을 모른다** — `lib/github.ts`도
  `lib/github-connect/user.ts`·`token-store.ts`도 import하지 않는다. 두 토큰이 만나는 자리는 **Server Action
  하나**다. `credential-separation.test.ts`에 `lib/onboarding` 루트를 그 규칙으로 **추가한다** (tasks T5).

⚠️ **base 브랜치 ref가 `null`이면 "브랜치 없음"으로 읽지 않는다** — `getRefSha`의 `null`은 권한
없음일 수도 있다(`client.ts` 주석, POSTMORTEM 2026-09-03). `base-branch-missing`은 `probeRepo`가 200을
준 뒤의 404에만 쓴다.

### 3.11 생성과 첫 적재는 **Action 둘**이다

`createProject`가 생성+첫 적재를 한 Action으로 하면, 첫 적재가 60초를 넘길 때 **행은 커밋됐는데 응답이
사라져 토큰 원문을 아무도 못 본다** (2026-09-07 검토 🔴). 그래서:

| Action | 무엇을 | 걸리는 시간 |
|---|---|---|
| `createProject(input)` | 재검증(§3.4) → `planProjectCreate` → `Project` + `ProjectMember(OWNER)` + `pushTokenHash`를 **한 트랜잭션** → **토큰 원문 반환** | 수백 ms + 재검증 blob 몇 개 |
| `runFirstIngest({ slug })` | `awaiting_first_sync` 확인 → 스냅샷 → 첫 적재(§4) → 결과(키 수·`read.errors`·`duplicateKeys`) | 로케일 파일 수에 비례 |

클라이언트는 `createProject` 응답을 받는 즉시 ⑤(토큰·YAML)를 그리고 **이어서** `runFirstIngest`를 부른다.
설정 화면의 [다시 시도]가 **같은 Action**이다 — `retryFirstIngest`는 따로 없다. 실패 사유는 그 호출의
인라인으로만 돌아온다(§3.7). permission은 `project:settings`.

**slug 경합**: `planProjectCreate`의 `slugTaken` 선조회를 둘이 동시에 지나면 트랜잭션 안 `create`가 P2002를
던진다 — `slug-taken`으로 접는다(callback의 `linkAccount`·`membership`의 `already-member`와 같은 형태).
`planSlug`의 예약어에 **`new`** 가 있다 (`/projects/new`와 충돌).

### 3.12 실패 갈래 — `OnboardError` 목록

`connectErrorMessage`(12갈래)와 같은 형으로 **열거한다** — 갈래 → 한국어 한 줄, `never` 검사.

| 갈래 | 어디서 | 문구의 요지 |
|---|---|---|
| `no-installations` | ①' | "App을 설치한 GitHub 계정이 없어요" + 설치 링크 (`GITHUB_APP_SLUG` 없으면 링크 대신 "관리자에게 설치를 요청") |
| `no-repos` | ①' | "이 설치에 선택된 리포가 없어요 — GitHub 설치 설정에서 리포를 추가해 주세요" + 링크 |
| `no-candidates` | ③ | "로케일 파일을 찾지 못했어요 — 언어가 2개 이상인 로케일 파일이 필요해요" (수동 지정 펼침) |
| `tree-truncated` | ③ | "파일이 너무 많아 자동 탐지를 할 수 없어요" |
| `base-branch-missing` | ③ | "기본 브랜치를 읽을 수 없어요" |
| `key-count-failed` | ③ 후보 단위 | "키 수 확인 실패" (탈락 아님) |
| `manual-no-match` | ③ 수동 | "그 경로에서 이 형식의 파일을 찾지 못했어요" |
| `installation-forbidden` · `repo-forbidden` · `repo-not-installed` | ④ | `planRepoConnect` 그대로 (`connectErrorMessage` 재사용) |
| `slug-taken` · `limit-reached` · `invalid-slug` | ④ | "이미 쓰는 주소" / "프로젝트는 3개까지" / 형식 |
| `not-awaiting` | 다시 시도 | "이미 적재가 끝났어요" |
| `ingest-failed` | ⑥ | "첫 적재에 실패했어요 — 설정에서 다시 시도할 수 있어요" (+ `read.errors` 상위 몇 건) |
| `unavailable` | 전부 | "GitHub이 응답하지 않아요 — 잠시 뒤 다시" (**거부 갈래로 접지 않는다** — POSTMORTEM 2026-09-03) |
| `unauthorized` | 전부 | 세션 만료 — 재로그인 후 처음부터 (§3.4 무저장의 귀결. "입력한 값은 그대로 있어요" 류 문구를 여기서 쓰면 거짓) |

**불변식 9의 표시 위치**: ⑥ 결과의 헤드라인이 `read.errors + duplicateKeys === 0`이면 "N개 키를
적재했어요", 아니면 "N개를 적재했지만 M건을 읽지 못했어요" — `pullMessage`의 "다만 N건은 반영되지 못했어요"
형이다. 0건이 아니면 성공 문구를 그대로 쓰지 않는다.

### 3.13 토큰 원문의 UI — 초대 링크 전례보다 약하면 안 된다

`components/invite-form.tsx:72-88`이 선례다(경고 캡션 "이 화면을 벗어나면 다시 볼 수 없어요" + mono 칩 +
복사). 둘을 더한다: **복사 버튼 라벨 교체 "복사됨"**(토큰은 잃으면 CI가 죽으므로 확인이 필요) · 캡션에
"잃어버리면 설정에서 재발급할 수 있어요". `beforeunload`는 넣지 않는다(리포에 전례 없음).

설정 화면의 재발급 섹션: confirm 다이얼로그 전례가 없으니 만들지 않고, 버튼 **위에** 상시 캡션
"재발급하면 기존 토큰은 즉시 무효가 되고 리포의 `PUSH_TOKEN`을 바꿔야 CI가 돌아요". 결과는 invite-form 형 인라인.

## 4. 서버측 첫 적재 — 기존 경로를 그대로 지난다

```
readRepoSnapshot(owner, repo, installationId, baseBranch)         (lib/github.ts)
   → { headSha, headCommittedAt, paths }
     ↓
ingestTargets(format, adapter.layout, paths)                       ← 순수: 내려받을 로케일 파일 경로 전부
     ↓
readBlob × M                                                       ← 2단계 예산 — 로케일 파일 수만큼
     ↓
assemblePushInput({ paths, probe, format, baseLocale })            ← lib/push/assemble.ts — push-local과 **같은 함수**
   = selectLocaleFiles → adapter.read → { read, baseLocale }
     ↓
buildPushPayload({ projectSlug, commitSha, commitAt, format, read, baseLocale, scanRefs: [] })
     ↓
applyPush(prisma, projectId, payload)
```

⚠️ **`buildPushPayload`를 우회하지 않는다.** 그 함수가 페이로드의 **유일한 생산자**이고, 리터럴로
조립했다가 필수 필드 둘이 늘어도 컴파일러가 침묵한 전례가 있다 (POSTMORTEM 2026-08-31).

⚠️ **`selectLocaleFiles`를 새로 짜지 않는다.** 껍데기가 파일을 안 골라 어댑터가 "존재하지 않았던"
전례가 있다 (POSTMORTEM 2026-09-02). `selectLocaleFiles(layout, format, paths, probe)`(`lib/push/payload.ts:35`)는
동기 probe가 필수라 **로케일 파일을 먼저 전부 내려받는다** — §3.1의 21개와 별개의 예산이고, 그 경로 목록을
내는 `ingestTargets`가 순수 함수다. 50로케일 리포면 blob 50개다 — 그래서 `runFirstIngest`가 별도 Action이다 (§3.11).

**조립을 `lib/push/assemble.ts`로 뽑아 CLI와 공유한다** (2026-09-07 결정). 지금 `scripts/push-local.ts:76-110`에
인라인인 select→read→base 판정을 순수 함수로 옮기고 push-local·`ingest.ts` 둘이 부른다. "서버 첫 적재 = CLI
push와 같은 DB 상태"가 §4의 실제 정확성 주장인데, 함수를 공유하면 등가가 구조로 보장되고 테스트 하나로
확인된다 — 같은 인메모리 트리를 fs probe와 `makeProbe(map)`로 각각 먹여 `commitSha·commitAt·refs`를 제외한
페이로드가 deep-equal.

⚠️ **`commitAt`은 base head 커밋의 시각이다.** `new Date()`를 쓰면 그 시각이 커밋보다 미래라
**CI의 첫 push가 `stale-commit` 409로 거부된다** — 같은 커밋의 재전송은 통과해야 하고
(`checkCommitOrder`가 동일 시각을 통과시킨다, `guard.ts:35`) 그러려면 저장된 값이 커밋 시각이어야 한다.
그래서 스냅샷이 `headCommittedAt`을 함께 읽는다 — **`GET /git/commits/{sha}` 1회가 더 든다** (ref·tree에 없는 필드).

⚠️ **`Project.baseBranch`는 `ProbeResult.defaultBranch`로 채운다** (`schema.prisma:25` default `"main"`,
pull이 그대로 읽는다 — `load.ts:24`). 안 채우면 default branch가 `develop`인 리포의 pull이 `main`을 찾는다.

⚠️ **`refs`는 빈 배열이다.** 서버가 리포를 체크아웃하지 않으므로 ts-morph를 돌릴 수 없다.
`applyPush`가 refs를 전체 교체하므로 빈 배열은 "참조 없음"으로 저장되고, CI가 처음 push하면 채워진다.
화면이 그 사실을 한 줄로 알린다 — 조용히 비어 있으면 "코드 참조 기능이 고장났다"로 읽힌다.

첫 적재는 `checkCommitOrder`를 지나지 않는다 — `lastCommitAt`이 `null`이라 지금은 무해하고, `ready`에서의
재실행은 §3.7이 `not-awaiting`으로 막는다.

## 5. 순수 함수로 분리 가능한 부분 — `/tdd` 대상

| 모듈 | 함수 | 무엇을 판정하나 |
|---|---|---|
| `lib/adapters/code-dict.ts` | `codeDictCandidatePaths(paths)` (분리·export — 판정 불변) | 경로 → code-dict 후보 그룹 `{ pathTemplate, locales }` (순위순 — T1에서 `{ dir, ext }`를 템플릿으로 합쳤다. `probeTargets`가 `DetectedFormat`과 같은 모양으로 받는다) |
| `lib/onboarding/detect.ts` | `probeTargets(jsonLike, codeDict, limits)` | 후보 → 내려받을 경로 (`sampleOrder`와 같은 파일, 상한) |
| | `makeProbe(map)` | `Map<path, content>` → `FileProbe` |
| | `summarizeCandidates(candidates, reads)` | 후보 + read 결과 → **사용자 언어 요약**(형식 이름·경로·언어 목록·기준 언어 기본값(`pickBaseLocale`)·키 수) |
| | `formatLabel(adapter)` | 어댑터 이름 → 화면 문구 + 경로 예시 (§3.3 표) |
| | `ingestTargets(format, layout, paths)` | 첫 적재가 내려받을 로케일 파일 경로 전부 (§4) |
| `lib/onboarding/confirm.ts` | `templatePaths(adapter, pathTemplate, paths)` · `planConfirmedFormat(input, detected)` | 템플릿 → 재검증할 파일 경로 / `detectFormatWith` 결과 ↔ 입력 대조 (§3.4). 어긋나면 거부 |
| `lib/onboarding/slug.ts` | `normalizeProjectSlug(repoName)` · `planSlug(slug)` | 리포명 → slug 후보 / 형식(`REF_SAFE_SLUG`)·예약어(`new`)·길이 |
| `lib/onboarding/create-plan.ts` | `planProjectCreate({ repoConnect, ownerCount, slugTaken, limit })` | 생성 가부 한 자리 — 3중 검증 결과(`unavailable`은 그대로 통과) + OWNER 개수 제한 + slug 충돌 |
| `lib/onboarding/readiness.ts` | `planProjectReadiness(project)` | `setup` / `awaiting_first_sync` / `ready` (§3.7) |
| `lib/onboarding/message.ts` | `OnboardError` · `isOnboardError` · `onboardErrorMessage` · `ingestHeadline(count, failed)` | 갈래 → 한국어 한 줄 (§3.12) / 불변식 9 헤드라인 |
| `lib/onboarding/workflow.ts` | `renderWorkflowYaml({ slug, baseBranch, adapter?, baseLocale? })` | 복사용 YAML 문자열 (§7). `baseBranch`는 T1 구현이 더했다 — `on.push.branches`를 `main`으로 고정하면 base가 `develop`인 리포에서 CI가 영영 안 돈다. 값은 `Project.baseBranch`(= `ProbeResult.defaultBranch`, §4) |
| `lib/push/token.ts` | `generatePushToken()` · `hashPushToken(raw)` | 난수 발급 + sha256 (초대 토큰과 같은 규칙) |
| `lib/push/assemble.ts` | `assemblePushInput({ paths, probe, format, baseLocale? })` | select→read→base 판정 — push-local과 서버가 공유 (§4) |
| `lib/pull/targets.ts` | `selectPullTargets(projects)` | 순회 대상 필터·정렬 (§3.9) |

**I/O 껍데기**: `lib/github.ts`(`readRepoSnapshot`·`readBlob` — App 토큰), `lib/onboarding/ingest.ts`(스냅샷·blob
→ `assemblePushInput` → `applyPush` — DB만, GitHub을 모른다), Server Action 다섯(§3.11 둘 + `startGithubConnectForUser`·
`listConnectableRepos`·`detectRepoFormats` + `rotatePushToken`), `/api/pull` 순회 루프.

⚠️ **`slug.ts`의 형식 규칙은 `lib/pull/trigger.ts`의 `REF_SAFE_SLUG`(`:26`, 지금 비export)와 같아야 한다.** 그
정규식이 **유일한 방어선**이고 위반은 pull 시점에 `fail()`로 터진다 — 온보딩이 그것을 통과하는
slug만 만들게 해서 실패를 생성 시점으로 당긴다. **정규식을 복사하지 않고 `trigger.ts`에서 export해
공유한다** (갈리면 온보딩이 만든 slug가 pull에서 죽는다). `checkProjectSlug`는 `lib/push/guard.ts`에 이미
있는 이름이라 여기서는 `planSlug`다.

## 6. 스키마 변경 — additive 하나

```prisma
model Project {
  ...
  /// CI가 /api/push를 부를 때 쓰는 토큰의 sha256. **원문은 저장하지 않는다** (SAAS §7.8 —
  /// ProjectInvitation.tokenHash와 같은 모델). null이면 아직 발급 전이고 **어떤 push도
  /// 통과하지 못한다**(fail-closed).
  pushTokenHash String? @unique
}
```

- 마이그레이션: `_add_project_push_token` — **additive**(nullable 컬럼 + unique 인덱스). 배포 2단계가
  필요 없다. Postgres의 unique는 NULL 여럿을 허용하므로 **기존 5행(전부 null)에 무해하다.**
- `pnpm db:migrate`(dev)는 `/push` 전, `pnpm db:deploy`(prod)는 `/merge` 전 (CLAUDE.md). `--create-only`로
  SQL을 눈으로 본 뒤 적용한다 (`/db`).
- ⚠️ **기존 프로젝트 넷은 `null`이다.** 프로덕션 배포 순간 그 리포들의 CI가 401이 되므로, **토큰 발급
  화면(설정)과 대상 리포 secret 교체가 같은 세션에 끝나야 한다** (tasks T8). **T3 이후 첫 `/merge`는 T7까지
  끝난 뒤 한 번이다** — 그 사이에 머지하면 발급 수단이 SQL뿐이다.

`ProbeResult`(`lib/github-connect/health.ts:16`)의 `ok` 갈래에 `defaultBranch`가 하나 는다 (§4가 base
브랜치를 알아야 한다). `probeRepo`가 이미 `GET /repos`를 부르므로 호출은 늘지 않고, `planConnectionHealth`는
그 필드를 보지 않는다. ⚠️ 필수 필드라 **리터럴 14곳**(`connect-plan.test.ts`·`health.test.ts`·
`github-connect.test.ts`)이 typecheck에 걸린다 — 판정은 불변, 리터럴만 갱신.

## 7. 워크플로 — 복사용 YAML (2026-09-07 결정)

**App 권한을 늘리지 않는다.** 근거는 둘이다 — **신뢰 비용**(설치 화면의 "워크플로 파일을 수정합니다"가
비개발자에게 가장 무거운 문장이다)과 **`workflows: write`의 면적**(리포의 CI 정의를 통째로 바꿀 수 있는
권한을 로케일 파일 하나 쓰려고 든다). ⚠️ "권한을 더하면 재승인 대기 중 기존 설치의 pull이 죽는다"는
**미실측**이라 근거로 쓰지 않는다 — GitHub은 소유자 승인 전까지 옛 권한으로 계속 동작하는 것으로 알려져 있다.
정본(SAAS §10)에 올릴 때 이 표기를 유지한다.

결과 화면이 내는 것 셋:

1. `.github/workflows/l10n.yml` 전문 — `project: <slug>`와 **`branches: [<Project.baseBranch>]`**가 박혀 있고, 수동 지정한 경우
   `adapter:`·`base-locale:`도 함께 박힌다 (docs/ACTIONS.md의 input 표 그대로 — `__tests__/workflow.test.ts`가 그 예시와
   주석·빈 줄을 뺀 채 줄 단위로 대조한다). `wrapper`는 넣지 않는다 —
   "훅 기반 리포면 `docs/ACTIONS.md`의 `wrapper`를 보라" 한 줄.
2. **push 토큰 원문** — 한 번만 보인다. "리포 Settings → Secrets → `PUSH_TOKEN`" 안내와 함께 (§3.13).
3. "이걸 안 붙여도 지금 적재된 것은 편집할 수 있어요" — §7.4의 요지가 그것이다. 워크플로는
   **계속 자동으로 받기 위한 것**이지 편집의 전제가 아니다.

SAAS §10의 "Workflows 권한을 요구할 것인가"가 여기서 닫힌다 — **요구하지 않는다.** 2차에 열 조건:
연동 PR을 못 내서 실제로 온보딩이 중단되는 사례가 나올 때.

## 8. POSTMORTEM — 이 기능이 밟을 자리

| 회고 | 이 기능에서 어떻게 나타나나 |
|---|---|
| **2026-09-02 껍데기가 파일을 안 골라 어댑터가 "존재하지 않았다"** | 서버측 첫 적재가 `selectLocaleFiles`를 우회하면 정확히 재발한다 (§4). `probeTargets`가 `sampleOrder`와 다른 파일을 받으면 같은 형태 (§3.1) |
| **2026-08-31 외부 계약 페이로드를 리터럴로 조립** | 첫 적재가 `buildPushPayload`를 우회하면 같은 형태 (§4) |
| **2026-09-02 순위 픽스가 자기 단위 테스트만 통과하고 실제 경로에서 죽어 있었다** | 2패스 탐지를 어댑터 API로만 테스트하면 같은 형태 — `detectCandidatesAcross`(진입점)에 실물 트리(bugshot-2·code-dict 리포 하나)로 돌려 본다 (tasks T5) |
| **2026-09-05 검증은 했는데 검증한 값을 저장하지 않았다** | `planConfirmedFormat`의 반환값(= `detectFormatWith` 결과)을 저장에 쓰지 않고 클라이언트 입력을 저장하면 검증이 장식이 된다 (§3.4). grep: 판정 함수의 반환값이 **묶여서** 쓰이는가 |
| **2026-09-06 실패 사유를 쿼리로 넘기고 읽는 쪽을 안 만들었다** | `/projects/new`가 `?e=`를 받으면 `isConnectError`·`isOnboardError` **둘로 읽는 쪽을 같은 커밋에** 만든다 (§3.6) |
| **2026-09-03 실패한 조회를 "없음"으로 읽었다** | 탐지 실패(`no-candidates`)와 GitHub 장애(`unavailable`)를 가른다. `getRefSha`의 `null`은 **"권한 없음"일 수도 있다** — base 브랜치가 `null`이면 "브랜치 없음"이 아니라 즉시 실패다 (§3.10). `planProjectCreate`도 `unavailable`을 거부로 접지 않는다 |
| **2026-08-31 레이아웃 인증 검사가 데이터 노출을 못 막았다** | `/projects/new`는 최상단에서 `requireUser`를 던진다. 조건부 렌더 금지 (`entry-points.test.ts`가 센다) |
| **2026-09-05 라우트를 옮겼는데 링크 생성기가 옛 경로를 들고 있었다** | 결과 화면 → 번역 화면 링크가 `/projects/${slug}/translations`를 조립한다. ⚠️ `entry-points.test.ts`의 링크 검사(`:161`)는 **단일 세그먼트만** 잡아 `/projects/new`도 템플릿 리터럴도 못 본다 — 정규식을 다중 세그먼트 정적 경로로 넓힌다 (tasks T6). 템플릿 리터럴은 여전히 `[manual]` |
| **2026-09-05 테스트 가짜가 실제 제약보다 관대했다** | `harness.ts`에 `project.create`가 **없다**(`findUnique(slug\|id)`·`update`만). `create`(slug·pushTokenHash P2002)·`findUnique({pushTokenHash})`·`findMany`·`projectMember.count({userId, role})`를 새로 만들어야 slug 충돌 경로를 **재현할 수조차 있다** (tasks T2) |
| **2026-09-06 인가는 지났는데 조회를 그 사용자로 좁히지 않았다** | `listConnectableRepos`·`projectMember.count`가 `userId`로 좁힌다 |

## 9. 불변식 영향

| 불변식 | 영향 | 어떻게 지키나 |
|---|---|---|
| **1. 값은 DB, 키·로케일 존재는 리포** | 없음 | 첫 적재도 `applyPush`(strict, `ON CONFLICT DO UPDATE`)를 지난다 |
| **2. 병합 없음** | 없음 | 새 프로젝트라 기존 값이 없다. `ready` 뒤의 재적재는 `not-awaiting`으로 막는다 (§3.7) |
| **3. 삭제하지 않는다** | 없음 | |
| **4. export 결정성** | 없음 | write 경로를 건드리지 않는다 |
| **5. 모든 쿼리를 `projectId`로 좁힌다** | ⚠️ 있다 | 순회 pull이 프로젝트 목록을 훑는다 — 그 조회만 전역이고(그것이 목적이다), 그 뒤 `triggerPull`은 slug 하나로 좁힌다. 생성 경로의 `projectMember.count`는 `userId` + `role: OWNER`로 좁힌다. `Project.findUnique({pushTokenHash})`는 전역 조회가 **의도**다 — 토큰이 프로젝트를 정한다 |
| **6. 세 자격증명을 섞지 않는다** | ⚠️ 있다 | 리포 목록·설치 목록 = **사용자 토큰**(`lib/github-connect/user.ts`), 트리·blob 읽기 = **installation 토큰**(`lib/github.ts`). `lib/onboarding/`은 둘 다 모른다 — `credential-separation.test.ts`에 그 루트를 connect 쪽 규칙 + `lib/github.ts` import 금지로 **추가**한다 (tasks T5) |
| **7. `ProjectMember`가 권한을 정한다** | 없음 | 생성자는 같은 트랜잭션에서 OWNER가 된다 |
| **8. `ready`는 최초 적재 성공** | **이 단계가 세운다** | §3.7 |
| **9. 버린 값을 성공으로 숨기지 않는다** | ⚠️ 있다 | 첫 적재의 `read.errors`·`duplicateKeys`를 ⑥ 헤드라인에 띄운다 — `ingestHeadline` (§3.12). 0건이 아니면 성공 문구를 그대로 쓰지 않는다 |

## 10. 환경변수

**새로 생기는 것은 없다.** `GITHUB_APP_SLUG`(설치 링크)는 이미 있고 `optionalEnv`다.

**사라지는 것이 둘이다.**

- `ACTIVE_PROJECT_SLUG` — `.env.example`·Vercel 세 스코프·`scripts/push-local.ts:68`·`scripts/smoke-github.ts:36`의
  `?? requireEnv(...)` 폴백·`/l10n-roundtrip` 스킬 문서에서 함께 빠진다. 두 스크립트는 **인자를 필수로**
  바꾼다(없으면 usage + exit 2). 코드 3곳도 있다 — `.github/actions/l10n-push/action.yml:20`(input 설명)·
  `lib/push/plan.ts:63`·`prisma/schema.prisma:14`(주석).
- **서버의 `PUSH_TOKEN`** — `/api/push`가 더 읽지 않는다. Vercel 세 스코프에서 지운다. `.env.example`의
  `PUSH_TOKEN`은 남되 의미가 바뀐다: "`push:local`이 보낼 **그 프로젝트의** 토큰 원문 — 설정 화면에서
  발급한 값, 로컬 전용". dev DB의 프로젝트 넷은 로컬 `pnpm dev`의 설정 화면에서 발급해 사람이 `.env.local`에
  넣는다(에이전트가 편집하지 않는다). CLAUDE.md 재발급 절차의 "세 곳이 같은 값을 들어야 하는 것은
  `PUSH_TOKEN` 하나"는 거짓이 된다 — "대상 리포 Actions secret과 그 프로젝트의 `pushTokenHash`" 둘로 고친다.

## 11. 대안과 버린 이유

- **연동 PR로 워크플로를 넣는다** → §7. 신뢰 비용과 권한 면적. (재승인 중 pull 중단은 미실측이라 근거 아님.)
- **탐지 결과를 세션·DB에 임시 저장하고 확정 시 그대로 쓴다** → §3.4. 클라이언트 입력이 설정이
  되는 표면이 생긴다. 재검증 비용이 그것보다 싸다.
- **확정 대조를 "재탐지 후보 목록에 있는가"로** → §3.1·§3.4. 후보가 "내려받은 상위 N개 중 생존자"라
  순위가 비단조고, 사용자가 본 후보가 확정에서 거부될 수 있다. 템플릿 파일을 읽어 `detectFormatWith`로
  재검증하면 수동 지정과 한 경로가 되고 예산 의존이 사라진다.
- **`lib/onboarding/snapshot.ts`가 자기 트리 읽기를 갖는다** → §3.10. App 개인키를 만지는 파일이 둘이 되고
  자격증명 분리 테스트가 자동으로 안 덮는다.
- **생성과 첫 적재를 한 Action으로** → §3.11. 타임아웃이 토큰 원문을 삼킨다.
- **`Project` 행을 먼저 만들고 단계마다 채운다** → 실패한 온보딩이 좀비 프로젝트를 남기고,
  `/projects` 목록이 "들어갈 수 없는 프로젝트"로 채워진다. 확정 시점에 한 트랜잭션으로 만든다.
  (`awaiting_first_sync`가 그 좁은 형태로 남는 것은 spec §5의 빚이다.)
- **push 토큰을 프로젝트별 env로** → 프로젝트 수만큼 Vercel 변수가 늘고 생성이 배포를 요구한다.
- **`/api/push`가 payload의 slug로 프로젝트를 찾고 그 프로젝트의 토큰과 비교** → 오배송된
  페이로드가 인증 대상을 고르게 된다 (§3.8). SAAS §7.8이 이 방향으로 쓰여 있어 T8이 고친다.
- **`Adapter.probePaths?(paths)`를 계약에 추가** → §3.1 2b. 일관적이지만 `types.ts`·`contract.ts` 매트릭스가
  늘고 5개 어댑터를 손댄다. code-dict 하나만 필요하므로 그 파일의 함수 분리·export로 충분하다.
- **순수 모듈 11개를 6개로 접는다** → 유지 (2026-09-07 결정). 파일 하나에 판정 하나 — `lib/auth/` 스타일과 같다.
