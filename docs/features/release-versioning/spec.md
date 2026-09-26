# release-versioning — spec

## 사용자

**개발자(오너 자신)** — `/merge`를 부르는 사람이자 "지금 프로덕션에 무엇이 나가 있나"를 되짚어야 하는 사람. 부수적으로
**리포 방문자**(공개 리포라 Releases 탭을 본다). 번역 편집자의 화면은 바뀌지 않는다 — 이 기능은 하네스(스킬)·문서·
`scripts/` 하나만 건드린다.

## 문제 (2026-09-27 실측)

- **프로덕션 배포에 이름이 없다.** `package.json`에 `version` 필드가 없고, 원격 태그는 composite action용
  `malmoi-i18n-push-v1` 하나뿐이다. main의 squash 커밋 6개(#73 … #110)는 PR 번호로만 구별된다.
- **무엇이 나갔는지 사후에 모은다.** `/merge` 3단계의 PR body가 유일한 기록이고, 사용자 관점으로 걸러진 요약이 없다.
  다음 `/merge`는 dev가 main보다 **157커밋** 앞서 있다(docs 76 · fix 24 · feat 20 · test 16 · chore 10 · refactor 9 · 기타 2).
- **`git describe --tags`가 엉뚱한 태그를 준다** — `origin/main`에서 `malmoi-i18n-push-v1`을 돌려준다. 앱 버전과
  action 계약 태그가 같은 이름공간에 섞여 있어, "직전 릴리스"를 태그로 찾는 순진한 명령이 틀린다.
- 참고 구현 `~/code/bugshot-2`는 semver + `/merge`의 bump 커밋 + `/deploy`의 태그·GitHub Release로 이 문제를 풀었지만,
  **`/deploy`는 스토어 빌드(zip·심사) 때문에 따로 선 단계다.** malmoi는 main 머지가 곧 Vercel 프로덕션 배포라 그 단계가 없다.

## 완료 조건

1. **다음 `/merge`가 `v1.0.0`을 낸다** — main의 squash 커밋에서 `package.json`의 `version`이 `"1.0.0"`이고,
   `git ls-remote --tags origin v1.0.0`이 그 squash 커밋 SHA를 가리키며, `gh release view v1.0.0`이 영문 노트와 함께
   published(draft 아님)·Latest로 존재한다.
2. **그 뒤의 `/merge`는 매번 레벨을 묻는다** — `AskUserQuestion`으로 patch·minor·major를 묻고, 각 선택지에 다음 버전을 보이며,
   커밋 타입 규칙(`!:`/`BREAKING CHANGE` → major, `feat` → minor, 그 밖 patch)의 판정을 "(Recommended)" 첫 선택지로 둔다.
   **머지마다 반드시 올린다**(skip 없음 — 머지 = 배포). seed(1.0.0)와 재실행(bump가 이미 dev에 있음)은 묻지 않는다.
3. **버전 판정이 스크립트 한 곳에 있다** — `pnpm release:plan`이 후보 셋·추천·seed/재실행 판정을 내고 `/merge` 3단계만 그 출력을 쓴다. 스크립트의
   순수 함수가 `pnpm test`로 고정돼 있고, `malmoi-i18n-push-v1`·로컬 전용 태그가 "직전 릴리스"로 잡히지 않는다.
4. **브랜치 프로텍션을 한 번도 우회하지 않는다** — bump는 dev 커밋으로 squash PR에 실리고, 태그는
   `gh release create --target <squash SHA>`가 서버에서 만든다. `--admin`·main 직접 push가 절차에 없다.
5. **`/merge`를 중간에서 다시 불러도 두 번 올리지 않는다** — bump 커밋이 이미 dev에 있으면(버전 > 직전 태그) 3단계가
   "이미 올림"으로 판정해 커밋을 건너뛴다.
6. **노트가 두 벌이다** — squash PR body는 개발자용 변경 목록(내부 변경 포함), GitHub Release는 사용자 체감 변화만. 둘 다 영문.
7. **태그 push가 아무 워크플로도 돌리지 않는다** — `ci.yml` 트리거에 `tags`·`release`가 없고, Vercel이 태그로 배포를
   만들지 않는다(첫 릴리스 때 실측).
8. **하네스 문서가 새 흐름을 말한다** — `merge.md`·CLAUDE.md(브랜치 정책·CI·워크플로·명령어)·`push.md`(금지 사항 한 줄)·`sync.md`·
   `ACTIONS.md`·`DIRECTORY.md`가 갱신되고 `pnpm sync:agents:check`가 green.

## 비목표

- **`/deploy`·스토어 빌드·zip·asset 첨부** — bugshot-2 고유. Vercel이 배포한다.
- **Release draft 후 수동 publish** — bugshot-2는 스토어 심사 대기 때문에 draft였다. malmoi는 머지 순간 배포되므로 곧바로 published.
- **`CHANGELOG.md`** — GitHub Release와 같은 내용의 사본이고, 갱신 규칙이 하나 더 는다. bugshot-2도 두지 않는다.
- **커버리지 리포트·래칫**(bugshot-2 `/merge` 5단계) — malmoi에 그 인프라가 없고 이번 요청이 아니다.
- **앱 화면에 버전 표시**(푸터 등), `/api/*` 응답에 버전 싣기.
- **1.0.0 이전 머지(#73 … #110)의 소급 태그** — 1.0.0이 첫 릴리스다.
- **composite action 태그(`malmoi-i18n-push-vN`)와의 연동** — 별개 축으로 둔다. 앱 버전이 올라도 action 태그는 안 움직이고,
  action 태그 이동은 지금처럼 `/merge` 밖의 별도 판단이다.
- **`/push`·`/orchestrate` 리포트에 예상 버전 표시** (2026-09-27 사용자 결정).
- **`/merge <level>` 인자** — 레벨은 3단계 질문이 받는다.
- **README 수정** — GitHub가 Releases를 리포 사이드바에 자동으로 보인다.
