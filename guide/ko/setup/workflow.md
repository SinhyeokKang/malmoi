# 워크플로 추가

생성된 GitHub Actions 워크플로를 추가해 리포지토리의 변경이 Malmoi에 들어오게 합니다.

시작하기 전에: **Malmoi 준비 완료** 페이지의 push 토큰을 준비합니다. 워크플로 파일을 커밋하기 전에 secret부터 저장하세요.

## secret 저장 {#push-token}

1. GitHub에서 리포지토리의 **Settings**를 열고 **Secrets and variables**, 이어서 **Actions**를 선택합니다.
2. **New repository secret**을 선택하고 `PUSH_TOKEN`을 입력한 뒤 push 토큰을 붙여 넣고 저장합니다.

![이름에 PUSH_TOKEN을 입력하고 secret 칸은 비어 있는 GitHub 새 secret 양식](/guide/push-token-secret.webp "이름에 PUSH_TOKEN을 입력하고 push 토큰을 붙여 넣은 뒤 secret을 추가합니다.")

## 워크플로 추가하기 {#workflow}

1. **Malmoi 준비 완료** 페이지에서, 또는 나중에 **설정**에서 워크플로를 복사해 리포지토리에 `.github/workflows/malmoi-i18n.yml`로 저장합니다.
2. 조직이 action을 제한한다면 [action 허용](allowed-actions.md)을 따릅니다.
3. 설정할 때 고른 기준 브랜치에 파일을 커밋합니다. 생성된 워크플로에는 소스마다 단계가 하나씩 있습니다.

![생성된 YAML과 복사 버튼이 보이는 Malmoi 설정의 워크플로 파일 대화상자](/guide/workflow-file.webp "YAML을 복사해 .github/workflows/malmoi-i18n.yml로 저장합니다.")

코드가 기본값 `@/i18n#t`가 아닌 래퍼 함수로 번역을 읽는다면, 그 단계의 `with:` 아래에 `wrapper` 입력을 추가합니다. 일반 함수는 `module#export`로, 훅은 `next-intl#useTranslations()`처럼 끝에 `()`를 붙여 씁니다. 래퍼가 여러 개면 YAML `|` 블록에 한 줄에 하나씩 씁니다. 설정 과정에서는 이 입력을 묻지 않습니다. 이 입력은 Malmoi가 코드 사용처를 찾는 데 도움을 줄 뿐, 어떤 번역 키가 있는지를 정하지는 않습니다.

`github-token` 입력은 읽기 전용이며 열린 풀 리퀘스트를 경고하는 데만 쓰입니다.

### 예전 워크플로 업데이트 {#update-workflow}

`malmoi-i18n-push-v1`을 쓰는 워크플로는 그대로 계속 동작합니다. `malmoi-i18n-push-v2`로 옮기려면 Malmoi에서 **설정**을 열고 **워크플로 파일**을 선택해 파일 전체를 복사한 뒤 `.github/workflows/malmoi-i18n.yml`을 그것으로 교체합니다. 그다음 `wrapper` 입력, 직접 지정한 `api-url`, 수정한 트리거처럼 손으로 바꿨던 부분을 다시 넣습니다. 생성된 파일에는 이것들이 없으며, `wrapper`가 빠지면 실행은 성공으로 끝나지만 코드 사용처가 더 이상 나타나지 않습니다. 버전 2는 Node 24에서 실행되므로 실행 로그에서 Node 20 지원 중단 경고가 사라집니다. 또한 버전 1이 통과시키던 일부 실행을 실패로 처리합니다. JSON이나 YAML 파일에 같은 키가 두 번 정의된 경우, `api-url`이 HTTPS가 아닌 경우, 언어 파일을 읽을 수 없는 경우가 그렇습니다.

## 실행하고 확인하기 {#first-run}

기준 브랜치에 워크플로를 커밋하면 실행이 시작됩니다. 다시 실행하려면 GitHub **Actions**를 열고 워크플로를 고른 뒤 **Run workflow**를 선택합니다. 실행 로그를 확인하세요. `applied`는 파일을 적재했고 Malmoi의 **소스**가 갱신됐다는 뜻입니다. 보내지 않은 편집이 있으면 성공한 실행도 `deferred`를 보고할 수 있습니다. 이때 갱신은 보류되며 로그에는 **보류**로 표시됩니다. [코드가 바뀌면](../sync/push.md#deferred)을 참고하세요. 실패한 실행은 로그에 이유를 보여 줍니다. Malmoi에서는 홈의 **동기화** 탭이 최근 동기화를 보여 줍니다. **마지막 동기화**에 **CI 동기화**가, **결과**에 그 결과가, **변경**에 바뀐 번역 수가 표시됩니다. **동기화 로그**에는 모든 동기화가 나열됩니다.

나중에 기준 브랜치를 바꾸려면 **설정**에서 **기준 브랜치**를 바꾸고 **저장**을 선택한 뒤 워크플로의 `branches:` 값을 고칩니다. 소스의 기준 언어를 바꿨다면 [소스 추가](sources.md#base-language)를 따라 워크플로 항목을 고칩니다.

## 다음 단계 {#next}

첫 실행이 성공하면 Malmoi가 키의 코드 사용처를 보여 줄 수 있습니다. 이후 실행이 실패해도 프로젝트는 준비된 상태로 남습니다.
