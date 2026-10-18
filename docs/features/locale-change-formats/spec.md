# locale-change-formats — 언어 추가·제거 포맷 확장 + 비지원 포맷의 동작 숨김

## 사용자

- **개발자(OWNER)** — YAML 카탈로그(Rails `config/locales/*.yml` 등)·로케일당 코드 딕셔너리(`src/locales/{locale}.ts`) 리포에서도
  리포를 열지 않고 언어를 추가·제거하고 싶다.
- **번역 편집자(EDITOR)** — 비지원 포맷에서 "소유자만 할 수 있다"는 거짓 안내를 보지 않는다.

## 문제 (관측)

1. prod `malmoi` 프로젝트(`ts-dict` — 연결만 해 둔 테스트·관찰용 프로젝트다. PRODUCT의 "dogfooding 안 함"은 그대로다)의 Sources 상세
   Languages 카드에서 **[Add language]가 꺼진 채 서 있고**, 사용자는 왜 꺼졌는지 몰랐다.
   카드 설명 `Languages come from the repository. Add or remove the files there.`가 사유를 말하지만 꺼진 버튼의 사유로 읽히지 않는다.
   DESIGN §6.66 "꺼진 동작은 숨기지 않는다"(2026-10-17)는 *권한*으로 꺼진 경우엔 맞지만, *포맷*으로 꺼진 경우엔 누구도 앱에서 켤 수 없어
   버튼이 아무 행동도 약속하지 못한다.
2. 언어 추가·제거는 `json-catalog`·`chrome-locales`만 지원한다(PRODUCT §7.2). `yaml-catalog`·`code-dict`도 **언어마다 파일이 따로**라
   파일 하나를 만들고 지우는 같은 모델에 들어맞는데 빠져 있다. 코드에서 막는 지점은 하나다 — 두 어댑터가 수술적 치환이라
   **원본 없는 새 파일을 만들지 않는다**(`lib/pull/render.ts` — `missingOriginal`).
3. EDITOR는 소스의 어댑터를 모른다(`SourceDetail.connection`이 OWNER 전용). 그래서 비지원 포맷에서도 EDITOR에겐
   `Only project owners can add or remove languages.`가 선다 — OWNER도 못 하므로 거짓이다.
4. Chrome 소스의 언어 추가 Dialog에서 언어 `Select`(54개)가 **화면 높이만큼** 열린다(`max-h = available-height`). 같은 Dialog의
   json용 `Combobox`는 300px 상한이 있어 두 입력의 형이 갈린다.

## 완료 조건

### A. 포맷 확장
- A1. `yaml-catalog`·`code-dict` 소스에서 OWNER가 웹(Languages 카드)과 MCP(`add_locale`·`preview_locale_removal`·`remove_locale`·`cancel_locale_removal`)로
  언어를 추가·제거·취소할 수 있다. 판정·만료·보류·지문·사건은 기존 json-catalog와 같은 코어를 지난다.
  **되살리기(revive — 제거했던 언어를 다시 추가, 리포에 파일 없음)도 같은 생성 갈래를 지난다.**
- A2. 추가(또는 되살린) 언어의 값이 하나 이상이면 Publish가 `pathTemplate`의 그 경로에 **새 파일을 만든다**. 새 파일은 base 파일의
  **규약**(값이 아니다)을 따른다:
  - yaml 루트 — base 파일의 루트 키가 **base 언어 코드와 같으면** 새 파일도 `<code>:`로 감싼다. 루트가 없으면 루트에 바로 키가 온다.
    루트 키가 base 언어 코드와 다르면(`en-US.yml` 안의 `en:` 등) 추측하지 않고 실패한다(A2-1).
  - 키 구조 — base 파일이 평평한 점 키(`"common.ok": …`)면 새 파일도 평평하게, 중첩이면 중첩으로 쓴다(두 포맷 모두).
  - code-dict 내보내기 — base가 `export default`면 `export default { … }` 모듈 하나. base가 named export(`export const translations = …`)면
    **같은 이름**으로 내보낸다. 이름에 base 언어 코드가 들어 있으면(`koTranslations`) 추측하지 않고 실패한다(A2-1). 확장자는 템플릿이 정한다.
  - **값이 없는 키는 쓰지 않는다** — base 언어 문자열을 새 언어 파일에 복사하지 않는다(다음 push가 그것을 그 언어의 번역으로 적재한다).
- A2-1. **새 파일을 만들 수 없으면 Publish 전체를 막는 실패**를 싣고 파일을 내지 않는다 — 조용히 빠뜨리지 않는다. 대상: base 파일 없음·파싱 실패,
  루트 키 불일치, 만든 파일을 다시 읽으면 최상위 키가 루트로 오인되는 경우(루트 없는 base에서 최상위 키가 하나뿐이고 언어 코드처럼 생김 — `nav`·`no`),
  접두 충돌(`key-shadowed`), code-dict의 `__proto__` 키, 언어 든 export 이름. OWNER는 추가 취소로 풀 수 있다. Publish 미리보기도 같은 판정이다.
- A3. **결정성**: 같은 DB 상태 + 같은 base 파일 → 새 파일 바이트가 같다. 그 파일을 원본으로 다음 Publish를 돌리면 diff가 0이다
  (`lib/adapters/__tests__/contract.ts` 매트릭스 행).
- A3-1. **Publish 미리보기 = 실행**: 새 파일로 나갈 셀을 미리보기가 "파일 없음 보류"로 세지 않는다.
- A4. **왕복**: 새 파일을 같은 어댑터 `read`로 읽으면 DB의 값 있는 키·값과 같다(키 구조 포함). yaml 새 파일의 스칼라는 YAML 1.1 파서(Psych)도
  문자열로 읽는다(`no`·`yes`·`on`·`12:30` 등 모호 토큰은 따옴표).
- A5. 제거는 기존과 같다 — 계산된 경로 하나를 delete하고 다른 파일은 건드리지 않는다.
- A6. 값 0개 ADD는 파일을 내지 않는다(기존 `empty`와 같음).
- A7. `ts-dict`는 여전히 비지원이다(`unsupported-format`).

### B. 비지원 포맷의 동작 숨김
- B1. `ts-dict`처럼 추가·제거가 불가한 포맷의 소스에서는 **역할과 무관하게** 카드 머리 [Add language]와 행의 [Remove language]를 **함께 숨긴다**
  (Inactive 행의 [Add language], **base 언어 행의 [Remove language]**도 숨긴다). 하나만 남기지 않는다 — 꺼진 버튼으로 남기지 않고 DOM에 렌더하지 않는다(2026-10-18 사용자).
- B2. 비지원 포맷에 남은 Adding·Removing 행의 취소(Remove로 추가 취소 · Cancel removal)는 **그대로 켜져 있다**(리포에 아무것도 보내지 않는 쪽 — 기존 Y3).
- B3. 지원 포맷의 EDITOR는 지금처럼 `aria-disabled` + `Only project owners can add or remove languages.`다(권한은 OWNER가 풀 수 있다 — D7 유지).
  꺼진 버튼은 클릭·Enter로 Dialog를 열지 않는다.
- B4. 판정 우선순위가 **포맷 > 권한**으로 바뀐다(카드 설명 · 머리 · 행 동작 · Inactive 띠 복구 문장). 행 동작의 기준 언어 사유는
  **지원 포맷 안에서** 그대로 맨 앞이다(비지원 포맷은 B1대로 숨긴다).
- B4-1. 비지원 포맷의 Inactive 띠는 OWNER에게 `Restore the file in the repository, then sync.`(기존), **EDITOR에게는 복구 문장 없이 보존 문장만** 보인다.
- B5. EDITOR도 포맷 지원 여부를 안다 — 서버가 `SourceDetail`에 boolean 하나를 모든 역할에 싣는다(어댑터 이름·경로는 계속 OWNER 전용).
- B6. 판정 기준을 한 문장으로 정한다(DESIGN §6.66): **이 프로젝트의 누군가가 앱 안에서 풀 수 있는 막힘(권한·기준 언어·미확정)은 `aria-disabled` + 사유,
  앱 안의 누구도 풀 수 없는 막힘(포맷)은 동작 자체가 없다.**

### C. 카드 설명 문구
- C1. 비지원 포맷이면 카드 **설명을 그리지 않는다**(2026-10-18 사용자) — 동작이 없으니 동작을 설명할 문장도 없다.
  문제 1은 "아무 행동도 약속하지 않는 버튼"을 없애 해결하고, 왜 이 포맷에서 언어를 못 바꾸는지는 가이드(`setup/languages.md`·`reference/formats.md`)가 말한다.
  지원 포맷의 설명 둘(`languagesHelpOwner` · `languagesHelpEditor`)은 그대로다.
- C2. 이 변경으로 소비자가 없어지는 `m.sources.languagesHelp` 키(지금 소비자는 Languages 카드 1곳)를 세 사전에서 같은 커밋에 지운다(내 변경이 만든 고아).
- C3. 영어 고정 MCP 표면의 두 문구가 지원 포맷 넷을 말한다 — 거부 문구 `unsupported-format`과 `add_locale` 도구 설명(둘 다 `messages/en.tsx`의 `mcp` 네임스페이스, ko·es에 없다).
  웹 Dialog는 이 문구를 쓰지 않는다(범용 `addFailed`).
- C4. A2-1의 실패는 writer 경고 코드 하나(`write-create-unsupported`)로 말한다 — 세 사전에 같은 커밋에서 키를 넣는다(기존 `write-no-default-export`와 같은 자리).

### D. 언어 드롭다운 높이
- D1. **모든 `Select` 목록**이 **300px**(가용 높이가 더 작으면 가용 높이)에서 멈추고 안에서 스크롤한다 — `Combobox`와 같은 상한(프리미티브 변경).
  Chrome 언어 Select(54개)·시간대 Select(42개)·온보딩 기준 언어 Select가 여기에 해당한다. DESIGN §6.675 시간대 행의 "고정 상한이 아니다"는 이 결정으로 뒤집힌다.
- D2. 짧은 Select(항목이 300px 미만)의 렌더는 바뀌지 않는다.

### 문서
- PRODUCT §7.2 "지원 포맷" · ARCHITECTURE §1.4("`null`은 원본이 없을 때만")·§5.10 머리·"ADD의 새 파일 표현"(빌리는 규약: 루트 키·키 구조·export 형태) ·
  DESIGN §6.66 "꺼진 동작은 숨기지 않는다"(B6 기준)·Inactive 띠·입력 선택("json-catalog = Combobox")·§6.4 Select 행·§6.675 시간대 행 ·
  `CLAUDE.md`(언어 삭제 절의 "`json-catalog`·`chrome-locales`뿐") · 가이드 `setup/languages.md`·`reference/formats.md`·`faq.md#languages`(en·ko·es) ·
  `guide/AUTHORING.md` · README(언어 추가·제거 문장 새로 추가)가 새 사실을 말한다.

## 비목표

- `ts-dict`(한 파일에 모든 언어)의 언어 구성 변경 — 공유 파일 안 로케일 객체 삽입·삭제는 구조 변경이고, 타입·언어 목록까지 묶인
  리포에서는 파일만 바꾼 PR이 빌드를 깬다.
- 새 파일에 base 파일의 주석·앵커·import·타입 주석(`const x: Locale = …`)·키 순서를 복사하는 것. 새 파일은 최소 형태다 — 수술적 보존은 **그 파일이 생긴 다음 Publish부터** 적용된다.
- 새 파일이 듬성한 데서 오는 이후 Publish의 평평한 삽입 — 새 파일에 부모 맵이 없는 키는 다음 Publish가 기존 수술적 삽입 규칙대로 점 리터럴 키로 넣는다(design §6 대가).
- 앱 코드의 언어 등록(import·지원 언어 목록) 자동 수정. PR 본문 안내는 기존 그대로다.
- 꺼진 동작 전반의 정책 변경 — 숨김은 B6 기준의 "누구도 풀 수 없는 막힘"(지금은 포맷 비지원 하나)에만 적용한다.
- 다른 Select 소비자의 개별 조정 — 상한은 프리미티브 하나에서 바꾸고 소비자별 className은 더하지 않는다.
