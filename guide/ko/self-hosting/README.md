# 셀프 호스팅

Linux 서버 한 대에서 Docker Compose로 Malmoi를 직접 운영할 수 있습니다. 이 장에서는 운영자를 위한 설치·운영·문제 해결 방법을 안내합니다.

## 지원 범위 {#support}

지원하는 구성은 Linux 서버 한 대의 Docker Compose입니다. 앱 인스턴스 하나, PostgreSQL 17, 업로드한 사진을 담는 볼륨, 야간 스케줄러를 HTTPS 리버스 프록시(nginx 예제 포함) 뒤 도메인 루트에 둡니다. 검증한 플랫폼은 `linux/amd64`입니다.

- 앱 릴리스 `v<x.y.z>`마다 `ghcr.io/sinhyeokkang/malmoi:v<x.y.z>` 이미지가 GHCR에 올라옵니다. 이미지 태그는 앱 태그와 같고, 워크플로 action 태그(`malmoi-i18n-push-vN`)와는 별개입니다.
- 최신 앱 릴리스만 지원하며, GitHub Issues로 문의하면 가능한 범위에서 답변합니다.
- 지원하지 않는 것: Kubernetes, 앱 인스턴스 여러 개, 고가용성, 무중단·자동 업데이트, 폐쇄망, GitHub Enterprise, GitLab Self-Managed, 비밀번호·SAML·이메일 로그인, Resend 이외의 메일 발송, mal-moi.com과 설치본 사이의 계정·프로젝트 이전, 관리 콘솔, 설치 마법사, 화이트라벨.

## mal-moi.com과 비교 {#compare}

| | mal-moi.com | 직접 운영하는 서버 |
| --- | --- | --- |
| 인프라 | 대신 운영합니다 | Docker Compose, PostgreSQL 17, 업로드 볼륨, 스케줄러, HTTPS 프록시를 갖춘 Linux 서버 한 대를 직접 운영합니다 |
| 업데이트 | 릴리스마다 자동으로 반영됩니다 | 공개된 이미지로 한 번에 한 릴리스씩 직접 업데이트합니다 |
| 데이터 위치 | Supabase(데이터베이스, 도쿄)와 Vercel(호스팅, 사진) | 내 서버의 데이터베이스와 업로드 볼륨 |
| 로그인과 메일 | GitHub·GitLab·Google 로그인, Resend로 보내는 초대 메일 | GitHub·GitLab·Google 로그인 중 하나 이상을 직접 등록한 OAuth 앱으로 씁니다. Resend 도메인과, GitHub 리포지토리를 쓰면 GitHub App도 직접 등록합니다 |
| 한도 | 한 사람이 소유한 활성 프로젝트 3개 | 같습니다. `OPERATOR_EMAILS`에 등록한 사람은 예외입니다 |
| 지원 | GitHub Issues | 최신 릴리스에 한해 GitHub Issues에서 가능한 범위로 답변 |
| 비용 | 무료 | 소프트웨어는 무료이고 서버·도메인·Resend 요금은 직접 부담합니다 |
| 개인정보 처리방침 | Malmoi의 방침 | 내 방침 — `/privacy`가 그쪽으로 이동합니다 |
| 검색 엔진과 방문 집계 | 공개 페이지가 색인되고 쿠키 없는 페이지뷰를 셉니다 | 모든 페이지에 `noindex`를 붙이고 페이지뷰를 세지 않습니다 |

- 가입은 양쪽 모두 열려 있습니다. 켜 둔 로그인 공급자(GitHub·GitLab·Google)가 확인한 이메일 주소가 있으면 누구나 로그인해 초대 없이 프로젝트를 만들 수 있습니다. 앱에는 가입을 막는 기능이 없고, 프로젝트에는 멤버로 등록된 사람만 접근할 수 있습니다.
- 설치본이 생성하는 CI 파일에는 내 주소가 항상 들어 있습니다. GitHub Actions는 `api-url`, GitLab CI는 `MALMOI_I18N_API_URL`입니다. 지우지 마세요. 이 줄이 없으면 워크플로가 프로젝트의 푸시 토큰을 mal-moi.com으로 보냅니다.
- 야간 동기화는 양쪽 모두 18:00 UTC에 실행됩니다. 내 서버에서는 스케줄러 컨테이너가 실행합니다.
- `/changelog`의 Latest 배지는 상류의 최신 릴리스를 가리키므로 설치본보다 새 버전일 수 있습니다. 설치본의 버전은 `MALMOI_IMAGE`의 태그입니다.

## 설치 전 준비 {#requirements}

- Docker Engine과 Compose 플러그인이 설치된 Linux 서버.
- 루트 경로 전체를 Malmoi에 사용할 도메인(하위 경로 불가). A 또는 AAAA 레코드가 서버를 가리키고 80·443 포트가 열려 있어야 합니다.
- 공개 인증 기관이 발급한 인증서. GitHub Actions 러너는 자체 서명 인증서와 사설 CA 인증서를 거부합니다.
- GitHub Actions나 GitLab CI 러너에서 접근할 수 있는 주소. 대상 리포지토리의 CI가 그 러너에서 `MALMOI_ORIGIN`으로 업데이트를 보내므로, 서버 앞에 IP 허용 목록·방화벽·VPN을 두면 업데이트가 모두 실패합니다.
- 다른 사이트에 둔 내 개인정보 처리방침 페이지. 설치본이 저장하는 항목은 [개인정보 처리방침 작성 자료](troubleshooting.md#privacy)에 있습니다.

GitHub 리포지토리의 워크플로는 `SinhyeokKang/malmoi`의 상류 action 태그 `malmoi-i18n-push-v3`를 실행하고, 그 단계에 프로젝트의 `PUSH_TOKEN`과 `GITHUB_TOKEN`이 들어갑니다. 이 태그가 가리키는 커밋은 설치한 버전과 상관없이 바뀔 수 있습니다. 받아들일 수 없다면 상류 리포지토리를 포크해 `uses:`를 포크의 커밋 SHA로 고정하세요.

GitLab CI 작업은 상류 태그 `malmoi-i18n-push-gitlab-v1`을 받고, 해당 커밋이 생성된 설정의 `MALMOI_I18N_PUSH_SHA`와 같은지 확인한 뒤 `PUSH_TOKEN`으로 적재 스크립트를 실행합니다. SHA 검사를 유지하세요. `PUSH_TOKEN`은 보호·마스킹된 CI 변수로 저장하고 기준 브랜치를 보호하세요. 러너는 스크립트를 받을 GitHub와 업데이트를 보낼 설치본에 모두 접근할 수 있어야 합니다.
