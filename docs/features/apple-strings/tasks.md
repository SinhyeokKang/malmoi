# apple-strings — tasks

모바일 세 스펙의 둘째다(arb → apple-strings → android-strings). 순서: 인코딩 경계(독립 배치) → `.strings` → `.xcstrings`. 배치마다 `pnpm gate` green +
학습·홀드아웃 **둘 다** 재측정(ARCHITECTURE §1.9 재측정 트리거)으로 닫는다. **`/merge`는 세 스펙이 다 끝난 뒤 한 번**이다.
모바일 코퍼스·기준선은 arb T0.0·T0.1이 만든다. 표기 규칙("검증: red"·(수동)·테스트 커밋 합치기)은 arb tasks 머리와 같다. design-brief 없음.

## 2a. 인코딩 경계 (독립 배치 — 자체 `/push`)

어댑터와 다른 커밋·다른 preview로 내보내 회귀가 나면 원인을 한쪽으로 좁힌다.

- [ ] **T2.0a 인코딩 테스트** (`/tdd`) — `decodeFileBytes`·`encodeFileContent` 왕복(5 인코딩) · `.strings` 아닌 경로는 판별 안 함 ·
      `encodeFileContent(s, "utf-8")`가 `Buffer.from(s, "utf8")`와 바이트 같음 · UTF-8 BOM이 문자열에 남음 · 판별 실패·비가역 입력(홀수 길이·짝 없는 서로게이트·
      BOM 없는 짧은 ASCII·NUL 섞인 UTF-8)은 UTF-8로 남고 `blobSha` 불변 · 인코딩한 바이트 기준 `blobSha` · `planPullChanges`(`lib/pull/plan.ts:252-283`)에
      변경 없는 UTF-16 파일을 넣으면 upsert 0 · 소스 테스트 "`.strings`를 UTF-8로 직접 읽는 로케일 리더 0곳". 검증: red.
- [ ] **T2.0b 인코딩 경로** — `AdapterFile.encoding`, 리더 넷(GitHub `lib/github.ts:322·409` · GitLab `lib/gitlab/plan.ts:93` · CLI `scripts/format.ts:25`) +
      survey `lib/survey/run.ts:63` NUL 스킵 교체, GitHub UTF-16 파일의 `POST /git/blobs`(base64) · GitLab `encoding: "base64"`, `blobSha` 바이트 기준
      (호출자 `lib/pull/plan.ts:266` · `scripts/ingest.ts:147`), 렌더 출력의 인코딩 상속.
      검증: `pnpm gate` green, 기존 2코퍼스 25차 표와 같고 arb T0.0 기준선과 리포별 1순위 diff 0(UTF-8 리포 회귀 0).
      커밋: `feat(repo): read and write strings files in their original encoding` → `/push`

## 2b. Apple `.strings` (`apple-strings`)

- [ ] **T2.1 테스트** — 토크나이저 범위 · 이스케이프 왕복 속성 · 비정규 리터럴 미변경 · 주석/빈 줄 보존 · 주석 속 `"a" = "b";`·`//` 안의 `=`는 엔트리 아님 ·
      중복 키(나중 값이 엔트리, `duplicate-key` 보고, 가려진 앞 리터럴 미변경) · `"__proto__" = "x";`가 own property · 빈 값 쓰기(`planClearability`) ·
      CRLF · 0바이트 파일 · 퇴화 출력 왕복 · `Base.lproj` 제외 · `fastlane/` 곁가지 · 진입점 `detectCandidatesAcross` 1순위 ·
      `create`(인코딩·BOM만 상속, 주석·기준 값 미복사, 값 있는 활성 키만) · `contract.ts` 매트릭스 편입. 검증: red.
- [ ] **T2.2 구현 + 배선** — arb T1.3과 같은 손 목록(`SUPPORTED_ADAPTERS`에 추가, 사전 라벨 "Apple strings file" 형). 검증: `pnpm test` green →
      껍데기 테스트가 `.strings`를 내려받는다 → `pnpm gate` green. 커밋: `feat(adapters): add Apple strings adapter`
- [ ] **T2.3 재측정** — 검증: 기존 표 회귀 0 · arb T0.0 기준선과 리포별 1순위 diff 0 · `.strings` 고정점 100% · 조용한 손실 0 · UTF-16 리포가 분모에 듦 ·
      `Base.lproj` 리포 수·`resource-limit` 거부 수 보고. 커밋 없음.
- [ ] **T2.4 실물 (수동)** — `/roundtrip`(UTF-8 리포 하나 + UTF-16 리포 하나). 전제: macOS + Xcode, 폐기용 리포. 검증: 고친 셀 외 diff 0, 인코딩·BOM 유지, Xcode 빌드 통과.

## 4. Apple `.xcstrings` (`apple-xcstrings`)

- [ ] **T4.0 서식 실측** — 실제 xcstrings 3개(코퍼스)로 Xcode 출력 서식(들여쓰기·`" : "`·키 정렬·끝 개행·빈 객체)을 골든 픽스처로 채록.
      검증: 픽스처가 원본과 바이트 같다. 커밋은 T4.2에 합친다.
- [ ] **T4.1 테스트** — `sourceLanguage` 기준 언어 · 값 치환 범위 · 없는 로케일 블록 삽입 위치·서식 · `state` 규칙 · `shouldTranslate:false`·`variations`
      보존 · **원문 셀 없는 키는 키를 기준 값으로 읽고 기준 셀을 쓰지 않음, 그 기준 값 편집은 거부** · `__proto__` 키 · 언어 추가·제거 비지원
      (`SUPPORTED_ADAPTERS`에 없음, `write-create-unsupported`) · 비울 수 없음(불변식 3 수술적 규칙). 검증: red.
- [ ] **T4.2 구현 + 배선** — arb T1.3 손 목록(`SUPPORTED_ADAPTERS`에는 넣지 않는다, 사전 라벨 "Apple String Catalog" 형). 화면 비지원 분기는
      `supportsLocaleChanges`에서 파생되므로 만들지 않는다. 검증: `pnpm test` green → 껍데기 테스트 → `pnpm gate` green.
      커밋: `feat(adapters): add Apple xcstrings adapter`
- [ ] **T4.3 재측정 + 실물 (수동)** — 재측정 검증은 T2.3과 같은 기준 + 원문 셀 없는 키 비율 보고. `/roundtrip`: Malmoi PR 머지 뒤 Xcode에서 열어 저장해도
      diff 0인지까지(전제: macOS + Xcode).

## 5. 문서 (문서별 커밋)

- [ ] **T5.1 `docs(PRODUCT)`** — §0 포맷 수, §2 포지셔닝 문구, §4.1 지원 포맷, §7.2 언어 추가·제거 지원 포맷 목록(`xcstrings` 비지원), 비목표(`Base.lproj`).
- [ ] **T5.2 `docs(ARCHITECTURE)`** — §1.9 재측정 표·판정, 파일 인코딩 경로와 §3.1 API 예산(UTF-16 blob), 값 표현 표(design §3), §0 불변식 3의
      수술적 표면 목록에 `apple-strings`·`apple-xcstrings`, xcstrings 셀 삽입 규칙(ts-dict와의 차이), 키 = 원문 규칙.
- [ ] **T5.3 `docs(ACTIONS)`·`docs(DIRECTORY)`·README·가이드**(`/guide` — en·ko·es 같은 커밋) — 지원 포맷 목록.
- [ ] **T5.4 정리** — 결론이 정본에 올라갔는지 확인한 뒤 `docs/features/apple-strings/` 삭제.
- T5 공통 검증: `pnpm test`(가이드 게이트·`no-korean-ui`) green · `pnpm sync:agents:check` green.
- action·GitLab CI 원본 태그 릴리스는 이 스펙에서 하지 않는다 — android-strings T5에서 세 스펙 합동으로 한 번.

## 확인 필요 (착수 전)

- ~~**Q5** `.xcstrings`~~ → **이 spec의 마지막 배치**(2026-10-19 사용자, design §2.3).
- ~~**Q6** UTF-16 `.strings`~~ → **이번에 지원, `.strings` 경로에만 판별, 독립 배치**(2026-10-19 사용자, design §2.2).
- ~~키 = 원문~~ → **키를 기준 값으로 읽되 기준 셀은 쓰지 않음**(2026-10-19 사용자, design §2.3).
- ~~create~~ → **뼈대만 복제, 값 있는 키만**(2026-10-19 사용자, design §2.1).
- ~~`Base.lproj`~~ → **비목표 + 코퍼스 건수 보고**(2026-10-19 사용자).
- ~~스펙 분할·출시~~ → **세 스펙, 출시·태깅·머지는 한 번**(2026-10-19 사용자).
