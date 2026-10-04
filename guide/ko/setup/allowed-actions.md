# action 허용

리포지토리나 조직이 GitHub Actions를 제한한다면, 생성된 워크플로가 쓰는 action 네 개를 허용합니다.

시작하기 전에: 리포지토리 또는 조직의 **Settings**를 열고 **Actions** → **General**로 갑니다.

## 필요한 action 허용 {#allowed-actions}

1. **Allow *OWNER*, and select non-*OWNER*, actions and reusable workflows**를 선택합니다. GitHub는 OWNER 자리에 계정 또는 조직 이름을 표시합니다. 아래의 쉼표로 구분한 패턴 네 개를 추가합니다.

   ```text
   SinhyeokKang/malmoi/.github/actions/malmoi-i18n-push@*, actions/checkout@*, pnpm/action-setup@*, actions/setup-node@*
   ```

2. 정책을 저장하고 워크플로를 다시 실행합니다.

![select-actions 옵션을 고르고 패턴 네 개를 입력한 GitHub Actions 권한 화면](/guide/actions-policy.webp "select-actions 옵션을 고르고 패턴 네 개를 입력한 뒤 저장합니다.")

action이 차단되면 실행이 **Set up job**에서 “not allowed to be used.”와 함께 멈춥니다. push 토큰으로는 이 GitHub 정책을 바꿀 수 없습니다.

## 다음 단계 {#next}

action 네 개가 모두 허용되면 워크플로가 리포지토리를 읽을 수 있습니다. 그래도 실행이 실패하면 GitHub Actions 로그에서 이유를 확인합니다.
