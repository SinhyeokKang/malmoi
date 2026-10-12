# MR 머지

GitLab에서 Malmoi가 만든 MR을 검토하고 머지해 번역을 리포지토리에 반영합니다.

시작하기 전에: GitLab 프로젝트에서 MR(GitLab의 *merge request*)을 머지할 권한이 있어야 합니다. MR에는 Malmoi가 생성한 번역 파일이 들어 있습니다.

## 번역 MR 머지하기 {#merging-gitlab}

Malmoi가 여는 번역 MR에는 `!128`처럼 번호가 붙습니다.

1. GitLab에서 번역 MR을 열고 변경 내용을 검토합니다.
2. 프로젝트의 머지 방식대로 머지합니다. 머지 커밋, squash, fast-forward를 모두 지원합니다.

게시할 때 MR의 내용이 더 이상 기준 브랜치와 다르지 않으면, Malmoi는 이유를 댓글로 남기고 MR을 닫은 뒤 그 브랜치를 삭제합니다.

## 루프 표시 유지 {#skip-marker}

Malmoi는 MR 제목과 Malmoi의 커밋에 `[skip-malmoi-i18n]`을 붙입니다. 제목에서 이 표시를 지우지 마세요. GitLab 프로젝트에서 머지 커밋이나 squash 커밋 메시지 템플릿을 직접 바꿨다면 템플릿에 `%{title}`을 남겨 두세요. 없으면 표시가 기준 브랜치에 남지 않아 CI 작업이 불필요하게 다시 실행됩니다.

## 다음 단계 {#next}

MR이 머지되면 리포지토리에 게시한 번역이 들어갑니다.
