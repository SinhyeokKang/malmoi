# B6 — T5.0: prod 표면 리포에 새 탐지 회귀 확인 (ego-browser, 읽기 전용)

먼저 `orch.md`를 읽는다. **코드를 고치지 않는다. 커밋하지 않는다.** main 체크아웃(`/Users/sinhyeokkang/code/malmoi`)에서 돈다.

## 목적

`docs/features/android-strings/tasks.md` T5.0: v1.4.7에서 새 어댑터(arb-catalog·apple-strings·apple-xcstrings·android-strings)와 탐지 순위가 바뀌었다. **prod에 등록된 표면들의 리포**에서 새 탐지가 여전히 기존 `adapterName`·`pathTemplate`를 1순위로 고르는지 확인한다. 워크플로에 `adapter`를 박지 않은 기존 소비자는 탐지가 바뀌면 CI가 영구 red가 된다. v1.4.7은 이미 프로덕션에 나갔으므로 사후 확인이다.

## 절차

1. **ego-browser로 prod(`https://mal-moi.com`)에 들어가** 사용자의 로그인 세션으로 접근 가능한 프로젝트를 전부 열고, 각 소스의 리포·기준 브랜치·`adapterName`(포맷)·`pathTemplate`·basePath를 소스 상세에서 읽어 표로 만든다. ego-browser 스킬을 먼저 읽는다.
   - **prod에서 아무것도 바꾸지 않는다** — 버튼은 읽기용(열기·탭 전환)만 누른다. Sync·Publish·설정·언어 추가/제거·초대 등 쓰기 동작 금지.
   - 시스템 브라우저를 열지 않는다(`BROWSER=true`).
   - prod DB에 직접 붙지 않는다.
2. 각 리포를 **리포 밖**(`/private/tmp/claude-501/` 아래 새 빈 디렉터리 — `.scratch/` 금지: vitest가 수집한다)에 `git clone --depth 1 --branch <기준 브랜치>`로 받는다. 비공개 리포라 받을 수 없으면 그 행을 "확인 불가"로 남긴다(자격증명을 찾아 쓰지 않는다).
3. main 체크아웃에서 `pnpm ingest <clone 디렉터리> --json`(옵션은 `pnpm ingest` 도움말 확인 — `--adapter`를 **주지 않고** 탐지에 맡긴다)으로 새 탐지 결과의 1순위 어댑터·경로 템플릿을 얻는다. 받은 리포 안의 스크립트를 실행하지 않는다.
4. prod 표면 값과 대조한다.

## 산출

`.scratch/handoff-B6.md`:

| 프로젝트 | 소스 | 리포@브랜치 | prod adapterName | prod pathTemplate(+basePath) | 새 탐지 1순위 | 일치 | 비고 |

- 불일치가 있으면 그 리포에서 2순위 이하가 무엇인지, 사용자 워크플로에 `adapter`가 박혀 있는지(리포의 `.github/workflows/*`·`.gitlab-ci.yml` 읽기만)를 같이 적는다.
- 확인 불가 행과 사유.
- 끝나면 받은 clone 디렉터리를 지운다.

Dispatch 지침대로 `worker_done`을 한 번 보낸다(불일치가 있어도 확인 자체를 끝냈으면 `succeeded`, 진행 불가면 `failed`).

## 모델

Claude Sonnet · effort medium.
