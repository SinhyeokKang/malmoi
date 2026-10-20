# B2 — GitLab CI 원본을 gitlab-v3에 고정 (🟡2 = android-strings T5.7)

먼저 `brief-common.md`와 `orch.md`를 읽는다.

## 결함

`lib/onboarding/gitlab-ci.ts:15-18` `GITLAB_CI_RELEASE`가 `tag: "malmoi-i18n-push-gitlab-v2"`, `sha: "325ae01a…"`(v1.4.3)에 묶여 있다. 원격 태그 `malmoi-i18n-push-gitlab-v3`는 이미 `753901bc11667cfbf4f7ac8151dc0cc67adfe7ef`(v1.4.7)에 있다(`git ls-remote --tags origin 'malmoi-i18n-push-gitlab-*'`로 다시 확인한다). 그래서 GitLab에서 ARB·Apple·Android 소스를 만들면 생성 job이 이 어댑터 이름을 모르는 CLI를 돌려 커밋마다 exit 2다.

## 할 일

`docs/features/android-strings/tasks.md` T5.7 그대로다.

- `GITLAB_CI_RELEASE`를 tag `malmoi-i18n-push-gitlab-v3` · sha `753901bc11667cfbf4f7ac8151dc0cc67adfe7ef`로 바꾼다(태그를 원격에서 다시 확인한 값으로).
- `docs/ACTIONS.md` §5 `<!-- gitlab-ci -->` 블록을 같이 고친다 — `lib/onboarding/__tests__/gitlab-ci.test.ts`가 줄 단위로 대조한다.
- ACTIONS 안의 gitlab-v2를 가리키는 다른 서술(예: 367행 부근)도 확인한다. 기존 소비자용 설명으로 남겨야 할 서술은 남긴다.
- 테스트가 먼저 red가 되도록 기대값(태그·sha)부터 고치고 green으로 만든다.
- 커밋: `chore(release): pin the GitLab CI source to malmoi-i18n-push-gitlab-v3`

## 소유 파일

`lib/onboarding/gitlab-ci.ts` · `lib/onboarding/__tests__/gitlab-ci.test.ts` · `docs/ACTIONS.md`.

**건드리지 않는다**: `docs/features/android-strings/tasks.md`(지휘자가 체크한다), CLAUDE.md, 가이드(gitlab-v2를 가리키는 곳이 가이드에 있으면 미룬 항목으로 적는다 — `/guide`는 세 언어를 같이 고쳐야 한다).

## 모델

Claude Sonnet · effort low.
