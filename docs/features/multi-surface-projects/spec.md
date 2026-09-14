# Multi-surface projects — Spec

## 1. 사용자

- **개발자**: 같은 리포의 여러 로케일 묶음을 프로젝트 하나로 연결하고, 워크플로와 Publish PR 하나로 운영한다.
- **번역 편집자**: 어느 표면을 편집하는지 알 수 있고, 같은 리포에 속한 표면 사이를 프로젝트를 바꾸지 않고 이동한다.

## 2. 문제

현재 `Project`가 리포 연결과 번역 표면을 동시에 뜻한다. 한 리포에 `_locales/{locale}/messages.json`과
`src/i18n/{locale}.json`이 함께 있으면 프로젝트를 둘 만들어야 한다. 그 결과:

- 같은 리포·설치·멤버십·push secret을 프로젝트마다 다시 관리한다.
- 같은 리포에 `l10n/sync-<project-slug>` 브랜치와 열린 PR이 표면 수만큼 생긴다.
- 번역 편집자는 프로젝트 이름만으로 어느 표면인지 구별해야 한다.
- 프로젝트 상한 3개가 리포 수가 아니라 번역 표면 수에 소모된다.

현재 구조에서 한 프로젝트로 두 표면을 그냥 push하면 더 위험하다. push는 프로젝트에 없는 키와 로케일을
orphan 처리하므로, 뒤에 도착한 표면이 먼저 적재된 표면을 사라진 것으로 판정한다. 복수 표면은 표시만 묶는
기능이 아니라 데이터 소유 경계를 `Project` 아래로 한 단계 내려야 성립한다.

## 3. 목표

`Project`를 리포·권한·Publish의 경계로 유지하고, 그 아래에 하나 이상의 독립된 번역 표면을 둔다.

- 표면마다 adapter, path template, 기준 로케일, 키, 로케일, 번역, 코드 참조와 push 상태를 독립 소유한다.
- push 하나는 명시된 표면 하나만 strict overwrite하고 다른 표면에는 영향을 주지 않는다.
- Publish 하나는 변경된 모든 표면을 결정적으로 렌더해 프로젝트의 고정 브랜치·PR 하나를 갱신한다.
- 프로젝트의 멤버십과 OWNER/EDITOR 권한은 모든 표면에 공통 적용한다.

## 4. 완료 조건

1. 새 프로젝트 생성 또는 Settings의 Add surface에서 경로가 겹치지 않는 후보 여러 개를 체크하고, 선택한 표면을 원자적으로 최초 적재할 수 있다.
2. A 표면을 다시 push해도 B 표면의 키·로케일·번역·참조·적재 상태가 바이트와 행 단위로 변하지 않는다.
3. 두 표면의 번역을 수정한 뒤 Publish하면 `l10n/sync-<project-slug>`의 열린 PR 하나에 두 표면의 파일이 함께 반영된다.
4. 같은 DB 상태와 같은 원본 파일에서 표면 등록 순서와 무관하게 같은 tree payload와 blob SHA가 나온다.
5. 두 표면이 같은 출력 파일을 소유하면 추가 또는 Publish 전에 fail-closed로 거부하고 어느 경로가 충돌했는지 보여준다.
6. 번역·로케일 화면에서 현재 표면의 path template을 확인하고 같은 프로젝트의 다른 표면으로 이동할 수 있다.
7. 모든 표면을 렌더한 최종 diff가 0이면 commit·PR을 만들지 않고 `skipped`로 끝난다.
8. 기존 프로젝트는 배포 후 기존 데이터와 URL을 잃지 않고 표면 하나를 가진 프로젝트로 보인다.
9. 프로젝트 토큰이 맞아도 존재하지 않거나 다른 프로젝트의 표면 slug를 보낸 push는 401/404로 표면 존재를 누설하지 않고 거부된다.
10. 활성 표면 하나가 Publish를 막을 때 OWNER가 데이터를 지우지 않고 비활성화할 수 있으며, 마지막 활성 표면은 비활성화할 수 없다.

## 5. 사용자 흐름

### 5.1 기존 프로젝트

기존 프로젝트는 마이그레이션이 만든 첫 표면 하나를 가진다. 기존 `/translations`·`/locales` URL은 그 표면의
새 URL로 이동한다. 프로젝트 Home·Members·Logs·Settings는 프로젝트 경로에 그대로 남는다.

### 5.2 표면 추가

OWNER가 프로젝트 Settings의 **Translation surfaces**에서 [Add surface]를 누른다. 서버가 이미 고정된 리포와
base branch를 읽어 후보를 탐지한다. 후보는 키 수 내림차순, 동률이면 path template 알파벳순으로 놓고 처음에는
전부 체크한다. Radio가 있던 자리는 Checkbox로 바꾸되 행의 모양은 유지한다. Checkbox는 생성 포함 여부만
바꾸고, 행 선택은 체크 상태와 독립적으로 우측 키 미리보기의 대상을 바꾼다. 체크하지 않은 후보도 상세를 볼 수
있으며 미리보기는 현재 행만 lazy load한다.

표면 이름은 따로 받지 않는다. UI 라벨은 path template이고, slug는 path template의 마지막 의미 있는 경로
조각에서 자동 생성한다. 같은 slug가 있으면 `-2`, `-3` 순으로 결정적으로 붙인다. 저장 전에 체크된 후보 전체와
기존 활성 표면의 출력 경로를 서버가 다시 검증한다. 충돌하면 자동 해제하지 않고 해당 후보 행에 상대 Surface와
경로를 보여주며 생성을 막는다.

목록에는 후보별 비용과 체크된 합계를 보여준다. 확정하면 서버가 체크된 전체 후보를 글로벌 탐지·적재 예산 하나로
다시 검증한다. 합산 예산 초과나 한 후보의
일부 파일 실패를 포함해 하나라도 실패하면 Project·Surface·자식 데이터를 전부 롤백한다. 현재 화면에서는 입력과
오류를 유지하고, 새로고침 뒤에는 draft를 복원하지 않고 다시 탐지한다. 성공하면 선택한 Surface 전부가 원자적으로
들어온다. 결과 화면은 기존 `PUSH_TOKEN`을 재사용하는 workflow step들을 보여준다. 토큰을 새로 발급하지 않는다.
자동 push를 시작하려면 사용자가 그 step들을 기존 workflow에 추가한다.

### 5.3 편집

표면 리소스 URL은 다음을 쓴다.

```text
/projects/:projectSlug/surfaces/:surfaceSlug/translations
/projects/:projectSlug/surfaces/:surfaceSlug/locales
```

표면 선택기는 Translations·Locales 두 surface-scoped 화면의 프로젝트 구역에만 둔다. 선택은 리소스
식별이므로 query string이나 브라우저 지역 상태에 두지 않는다. 표면이 하나여도 현재 path template은 보여 주되
이동 목록은 접힌다. 생성 뒤 목록은 path template 알파벳순으로 고정한다. Surface를 바꾸면 기존 query filter를
초기화하고, 저장 중이거나 실패한 셀이 있으면 전환을 막아 현재 셀의 Retry 흐름을 유지한다.

프로젝트 단위 화면의 Translations·Locales 링크와 legacy URL은 저장된 `defaultSurfaceId`로 이동한다. 생성 시 키가
가장 많은 후보를 기본 Surface로 한 번 정하고, 동률이면 slug 알파벳순을 쓴다. 이후 키 수가 바뀌어도 기본값은
움직이지 않는다.

### 5.4 push

대상 리포 workflow는 표면마다 action step 하나를 둔다. 각 step은 같은 `project`와 `PUSH_TOKEN`을 쓰고 서로
다른 `surface` slug를 보낸다. adapter와 base locale 명시는 현재 규칙을 그대로 따른다. 한 step 실패는 job을
실패시키며, 먼저 성공한 다른 표면을 롤백하거나 병합하지 않는다.

### 5.5 Publish

Publish는 프로젝트 단위다. 변경된 표면만 모으되 렌더 순서는 surface slug의 코드포인트 순서로 고정한다.
각 출력 파일은 표면 하나만 소유해야 한다. 모든 표면을 렌더·검증한 뒤 전체 diff가 있을 때만 tree 하나와
commit 하나를 만들고 기존 프로젝트 PR을 생성하거나 갱신한다. 전체 diff가 없으면 `skipped`다. Translations
화면의 Publish 버튼과 미발송 수는 현재 Surface가 아니라 활성 Surface 전체를 합산하며, 버튼도 `Publish all`로
범위를 드러낸다.

### 5.6 표면 비활성화

OWNER는 Settings에서 마지막 하나가 아닌 활성 Surface를 비활성화할 수 있다. 확인 Dialog는 데이터가 보존되고
대상 workflow step을 직접 제거해야 한다고 알린다. 비활성 Surface는 일반 UI·push·Publish에서 모두 제외하고,
이번 범위에는 재활성화 UI를 만들지 않는다. 기본 Surface를 비활성화하면 남은 활성 Surface 중 키가 가장 많은
항목을 새 기본값으로 같은 트랜잭션에서 저장하며, 동률이면 slug 알파벳순을 쓴다.

## 6. 비목표

- 표면별 멤버십·OWNER/EDITOR 권한
- 표면별 push token, sync branch 또는 PR
- 여러 리포를 프로젝트 하나에 연결하기
- 서로 겹치는 표면의 키·파일을 병합하거나 우선순위로 해결하기
- 표면을 가로지르는 통합 키 목록·검색·진행률
- 활성 표면의 경로·adapter 변경
- 표면 삭제·데이터 정리·재활성화 UI
- 기존 프로젝트 둘을 프로젝트 하나로 자동 병합하기
- workflow YAML 전체를 서버가 리포에 직접 쓰기
- Publish 전 diff UI. 후속 설계의 데이터 위계는 Surface → Namespace → Key → Locale로 고정하고 namespace가
  없는 키는 `Ungrouped`로 묶는다.

## 7. 제품 정책 변경

`docs/PRODUCT.md` §7.1의 `1 Project = 1 repository + 1 translation surface`를 다음으로 바꿔야 한다.

> 1 Project = 1 repository + N non-overlapping translation surfaces. Repository identity, membership and Publish PR
> belong to Project; format, source keys, locales and translations belong to TranslationSurface.

프로젝트 상한 3개는 계속 리포 연결 수를 제한한다. 표면 개수 상한은 두지 않고 후보 전체가 기존 글로벌 탐지·적재
예산을 공유한다. 예산 초과가 반복해서 관측되면 후속으로 글로벌 상한을 올린다. cron 상한도 프로젝트 단위라
표면 수를 별도 프로젝트처럼 세지 않는다.
