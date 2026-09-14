# tasks — multi-surface projects, 2라운드 (다중 후보 선택)

**2026-09-14 리뷰 확정: 생성과 첫 적재는 All-or-Nothing이다.** 일부 파일 실패도 전체 거부하며,
GitHub 읽기·파싱은 DB 트랜잭션 밖, 프로젝트 생성·모든 표면 적재는 같은 트랜잭션 안에서 처리한다.
이 목록은 이전 T1~T3의 표면별 가드·독립 적재 계획을 대체한다.

**스키마 변경 0건이라 `/db`를 지나지 않는다.** 마이그레이션·환경변수 추가도 없다.
새 순수 판정 테스트 → 원자적 저장 → Action과 호출부의 동시 전환 → 다중 선택 UI 순서다.

## 구현 인계 상태 (2026-09-14, Codex → 지정 Claude Code 터미널)

- 구현 커밋: `ebd5eae`(T1~T3 원자적 생성) · `4d021e1`(T4~T9 다중 선택).
- 테스트 선행 커밋: `1a4ab8b` · `6601f19` · `a9bc8c3`. 각 계약의 red를 확인한 뒤 구현했다.
- 자동 검증: 전체 3,685건 통과 후 추가 DOM 케이스 포함 해당 2파일 60건 통과. 타입 검사 통과.
  격리 PostgreSQL 46건 통과(둘째 표면·마지막 쓰기·30초 timeout 롤백, 별도 연결 부분 가시성,
  동시 OWNER 한도·slug 충돌). 접근 이름·role 뮤테이션 5건 모두 red 후 복원했다.
- 수동 포맷의 기존 YAML을 보존하기 위해 생성 입력에 선택적 `manual: boolean` 메타데이터를 추가했다.
  이 값은 어댑터·기준 언어를 YAML에 고정할지만 정한다. 서버 경로·포맷 재검증은 항상 동일하다.
- T10: PRODUCT·ARCHITECTURE·DESIGN·DIRECTORY 갱신. **CLAUDE.md의 프리미티브 19→20,
  Radix 넷→다섯과 `pnpm sync:agents`는 Claude Code 담당으로 남긴다.**
- **T11 실물 검증·시간 계측·build·push 게이트는 아직 실행하지 않았다.** 사용자 지정 터미널
  `term_79165e31-5fa4-4189-982a-60a752cd7add`에서 검증하고 마무리한다.
  dev/prod DB와 외부 리포에 쓰지 않았고 브라우저 QA 프로젝트도 생성하지 않았다.
- 시안 대조: 해당 없음(새 행 형의 핸드오프 부재, 아래 사용자 확정). 시안 일치 판정이 아니다.
- 알려진 후속 확인 후보: 기존 Add surface의 fieldset 안 FilesStep Select는 직접 disabled가 없다.
  신규 생성의 Portal 입력 잠금 회귀는 수정·기록했고 기존 Add surface는 이번 범위 밖이다.

## T1. 전체 적재 준비의 거부 조건 — `/tdd interface`

`lib/onboarding/ingest.ts`의 기존 `prepareFirstSnapshot`을 사용한다. 신규 생성의 준비 단계는
모든 표면에서 `payload !== null && result.failed === 0`일 때만 저장을 허용한다.
`assemblePushInput`·`buildPushPayload`·예산 검사 등 기존 계약을 우회하지 않는다.

**검증**: 한 표면의 0키 / 파싱 오류 / 다운로드 누락 / 중복 키만 있는 실패 / 예산 초과가 각각 생성 거부를
만든다. 서로 다른 베이스 언어의 두 표면은 각 선택을 payload에 보존한다. 기존 Add surface·첫 적재의
부분 실패 허용 테스트는 유지한다. `pnpm test` green.

## T2. 프로젝트 생성·전체 적재의 단일 트랜잭션

기존 생성 경로의 User 잠금·OWNER 한도 재집계·Project 명시적 id를 유지한다.
준비한 payload로 Project·OWNER·Surface·기본 포인터를 만들고 `applyPushInTransaction`을 표면마다 호출한다.
GitHub 읽기·파싱은 진입 전에 끝낸다. callback 내부에서 실패를 정상 결과로 바꾸지 않는다.

**검증**: 실제 PostgreSQL에서 둘째 표면의 쓰기를 실패시키고 Project·Member·Surface·Locale·StringKey·
Translation·refs·토큰 해시가 모두 남지 않는지 확인한다. 마지막 쓰기 실패·트랜잭션 타임아웃도 같은 조건이다.
성공 시 모든 표면의 베이스 언어·키·번역·SHA·기본 포인터가 일치하고, 별도 연결에 부분 프로젝트가 보이지 않는다.
동시 생성의 프로젝트 한도와 slug 충돌도 기존 동작을 보존한다. `pnpm test:projects:postgres` green.

## T3. `createProject`와 단일 표면 모달을 함께 전환

`app/(edit)/projects/actions.ts`에서 표면 배열을 받고 **한 번의 snapshot**으로 T1 준비 후 T2를 실행한다.
서버 확정 포맷으로 성공 YAML을 준비하고 커밋 뒤에만 결과·토큰을 반환한다(design §4).
실패는 경로·사유·실패 수를 담고, 모달은 ③에 입력을 유지한다.

`components/onboarding/new-project.tsx`의 기존 단일 후보도 `surfaces: [format]`으로 보내도록 같은 커밋에서
바꾼다. 성공 반환 소비자와 `steps/result.tsx`도 함께 전환하고 **생성 뒤 `runFirstIngest` 호출을 제거**한다.
③에서 처리 완료를 기다리고 ④는 성공만 표시한다. 기존 Settings의 `runFirstIngest` 호출은 유지한다.
네트워크 오류·응답 유실은 생성 거부와 구별하고 자동 재제출하지 않는다.

**검증**: 실제 생성 Action의 snapshot 호출 1회 / 준비 실패 시 DB 쓰기 0회 / 모든 표면이 같은 SHA 사용 /
모달이 완료 전 ④로 이동하지 않음 / 성공 뒤 별도 적재 Action 호출 0회 / 확인된 거부 시 입력 유지 /
커밋 후 응답 유실 시 “아무것도 생성되지 않았다”를 표시하지 않음. 단일 표면의 성공 YAML 회귀 검사 포함.
`pnpm typecheck` + `pnpm test` + `pnpm test:projects:postgres` green.

> **커밋 경계 ①** — `feat(onboarding): create projects with all initial imports atomically`
> Action 입력·반환과 단일 표면 모달 소비자를 함께 변경한다. 중간 타입 오류 상태로 커밋하지 않는다.

---

## T4. 선택 판정 — `/tdd interface`

`planSurfaceSelection(candidates, checked, baseLocales)` — `lib/onboarding/select-surfaces.ts`(신설, **잎**).
`{ formats, defaultIndex, conflicts }`를 낸다. slug는 `planSurfaceSlug`를 누적 호출해 충돌을 피하고,
서버가 후보별로 내려준 `outputPaths`의 충돌을 `surfaceOwnership`으로 판정한다.

선행 배선: 후보 응답의 `outputPaths: string[]`를 필수로 정의하고 탐지·수동 응답 생산자와 fixture를
함께 갱신한다. 서버가 기존 snapshot·포맷으로 전체 출력 경로를 계산해 정렬·중복 제거한다(design §4.0).
클라이언트가 `ingestTargets`나 어댑터를 값으로 import해 경로를 재계산하지 않게 한다.

**검증**: `pnpm test` green. `components/__tests__/client-graph.test.ts`에 신설 선택 모듈을
**직접 진입점으로 넘기는 검사**를 추가한다. T8·T9의 소비자 배선 전에도 모듈에 도달해야 하며,
기존 `use client` 전역 검사만 통과한 것을 신설 모듈 검증으로 간주하지 않는다.
경로가 겹치는 후보 둘, 같은 디렉터리명이라 slug가 충돌하는 후보 둘, 체크 1개(= 1라운드와 같은 답).
서로 다른 베이스 언어를 선택한 표면 둘의 `formats`가 각 선택을 보존하고, 체크하지 않은 후보는 제외되는지 검사한다.
서버 응답 검증: 미리보기에서 제외된 로케일의 출력 경로도 포함 / 경로 정렬·중복 제거 /
추가 snapshot·blob 읽기 0회. 선택 판정 검증: 서로 다른 후보의 중복 경로는 충돌 / 같은 후보 안 중복은
비충돌 / 미체크 후보 제외 / 체크 해제로 충돌 해소. 생성 통합 검증에서는 클라이언트 경로 목록 조작과
탐지 이후 snapshot 변경에도 서버가 충돌을 재계산해 전체 거부하는지 확인한다.

## T5. 전체 거부 결과의 표시

③에서 실패 표면의 경로·사유·실패 수를 표시한다. 중복 키는 `errors.length === 0`이어도 거부다.
확인된 생성 거부와 네트워크 응답 유실의 문구를 구별한다. ④의 부분 실패 tone 집계는 만들지 않는다.

**검증**: 준비 실패·DB 롤백은 ③에 전체 미생성과 경로별 사유를 표시하고, 전송 오류는 결과 확인 안내를
표시한다. 생성 요청 중 중복 제출은 막는다. `pnpm test` green.

## T6. 다중 표면 원자성 통합 검증

T3의 계약을 두 표면 이상으로 검증한다. 경로 충돌은 서버에서 준비한 스냅샷과 payload 로케일로
재판정한다. 선택한 후보 중 탐지 순서가 앞선 표면을 기본으로 삼는다.

**검증**: 표면 둘 성공 / 한 표면 준비 실패 / 둘째 표면 DB 실패 / 경로 충돌 / 서로 다른 베이스 언어 /
표면 하나의 일부 파일 실패 모두 실제 Action과 PG에서 검사한다. 실패 시 관련 행 0개, 성공 시 전체 행과
단일 프로젝트 포인터 일치를 확인한다. `pnpm typecheck` + `pnpm test` + `pnpm test:projects:postgres` green.

---

## T7. `Checkbox` 프리미티브 — `/tdd interface`

`components/ui/checkbox.tsx`. `radix-ui`의 `Checkbox`를 쓴다 — **그 패키지에서 가져오는 컴포넌트가
넷에서 다섯이 된다.**

⚠️ **`radio.tsx`를 형으로 삼되 `label`을 필수로 만들지 않는다** — ②의 쓰임은 접근 이름이 `aria-label`이고
시각 라벨이 형제 button 안에 있다. 필수로 박으면 이 화면이 프리미티브를 못 쓴다.

**검증**: `pnpm test` green. 크기 16 · 포커스 링 · disabled · `aria-label`만으로 접근 이름이 서는지.
⚠️ **테스트 단언을 유지하고 구현의 `aria-label`·role 방어선을 하나씩 제거했을 때 red인지 확인한 뒤
복원한다.** 테스트 단언 자체를 지우는 검증이 아니다 (POSTMORTEM 2026-09-14).

## T8. ② 후보 목록을 체크박스 + 형제 트리거로

`components/onboarding/steps/files.tsx`. `RadioGroup`/`picked`를 걷어내고 `checked: Set<number>` +
`detail: number | null` 두 축으로 나눈다.

- `bg-muted`는 **`detail`만** 말한다. 체크는 체크박스가 말한다.
- 접근 이름 `Include {path}` / `Preview {path}` — 문구는 `messages/en.tsx`를 지난다.
- `<ul>`의 list role을 덮지 않는다.
- 탐지 선택에서 체크 0개면 [Next] 비활성. 수동 지정은 기존 `manualMatched`로 판정하며 체크 수로 막지 않는다.
- 체크된 후보끼리 경로가 겹치면 그 자리에서 경고하고 [Next]를 막는다.

⚠️ **`user-event`를 쓰는 테스트 파일 머리에만 `vi.setConfig({ testTimeout: 20_000 })`을 둔다**
(POSTMORTEM 2026-09-13 — 전역으로 올리면 순수 함수 3,000개가 20초 천장을 갖는다).

**검증**: `pnpm test` green. DOM 테스트로 — 체크와 상세가 독립 / 체크 안 한 행도 상세를 볼 수 있음 /
중첩 인터랙티브 0 / list role 보존 / **리포를 되돌리면 체크 집합이 무효화됨**(POSTMORTEM 2026-09-13 🔁).
수동 후보가 검증되면 탐지 체크 0개여도 진행 / 수동 입력 변경 시 이전 검증 무효 / 늦은 검증 응답 무시.

## T9. 모달 컨테이너 — 다중 선택과 표면별 베이스 언어

`components/onboarding/new-project.tsx` · `components/onboarding/steps/naming.tsx`.

- ③은 체크한 표면마다 경로로 구별되는 베이스 언어 선택 UI를 표시한다. 기존 언어 선택 UI를 재사용하고,
  단일 표면은 현행 화면을 유지한다. 프로젝트 이름·주소는 한 벌이다.
- 컨테이너가 후보별 `baseLocales`를 탐지 제안으로 초기화한다. 상세·미리보기와 분리하고, 체크 해제 후
  재선택에서는 유지하되 리포·브랜치 변경과 재탐지에서는 초기화한다.
- 생성 게이트는 모든 체크 표면의 언어가 각 후보의 `locales`에 속하는지 검사한다.
  `create()`가 사용자 선택을 포함한 `planSurfaceSelection`의 `formats`를 `createProject`에 넘긴다.
- 수동 지정에서는 현재 검증된 포맷과 ③의 베이스 언어로 `surfaces` 원소 하나만 보낸다.
  이전 탐지 체크를 섞지 않는다. 수동 포맷 하나도 같은 생성·적재 All-or-Nothing 계약을 따른다.
- T3에서 전환한 생성 요청에 체크한 모든 표면을 넘긴다. ③의 완료 대기·실패, ④의 성공 상태를 재사용한다.
- ④는 서버가 반환한 전체 YAML·합산 키 수·토큰을 표시한다. 추가 적재 요청이나 표면별 재시도 루프를 만들지 않는다.
- 서버 재검증에도 성공 결과·토큰이 유지돼야 한다.

**검증**: 지연 Promise로 생성 완료 전 ③ 유지 / 한 표면이라도 실패하면 ④ 진입 안 함 /
모든 표면 성공 후 ④ 진입 / YAML step 수와 선택 수 일치 / 성공 후 추가 적재 호출 0회.
베이스 언어 DOM 검증: 서로 다른 언어 목록의 표면 둘에서 각 언어를 변경한 뒤 Action 입력이 정확한지 /
미체크 후보의 상세 전환이 선택을 바꾸지 않는지 / 체크 해제·재선택 시 유지 / 리포·브랜치 변경·재탐지 시
초기화 / 하나라도 무효면 생성 차단 / 단일 표면의 기존 선택 동작 유지. `pnpm typecheck` + `pnpm test` green.
수동 생성 DOM 검증: 이전 탐지 체크가 남아 있어도 요청은 수동 포맷 하나 / 베이스 언어 보존 /
수동 입력 검증 실패 시 생성 차단 / 수동 성공 YAML과 전체 실패 시 ③ 유지.
실제 클라이언트 import가 연결된 상태에서 `client-graph.test.ts`를 재검사한다. 변경 전 단일 후보 YAML의
고정 기대 문자열과 비교하고, 다중 표면의 각 `surface`·`path-template`·선택한 `base-locale`이 맞는지 검사한다.

> **커밋 경계 ②** — `feat(onboarding): pick several locale file candidates at once`

---

## T10. 문서 정본 갱신

design §10의 정본 갱신 대상. 신규 생성의 일부 파일 실패 허용과 ④ 대기 설명도 함께 바꾼다. **문서별 별도 커밋**(`docs(PRODUCT): ...` 꼴).

**검증**: §10의 갱신 항목을 하나씩 코드와 대조한다. Codex는 `CLAUDE.md` 원본 편집을
Claude Code 담당으로 남긴다. 원본 담당자가 변경 후 `pnpm sync:agents`와 `pnpm sync:agents:check`를
실행하고 생성된 미러를 함께 커밋한다. 검사 명령만으로 미러가 갱신된다고 가정하지 않는다.

## T11. 실물 게이트

- `i18n-many-locales`는 **59로케일의 lazy load·언어 선택 UI 검증용**이다. 쓰기·PR 생성에는 사용하지 않는다.
  다중 후보가 있는 유일한 리포는 아니다 — spec §2의 `bugshot-i18n-test`도 두 후보가 관측됐다.
- 실제 ③→④ 생성은 폐기용 리포 `bugshot-i18n-test`와 dev DB를 사용한다. 상주 프로젝트
  `bugshot-i18n-test-qa`는 삭제·재생성하지 않는다. 이번 검증 전용 고유 slug 프로젝트 **하나**를 생성해
  두 후보의 전체 적재·④·Settings YAML을 확인하고, 검증 뒤 UI의 프로젝트 보관으로 OWNER 슬롯을 반환한다.
  리포에는 쓰지 않고, 보관된 검증 행은 남는다는 사실과 slug를 QA 리포트에 기록한다.
- 실제 DB 쓰기 중간 실패·롤백·동시성은 T2·T6의 격리 PostgreSQL에서 검사한다. 공유 dev DB에 인위적
  장애를 넣지 않는다. ③의 오류 문구와 입력 유지는 DOM 테스트로 보완한다.
- Claude Code에서는 `/bugshot-qa`, Codex에서는 제공된 브라우저 도구로 같은 시나리오를 수동 검증한다.
  Codex에 없는 명령을 실행한 것으로 보고하지 않는다.
- 시안 대조는 건너뛴다 — 아래 확정된 결정처럼 새 행 형의 핸드오프가 없다.

**검증**: 두 표면·각 베이스 언어·키·번역이 저장된 뒤에만 ④가 보임 / 성공 YAML의 step 둘 /
직접 진입과 인터셉트 모달 양쪽의 상태 전환 / 상주 프로젝트 보존 / QA 프로젝트 보관을 리포트한다.
GitHub 읽기·파싱 시간, DB 트랜잭션 시간, 요청 전체 시간을 각각 기록하고 현재 `maxDuration = 60`과
명시적 DB 시간 제한 안에서 완료되는지 확인한다. 시간 초과는 미통과이며 부분 생성으로 우회하지 않는다.
결함은 red→green + `/postmortem`으로 기록한다.

---

## 확정된 결정 (2026-09-14 사용자)

- ✅ **③은 표면별 베이스 언어 선택이다.** 체크한 각 표면의 언어를 확인·변경하고 생성·첫 적재에 반영한다.
- ✅ **수동 지정은 후보 하나만 생성한다.** 탐지 후보와 섞지 않고 기존 입력·검증 흐름을 유지한다.
- ✅ **서버가 후보별 `outputPaths`를 제공한다.** 화면은 그 목록으로 체크 충돌을 안내하고,
      생성 서버는 새 snapshot으로 경로를 다시 계산한다.
- ✅ **`Checkbox`는 `radix-ui`로 간다.** 같은 화면에 Radix Radio(①·③)가 이미 서 있어 native로 가면
      포커스 링·크기·disabled가 두 벌이 된다. 대가는 그 DOM 테스트가 `user-event` 실시간 지연에
      묶이는 것이고, 그것은 **파일 머리의 `vi.setConfig`로 받는다**(T8).
- ✅ **생성·첫 적재 전부 All-or-Nothing이다.** 일부 파일 실패·중복 키도 전체 거부한다.
      이전의 “생성 후 독립 적재” 결정을 대체한다. 성공 시에만 ④로 넘어가며, 표면 하나도 동일하다.
- ✅ **GitHub 읽기·파싱은 tx 밖, 생성·전체 적재 저장은 한 tx 안이다.** 실패 후 재시도는 전체 요청이다.
- ✅ **시안 대조는 건너뛴다** — ②의 새 행 형에 Claude Design 핸드오프가 없어 `/design-sync`의 SoT가
      존재하지 않는다(1라운드와 같은 판정). ⚠️ **"시안과 같다"가 아니라 "시안이 없다"다.**
      ⚠️ **그리고 이것은 프리미티브 치환이 아니다** — 행 전체를 감싸던 `<label>`이 사라지고
      클릭 영역이 둘로 갈린다(체크박스=포함 / 텍스트=상세). 나중에 이 화면의 핸드오프가 생기면
      `/design-sync`를 한 번은 돌려야 하고, 그때의 불일치는 회귀가 아니라 첫 대조다.
