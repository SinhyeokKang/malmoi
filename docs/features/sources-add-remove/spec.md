# sources-add-remove — spec

> **시안(SoT, dev 반영 전까지)**: [Sources Add Remove.dc.html](https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=Sources+Add+Remove.dc.html) — 2026-10-05 수령. 프레임 A1–A8 · R1–R9 · L1.
>
> 초안(2026-10-05, feature-review 반영). 로컬 dev 점유가 풀리면 `docs/features/sources-add-remove/`로 옮긴다. 하나의 `/orchestrate`에 태우고, 그 안에서 A·B를 배치로 나눠도 된다.
>
> **범위 게이트** — §4.2 비범위에는 걸리지 않는다. 다만 정본 판정 넷을 바꾼다(사용자 확정 2026-10-05):
> - PRODUCT §7.1 "표면 보관·복원은 다음 라운드" → **제거·재추가**
> - ARCHITECTURE §0 · PRODUCT §3·§4.1 · CLAUDE.md 코어 원칙 "편집을 버리는 길은 OWNER 전용 둘" → **셋**(제거된 소스를 다시 추가하는 적재)
> - PRODUCT §3 `project:settings` 권한 열거 → **소스 제거** 추가
> - PRODUCT §7.8 "없는·비활성 표면은 모두 같은 409 `surface mismatch`" → **제거된 소스는 `surface removed`로 구분**(노출: 프로젝트 push 토큰 보유자에게 그 slug가 있었다는 사실뿐)

## 사용자

- **OWNER(개발자)** — 소스 추가·제거는 `project:settings`. EDITOR에게는 제거 버튼이 없고 서버도 거부한다.

## 문제 (관측)

1. **기준 언어가 보이지 않은 채 확정된다.** Add sources 모달의 기준 언어 셀렉트는 하나이고 **포커스한 후보**에만 묶인다(`components/sources/add-sources-modal.tsx:158`). 여러 후보를 체크만 하면 나머지는 `pickBaseLocale` 기본값이 한 번도 화면에 안 보이고 제출된다 — PRODUCT §7.3 "후보와 base locale을 확인하기 전에는 확정하지 않는다" 위반.
2. **소스를 뺄 길이 없다.** 쓰기 경로가 0이다(`prisma/schema.prisma:118-121` 주석). 관리하지 않게 된 소스도 Sources 목록·Publish·자동 적재에 남는다. (실측된 피해 사례는 아직 없다 — 요구로 받는다.)
3. **재추가가 고아를 만든다(잠재).** 지금 코드로 보관 표면과 같은 경로를 추가하면, 경로 소유 판정은 보관 행을 빼고(`lib/surfaces/create.ts:62-63`) slug 계획은 포함해(`:59·66`) `-2` 새 행이 생긴다 — 옛 행의 키·번역·이력이 분리된다.

## 완료 조건

### A. 소스 추가 — 기준 언어 2단계
- A1. Add sources 모달이 2단계다. ① 소스 선택(현행 `FilesStep`) → ② 소스별 기준 언어 → [Add selected sources].
- A2. ①에서 **새로** 체크한 소스가 0개면 [Next]가 `aria-disabled`이고 보이는 사유가 선다(기존 `selectHelp`·`blocked.*` 사전 재사용). 기존 소스는 지금처럼 체크·잠금이다.
- A3. ②는 ①에서 **새로 체크한** 소스 전부(잠긴 기존 소스 제외)를 블록으로 보이고 각 블록에 기준 언어 컨트롤이 있다. 기본값은 후보의 `baseLocale`.
- A4. ②의 소스 블록은 신규 프로젝트 ③(`NamingStep`)과 **같은 컴포넌트**다(손 사본 0). 소스가 1개여도 경로 줄이 있는 같은 형이다.
- A5. ②에서 [Back]하면 ①의 체크·포커스·미리보기 언어·기준 언어 선택이 보존된다. A→B→A 전환과 늦은 미리보기 응답 역전에도 보존된다.
- A6. ①의 하단 공통 기준 언어 셀렉트가 없다. 수동 경로 [Check files] 줄은 남는다.
- A7. 추가 실패(거부·충돌·`unknown`) 시 ②에 머물고 선택이 보존된다(현행 "Nothing was added. Your selection is still here." 계약). 경로 충돌 문장은 [Back]으로 고치라고 안내한다.

### B. 소스 제거
- B1. 소스 상세 모달의 **바닥 왼쪽**에 OWNER 전용 [Remove source](danger)가 있다. 그 자리의 기존 안내 문구(`notice` — `readOnlyNote`·Open 꺼짐 사유·진행 중 문장)는 없앤다. Open translations의 꺼짐 사유는 sr-only `describedby`로 남고, 보이는 글자는 Status·Languages 카드가 든다.
- B2. [Remove source]는 확인 창을 거친다. 확인 창은 대상을 **slug**로 부르고 다음을 하나의 Alert에 담는다: 미전달 편집 n건이 사라진다(n>0일 때만) · 열린 PR이 이 소스 파일을 바꿨다면 그 변경은 다음 Publish에서 빠진다(프로젝트에 열린 Malmoi PR이 있을 때만) · 워크플로에서 이 소스의 step을 지우지 않으면 다음 실행이 실패하고 **뒤 step의 다른 소스도 적재되지 않는다**(**항상** — 앱은 워크플로 등록 여부를 알 수 없다, PRODUCT §7.1). 리포 파일은 바뀌지 않는다는 문장은 항상 보인다.
- B3. 제거된 소스는 Sources 목록·셸 소스 전환·Home·Inbox·검색·Publish·야간 적재에서 사라진다. "보관됨"·Restore UI는 없다. 제거된 소스의 URL은 `notFound()`다(현행).
- B4. 제거된 소스의 경로는 Add sources ①에서 **체크 가능한 일반 후보**다.
- B5. **마지막 남은 활성 소스는 제거할 수 없다** — 버튼 `aria-disabled` + 보이는 사유, 서버 `last-source`. 사전 차단과 서버 거부가 같은 문장 함수를 지난다.
- B6. 같은 `pathTemplate` + 같은 어댑터로 재추가하면 그 보관 행이 되살아난다(`id`·`slug`·이력 유지). 첫 적재는 strict다. 화면에서는 새 추가와 구별되지 않는다.
- B7. 같은 경로 + 다른 어댑터로 재추가하면 새 행이 생긴다(slug 접미사). 성공 배너가 워크플로 갱신을 안내한다(현행 `m.sources.workflow`).
- B8. 미전달 편집이 있어도 제거할 수 있다. 제거는 번역을 건드리지 않는다. 그 편집은 **다시 추가할 때의 첫 적재가** 리포 값으로 덮어 버린다(그 소스의 토큰 전부를 승인 — 수동 Sync와 같은 장치). 리포에 값이 없는 칸은 미전달로 남는다.
- B9. 미전달 편집이 있으면 제거 실행에 **대상 소스에만 묶인 서버 발급 승인 지문**이 필요하다. 확인 창을 열 때 받고, 낡으면 `stale-approval`(아무것도 제거되지 않음).
- B10. 기본 소스를 제거하면 같은 트랜잭션에서 기본이 남은 활성 소스 중 **slug 오름차순 첫 번째**로 옮겨진다. 화면 안내는 없다.
- B11. 대상 리포 CI가 제거된 소스로 `/api/push`·`/api/push/failure`를 보내면 적재하지 않고 `409 surface removed`를 돌려주며 Logs에 거부로 남는다. 제거와 push가 경합해도 응답은 `surface removed`다(프로젝트 보관 `archived`와 섞이지 않는다).
- B12. 제거는 리포 파일을 건드리지 않는다. Publish는 활성 소스만 렌더하므로, 열린 PR에 있던 이 소스의 변경은 다음 Publish에서 빠진다(B2가 알린다).
- B13. MCP `remove_source`가 웹과 같은 코어를 쓴다(OWNER). 미전달 편집이 있으면 미리보기 → 실행 두 도구 형으로 지문을 주고받는다(수동 Sync 도구와 같은 형).
- B14. 제거가 `ProjectEvent`(`kind: SURFACE`, `subtype: "surface.removed"`)로 상태 변경과 같은 트랜잭션에 남고, Logs가 "removed" 문장으로 그린다. 되살림은 기존 추가 사건과 같다.
- B15. Logs의 소스 필터에 제거된 소스도 **"(removed)" 표시**로 남는다. 제거된 소스 행은 링크가 없다.
- B16. 프로젝트가 보관 상태면 제거도 `archived`로 거부된다(PRODUCT §7.9 "보관 = Restore만"). 첫 적재가 진행 중인 소스는 제거가 `importing`으로 거부된다.

## 비목표

- 리포 파일 삭제, 제거된 소스 목록·복원 화면(재추가가 유일한 복원 길), 하드 삭제·보존 기간.
- 목록 행의 인라인 Remove·⋯ 메뉴.
- "기본 소스" 개념의 화면 노출.
- ②에서 소스 이름·slug 편집. 추가 뒤 기준 언어 변경은 현행 상세 모달.
