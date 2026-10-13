# GitLab CI 작업 추가

생성된 CI 작업을 GitLab 프로젝트에 추가해 리포지토리의 변경 사항을 Malmoi에 반영합니다.

시작하기 전에: **Malmoi 준비 완료** 페이지의 푸시 토큰을 준비합니다. 작업을 커밋하기 전에 CI/CD 변수부터 저장하세요.

## 푸시 토큰 저장 {#ci-variable}

1. GitLab에서 프로젝트의 **Settings** › **CI/CD**로 가서 **Variables**를 펼치고 **Add variable**을 누릅니다. 이름은 `PUSH_TOKEN`, 값은 푸시 토큰으로 넣고 **Protect variable**을 선택하며 **Visibility**는 **Masked**로 둡니다.

![GitLab의 변수 추가 폼에 키로 PUSH_TOKEN이 입력되고 Masked 표시 방식과 Protect variable이 선택된 모습](/guide/gitlab-ci-variable.webp "이름을 PUSH_TOKEN으로 두고 Masked를 유지한 채 Protect variable을 고른 뒤 토큰을 값으로 붙여 넣습니다.")

## 기준 브랜치 보호 {#protected-branch}

1. 고른 기준 브랜치가 GitLab에서 보호 브랜치인지 확인합니다. 따로 바꾸지 않았다면 GitLab은 기본 브랜치를 보호합니다. 보호 변수는 보호 브랜치에만 전달되므로, 보호되지 않은 브랜치에서는 `PUSH_TOKEN`이 없어 작업이 실패합니다. Malmoi의 `malmoi-i18n/sync-*` 브랜치는 와일드카드 규칙으로도 보호하지 마세요. 게시가 이 브랜치에 쓰므로, 보호되어 있으면 게시가 실패합니다.

![GitLab의 Protected branches 설정에 기본 브랜치 main이 보호되어 있고 Maintainers가 머지와 푸시를 할 수 있는 모습](/guide/gitlab-protected-branch.webp "기준 브랜치가 Protected branches에 있는지 확인합니다.")

## CI 작업 추가하기 {#gitlab-ci}

1. **Malmoi 준비 완료** 페이지에서, 또는 나중에 **설정**의 **CI 파일**에서 작업을 복사해 리포지토리 루트의 `.gitlab-ci.yml`에 추가합니다. 파일이 이미 있으면 그 안에 덧붙입니다.
2. 기준 브랜치에 파일을 커밋합니다.

![생성된 .gitlab-ci.yml 작업과 복사 버튼이 있는 Malmoi 설정의 CI 파일 대화상자](/guide/gitlab-ci-file.webp "작업을 복사해 기준 브랜치의 .gitlab-ci.yml에 추가합니다.")

소스마다 작업이 하나씩 있고, 작업 이름에 프로젝트 주소가 들어가므로 한 리포지토리의 두 프로젝트가 서로의 작업을 덮어쓰지 않습니다. 작업은 기준 브랜치에 새 커밋이 들어올 때만 실행되며, `[skip-malmoi-i18n]`이 든 커밋은 건너뜁니다. 작업은 `test` 단계(stage)를 씁니다. 파일에 `stages:`를 직접 정의했다면 그 목록에 `test`를 남겨 두세요. 러너는 `github.com`(작업마다 고정된 버전의 Malmoi 스크립트를 받아 옵니다), `registry.npmjs.org`, Docker Hub(작업은 공식 Node.js 이미지를 씁니다), Malmoi에 접속할 수 있어야 합니다.

코드가 래퍼 함수로 번역을 읽는다면 그 소스 작업의 `variables:`에 있는 `MALMOI_I18N_WRAPPER`(기본은 빈 값)를 채우고, 한 줄에 하나씩 씁니다. 일반 함수는 `module#export`로, 훅은 `next-intl#useTranslations()`처럼 끝에 `()`를 붙여 씁니다. 이 값은 Malmoi가 코드 사용처를 찾는 데 도움을 줄 뿐, 어떤 번역 키가 있는지를 정하지는 않습니다. 나중에 기준 브랜치를 바꾸려면 **설정**에서 **기준 브랜치**를 바꾸고 `MALMOI_I18N_BASE_BRANCH` 값을 고칩니다. 소스를 추가하면 **설정**에서 파일 전체를 다시 복사해 Malmoi 작업을 그것으로 교체합니다.

## 실행하고 확인하기 {#first-run}

기준 브랜치에 작업을 커밋하면 실행이 시작됩니다. 다시 실행하려면 파이프라인에서 그 작업을 다시 실행합니다. 작업 로그를 확인하세요. `applied`는 파일을 반영해 Malmoi의 **소스**를 업데이트했다는 뜻입니다. 미전송 변경 사항이 있으면 성공한 작업도 `deferred`를 보고할 수 있습니다. 이때 리포지토리 업데이트는 보류되며 로그에는 **보류**로 표시됩니다. [코드가 바뀌면](../sync/push.md#deferred)을 참고하세요. 실패한 작업은 로그에 이유를 보여 줍니다. Malmoi에서는 홈의 **동기화** 탭이 최근 동기화를 보여 줍니다. **마지막 동기화**에 **CI 동기화**가, **결과**에 그 결과가, **변경**에 바뀐 번역 수가 표시됩니다. **동기화 로그**에는 모든 동기화가 나열됩니다.

## 다음 단계 {#next}

첫 실행이 성공하면 Malmoi가 키의 코드 사용처를 보여 줄 수 있습니다. 이후 실행이 실패해도 프로젝트는 준비된 상태로 남습니다.
