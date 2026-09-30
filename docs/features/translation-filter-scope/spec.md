# translation-filter-scope — spec

## 사용자

**번역 편집자(비개발자 동료)**. 소스(표면)가 둘 이상인 프로젝트에서 "화면에 보이는 문구"로 키를 찾는 사람이다.
개발자는 키 이름을 알아 트리로 바로 가므로 이 변경의 이득이 작고, 잃는 것도 없다(`This source`는 여전히 한 번에 고를 수 있다).

## 문제 (관측)

- 소스 A·B·C가 있을 때 번역 화면에 처음 들어오면 A(프로젝트 기본 표면)가 선택되고, 범위가 **보이지 않게** `This source`로 좁혀져 있다
  (`DEFAULT_TRANSLATION_QUERY.scope = "source"`, `FilterMenu`의 `on`은 `scope !== "source"`일 때만 켜진다).
- 이 상태에서 C에만 있는 값을 검색하면 **0건**(`No keys match "<q>"`)이고, 빈 상태의 버튼은 `Clear search` 하나다. 범위를 넓히라는 안내가 없다
  — `messages/en.tsx`의 `searchAll: "Search all sources"`는 정의만 있고 쓰는 곳이 없다.
- 트리 클릭이 범위 필터를 **덮어쓴다**(`treeQuery` → `This source`/`This namespace`). `All sources`로 넓혀 둔 상태도 트리를 누르면 조용히 좁혀진다.
  트리가 "위치"와 "필터" 두 역할을 겸해서, 사용자가 필터를 건드린 적이 없어도 쿼리 조건이 걸린다.

## 모델 (사용자 확정, 2026-09-30)

**필터는 단방향이다.** 필터 콤보박스(Completion · State · Scope)와 검색을 사용자가 직접 조작할 때만 조회 조건이 붙는다.

- 트리·키 선택은 **위치**다 — 필터 값을 바꾸지 않는다.
- 필터가 켜지면 트리와 키 목록에 **반영**된다 — 조건에 맞지 않는 소스·네임스페이스·키는 **숨긴다**.
- 필터가 모두 꺼진 상태(= 최초 진입, `Clear filters` 뒤)의 조회 범위는 **프로젝트 전체(`All sources`)**다.

## 완료 조건 (검증 가능한 문장)

1. 최초 진입(쿼리 없음)의 목록은 프로젝트의 **모든 활성 소스**의 활성 키를 담고, Scope 트리거는 `All sources`에 꺼진 표시(`on=false`)다.
2. 소스 A 경로에서 C에만 있는 번역값을 검색하면 C의 키가 결과에 나온다(필터 조작 없이).
3. 트리의 소스·네임스페이스를 눌러도 URL의 `scope`·`completion`·`state`·`q`가 **바뀌지 않는다**.
4. 트리 클릭은 현재 조건의 목록에서 **그 위치(소스·네임스페이스)의 첫 키**를 선택하고, 그 행이 보이게 스크롤된다.
11. 화면 목록은 **조건에 맞는 키 전부를 한 번에** 싣는다 — `Show more keys`·`Back to top` 같은 추가 조회 버튼이 없고, 목록 배지 수 = 행 수다.
5. 조건(Completion·State·Scope·검색) 중 하나라도 켜지면 트리는 **일치 키가 1개 이상인 소스·네임스페이스만** 보인다.
6. `Clear filters`는 Scope를 `All sources`로 되돌린다(완성도·상태도 기존처럼). 검색어·트리 위치·상세 언어·선택 키는 남는다.
7. `scope`가 없는 옛 링크는 `All sources`로 열린다. `scope=source`·`scope=namespace`는 그대로 그 범위로 열린다.
8. 검색 결과 0건이면서 Scope가 `All sources`가 아니면 빈 상태에 `Search all sources` 버튼이 서고, 누르면 Scope만 `All sources`로 바뀐다.
9. Logs의 `Open this translation`과 상세의 링크 복사는 **필터를 켜지 않은 채** 그 키를 선택한 주소를 만든다.
10. 전 소스 전량 로드의 첫 화면 쿼리 시간이 `translation-list-performance.integration.ts` fixture에서 ARCHITECTURE §1.96의 `All sources` 실측(389ms)
    대비 회귀하지 않는다(±20%). 같은 fixture에서 응답 크기·렌더 시간·Save 재검증 시간을 기록한다.

## 비목표

- **정렬 변경 없음** — `Incomplete first` 하나를 유지한다(ARCHITECTURE §1.96).
- **MCP `list_keys`의 cursor 페이징은 그대로** — 외부 계약이다(design §3.1).
- **키 선택이 트리 위치를 옮기지 않는다** — `All sources`에서 다른 소스의 키를 눌러도 트리 강조는 경로 소스에 남는다(다음 단계 후보).
- `This namespace` 옵션의 비활성화(트리 위치가 `All namespaces`일 때) — 지금처럼 소스 전체로 처리한다.
- 가상 스크롤 도입 없음(CLAUDE.md 스택 — 근거는 ARCHITECTURE §1.95).
