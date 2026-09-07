---
name: "source-command-l10n-roundtrip"
description: "실제 리포로 push→편집→pull→머지→재pull 왕복을 검증. 단위 테스트가 원리적으로 못 보는 층 전담."
---

# source-command-l10n-roundtrip

Use this skill when the user asks to run the migrated source command `l10n-roundtrip`.

## Command Template

**실물 리포·실물 DB·실물 GitHub API로 세 흐름을 한 바퀴 돌린다.** 단위 테스트가 전부 green인 채 기능이 멎은 사례가 `docs/POSTMORTEM.md`에 넷 있고, ARCHITECTURE §1.1이 **"단위 테스트가 원리적으로 못 보는 층이므로 이 확인을 대체할 수단이 없다"** 고 못 박은 자리가 여기다.

## 사용

- `/l10n-roundtrip <project-slug>` — 그 프로젝트로 한 바퀴.
- `/l10n-roundtrip <project-slug> --dry` — **PR을 만들지 않고** 렌더 결과만 원본과 비교한다 (1·2단계까지).

## 언제 쓰나

- **어댑터를 새로 만들었거나 `write` 경로를 고쳤을 때** — 값이 맞아도 표현이 깨질 수 있다 (POSTMORTEM 2026-09-03 인용 부호)
- **새 대상 리포를 붙일 때** — 그 리포의 포맷이 우리 어댑터를 처음 지난다
- **`lib/pull/`·`lib/push/`의 홉을 건드렸을 때** — 값 전달이 끊기는 층은 여기서만 보인다

**안 쓰는 때**: 순수 함수만 고쳤고 어댑터 출력이 안 바뀌는 변경. `pnpm test`가 답한다.

## 전제 조건 (착수 전 확인 — 하나라도 어긋나면 중단)

1. **대상은 폐기용 리포여야 한다.** 실물 오픈소스 리포에 검증 PR을 내면 흔적이 남는다 — 2026-09-03에 `bugshot-2`에 한 번 냈다가 닫고 되돌렸다(PR #226, `l10n/sync` 삭제, DB 원복). 현재 폐기용 리포 **셋**: `bugshot-i18n-test`(ts-dict + _locales), `i18n-format-check`(yaml-catalog + code-dict), `i18n-order-check`(json-catalog — 23키 3로케일, **표현 5축이 섞이도록 재포맷돼 있다**: en 4칸 + 한 줄 컨테이너 + `\/`, ko 4칸 + 전 비ASCII `\uXXXX`, ja 탭). 재생성 어댑터를 고쳤으면 **이쪽**이다 — 나머지 둘은 수술적 어댑터 리포라 재생성 경로를 한 줄도 지나지 않는다.
2. **`Project` 행이 있고 `installationId`가 채워져 있다.** GitHub App이 계정 전체(`all`)에 설치돼 있어도 설치 id는 컬럼에 있어야 한다.
3. **그 리포를 가리키는 `Project`가 하나뿐이다.** 둘이면 `l10n/sync`를 force update로 다툰다 — 한 리포에 두 포맷이 있으면 **순차로** 검증한다.
4. **워킹 트리가 clean하고 `pnpm test`가 green이다.** 깨진 코드로 실물 PR을 내지 않는다.

## 절차

### 0. 환경 전환

**서버 env를 바꿀 일이 없다** (2026-09-07부터). `/api/push`는 **Bearer 토큰이 프로젝트를 정하고**(`sha256` → `Project.pushTokenHash`), `/api/pull`은 준비된 **전 프로젝트를 순회**한다 — 공유 slug env는 사라졌다.

- `.env.local`의 `PUSH_TOKEN`을 **대상 프로젝트의 토큰 원문**으로 둔다(프로젝트 설정 화면에서 발급). 페이로드 slug가 그 토큰의 프로젝트와 다르면 409다.
- **프로덕션 env를 검증 때문에 바꾸지 않는다** — 애초에 바꿀 변수가 없다.
- `pnpm push:local`은 `--project <slug>`가 **필수**다.

`pnpm smoke:github <slug>`로 App 토큰 → base head → 트리 → 글롭 매칭을 먼저 확인한다. 여기서 실패하면 나머지가 무의미하다.

### 1. push — 리포 → DB

```
pnpm push:local <리포 경로> --adapter <name> --project <slug>
```

⚠️ **`--adapter`를 명시한다.** 자동 탐지는 후보 중 하나를 고르고 **조용히 작은 쪽으로 떨어진다** — `bugshot-i18n-test`에서 `_locales`(4키)가 `ts-dict`(903키)를 이겼다(2026-09-03 실측). 에러가 나지 않으므로 키 수를 눈으로 확인한다.

**게이트**: `200` + 키·번역 수가 리포의 실제 규모와 맞는가. `inserted`가 예상보다 적으면 어댑터가 틀렸다.

### 2. 바이트 고정점 — **여기서 깨지면 나머지를 볼 필요가 없다**

편집 0건 상태로 pull을 부른다.

```
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/pull
```

**게이트**: 응답이 **배열**이고 그 안에서 대상 프로젝트 항목이 `{"slug":"<slug>","status":"skipped","reason":"no-changes"}`다. 다른 프로젝트 항목이 함께 오는 것은 정상이다 — cron이 준비된 전 프로젝트를 돈다.

- `no-changes`는 **2층(blob 비교)까지 가서 전 파일이 동일했다**는 뜻이다. DB 상태와 리포가 일치하고 writer가 결정적이라는 증거다.
- **`committed`가 나오면 중단한다.** write가 원본을 정규화하고 있다 — 그 상태로 진행하면 PR이 전 파일 재작성으로 나온다.
- `no-edits`는 1층 스킵이라 이 게이트를 통과한 게 아니다. `lastPulledAt`이 이미 최신이면 그렇게 나오므로, 그때는 아래 드라이런으로 확인한다.

**드라이런**(PR 없이 확인, `--dry`는 여기까지): `loadPullState` → `formatFromProject` → `resolveLocalePaths` → `renderLocaleFiles`를 로컬 파일을 원본으로 삼아 부르고 `blobSha`로 원본과 비교한다. 파일별로 `=`/`≠`와 `lib/survey/diff.ts`의 `changedHunks`를 찍는다. 스크립트는 `.scratch/`에 쓴다(gitignore).

### 3. 편집 → pull

**서로 다른 파일/네임스페이스에 걸치도록 2~3건**을 편집한다. 파일 단위 변경 감지도 같이 검증된다.

**보존이 깨지기 쉬운 자리를 일부러 고른다**: 여러 줄로 감긴 값, YAML 접힌 스칼라(`>`), 주석 바로 옆 줄, 작은따옴표 리터럴. 값에 `'`·`"`·백슬래시를 섞으면 이스케이프까지 본다.

편집은 Prisma 직접 쓰기로 한다 (`saveTranslation` 경로는 `app/(edit)/__tests__/edit-flow.test.ts`가 덮는다). **원래 값을 파일로 남겨** 되돌릴 수 있게 한다.

**게이트 셋**:
1. `changed` 배열에 **편집한 키가 속한 파일만** 있다
2. PR이 `+N -N` 대칭이고 **hunk 수 = 편집한 키 수**
3. diff를 눈으로 본다 — 주석·빈 줄·키 순서·인용 부호·블록 스타일이 살아 있는가

⚠️ **`+N -N` 대칭은 수술적 치환에서만 증거다.** 재생성 어댑터(JSON)는 값 변경 0으로 전면 재정렬해도 `270 insertions(+), 270 deletions(-)`가 나온다(실측) — 그쪽은 2단계의 `0 files changed`가 순서 보존의 증거다 (ARCHITECTURE §1.1).

### 4. 머지 → 재pull 수렴

**PR 머지는 사용자가 한다** — 되돌리기 어려운 작업이라 이 스킬이 대신 승인하지 않는다. 명령을 제시하고 대기한다.

```
GH_TOKEN=$(gh auth token --user <owner>) gh pr merge <n> --repo <owner>/<repo> --squash --delete-branch
```

머지 뒤 확인할 것:
- `dev` head의 커밋 메시지에 **`[skip-l10n]`** 이 있다 (없으면 대상 리포 CI가 다시 push를 돌려 무한 루프다)
- `l10n/sync` 브랜치가 삭제됐다
- **재pull이 `no-edits`** — 1층 스킵이고, **GitHub API를 한 번도 안 부른다.** 야간 cron이 변경 없는 날 도는 기본 경로가 이것이다

### 5. (선택) CI 방향 — 대상 리포에 워크플로가 붙어 있을 때만

`docs/ACTIONS.md`를 따라 붙인다. `[skip-l10n]` 커밋이 스킵되는지, 열린 `l10n/sync` PR 경고가 뜨는지 확인한다 — 후자는 대상 리포 워크플로에 `permissions: pull-requests: read`가 있어야 뜬다(없으면 조회 실패를 "PR 없음"으로 삼킨다 — POSTMORTEM 2026-09-03).

✅ **두 리포의 CI를 동시에 받을 수 있다** (2026-09-07 — 토큰이 프로젝트를 정한다). 각 대상 리포의 secret `PUSH_TOKEN`이 **그 프로젝트의 토큰**이면 된다. CI 층 자체는 어댑터와 무관하므로, 어댑터 검증이 목적이면 이 단계를 건너뛴다.

### 6. 정리 — **생략 금지**

- `.env.local`의 `PUSH_TOKEN`을 **원래 값으로 되돌린다**(검증용으로 다른 프로젝트 토큰을 넣었다면)
- 검증용으로 발급한 토큰을 **회수한다** — 설정 화면에서 재발급하면 옛 토큰이 즉시 무효다
- 검증용으로 만든 `Project` 행·키·번역을 지운다
- dev 서버 종료
- 편집을 되돌릴지 판단: PR을 머지했으면 DB와 리포가 일치하므로 그대로 둔다. **머지하지 않았으면 원복한다**
- 실물 리포에 실수로 낸 PR이 있으면 닫고 `l10n/sync`를 삭제한다
- `.scratch/` 임시 스크립트 정리
- `next-env.d.ts`가 `pnpm dev`로 바뀌었으면 `git checkout`

## 리포트

```
🔄 l10n-roundtrip: <slug> (<adapter>, <키>키 <로케일>로케일)
전제: 폐기용 리포 <repo> / Project 단일 / smoke:github OK
1 push:       200 — <n>키 / <n>번역 / <n>refs
2 바이트 고정점: no-changes ✅ / ❌ (committed — 중단)
3 편집 <n>건:  PR #<n> +<a> -<b> / <n>파일, hunk <n>
   보존:      주석 · 빈 줄 · 키 순서 · 인용 부호 · <포맷별 항목>
4 머지 후:    dev head [skip-l10n] ✅ / 재pull no-edits ✅
5 CI:         스킵(사유) / green
6 정리:       PUSH_TOKEN 원복 ✅ / 검증용 행 삭제 ✅ / dev 종료 ✅ / <기타>
```

## 금지 사항

- **실물 오픈소스 리포를 대상으로 삼지 않는다.** 폐기용 복제본만.
- **PR 머지를 대신 하지 않는다** — 사용자에게 명령을 주고 대기한다.
- **프로덕션 env·프로덕션 DB를 검증 때문에 바꾸지 않는다** — 로컬 dev 서버 + dev DB로 돌린다.
- **2단계 게이트를 건너뛰지 않는다.** 바이트 고정점이 깨진 채 3단계로 가면 PR이 전 파일 재작성으로 나오고, 그걸 "diff가 크네"로 넘기면 결정성 붕괴를 놓친다.
- **정리(6단계) 생략 금지** — 검증용 `Project` 행이 남으면 **야간 pull이 그것까지 순회한다**(준비된 행이면 매일 밤 실패 로그를 남기고, `[pull] failed=N`이 상시 1 이상이 되어 진짜 장애가 묻힌다).
- **`pnpm adapter-survey` 실행 금지** — 이 스킬은 리포 하나를 깊게 보고, 실측은 129개를 얕게 본다. 재측정 판단은 `/push` 4d.
- **커밋·배포 안 함** — 검증 스킬이다. 코드를 고쳐야 하면 `/tdd` → `/implement`로 나간다.
