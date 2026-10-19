# apple-strings — spec

Apple 로케일 파일 두 종류(`.strings` → `.xcstrings`)를 지원 포맷에 더한다. 모바일 세 스펙(**arb → apple-strings → android-strings**) 중 둘째다.
UTF-16 `.strings`를 원본 인코딩 그대로 돌려쓰기 위한 **파일 인코딩 경계 변경**이 이 스펙에 딸린다 — `.strings` 파일에만 걸고, 어댑터와 별개 배치로 낸다(design §2.2).

**출시는 세 스펙을 한 번에 묶는다**(결정 2026-10-19 사용자) — 기능 `/merge`는 android-strings까지 dev에 들어간 뒤 한 번이고, 태그 발행과 GitLab SHA 후속
패치는 android-strings T5가 든다. 모바일 코퍼스·기준선
보고서는 arb T0.0·T0.1이 만든다.

## 사용자

- **주: 개발자** — iOS·macOS 앱 리포를 가진 팀이 지금은 온보딩에서 후보 0개를 받는다(설명 없이 혼자 완주 불가 — PRODUCT §1).
- **부: 번역 편집자** — 화면에서 보는 값의 모양(이스케이프·placeholder)이 이 기능에서 정해진다(design §3).

## 문제 (관측)

2026-10-19 보급률 표본(GitHub 리포 1,397개 — 스타 7구간 × 200, 2026-04 이후 push, fork·보관 제외, **경로 정규식 분류**):

- 로케일 파일이 있는 리포 394개 중 지금 지원 선언 포맷 넷(ARCHITECTURE §1.9 판정 ①)이 덮는 것은 **249개(63.2%)**다. 남은 37%는 웹 밖이다.
- 모바일 세 생태계를 합치면 **지원 포맷이 하나도 없던 리포 49개(+12.4%p)**가 새로 덮인다(순증). 그중 Apple이 **26개(+6.6%p)**로 가장 크다.
  Apple 파일을 가진 리포 전체(보유)는 35개다. 코퍼스 후보(arb T0.1)는 보유 기준이다.
- 선례(2026-10-19 조사): Weblate는 UTF-16 `.strings`를 판별해 같은 인코딩으로 돌려쓰고, Tolgee는 항상 UTF-8로 써서 파일 전체가 diff가 된다.
  `.xcstrings`는 Weblate가 미지원(Apple 스펙 미공개), Tolgee는 재생성이라 Xcode가 다시 저장하면 diff가 생긴다.
- ⚠️ 이 수치는 정규식 추정이다. 지원 여부를 실제 탐지기로 재는 것은 모바일 코퍼스(arb T0.1)가 한다.

## 완료 조건

1. `.strings`·`.xcstrings` **각각**에서, 모바일 홀드아웃 코퍼스의 리포(사람이 판정한 정답 경로가 있는 리포)를 연결한 사용자가 **그 포맷 후보 중**
   정답 경로를 받고 → 번역을 고치고 → 그 셀 외에 diff가 없는 PR/MR을 받는다(PRODUCT §1의 완료 조건을 포맷별로). 리포 전체의 1순위는 리포별 대표
   정답 하나로 따로 판정한다(`.strings`·`.xcstrings`나 Apple·Android를 함께 가진 리포에 포맷마다 다른 1순위를 동시에 요구하지 않는다).
   언어 파일을 만든 뒤 **두 번째 번역**(그 파일에 아직 없는 키)도 같은 조건으로 PR에 나간다.
2. **모바일 코퍼스**(학습 + 홀드아웃)의 Apple 리포에서 `pnpm adapter-survey`가 지원 포맷 탐지 · 왕복 의미 동일 · 바이트 고정점 · 조용한 손실 0을
   기존 4포맷과 같은 기준으로 보고한다. 목표: 고정점 100%, 조용한 손실 0건. 탐지·오탐 수치는 목표가 아니라 **보고 대상**이다(§1.9 판정 ④).
   survey가 UTF-16 파일을 건너뛰지 않는다(지금은 NUL 바이트 파일을 스킵한다 — `lib/survey/run.ts:63`).
3. **기존 코퍼스 회귀 0** — 학습 109·홀드아웃 20의 25차 표가 한 칸도 나빠지지 않고, arb T0.0 기준선(리포별 SHA 고정)과 리포별 1순위 경로 diff 0이다
   (POSTMORTEM 2026-09-14). 인코딩 경계 변경 뒤에도 기존 UTF-8 파일의 `blobSha`가 그대로다.
4. 번역하지 않는 구조(`.stringsdict`·xcstrings variations, `shouldTranslate: false`)가 Publish 뒤에도 **바이트 그대로** 남는다 — 골든 테스트로 고정한다.
5. 언어 추가·제거(§7.2 locale-add)는 언어별 파일인 `.strings`에서 동작한다. `.xcstrings`는 ts-dict와 같이 **추가·제거 동작이 렌더되지 않는다**.
6. 유효한 UTF-16(LE·BE, BOM 유무) `.strings` 파일이 원본 인코딩·BOM 그대로 PR에 나가고, 고치지 않은 파일의 `blobSha`가 원본과 같다(design §2.2).
   무손실로 디코드되지 않는 `.strings`(BOM + 짝 없는 서로게이트 등)는 명시 실패로 적재·쓰기가 막힌다 — 대체 문자로 조용히 바뀌지 않는다.

## 비목표

- **복수형 편집 UI** — PRODUCT §4.2 비범위 그대로. `.stringsdict`·xcstrings `variations`는 읽지 않고 보존만 한다.
- **`Base.lproj/Localizable.strings`가 기준인 리포**(Base Internationalization) — `Base`는 로케일 코드가 아니고 Android `basePath` 같은 장치를
  Apple에 열지 않는다. 코퍼스 건수만 보고하고(arb T0.1), 많으면 후속 spec이다.
- UTF-8·UTF-16 밖의 인코딩, `.strings` 밖 파일의 UTF-16.
- `InfoPlist.strings` 등 테이블 여러 개를 한 소스로 묶기 — 테이블마다 소스 하나(기존 다중 표면 모델).
- 크로스플랫폼 리포에서 같은 언어가 포맷마다 다른 코드(`zh-Hans`·`zh-rCN`·`zh_CN`)로 갈리는 것 — raw 코드 정책을 따른다.
- Xcode가 만드는 생성물 갱신.
- 화면 신규 표면 — 어댑터 라벨·예시가 기존 수동 지정 목록에 붙을 뿐이다(그래서 design-brief가 없다).
