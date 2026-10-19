# apple-strings — tasks

모바일 세 스펙의 둘째다(arb → apple-strings → android-strings). 순서: 인코딩 코어 → `.strings` → `.xcstrings`. 배치마다 `pnpm gate` green +
학습·홀드아웃 **둘 다** 재측정(ARCHITECTURE §1.9 재측정 트리거)으로 닫는다. **`/merge`는 세 스펙이 다 끝난 뒤 한 번**이다.
모바일 코퍼스는 arb T0.1이 만든다. design-brief 없음 — 새 UI 표면이 없다.

## 2. Apple `.strings` (`apple-strings`)

- [ ] **T2.0a 인코딩 테스트** (`/tdd`) — `decodeFileBytes`·`encodeFileContent` 왕복(6 인코딩), UTF-8 계열 기존 동작 불변(BOM이 문자열에 남는다),
      인코딩한 바이트 기준 `blobSha`. 검증: red.
- [ ] **T2.0b 인코딩 경로** — `AdapterFile.encoding`, 리더 셋(GitHub ×2·GitLab·CLI walk)·survey 껍데기, GitHub base64 blob·GitLab `encoding: "base64"`,
      `blobSha` 바이트 기준, 렌더 출력의 인코딩 상속. 검증: `pnpm gate` green, 기존 survey 2코퍼스 25차 표와 같음(UTF-8 리포 회귀 0).
      커밋: `feat(repo): read and write locale files in their original encoding`
- [ ] **T2.1 테스트** — 토크나이저 범위 · 이스케이프 왕복 속성 · 비정규 리터럴 미변경 · 주석/빈 줄 보존 · `Base.lproj` 제외 ·
      `fastlane/` 곁가지 · `create`(기준 언어 인코딩 상속). 검증: red.
- [ ] **T2.2 구현 + 배선** (arb T1.3과 같은 목록). 커밋: `feat(adapters): add Apple strings adapter`
- [ ] **T2.3 재측정 + `/roundtrip`** (Xcode 빌드 통과까지).

## 4. Apple `.xcstrings` (`apple-xcstrings`)

- [ ] **T4.0 서식 실측** — 실제 xcstrings 3개(코퍼스)로 Xcode 출력 서식(들여쓰기·`" : "`·키 정렬·끝 개행·빈 객체)을 골든 픽스처로 채록.
      검증: 픽스처가 원본과 바이트 같다.
- [ ] **T4.1 테스트** — `sourceLanguage` 기준 언어 · 값 치환 범위 · 없는 로케일 블록 삽입 위치·서식 · `state` 규칙 · `shouldTranslate:false`·`variations`
      보존 · 언어 추가·제거 비지원 표시(`write-create-unsupported`) · 비울 수 없음(불변식 3 수술적 규칙). 검증: red.
- [ ] **T4.2 구현 + 배선** (arb T1.3 목록 + locale-add 비지원 화면 분기). 커밋: `feat(adapters): add Apple xcstrings adapter`
- [ ] **T4.3 재측정 + `/roundtrip`** — Malmoi PR 머지 뒤 Xcode에서 열어 저장해도 diff 0인지까지.

## 5. 문서 (문서별 커밋)

- [ ] **T5.1 `docs(PRODUCT)`** — §2 포지셔닝 문구, §4.1 지원 포맷, §7.2 언어 추가·제거 지원 포맷 목록(`xcstrings` 비지원).
- [ ] **T5.2 `docs(ARCHITECTURE)`** — §1.9 재측정 표·판정, 파일 인코딩 경로(design §2.2), 값 표현 표(design §3).
- [ ] **T5.3 `docs(ACTIONS)`·`docs(DIRECTORY)`·README·가이드**(`/guide` — en·ko·es 같은 커밋) — 지원 포맷 목록.
- [ ] **T5.4 정리** — 결론을 정본으로 올린 뒤 `docs/features/apple-strings/` 삭제.
- action·GitLab CI 원본 태그 릴리스는 이 스펙에서 하지 않는다 — android-strings T5에서 세 스펙 합동으로 한 번.

## 확인 필요 (착수 전)

- ~~**Q5** `.xcstrings`~~ → **이 spec의 마지막 배치**(2026-10-19 사용자, design §2.3).
- ~~**Q6** UTF-16 `.strings`~~ → **이번에 지원**(2026-10-19 사용자, design §2.2).
- ~~스펙 분할~~ → **arb · apple-strings · android-strings 셋, 출시·태깅은 한 번**(2026-10-19 사용자, `/feature-review`).
