# mobile-strings — spec

모바일 세 어댑터 스펙(**arb → apple-strings → android-strings**) 앞에 까는 코어 사전 작업이다(결정 2026-10-19 사용자). 사용자에게 보이는 변화가 없고,
세 스펙이 공유하는 측정 기반과 코어 변경 둘을 먼저 dev에 올려 어댑터 배치를 작게 만든다.

1. **기준선·코퍼스** — 리포별 SHA를 고정한 기준선 보고서와 모바일 코퍼스(학습·홀드아웃).
2. **`basePath`** — Android 기준 언어 파일 `values/strings.xml`처럼 `{locale}` 치환으로 표현되지 않는 기준 경로를 싣는 additive 컬럼과 그 배선.
3. **`.strings` 인코딩 경계** — UTF-16 `.strings`를 원본 인코딩·BOM 그대로 읽고 쓰기 위한 리더·쓰기·`blobSha` 변경.

**출시는 세 어댑터 스펙과 한 번에 묶는다** — 기능 `/merge`는 android-strings까지 dev에 들어간 뒤 한 번이다(android-strings T5).

## 사용자

- **개발자(이 리포의 유지자)** — 뒤 배치가 회귀를 판정할 기준과 코어를 먼저 받는다. 최종 사용자에게는 세 어댑터 스펙이 나간 뒤에야 의미가 생긴다.

## 문제 (관측)

- survey는 매번 외부 리포의 최신 HEAD를 clone한다(`lib/survey/run.ts:31·37·51·75`) — 상류 변경만으로 리포별 1순위가 바뀌어 "기존 리포 1순위 불변"을 판정할 수 없다.
- 기준 언어 경로는 `pathTemplate`의 `{locale}` 치환으로만 계산된다(`lib/` 비테스트 22줄) — `values/strings.xml`을 표현할 수 없다.
- 리포 파일은 무조건 UTF-8로 읽고 쓴다 — UTF-16 `.strings`는 깨진 문자열로 적재되고 쓰면 파일 전체가 diff가 된다. survey는 NUL 바이트 파일을 건너뛴다(`lib/survey/run.ts:63`).

## 완료 조건

1. 같은 SHA로 두 번 돌린 학습·홀드아웃 survey 보고서가 리포별로 같고, 그 보고서가 `.scratch/adapter-survey-baseline/`에 있다.
2. 모바일 코퍼스(`docs/adapter-survey/repos-mobile*.txt`·판정 JSON)가 clone 실패 0으로 돌고, UTF-16 `.strings`·`Base.lproj`·xcstrings 원문 셀 없는 키 건수가 기록됐다.
3. `TranslationSurface.basePath`가 dev DB에 있고, `basePath`가 있는 표면에서 base 경로를 치환으로 만드는 서버 자리가 0이다(소스 테스트). 기존 표면(null)의
   동작이 바뀌지 않는다 — 기존 2코퍼스 25차 표와 같고 M0 기준선과 리포별 1순위 diff 0, 옛 CLI 페이로드가 `format mismatch`가 아니다.
4. 유효한 UTF-16 `.strings`가 원본 인코딩·BOM 그대로 왕복하고, 고치지 않은 파일의 `blobSha`가 원본과 같다. 비가역 입력은 명시 실패다. `.strings` 밖 파일과
   기존 UTF-8 파일의 바이트·`blobSha`가 그대로다.
5. M2·M3가 각자 `pnpm gate` green으로 `/push`됐다.

## 비목표

- 어댑터(ARB·`.strings`·`.xcstrings`·Android) 자체 — 세 어댑터 스펙이 든다.
- 화면 변경 — `basePath` 표시는 android-strings T3.2b가 든다.
- `.strings` 밖 파일의 UTF-16, UTF-8·UTF-16 밖 인코딩.
