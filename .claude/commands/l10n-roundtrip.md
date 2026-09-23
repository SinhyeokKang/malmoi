---
description: 실제 리포로 push→편집→pull→머지→재pull 왕복을 검증. 단위 테스트가 원리적으로 못 보는 층 전담.
---

**실물 리포·실물 DB·실물 GitHub API로 세 흐름을 한 바퀴 돌린다.** 단위 테스트가 전부 green인 채 기능이 멎은 사례가 `docs/POSTMORTEM.md`에 넷 있고, ARCHITECTURE §1.1이 **"단위 테스트가 원리적으로 못 보는 층이므로 이 확인을 대체할 수단이 없다"** 고 못 박은 자리가 여기다.

## 사용

- `/l10n-roundtrip <project-slug> --surface <slug> --path-template <template>` — 지정 표면으로 한 바퀴.
- 두 표면 검증은 `--surface`·`--path-template` 쌍을 둘 지정하고, 각 표면 push·편집 뒤 Publish를 **한 번만** 한다.
- `/l10n-roundtrip <project-slug> --dry` — **PR을 만들지 않고** 렌더 결과만 원본과 비교한다 (1·2단계까지).
- `--merge <squash|merge|rebase>` — 4단계의 머지 방식. **기본 `squash`.** 루프 마커는 커밋 메시지와 PR 제목 둘 다에 있어 셋 다 가드를 지나야 하는데(ARCHITECTURE §3), 2026-09-17까지 이 스킬이 squash만 돌아 merge commit 회귀는 구조적으로 안 보였다(launch-readiness L1.2). `lib/pull/`을 고쳤으면 **`merge`로 한 번 더** 돈다.

## 언제 쓰나

- **어댑터를 새로 만들었거나 `write` 경로를 고쳤을 때** — 값이 맞아도 표현이 깨질 수 있다 (POSTMORTEM 2026-09-03 인용 부호)
- **새 대상 리포를 붙일 때** — 그 리포의 포맷이 우리 어댑터를 처음 지난다
- **`lib/pull/`·`lib/push/`의 홉을 건드렸을 때** — 값 전달이 끊기는 층은 여기서만 보인다

**안 쓰는 때**: 순수 함수만 고쳤고 어댑터 출력이 안 바뀌는 변경. `pnpm test`가 답한다.

## 전제 조건 (착수 전 확인 — 하나라도 어긋나면 중단)

1. **대상은 폐기용 리포여야 한다.** 실물 오픈소스 리포에 검증 PR을 내면 흔적이 남는다 — 2026-09-03에 `bugshot-2`에 한 번 냈다가 닫고 되돌렸다(PR #226, `malmoi-i18n/sync` 삭제, DB 원복). 현재 폐기용 리포 **셋**: `bugshot-i18n-test`(ts-dict + _locales), `i18n-format-check`(yaml-catalog + code-dict), `i18n-order-check`(json-catalog — 23키 3로케일, **표현 5축이 섞이도록 재포맷돼 있다**: en 4칸 + 한 줄 컨테이너 + `\/`, ko 4칸 + 전 비ASCII `\uXXXX`, ja 탭). 재생성 어댑터를 고쳤으면 **이쪽**이다 — 나머지 둘은 수술적 어댑터 리포라 재생성 경로를 한 줄도 지나지 않는다.
2. **`Project` 행이 있고 `installationId`가 채워져 있다.** GitHub App이 계정 전체(`all`)에 설치돼 있어도 설치 id는 컬럼에 있어야 한다.
3. **대상 Project와 활성 Surface의 소유권을 확인한다.** 한 리포에 Project가 여럿 있어도 sync branch는
   `malmoi-i18n/sync-<project-slug>`로 분리된다. 이번 검증에 다른 프로젝트의 cron·Publish가 끼어 같은
   base 파일을 바꾸지 않게 하고, 한 Project의 두 표면은 비중첩 path-template으로 등록한다.
   동일 key/locale 이름은 허용한다. 권한·토큰·PR은 Project, 적재·편집 대상은 Surface다.
4. **워킹 트리가 clean하고 `pnpm test`가 green이다.** 깨진 코드로 실물 PR을 내지 않는다.

## 절차

### 0. 환경 전환

**서버 env를 바꿀 일이 없다** (2026-09-07부터). `/api/push`는 **Bearer 토큰이 프로젝트를 정하고**(`sha256` → `Project.pushTokenHash`), `/api/pull`은 준비된 **전 프로젝트를 순회**한다 — 공유 slug env는 사라졌다.

- **`PUSH_TOKEN`은 그 명령에만 넘긴다 — `.env.local`을 편집하지 않는다.**

  ```
  PUSH_TOKEN='<대상 프로젝트의 토큰 원문>' pnpm push:local <리포 경로> --adapter <name> --project <slug> --surface <surface-slug> --path-template <template>
  ```

  ⚠️ **`.env.local`은 에이전트가 편집하지 않는다** (CLAUDE.md 새 머신 셋업 3). 편집하면 하네스가 "파일이 바뀌었다" 알림으로 **전문을 컨텍스트에 넣어** 시크릿이 트랜스크립트에 남는다 — 2026-09-04에 실제로 유출돼 전면 재발급했다. **이 스킬이 전에 그 편집과 원복을 지시하고 있었다**(2026-09-13, Codex 하네스 검토 지적 2). 원복을 잊으면 파일이 틀린 값으로 남는 문제까지 덤이었다.

  `scripts/push-local.ts`가 `dotenv`의 `config()`로 `.env.local`을 읽는데 **dotenv는 이미 있는 `process.env`를 덮지 않는다**(실측). 그래서 앞에 붙인 값이 이긴다 — 파일에 손대지 않아도 그 프로세스에만 적용된다.

- 토큰 원문은 프로젝트 설정 화면에서 발급한다. **페이로드 slug가 그 토큰의 프로젝트와 다르면 409다.**
- 값을 셸 변수로 export하지 않는다 — 그 세션의 다른 명령까지 따라간다. **명령 하나 앞에만 붙인다.**
- **프로덕션 env를 검증 때문에 바꾸지 않는다** — 애초에 바꿀 변수가 없다.
- `pnpm push:local` 검증 명령은 project·surface·path-template 셋을 모두 명시한다. 최초 표면도 default라고 추정하지 않는다.

`pnpm smoke:github <slug>`로 App 토큰 → base head → 트리 → 글롭 매칭을 먼저 확인한다. 여기서 실패하면 나머지가 무의미하다.

### 1. push — 리포 → DB

```
PUSH_TOKEN='<대상 프로젝트의 토큰 원문>' pnpm push:local <리포 경로> --adapter <name> --project <slug> --surface <surface-slug> --path-template <template>
```

⚠️ **`--adapter`를 명시한다.** 자동 탐지는 후보 중 하나를 고르고 **조용히 작은 쪽으로 떨어진다** — `bugshot-i18n-test`에서 `_locales`(4키)가 `ts-dict`(903키)를 이겼다(2026-09-03 실측). 에러가 나지 않으므로 키 수를 눈으로 확인한다.

**게이트**: `200` + 키·번역 수가 리포의 실제 규모와 맞는가. `inserted`가 예상보다 적으면 어댑터가 틀렸다.

### 2. 값 고정점 — **여기서 깨지면 나머지를 볼 필요가 없다**

편집 0건 상태로 pull을 부른다.

```
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/pull
```

**게이트**: 응답이 **배열**이고 그 안에서 대상 프로젝트 항목이 `{"slug":"<slug>","status":"skipped","reason":"no-changes"}`다. 다른 프로젝트 항목이 함께 오는 것은 정상이다 — cron이 준비된 전 프로젝트를 돈다.

- `no-changes`는 **2층(blob 비교)까지 가서 전 파일이 동일했다**는 뜻이다. DB 상태와 리포가 일치한다는 증거다.
- ⚠️ **이것은 값 고정점이지 바이트 고정점이 아니다** (2026-09-16 실측 정정). 수술적 어댑터는 바꿀 값이
  없으면 `changed = false`로 **원본 바이트를 그대로 돌려준다**(`yaml-catalog.ts`·`code-dict.ts`) — 재직렬화
  경로를 **한 줄도 지나지 않는다.** 그래서 이 게이트는 "DB 값이 파싱 값과 같은가"만 재고, **직렬화가
  원본 표현을 얼마나 보존하는가는 원리적으로 검증하지 못한다.** 실제로 `lineWidth: 0`이 편집하지 않은
  접힌 스칼라를 펴는 것(ARCHITECTURE §1.4)이 이 게이트를 **통과한 채** 살아 있었다.
- **표현 보존은 3단계 diff에서만 보인다** — 그것도 **편집한 키와 같은 파일 안**의 다른 줄이 움직였는지를
  봐야 한다. 3단계 게이트 3("diff를 눈으로 본다")이 그 자리이고, 세는 것은 **hunk 수 = 편집한 키 수**다.
- **`committed`가 나오면 중단한다.** write가 원본을 정규화하고 있다 — 그 상태로 진행하면 PR이 전 파일 재작성으로 나온다.
- `no-edits`는 1층 스킵이라 이 게이트를 통과한 게 아니다. `lastPulledAt`이 이미 최신이면 그렇게 나오므로, 그때는 아래 드라이런으로 확인한다.

**드라이런**(PR 없이 확인, `--dry`는 여기까지): `loadPullState` → 활성 표면별 `formatFromProject` → `resolveLocalePaths` → `renderLocaleFiles` → `planMultiSurfacePull`을 로컬 파일을 원본으로 삼아 부르고 `blobSha`로 원본과 비교한다. 파일별로 `=`/`≠`와 `lib/survey/diff.ts`의 `changedHunks`를 찍는다. 스크립트는 `.scratch/`에 쓴다(gitignore).

### 3. 편집 → pull

**서로 다른 파일/네임스페이스에 걸치도록 2~3건**을 편집한다. 파일 단위 변경 감지도 같이 검증된다.

**보존이 깨지기 쉬운 자리를 일부러 고른다**: 여러 줄로 감긴 값, YAML 접힌 스칼라(`>`), 주석 바로 옆 줄, 작은따옴표 리터럴. 값에 `'`·`"`·백슬래시를 섞으면 이스케이프까지 본다.

두 표면이면 각각 최소 1건을 편집하고 같은 key/locale의 상대 표면 값은 그대로인지 확인한다.
편집은 projectId + surfaceId + keyId + localeCode로 좁힌 Prisma 직접 쓰기로 한다 (`saveTranslationKey` 경로는 `app/(edit)/__tests__/edit-flow.test.ts`가 덮는다). **원래 값을 파일로 남겨** 되돌릴 수 있게 한다.

**게이트 셋**:
1. 두 표면도 tree·commit·PR·SyncRun이 프로젝트당 하나이며 `changed` 배열에 **편집한 키가 속한 파일만** 있다
2. PR이 `+N -N` 대칭이고 **hunk 수 = 편집한 키 수**
3. diff를 눈으로 본다 — 주석·빈 줄·키 순서·인용 부호·블록 스타일이 살아 있는가

⚠️ **`+N -N` 대칭은 수술적 치환에서만 증거다.** 재생성 어댑터(JSON)는 값 변경 0으로 전면 재정렬해도 `270 insertions(+), 270 deletions(-)`가 나온다(실측) — 그쪽은 2단계의 `0 files changed`가 순서 보존의 증거다 (ARCHITECTURE §1.1).

### 4. 머지 → 재pull 수렴

**PR 머지는 사용자가 한다** — 되돌리기 어려운 작업이라 이 스킬이 대신 승인하지 않는다. 명령을 제시하고 대기한다.

```
GH_TOKEN=$(gh auth token --user <owner>) gh pr merge <n> --repo <owner>/<repo> --<squash|merge|rebase> --delete-branch
```

머지 전 확인할 것:
- **PR 제목에 `[skip-malmoi-i18n]`이 있다** (`gh pr view <n> --json title`). merge commit의 `head_commit.message`는 `Merge pull request #N …` + **PR 제목**이라 커밋 메시지의 마커가 실리지 않는다 — 제목의 마커가 그 방식의 유일한 가드다. 재사용된 옛 PR이면 이번 pull이 제목 뒤에 마커를 덧붙였어야 한다(`withSkipMarker`).

머지 뒤 확인할 것:
- `dev` head의 커밋 메시지에 **`[skip-malmoi-i18n]`** 이 있다 (없으면 대상 리포 CI가 다시 push를 돌려 무한 루프다). `--merge`면 그 메시지의 **둘째 문단(PR 제목)**에 있고, `--squash`·`--rebase`면 첫 줄에 있다 — 어느 자리든 가드는 부분 문자열만 본다
- `malmoi-i18n/sync-<project-slug>` 브랜치가 삭제됐다
- checkout을 merge head로 갱신하고 두 표면을 각각 다시 push해 편집 값·구조·표현이 유지되는지 확인한다
- 값 불변 재push 뒤 첫 pull은 `no-changes`(2층), 즉시 재pull은 **`no-edits`** — 1층 스킵이고, **GitHub API를 한 번도 안 부른다.** 야간 cron이 변경 없는 날 도는 기본 경로가 이것이다

### 5. (선택) CI 방향 — 대상 리포에 워크플로가 붙어 있을 때만

`docs/ACTIONS.md`를 따라 붙인다. `[skip-malmoi-i18n]` 커밋이 스킵되는지, 열린 `malmoi-i18n/sync-<project-slug>` PR 경고가 뜨는지 확인한다 — 후자는 대상 리포 워크플로에 `permissions: pull-requests: read`가 있어야 뜬다(없으면 조회 실패를 "PR 없음"으로 삼킨다 — POSTMORTEM 2026-09-03).

✅ **두 리포의 CI를 동시에 받을 수 있다** (2026-09-07 — 토큰이 프로젝트를 정한다). 각 대상 리포의 secret `PUSH_TOKEN`이 **그 프로젝트의 토큰**이면 된다. CI 층 자체는 어댑터와 무관하므로, 어댑터 검증이 목적이면 이 단계를 건너뛴다.

### 6. 정리 — **생략 금지**

- **`.env.local` 원복은 할 일이 없다** — 토큰을 명령 앞에만 붙였으므로 그 프로세스와 함께 사라진다. 원복 단계가 있었다는 것은 파일을 고쳤다는 뜻이고, 그 자체가 지적 2의 사고 경로다.
- 검증용으로 발급한 토큰을 **회수한다** — 설정 화면에서 재발급하면 옛 토큰이 즉시 무효다
- **셸 히스토리를 확인한다.** 명령 앞에 토큰을 붙였으므로 `HISTFILE`에 원문이 남는다. 회수했으면 무효한 문자열이지만, 회수 전에 세션이 끝나면 유효한 값이 파일로 남는다 — 회수를 이 단계에서 **먼저** 한다.
- 이번에 만든 일회성 `Project`만 정리한다. **상주 `bugshot-i18n-test-qa`와 그 표면·번역은 보존한다.**
  TRUNCATE 또는 프로젝트 전건 삭제는 하지 않는다.
- dev 서버 종료
- 편집을 되돌릴지 판단: PR을 머지했으면 DB와 리포가 일치하므로 그대로 둔다. **머지하지 않았으면 원복한다**
- 실물 리포에 실수로 낸 PR이 있으면 닫고 `malmoi-i18n/sync-<project-slug>`를 삭제한다
- `.scratch/` 임시 스크립트 정리
- `next-env.d.ts`가 `pnpm dev`로 바뀌었으면 `git checkout`

## 리포트

```
🔄 l10n-roundtrip: <slug> (<adapter>, <키>키 <로케일>로케일)
전제: 폐기용 리포 <repo> / Project·Surface·경로 소유권 확인 / smoke:github OK
1 push:       200 — <n>키 / <n>번역 / <n>refs
2 값 고정점:   no-changes ✅ / ❌ (committed — 중단) · ⚠️ 표현 보존은 여기서 안 보인다
3 편집 <n>건:  PR #<n> +<a> -<b> / <n>파일, hunk <n>
   보존:      주석 · 빈 줄 · 키 순서 · 인용 부호 · <포맷별 항목>
4 머지 후:    --<방식> · PR 제목 마커 ✅ · dev head [skip-malmoi-i18n] ✅ / 재pull no-edits ✅
5 CI:         스킵(사유) / green
6 정리:       토큰 회수 ✅ (.env.local 미편집 — 원복 불필요) / 검증용 행 삭제 ✅ / dev 종료 ✅ / <기타>
```

## 금지 사항

- **실물 오픈소스 리포를 대상으로 삼지 않는다.** 폐기용 복제본만.
- **PR 머지를 대신 하지 않는다** — 사용자에게 명령을 주고 대기한다.
- **프로덕션 env·프로덕션 DB를 검증 때문에 바꾸지 않는다** — 로컬 dev 서버 + dev DB로 돌린다.
- **`.env.local`을 편집하지 않는다** — 읽지도 쓰지도 않는다. 토큰은 명령 앞에 붙여 그 프로세스에만 넘긴다 (0단계).
- **2단계 게이트를 건너뛰지 않는다.** 값 고정점이 깨진 채 3단계로 가면 PR이 전 파일 재작성으로 나오고, 그걸 "diff가 크네"로 넘기면 결정성 붕괴를 놓친다.
- ⚠️ **2단계 통과를 "표현이 보존된다"로 읽지 않는다** — 그 게이트는 재직렬화를 안 지난다(2단계 주석). 표현은 3단계 diff로만 본다.
- **정리(6단계) 생략 금지** — 검증용 `Project` 행이 남으면 **야간 pull이 그것까지 순회한다**(준비된 행이면 매일 밤 실패 로그를 남기고, `[pull] failed=N`이 상시 1 이상이 되어 진짜 장애가 묻힌다).
- **`pnpm adapter-survey` 실행 금지** — 이 스킬은 리포 하나를 깊게 보고, 실측은 129개를 얕게 본다. 재측정 판단은 `/push` 4d.
- **커밋·배포 안 함** — 검증 스킬이다. 코드를 고쳐야 하면 `/tdd` → `/implement`로 나간다.
