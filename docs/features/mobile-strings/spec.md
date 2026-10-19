# mobile-strings — spec

ARB(Flutter `gen-l10n`) · Apple(`.strings` → `.xcstrings`) · Android(`strings.xml`) 세 생태계의 로케일 파일을 지원 포맷에 더한다.
배치 순서는 **ARB → Apple `.strings` → Android → Apple `.xcstrings`**다. 공통 결정을 가장 싼 어댑터(ARB)에서 먼저 실물로 확정한다.

## 사용자

- **주: 개발자** — 모바일 앱 리포를 가진 팀이 지금은 온보딩에서 후보 0개를 받는다(설명 없이 혼자 완주 불가 — PRODUCT §1).
- **부: 번역 편집자** — 화면에서 보는 값의 모양(이스케이프·placeholder·인라인 태그)이 이 기능에서 정해진다. 둘이 상충하는 지점이
  "값을 파일 표기 그대로 보여 줄지, 풀어서 보여 줄지"다(design §3).

## 문제 (관측)

2026-10-19 보급률 표본(GitHub 리포 1,397개 — 스타 7구간 × 200, 2026-04 이후 push, fork·보관 제외, **경로 정규식 분류**):

- 로케일 파일이 있는 리포 394개 중 지금 4포맷이 덮는 것은 **249개(63.2%)**다. TS/JS 리포는 125개 중 119개(95%)로 거의 다 덮는다 —
  남은 37%는 웹 밖이다.
- 세 생태계를 합치면 **지원 포맷이 하나도 없던 리포 49개(+12.4%p)**가 새로 덮인다. Apple 26(+6.6) · Android 21(+5.3) · ARB 8(+2.0),
  둘 다 가진 크로스플랫폼 리포가 6개라 합은 단순 합보다 작다.
- 크로스플랫폼 앱(Shuttle2·gemwallet·fud-ai·openclaw 등)은 한쪽만 지원하면 앱의 절반이 미번역으로 남는다 — 셋을 한 spec에 묶는 이유다.
- ⚠️ 이 수치는 정규식 추정이다. 지원 여부를 실제 탐지기로 재는 것은 태스크 0(모바일 코퍼스)이 한다.

## 완료 조건

1. **세 생태계 각각**에서, 낯선 리포를 연결한 사용자가 온보딩 후보 1순위로 정답 경로를 받고 → 번역을 고치고 → 그 셀 외에 diff가 없는
   PR/MR을 받는다(PRODUCT §1의 완료 조건을 포맷별로).
2. **모바일 코퍼스**(학습 + 홀드아웃)에서 `pnpm adapter-survey`가 지원 포맷 탐지 · 왕복 의미 동일 · 바이트 고정점 · 조용한 손실 0을
   기존 4포맷과 같은 기준으로 보고한다. 목표: 고정점 100%, 조용한 손실 0건. 탐지·오탐 수치는 목표가 아니라 **보고 대상**이다(§1.9 판정 ④).
3. **기존 코퍼스 회귀 0** — 학습 109·홀드아웃 20의 25차 표가 한 칸도 나빠지지 않는다. 특히 **기존 리포의 1순위 후보가 바뀌지 않는다**
   (바뀌면 `adapter`를 박지 않은 기존 워크플로가 `format mismatch` 409로 영구 red가 된다 — POSTMORTEM 2026-09-14).
4. 번역하지 않는 구조(복수형 `<plurals>`·`.stringsdict`·xcstrings variations, `<string-array>`, `translatable="false"`, ARB `@key`
   메타데이터)가 Publish 뒤에도 **바이트 그대로** 남는다 — 골든 테스트로 고정한다.
5. 언어 추가·제거(§7.2 locale-add)는 언어별 파일인 ARB·`.strings`·Android에서 동작하고, `.xcstrings`는 ts-dict와 같이 비지원으로 표시된다.
6. CI(GitHub action·GitLab CI 원본)가 새 어댑터 이름을 받는다 — action 태그 릴리스 절차를 지난다.
7. UTF-16(LE·BE, BOM 유무) `.strings` 파일이 원본 인코딩·BOM 그대로 PR에 나가고, 고치지 않은 파일의 `blobSha`가 원본과 같다(design §2.4).

## 비목표

- **복수형·ICU 편집 UI** — PRODUCT §4.2 비범위 그대로. ARB의 ICU 문자열(`{count, plural, …}`)은 **통짜 문자열**로 보여 주고 저장한다.
  복수형 전용 구조는 읽지 않고 보존만 한다.
- gettext·Qt Linguist·.NET resx·Fluent·Java properties·XLIFF — 키 = 원문(gettext·Qt)은 원칙 충돌이라 포지셔닝 판정이 먼저다.
- Android `b+sr+Latn` 형식 한정자(`+`가 경로 안전 문자 밖이다) · 지역 외 한정자(`values-ko-night`, `values-sw600dp`)의 문자열.
- `InfoPlist.strings` 등 테이블 여러 개를 한 소스로 묶기 — 테이블마다 소스 하나(기존 다중 표면 모델).
- Xcode·Android Studio·`flutter gen-l10n`이 만드는 생성물(`.qm`·`app_localizations*.dart`) 갱신.
- 화면 신규 표면 — 어댑터 라벨·예시가 기존 수동 지정 목록에 붙을 뿐이다(그래서 design-brief가 없다).
