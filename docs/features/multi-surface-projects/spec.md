# Multi-surface projects — Spec

구현·검증 상태는 `tasks.md` 상단 체크포인트를 따른다. 미검증 완료 조건이 남아 이 디렉터리를 유지한다.

## 0. 라운드 분할

축이 다섯이라 **두 라운드로 쪼갠다** (선례: `file-upload` spec — "떼는 근거는 크기가 아니라 축이다").

| 라운드 | 무엇 | 배포 |
|---|---|---|
| **1라운드** (이 문서의 범위) | 스키마 전환 · push 격리 · 단일 PR Publish · 편집 화면 이관과 표면 선택기 · **후보 하나짜리** Add surface | 배포 둘 (스키마 단계 A + 코드 → 단계 B + Add surface 개방) |
| **2라운드** (후속) | Checkbox 다중 후보 선택으로 표면 여럿을 한 번에 만들기 · 표면 비활성화/재활성화 UI | — |

2라운드로 미룬 것은 이 문서의 **비목표가 아니라 순서**다. 해당 절에 `[2라운드]`로 표시한다.

## 1. 사용자

- **개발자**: 같은 리포의 여러 로케일 묶음을 프로젝트 하나로 연결하고, 워크플로와 Publish PR 하나로 운영한다.
- **번역 편집자**: 어느 표면을 편집하는지 알 수 있고, 같은 리포에 속한 표면 사이를 프로젝트를 바꾸지 않고 이동한다.

둘이 상충하면 **번역 편집자를 우선한다.** 표면은 개발자가 만드는 구조이고 편집자는 그것을 매일 본다 — 화면에 개발자 어휘(경로 템플릿·adapter 이름·slug)를 상시로 세우지 않는다.

## 2. 문제

현재 `Project`가 리포 연결과 번역 표면을 동시에 뜻한다. 한 리포에 `_locales/{locale}/messages.json`과
`src/i18n/{locale}.json`이 함께 있으면 프로젝트를 둘 만들어야 한다 (실물: `bugshot-i18n-test`의 ts-dict 903키 +
`_locales` 4키, prod의 `i18n-format-check` → `format-check-code`/`format-check-yaml`). 그 결과:

- 같은 리포·설치·멤버십·push secret을 프로젝트마다 다시 관리한다.
- 같은 리포에 `malmoi-i18n/sync-<project-slug>` 브랜치와 열린 PR이 표면 수만큼 생긴다.
- 번역 편집자는 프로젝트 이름만으로 어느 표면인지 구별해야 한다.
- 프로젝트 상한 3개가 번역 표면 수에 소모된다. ⚠️ **상한은 리포 수가 아니라 OWNER의 `Project` 행 수다**
  (`lib/onboarding/create-plan.ts`) — 이 기능은 그 집계를 바꾸지 않으므로 이 근거는 "같은 리포가 상한을 두 칸
  쓴다" 이상을 주장하지 않는다.

현재 구조에서 한 프로젝트로 두 표면을 그냥 push하면 더 위험하다. push는 프로젝트에 없는 키와 로케일을
orphan 처리하므로(`lib/push/apply.ts`의 키 조회가 `where: { projectId }` 전 범위, KeyRef는 프로젝트 전체 삭제),
뒤에 도착한 표면이 먼저 적재된 표면을 사라진 것으로 판정한다. 복수 표면은 표시만 묶는 기능이 아니라 데이터
소유 경계를 `Project` 아래로 한 단계 내려야 성립한다.

## 3. 목표

`Project`를 리포·권한·Publish의 경계로 유지하고, 그 아래에 하나 이상의 독립된 번역 표면을 둔다.

- 표면마다 adapter, path template, 기준 로케일, 키, 로케일, 번역, 코드 참조와 push 상태를 독립 소유한다.
- push 하나는 명시된 표면 하나만 strict overwrite하고 다른 표면에는 영향을 주지 않는다.
- Publish 하나는 변경된 모든 표면을 결정적으로 렌더해 프로젝트의 고정 브랜치·PR 하나를 갱신한다.
- 프로젝트의 멤버십과 OWNER/EDITOR 권한은 모든 표면에 공통 적용한다.

## 4. 완료 조건

1. 새 프로젝트 생성 또는 Settings의 Add surface에서 후보 하나를 골라 표면을 추가할 수 있고, **그 표면의 첫
   적재가 실패하면 그 표면은 Project에 들어오지 않는다.** 이미 있던 표면은 그 실패에 영향받지 않는다.
   ⚠️ 한 표면 안의 **일부 파일 실패는 현행 `partial-import` 그대로**다 — 롤백이 아니라 화면에 드러낸다
   (불변식 9는 "숨기지 마라"이지 "지워라"가 아니다).
2. A 표면을 다시 push해도 B 표면의 키·로케일·번역·참조·적재 상태가 바이트와 행 단위로 변하지 않는다.
3. 두 표면의 번역을 수정한 뒤 Publish하면 `malmoi-i18n/sync-<project-slug>`의 열린 PR 하나에 두 표면의 파일이 함께 반영된다.
4. 같은 DB 상태와 같은 원본 파일에서 표면 등록 순서와 무관하게 같은 tree payload와 blob SHA가 나온다.
5. 두 표면이 같은 출력 파일을 소유하면 추가 또는 Publish 전에 fail-closed로 거부하고 어느 경로가 충돌했는지 보여준다.
6. 표면이 둘 이상인 프로젝트의 번역·로케일 화면에서 현재 표면을 확인하고 다른 표면으로 이동할 수 있다.
   **표면이 하나면 화면에 아무것도 늘지 않는다.**
7. 모든 표면을 렌더한 최종 diff가 0이면 commit·PR을 만들지 않고 `skipped`로 끝난다.
8. 기존 프로젝트는 배포 후 기존 데이터와 URL을 잃지 않고 표면 하나를 가진 프로젝트로 보인다.
9. 프로젝트 토큰이 맞아도 **없는 표면·비활성 표면·다른 프로젝트의 표면 slug**를 보낸 push는 **서로 구별할 수 없는
   409 하나**로 거부된다. ⚠️ `/api/push`에 404는 없다 — 인증은 401, 인증 뒤 불일치는 409이고 기존 409는
   `expected`를 일부러 본문에 싣지만 **표면 목록은 싣지 않는다**(그 자리가 유일한 누설 경로다).
10. `[2라운드]` 활성 표면 하나가 Publish를 막을 때 OWNER가 데이터를 지우지 않고 비활성화할 수 있고, **같은
    화면에서 되돌릴 수 있다.** 마지막 활성 표면은 비활성화할 수 없다.

## 5. 사용자 흐름

### 5.1 기존 프로젝트

기존 프로젝트는 마이그레이션이 만든 첫 표면 하나를 가진다. 기존 `/translations`·`/locales` URL은 그 표면의
새 URL로 이동한다. 프로젝트 Home·Members·Logs·Settings는 프로젝트 경로에 그대로 남는다.

### 5.2 표면 추가

OWNER가 프로젝트 Settings의 **Translation surfaces**에서 [Add surface]를 누른다. 서버가 이미 고정된 리포와
base branch를 읽어 후보를 탐지한다.

**후보 순위는 탐지기 순위 그대로다** (`lib/adapters/index.ts`의 `compareTemplates` — i18n 신호 → 예제·픽스처
감점 → 로케일 수). ⚠️ **키 수로 다시 정렬하지 않는다** — PRODUCT §7.3이 실측(bugshot-web)으로 기각한 안이고,
그러면 검색 인덱스 같은 무관한 JSON 묶음이 1순위가 된다. 키 수는 행에 **표시만** 한다(`key-count-failed`로
부재할 수 있어 정렬 키로 쓸 수 없다).

1라운드는 **후보 하나**를 고르고, 기존 Radio 행 형을 그대로 쓴다. `[2라운드]` 다중 선택은 §5.7이다.

표면 이름은 따로 받지 않는다. slug는 path template에서 로케일·와일드카드·파일명을 걷어낸 **마지막 디렉터리
조각**으로 만든다 — `_locales/{locale}/messages.json` → `_locales`, `src/i18n/{locale}.json` → `i18n`,
ts-dict 글롭 `<dir>/*.ts` → `<dir>`. 세 경우가 같은 규칙 하나로 답이 난다. 같은 slug가 있으면 `-2`, `-3` 순으로
결정적으로 붙인다.

확정 직전에 서버가 repository identity와 **기존 활성 표면의 출력 경로와의 충돌**을 다시 검증한다. 충돌하면
상대 Surface와 경로를 보여주며 생성을 막는다. 적재 예산은 **표면마다 `readFiles` 호출 하나씩 각자** 적용한다
(파일 200 · 파일당 2MB · 합계 10MB — `lib/onboarding/budget.ts`, 호출 단위다).

결과 화면은 기존 `PUSH_TOKEN`을 재사용하는 workflow step을 보여준다. 토큰을 새로 발급하지 않는다.
자동 push를 시작하려면 사용자가 그 step을 기존 workflow에 추가한다.

### 5.3 편집

표면 리소스 URL은 다음을 쓴다.

```text
/projects/:projectSlug/surfaces/:surfaceSlug/translations
/projects/:projectSlug/surfaces/:surfaceSlug/locales
```

**표면 선택기는 Translations·Locales 두 화면의 패널 머리에만 둔다.** 사이드바는 건드리지 않는다 —
DESIGN §6.5의 "스위처가 없다"는 의도된 판정이고, 셸 레이아웃은 `[slug]` params를 받지 못한다.

- **라벨은 마지막 경로 조각**(= slug의 원본: `_locales`, `i18n`)이고 **sans**다. 전체 path template은 보조 줄
  또는 tooltip으로 내린다 — DESIGN §6.7이 ②의 경로 템플릿을 sans로 고정했고 §4.1이 "같은 값이 화면마다 다른
  폰트면 그 자체가 결함"이라고 적었다.
- **표면이 하나면 선택기를 그리지 않는다.** 지금 모든 프로젝트가 표면 하나이고 화면 머리는 이미
  제목·총계·Last sent·PR·버튼으로 차 있다(DESIGN §6.1 "가장 흔한 상태가 가장 조용하다").
- 선택은 리소스 식별이므로 query string이나 브라우저 지역 상태에 두지 않는다. 목록은 라벨 알파벳순.
- **전환을 막지 않는다.** 저장은 blur 커밋이라(`components/translation-input.tsx`) "고치고 바로 다른 표면으로"가
  상시 차단되고, 셀 상태를 부모로 올리는 배선이 리포에 없으며, 지금도 필터 변경은 실패 셀을 조용히
  언마운트한다 — 같은 위험에 규칙을 둘로 늘리지 않는다.
- 전환 시 **유효하지 않은 필터만 떨어뜨린다.** `ns`는 서버가 "남은 일이 있는 첫 네임스페이스"로 다시 고르고,
  `?q=`는 표면과 무관하며 `?locales=`는 두 표면이 같은 코드를 갖는 경우가 흔하다.
- 선택기의 각 항목 옆에 **그 표면의 미발송 수**를 배지로 보인다. Publish 버튼 문구는 `Send changes (N)` 그대로다
  — N은 지금도 이미 프로젝트 전체이고(`countUnpublished`), 바뀐 것은 버튼이 아니라 화면이 표면 범위가 된 것이다.

**프로젝트 단위 화면은 링크에 표면을 실어 정확히 보낸다.** Home의 최근 활동은 그 행이 속한 표면으로, 로케일
진행률 행은 표면별로 묶어 각자 자기 표면 URL로 간다. 목록 띠의 집계 축도 같다. default로 접으면 B 표면의
편집을 누른 사람이 A 화면에 0행으로 착지한다 — PRODUCT §7.7 결정 1("번역자의 클릭 하나를 Home이 갚는다")이
거기서 뒤집힌다.

legacy URL과 표면을 모르는 진입은 저장된 `defaultSurfaceId`로 이동한다. 기본 Surface는 **생성 시 탐지 1순위**로
한 번 정하고 이후 움직이지 않는다.

### 5.4 push

대상 리포 workflow는 표면마다 action step 하나를 둔다. 각 step은 같은 `project`와 `PUSH_TOKEN`을 쓰고 서로
다른 `surface` slug를 보낸다. adapter와 base locale 명시는 현재 규칙을 그대로 따른다. 한 step 실패는 job을
실패시키며, 먼저 성공한 다른 표면을 롤백하거나 병합하지 않는다.

⚠️ **서버 스키마에서 `surfaceSlug`는 필수다.** 과도기 이중 수용을 만들지 않는다(project-onboarding
2026-09-07 결정). 기존 workflow 호환은 **`action.yml`의 `surface` 기본값 `"default"`** 하나로 얻는다 — 같은
효과를 내면서 서버가 추측하지 않고, `z.default`가 생산자 타입에서 필드를 optional로 만들어
POSTMORTEM 2026-08-31의 구멍을 다시 여는 것도 피한다.

### 5.5 Publish

Publish는 프로젝트 단위다. 변경된 표면만 모으되 렌더 순서는 surface slug의 코드포인트 순서로 고정한다.
각 출력 파일은 표면 하나만 소유해야 한다. 모든 표면을 렌더·검증한 뒤 전체 diff가 있을 때만 tree 하나와
commit 하나를 만들고 기존 프로젝트 PR을 생성하거나 갱신한다. 전체 diff가 없으면 `skipped`다.

### 5.6 `[2라운드]` 표면 비활성화와 되돌리기

OWNER는 Settings에서 마지막 하나가 아닌 활성 Surface를 비활성화할 수 있고 **같은 목록에서 되돌릴 수 있다**.
비활성화는 `archivedAt`만 기록하고 일반 UI·push·Publish에서 제외한다. ⚠️ **되돌릴 수 없게 만들지 않는다** —
PRODUCT §7.9가 프로젝트 보관에서 정확히 그 이유로 `unarchiveProject`를 두었고 같은 컬럼명을 쓴다.

확인 Dialog는 셋을 말한다: ① 데이터는 보존되고 되돌릴 수 있다 ② 대상 workflow의 그 step을 지우지 않으면 다음
CI push가 409로 job을 실패시킨다 ③ **그 표면의 미발송 편집 N건이 비활성 동안 Publish에서 빠진다**(건수를 싣는다).

기본 Surface를 비활성화하면 남은 활성 Surface 중 **탐지 1순위가 아니라 slug 알파벳순 첫 항목**으로
`defaultSurfaceId`를 같은 트랜잭션에서 바꾼다(탐지 순위는 생성 시점 값이라 나중에 재계산할 수 없다).

### 5.7 `[2라운드]` 다중 후보 선택

한 번에 표면 여럿을 만든다. Radio 자리에 Checkbox가 들어가되 **Checkbox와 텍스트 영역 button이 형제**다 —
지금 행은 Radix Radio가 그리는 `<label>`이 행 전체를 감싸서, 그대로 치환하면 "행 클릭=토글"과 "행 클릭=상세"가
충돌하고 상세를 행 버튼으로 만들면 **중첩 인터랙티브**가 된다(DESIGN §6.1이 이미 거절한 형).

- Checkbox 접근 이름 `Include {path}`, 상세 트리거 `Preview {path}`.
- 선택 배경(`bg-muted`)은 **상세 대상만** 말하고 체크는 체크박스가 말한다.
- **초기 체크는 1순위 하나뿐이다.** 전부 체크하면 `examples/` 픽스처와 검색 인덱스가 기본 적재 표면이 된다.
- 체크 해제된 행도 상세를 볼 수 있고 미리보기는 현재 상세 하나만 lazy load한다.
- 후보별 비용·합산 예산은 **표시하지 않는다.** 합산 예산이라는 것이 없고(§7), 비개발자에게 "blob 12/37"은
  아무것도 말하지 않는다.
- 표면마다 적재가 독립이므로 실패한 표면만 들어오지 않는다. 이미 있던 표면은 롤백 대상이 아니다.

## 6. 비목표

- 표면별 멤버십·OWNER/EDITOR 권한
- 표면별 push token, sync branch 또는 PR
- 여러 리포를 프로젝트 하나에 연결하기
- 서로 겹치는 표면의 키·파일을 병합하거나 우선순위로 해결하기
- 표면을 가로지르는 통합 키 목록·검색
- 활성 표면의 경로·adapter·slug 변경
- 표면 삭제와 데이터 정리
- 기존 프로젝트 둘을 프로젝트 하나로 자동 병합하기
- workflow YAML 전체를 서버가 리포에 직접 쓰기
- Publish 전 diff UI
- `repositoryId`에 unique를 걸어 리포당 프로젝트를 하나로 강제하기 (PRODUCT §10의 미결 항목으로 남긴다)

## 7. 제품 정책 변경

`docs/PRODUCT.md` §7.1의 `1 Project = 1 repository + 1 translation surface`를 다음으로 바꿔야 한다.

> 1 Project = 1 repository + N non-overlapping translation surfaces. Repository identity, membership and Publish PR
> belong to Project; format, source keys, locales and translations belong to TranslationSurface.

- **프로젝트 상한 3개는 OWNER의 `Project` 행 수를 제한한다** — 리포 수가 아니다. `repositoryId`에 unique가
  없어 같은 리포로 프로젝트를 둘 만드는 길은 그대로 열려 있고 이 기능은 그것을 닫지 않는다.
- **표면 개수 상한 = 탐지 후보 상한이다.** 탐지가 상위 5(JSON류) + 2(code-dict)로 잘리므로(`PROBE_LIMITS`)
  한 번에 검증되는 후보 모집단이 7 이하다. "상한이 없다"고 쓰지 않는다.
- **합산 예산이라는 것은 없다.** 탐지 예산(blob ≤37)은 비용이 아니라 **응답 시간** 한도이고, 적재 예산(파일
  200·2MB·10MB)은 `readFiles` **호출 하나** 기준이라 표면마다 각자 적용된다. 새 합산 함수를 만들지 않는다.
- cron 상한도 프로젝트 단위라 표면 수를 별도 프로젝트처럼 세지 않는다.
- PRODUCT §3의 "번역 편집자가 알 필요 없는 것" 목록에 있는 `pathTemplate`은 **표면이 둘 이상일 때 선택기의
  보조 줄로만** 노출된다는 단서를 단다.
