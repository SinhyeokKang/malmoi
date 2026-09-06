# project-onboarding — 설계

> 착수 전 읽은 것: SAAS §5.4·§5.7·§7.1~§7.9·§8 5단계 · ARCHITECTURE §1·§2·§3·§4·§6.1 ·
> ADAPTER-COVERAGE §0 3차 · POSTMORTEM 7건(§8에 인용) · `features/github-connect/design.md`.

## 1. 영향 받는 흐름 — 셋 다다

| 흐름 | 무엇이 바뀌나 |
|---|---|
| **push** | 인증 근거가 `PUSH_TOKEN`(서버 env 하나) → `Project.pushTokenHash`(프로젝트별)로 바뀐다. 오배송 판정의 기준도 "서버가 아는 프로젝트"에서 **"이 토큰의 프로젝트"** 로 바뀐다 (SAAS §7.8) |
| **pull** | `/api/pull`이 slug 하나가 아니라 **준비된 전 프로젝트를 순회**한다. `triggerPull` 자체는 그대로다 |
| **편집 UI** | `/projects/new`가 생기고, `/projects` 목록이 상태를 보이며, 번역 화면이 `ready`가 아닌 프로젝트를 막는다 |

**새로 생기는 흐름이 하나 있다 — 서버측 첫 적재.** CI 없이 GitHub App 토큰으로 base 트리를 읽어
`applyPush`까지 간다 (§4). 지금까지 적재는 항상 리포를 체크아웃한 CLI가 했다.

## 2. 화면 흐름

```
/projects  ──[새 프로젝트]──▶  /projects/new
                                  │
                    ① GitHub 계정이 연결돼 있나  ──아니오──▶ [GitHub 연결] (왕복 후 /projects/new로 복귀)
                                  │ 예
                    ② 내 설치의 리포 목록에서 하나 고르기
                                  │
                    ③ 탐지 결과 — 후보 N개 + 기준 로케일 (+ 수동 지정)
                                  │ 확정
                    ④ 이름·주소(slug) 확인  ──▶ 생성 + 첫 적재
                                  │
                    ⑤ 결과 — push 토큰 원문 + 워크플로 YAML (한 번만)
                                  │
                                  ▼
                    /projects/<slug>/translations
```

**②~④가 한 라우트다.** 단계를 URL로 쪼개지 않는다 — 중간 상태를 서버에 저장하지 않으므로(§3.4)
새로고침하면 처음부터인데, 라우트를 쪼개면 그것이 "깨진 것"으로 보인다.

## 3. 설계 결정

### 3.1 탐지는 **두 번 돈다** — probe가 동기 함수이기 때문이다

`FileProbe = (path: string) => string | undefined`는 **동기**다. CLI는 `readFileSync`라 문제가
없지만 서버는 GitHub API라 그럴 수 없다. 그래서:

```
1) getTree(baseHeadSha)          → 경로 전부 (blob sha 포함)
2) detectCandidatesAcross(paths) → probe 없이 후보 목록 (넉넉한 상위집합)
3) probeTargets(candidates)      → 내려받을 blob 경로 (순수 함수, 상한 있음)
4) getBlobText × N               → Map<path, content>
5) detectCandidatesAcross(paths, makeProbe(map)) → 최종 후보 순위
```

**2)의 후보가 5)의 상위집합인 것이 이 설계의 근거다** — probe는 후보를 **떨어뜨리는** 데만 쓰이므로
(카탈로그 모양이 아니면 탈락) probe 없는 통과 집합이 항상 더 크다. 그래서 3)이 고를 대상을 2)에서
얻을 수 있다.

⚠️ **`detectFormat`을 서버에서 probe 없이 부르지 않는다.** probe 없는 1순위는 검색 인덱스 같은
무관한 JSON 묶음일 수 있고(bugshot-web 실측), 그 상태로 확정하면 온보딩이 잘못된 표면을 붙인다.
2)의 결과는 **후보를 고르기 위한 중간값이지 사용자에게 보여주는 값이 아니다.**

**상한**: 후보 상위 5개 × 후보당 최대 3파일 = blob 15개. `getTree`는 재귀 1회이므로 온보딩
한 번의 GitHub 호출은 `ref 1 + tree 1 + blob ≤15 + 후보 base 파일 읽기`다. 상한을 두는 이유는
비용이 아니라 **응답 시간**이다 — Vercel 함수가 60초다.

### 3.2 키 수를 보여주려면 base 파일을 실제로 읽어야 한다

완료 조건 ②("작은 후보가 큰 표면을 조용히 가리지 않는다")의 유일한 재료가 키 수다. 경로와 로케일
수만으로는 `_locales`(4키)와 `ts-dict`(903키)를 사람이 구별할 수 없다. 그래서 3.1의 4)에서 받은
blob으로 **후보마다 `adapter.read`를 돌려 base 로케일의 키 수를 낸다.**

읽기 실패는 후보를 떨어뜨리지 않고 "키 수 확인 실패"로 표시한다 — 남의 리포를 우리 파서 규칙으로
탈락시키지 않는다 (ARCHITECTURE §4의 연장).

### 3.3 사용자에게 어댑터 이름을 보이지 않는다 (SAAS §3)

| 내부 | 화면 |
|---|---|
| `chrome-locales` | 크롬 확장 메시지 |
| `json-catalog` | JSON 카탈로그 |
| `yaml-catalog` | YAML 카탈로그 |
| `code-dict` | 코드 딕셔너리 |
| `ts-dict` | 코드 딕셔너리 (여러 언어가 한 파일) |

`pathTemplate`·`layout`·`writeStrategy`·`nestedByPath`는 화면에 없다. **단 경로는 보인다** —
`src/locales/{locale}.json`은 사용자가 자기 리포에서 확인할 수 있는 유일한 단서라서 숨기면 후보를
고를 근거가 사라진다. `{locale}` 자리는 그대로 두되 "언어 자리"라고 한 줄 붙인다.

### 3.4 중간 상태를 서버에 저장하지 않는다

탐지 결과를 `Project` 행에 미리 쓰지 않는다. 확정 시점에 **클라이언트가 고른 값을 다시 보내고 서버가
탐지를 다시 돌려 대조한다.**

⚠️ **클라이언트가 보낸 `adapterName`·`pathTemplate`을 그대로 저장하면 안 된다** — 그것은 SAAS §5.4가
`installationId`에 대해 막은 것과 같은 형태다. 임의의 `pathTemplate`을 저장할 수 있으면 pull이 그
리포의 아무 파일이나 덮어쓰는 커밋을 만든다. 대조 규칙:

- `adapterName`은 `isAdapterName`을 지난다.
- `pathTemplate`은 **재탐지한 후보 목록에 있어야 한다.** 예외는 수동 지정(§3.5).
- `baseLocale`은 그 후보의 `locales`에 있어야 한다.

재탐지 비용(트리 1 + blob ≤15)은 확정 클릭 한 번당 한 번이고, 그 대가로 "브라우저가 보낸 값이
설정이 된다"는 표면이 사라진다.

### 3.5 수동 지정 — `ts-dict`의 유일한 경로

후보 목록 아래에 "찾는 파일이 없나요?"를 두고 어댑터 선택 + 경로 템플릿 입력을 받는다. 이때는
§3.4의 "후보 목록에 있어야 한다"를 적용할 수 없으므로 **`detectFormatWith(name, paths, probe)`가
그 리포에서 실제로 매치하는지**로 대신 검증한다. 매치하지 않으면 거부다 — 사용자가 친 경로를
그대로 저장하지 않는다.

### 3.6 GitHub 계정 연결이 **프로젝트 없이** 성립해야 한다

지금 `startGithubConnect(slug)`는 `getProjectAccess(slug, "project:settings")`를 지난다. 생성
경로에는 프로젝트가 없으므로 그대로는 못 쓴다.

**서명 payload에 착지 지점을 넣는다** (`lib/github-connect/state.ts`). 지금 `slug`가 그 역할을
겸하고 있는데 갈래가 둘이 되므로 명시적으로 가른다:

```ts
type StateDest = { kind: "settings"; slug: string } | { kind: "new" };
```

⚠️ **착지 지점은 계속 서명 안에 있어야 한다** — 쿼리로 실으면 공격자가 정할 수 있고, 그러면
open redirect 판정이 필요해진다 (github-connect design §3.1이 없앤 것을 되살리는 셈이다).
payload 모양이 바뀌므로 **진행 중인 연결 왕복은 전부 `state-mismatch`가 된다.** 10분 만료라
배포 직후 10분의 창이고, 그 창의 사용자는 버튼을 다시 누르면 된다.

이 Action의 인가는 `requireUser`뿐이다 — `Account` 행은 사용자 소유이므로 프로젝트 권한을 요구할
근거가 없다. **6단계 백로그의 "GitHub 계정 섹션을 사용자 수준으로"의 절반이 여기서 먼저 온다**
(연결만. 해제는 `project:settings` 뒤에 그대로 남고 6단계가 옮긴다).

### 3.7 `ready` 판정 — 컬럼을 만들지 않는다 (§7.5)

```
setup              installationId == null            (연결 전 — 온보딩이 만들면 이 상태로 안 남는다)
awaiting_first_sync lastCommitSha == null            (행은 있는데 적재가 안 끝났다)
ready               lastCommitSha != null
```

**`lastCommitSha`가 "첫 적재가 성공했다"의 유일한 증거다** — `applyPush`가 그 컬럼을 쓰고, 그 쓰기는
키·번역·refs와 **한 트랜잭션**이다 (`lib/push/apply.ts`). 그래서 부분 성공 상태가 없다.

⚠️ **설정 저장과 `ready`를 가르는 것이 요지다** (불변식 8). 확정한 어댑터·경로·기준 로케일은
`Project` 행 생성과 같은 트랜잭션에서 저장하지만 그것으로 `ready`가 되지는 않는다 — 저장하는 이유는
"다시 시도"가 재탐지 없이 돌 수 있게 하기 위해서다.

번역 화면(`/projects/:slug/translations`)이 `ready`가 아니면 온보딩 결과 화면으로 돌려보낸다.

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
순서를 뒤집는다: 토큰이 프로젝트를 정하고, slug는 그 뒤에 대조된다.

⚠️ **fail-closed를 유지한다** — `pushTokenHash`가 `null`인 프로젝트는 어떤 요청도 통과시키지
않는다. `checkBearer`의 `not-configured`(500)와 같은 축이지만, 여기서는 서버 설정이 아니라 그
프로젝트의 상태이므로 **401**이다.

⚠️ **`checkProjectSlug`의 시그니처는 그대로 두고 인자만 바꾼다.** 두 번째 인자가
`ACTIVE_PROJECT_SLUG`에서 `project.slug`가 된다 — 순수 함수라 판정 자체는 변하지 않고, 바뀌는 것은
"무엇과 대조하는가"다 (SAAS §7.8의 경고 그대로).

**과도기 이중 수용을 만들지 않는다** (2026-09-07 결정). 대상 리포 넷이 전부 내 것이라 배포와 같은
세션에 Actions secret을 바꿀 수 있고, 이중 수용은 한 번 넣으면 지워지지 않는 부류다.

### 3.9 `/api/pull` 순회 — 한 프로젝트의 실패가 나머지를 막지 않는다

```ts
for (const slug of targets) {
  try { results.push({ slug, ...await triggerPull(prisma, slug) }); }
  catch (e) { results.push({ slug, status: "failed", ref }); }   // 전문은 서버 로그로
}
```

- **대상**: `installationId != null AND lastCommitSha != null` (= `ready`). 준비 안 된 프로젝트를
  돌리면 `loadPullState`가 던지고 그 실패가 매일 밤 로그를 채운다.
- **순서는 `slug` 오름차순.** 결정적이어야 실패 지점을 재현할 수 있다.
- **1층 스킵이 기본 경로다** — 편집이 없는 프로젝트는 GitHub을 한 번도 부르지 않는다
  (ARCHITECTURE §2). 그래서 프로젝트가 늘어도 야간 실행 시간은 거의 늘지 않는다.
- ⚠️ **`maxDuration = 60`은 그대로 둔다.** 실제로 편집이 쌓인 프로젝트가 여럿이면 넘칠 수 있고,
  그 한계는 **7단계의 `SyncRun`이 답한다**(프로젝트당 실행을 큐로 가른다). 지금은 "몇 개까지
  가능한가"를 세지 않고, 넘치면 나머지가 다음 밤에 도는 것으로 둔다 — `lastPulledAt`은 성공한
  프로젝트에만 쓰이므로 실패·미실행이 편집을 잃지 않는다.

### 3.10 트리가 잘리면 진단으로 만든다 — pull은 그대로 던진다

`GitClient.getTree`는 `truncated`면 **던진다** (부분 트리로 blob SHA 비교를 하면 전부 틀어진다).
온보딩은 같은 상황에서 "이 리포는 파일이 너무 많아 자동 탐지를 할 수 없어요"라고 말해야 한다.

**두 호출자가 원하는 것이 달라서 함수를 가른다.** 온보딩은 `lib/onboarding/snapshot.ts`가
자기 트리 읽기를 갖고 `{ status: "ok" | "truncated" }`를 값으로 돌려준다. `lib/pull/client.ts`의
계약은 손대지 않는다 — 그쪽에서 잘린 트리는 진단이 아니라 **중단 사유**다.

## 4. 서버측 첫 적재 — 기존 경로를 그대로 지난다

```
readRepoSnapshot(owner, repo, installationId, baseBranch)
   → { headSha, headCommittedAt, paths, blobText }
     ↓
selectLocaleFiles(adapter.layout, format, paths, probe)   ← push와 같은 함수
     ↓
adapter.read(format, files)
     ↓
buildPushPayload({ projectSlug, commitSha, commitAt, format, read, baseLocale, scanRefs: [] })
     ↓
applyPush(prisma, projectId, payload)
```

⚠️ **`buildPushPayload`를 우회하지 않는다.** 그 함수가 페이로드의 **유일한 생산자**이고, 리터럴로
조립했다가 필수 필드 둘이 늘어도 컴파일러가 침묵한 전례가 있다 (POSTMORTEM 2026-08-31).

⚠️ **`selectLocaleFiles`를 새로 짜지 않는다.** 껍데기가 파일을 안 골라 어댑터가 "존재하지 않았던"
전례가 있다 (POSTMORTEM 2026-09-02).

⚠️ **`commitAt`은 base head 커밋의 시각이다.** `new Date()`를 쓰면 그 시각이 커밋보다 미래라
**CI의 첫 push가 `stale-commit` 409로 거부된다** — 같은 커밋의 재전송은 통과해야 하고
(`checkCommitOrder`가 동일 시각을 통과시킨다) 그러려면 저장된 값이 커밋 시각이어야 한다.
그래서 스냅샷이 `headCommittedAt`을 함께 읽는다.

⚠️ **`refs`는 빈 배열이다.** 서버가 리포를 체크아웃하지 않으므로 ts-morph를 돌릴 수 없다.
`applyPush`가 refs를 전체 교체하므로 빈 배열은 "참조 없음"으로 저장되고, CI가 처음 push하면 채워진다.
화면이 그 사실을 한 줄로 알린다 — 조용히 비어 있으면 "코드 참조 기능이 고장났다"로 읽힌다.

## 5. 순수 함수로 분리 가능한 부분 — `/tdd` 대상

| 모듈 | 함수 | 무엇을 판정하나 |
|---|---|---|
| `lib/onboarding/detect.ts` | `probeTargets(candidates, limits)` | probe 없는 후보 목록 → 내려받을 경로 (상한 적용) |
| | `makeProbe(map)` | `Map<path, content>` → `FileProbe` |
| | `summarizeCandidates(candidates, reads)` | 후보 + read 결과 → **사용자 언어 요약**(형식 이름·경로·언어 목록·기준 언어 추천·키 수) |
| | `formatLabel(adapter)` | 어댑터 이름 → 화면 문구 (§3.3 표) |
| `lib/onboarding/confirm.ts` | `planConfirmedFormat(input, candidates, paths)` | 사용자가 고른 값 ↔ 재탐지 결과 대조 (§3.4·§3.5). 어긋나면 거부 |
| `lib/onboarding/slug.ts` | `normalizeProjectSlug(repoName)` | 리포명 → slug 후보 |
| | `checkProjectSlug`(이름 충돌 주의 — `planSlug`) | 형식(`REF_SAFE_SLUG`)·예약어·길이 |
| `lib/onboarding/create-plan.ts` | `planProjectCreate({ repoConnect, projectCount, slugTaken, limit })` | 생성 가부 한 자리 — 3중 검증 결과 + 개수 제한 + slug 충돌 |
| `lib/onboarding/readiness.ts` | `planProjectReadiness(project)` | `setup` / `awaiting_first_sync` / `ready` (§3.7) |
| `lib/onboarding/message.ts` | `isOnboardError` · `onboardErrorMessage` | 갈래 → 한국어 한 줄 (`connectErrorMessage`와 같은 형) |
| `lib/onboarding/workflow.ts` | `renderWorkflowYaml({ slug, adapter?, baseLocale? })` | 복사용 YAML 문자열 (§7) |
| `lib/push/token.ts` | `generatePushToken()` · `hashPushToken(raw)` | 난수 발급 + sha256 (초대 토큰과 같은 규칙) |
| `lib/pull/targets.ts` | `selectPullTargets(projects)` | 순회 대상 필터·정렬 (§3.9) |

**I/O 껍데기는 넷뿐이다**: `lib/onboarding/snapshot.ts`(GitHub 읽기),
`lib/onboarding/ingest.ts`(스냅샷 → `applyPush`), Server Action 셋, `/api/pull` 순회 루프.

⚠️ **`slug.ts`의 형식 규칙은 `lib/pull/trigger.ts`의 `REF_SAFE_SLUG`와 같아야 한다.** 지금 그
정규식이 **유일한 방어선**이고 위반은 pull 시점에 `fail()`로 터진다 — 온보딩이 그것을 통과하는
slug만 만들게 해서 실패를 생성 시점으로 당긴다. **정규식을 복사하지 않고 `trigger.ts`에서 export해
공유한다** (갈리면 온보딩이 만든 slug가 pull에서 죽는다).

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

- 마이그레이션: `_add_project_push_token` — **additive**(nullable 컬럼 + unique 인덱스).
  배포 2단계가 필요 없다.
- `pnpm db:migrate`(dev)는 `/push` 전, `pnpm db:deploy`(prod)는 `/merge` 전 (CLAUDE.md).
- ⚠️ **기존 프로젝트 넷은 `null`이다.** 배포 순간 그 리포들의 CI가 401이 되므로, **토큰 발급
  화면(설정)과 대상 리포 secret 교체가 같은 세션에 끝나야 한다** (tasks T8).

`ProbeResult`에 `defaultBranch`가 하나 는다 (§4가 base 브랜치를 알아야 한다). `probeRepo`가 이미
`GET /repos`를 부르므로 호출은 늘지 않고, `planConnectionHealth`는 그 필드를 보지 않는다.

## 7. 워크플로 — 복사용 YAML (2026-09-07 결정)

**App 권한을 늘리지 않는다.** Workflows write를 더하면 GitHub이 **기존 설치 전부에 재승인을
요구**하고, 승인 전까지 설치가 일시중지된다 — 폐기용 리포 셋의 pull이 그 사이 죽고, 증상은
"App이 제거됐어요"로 보인다(`planConnectionHealth`가 403을 `not-installed`로 접는다). 신뢰
비용도 가장 크다: 설치 화면의 "워크플로 파일을 수정합니다"가 비개발자에게는 가장 무거운 문장이다.

결과 화면이 내는 것 셋:

1. `.github/workflows/l10n.yml` 전문 — `project: <slug>`가 박혀 있고, 수동 지정한 경우
   `adapter:`·`base-locale:`도 함께 박힌다 (docs/ACTIONS.md의 input 표 그대로).
2. **push 토큰 원문** — 한 번만 보인다. "리포 Settings → Secrets → `PUSH_TOKEN`" 안내와 함께.
3. "이걸 안 붙여도 지금 적재된 것은 편집할 수 있어요" — §7.4의 요지가 그것이다. 워크플로는
   **계속 자동으로 받기 위한 것**이지 편집의 전제가 아니다.

SAAS §10의 "Workflows 권한을 요구할 것인가"가 여기서 닫힌다 — **요구하지 않는다.** 2차에 열 조건:
연동 PR을 못 내서 실제로 온보딩이 중단되는 사례가 나올 때.

## 8. POSTMORTEM — 이 기능이 밟을 자리

| 회고 | 이 기능에서 어떻게 나타나나 |
|---|---|
| **2026-09-02 껍데기가 파일을 안 골라 어댑터가 "존재하지 않았다"** | 서버측 첫 적재가 `selectLocaleFiles`를 우회하면 정확히 재발한다 (§4) |
| **2026-08-31 외부 계약 페이로드를 리터럴로 조립** | 첫 적재가 `buildPushPayload`를 우회하면 같은 형태 (§4) |
| **2026-09-05 검증은 했는데 검증한 값을 저장하지 않았다** | `planConfirmedFormat`의 반환값을 저장에 쓰지 않고 클라이언트 입력을 저장하면 검증이 장식이 된다 (§3.4). grep: 판정 함수의 반환값이 **묶여서** 쓰이는가 |
| **2026-09-06 실패 사유를 쿼리로 넘기고 읽는 쪽을 안 만들었다** | `/projects/new`가 `?e=`를 받으면 `isOnboardError`로 **읽는 쪽을 같은 커밋에** 만든다 |
| **2026-09-03 실패한 조회를 "없음"으로 읽었다** | 탐지 실패(`no-candidates`)와 GitHub 장애(`unavailable`)를 가른다. `getRefSha`의 `null`은 **"권한 없음"일 수도 있다**(`client.ts` 주석) — base 브랜치가 `null`이면 "브랜치 없음"이 아니라 즉시 실패다 |
| **2026-08-31 레이아웃 인증 검사가 데이터 노출을 못 막았다** | `/projects/new`는 최상단에서 `requireUser`를 던진다. 조건부 렌더 금지 (`entry-points.test.ts`가 센다) |
| **2026-09-05 라우트를 옮겼는데 링크 생성기가 옛 경로를 들고 있었다** | 결과 화면 → 번역 화면 링크가 `/projects/${slug}/translations`를 조립한다. `entry-points.test.ts`의 링크 검사에 걸리게 둔다 |
| **2026-09-05 테스트 가짜가 실제 제약보다 관대했다** | `harness.ts`에 `Project.slug @unique`·`pushTokenHash @unique`가 없으면 slug 충돌 경로를 **재현할 수조차 없다.** 가짜에 제약을 더한다 |

## 9. 불변식 영향

| 불변식 | 영향 | 어떻게 지키나 |
|---|---|---|
| **1. 값은 DB, 키·로케일 존재는 리포** | 없음 | 첫 적재도 `applyPush`(strict, `ON CONFLICT DO UPDATE`)를 지난다 |
| **2. 병합 없음** | 없음 | 새 프로젝트라 기존 값이 없다 |
| **3. 삭제하지 않는다** | 없음 | |
| **4. export 결정성** | 없음 | write 경로를 건드리지 않는다 |
| **5. 모든 쿼리를 `projectId`로 좁힌다** | ⚠️ 있다 | 순회 pull이 프로젝트 목록을 훑는다 — 그 조회만 전역이고(그것이 목적이다), 그 뒤 `triggerPull`은 slug 하나로 좁힌다. 생성 경로의 `projectMember.count`는 `userId`로 좁힌다 |
| **6. 세 자격증명을 섞지 않는다** | ⚠️ 있다 | 리포 목록·설치 목록 = **사용자 토큰**, 트리·blob 읽기 = **installation 토큰**. `credential-separation.test.ts`가 소스에서 센다 — `lib/onboarding/`이 어느 쪽을 무는지 그 테스트 대상에 넣는다 |
| **7. `ProjectMember`가 권한을 정한다** | 없음 | 생성자는 같은 트랜잭션에서 OWNER가 된다 |
| **8. `ready`는 최초 적재 성공** | **이 단계가 세운다** | §3.7 |
| **9. 버린 값을 성공으로 숨기지 않는다** | ⚠️ 있다 | 첫 적재의 `read.errors`·`duplicateKeys`·`writeWithErrors`를 결과 화면에 띄운다. 0건이 아니면 성공 문구를 그대로 쓰지 않는다 |

## 10. 새 환경변수

**없다.** `GITHUB_APP_SLUG`(설치 링크)는 이미 있고 `optionalEnv`다.

**사라지는 것이 하나 있다** — `ACTIVE_PROJECT_SLUG`. `.env.example`·Vercel 세 스코프·
`scripts/push-local.ts`·`scripts/smoke-github.ts`의 폴백·`/l10n-roundtrip` 스킬 문서에서 함께
빠진다. 두 스크립트는 **인자를 필수로** 바꾼다 (기본값 인자에서 `requireEnv`를 부르는 형태가
POSTMORTEM 2026-08-31 🔁의 함정이므로, 없애는 방향이 맞다).

## 11. 대안과 버린 이유

- **연동 PR로 워크플로를 넣는다** → §7. App 권한 재승인 비용이 기존 설치 넷을 멈춘다.
- **탐지 결과를 세션·DB에 임시 저장하고 확정 시 그대로 쓴다** → §3.4. 클라이언트 입력이 설정이
  되는 표면이 생긴다. 재탐지 비용이 그것보다 싸다.
- **`Project` 행을 먼저 만들고 단계마다 채운다** → 실패한 온보딩이 좀비 프로젝트를 남기고,
  `/projects` 목록이 "들어갈 수 없는 프로젝트"로 채워진다. 확정 시점에 한 트랜잭션으로 만든다.
- **push 토큰을 프로젝트별 env로** → 프로젝트 수만큼 Vercel 변수가 늘고 생성이 배포를 요구한다.
- **`/api/push`가 payload의 slug로 프로젝트를 찾고 그 프로젝트의 토큰과 비교** → 오배송된
  페이로드가 인증 대상을 고르게 된다 (§3.8).
