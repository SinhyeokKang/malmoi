# android-strings — spec

Android `res/values*/strings.xml`을 지원 포맷에 더한다. 모바일 세 스펙(**arb → apple-strings → android-strings**) 중 마지막이고,
**세 스펙 합동 출시**(기능 `/merge` 한 번 → 새 action·GitLab CI 원본 태그 → GitLab SHA 후속 패치)가 이 스펙의 T5에 있다(결정 2026-10-19 사용자).
모바일 코퍼스·기준선은 mobile-strings M0·M1이 만든다.

## 사용자

- **주: 개발자** — Android 앱 리포를 가진 팀이 지금은 온보딩에서 후보 0개를 받는다(설명 없이 혼자 완주 불가 — PRODUCT §1).
  기준 언어 파일 `values/strings.xml`에는 언어 코드가 없어서, 개발자가 온보딩에서 그 코드를 직접 넣는다(design §2.4).
- **부: 번역 편집자** — 화면에서 보는 값의 모양(이스케이프·인라인 태그)이 이 기능에서 정해진다. 둘이 상충하는 지점이
  "값을 파일 표기 그대로 보여 줄지, 풀어서 보여 줄지"다(design §3). 이스케이프는 풀고 태그는 그대로 두며, 태그를 깨뜨리는 저장은 막는다.

## 문제 (관측)

2026-10-19 보급률 표본(GitHub 리포 1,397개 — 스타 7구간 × 200, 2026-04 이후 push, fork·보관 제외, **경로 정규식 분류**):

- 로케일 파일이 있는 리포 394개 중 지금 지원 선언 포맷 넷(ARCHITECTURE §1.9 판정 ①)이 덮는 것은 **249개(63.2%)**다. 남은 37%는 웹 밖이다.
- 모바일 세 생태계를 합치면 **지원 포맷이 하나도 없던 리포 49개(+12.4%p)**가 새로 덮인다(순증). 그중 Android가 **21개(+5.3%p)**다.
  Android 파일을 가진 리포 전체(보유)는 24개다. 두 생태계를 함께 가진 크로스플랫폼 리포는 순증 49개 중 6개다 — 세 스펙을 한 번에 출시하는 이유다.
- 선례(2026-10-19 조사): Weblate·Tolgee 모두 `values/`의 언어를 파일에서 추론하지 않고 사람이 정한다. 둘 다 XML을 다시 직렬화해 원본 서식을 잃는다.
- ⚠️ 이 수치는 정규식 추정이다. **mobile-strings M1 실측**(2026-10-19, `docs/adapter-survey/repos.md` "모바일 코퍼스"): 60리포 중 Android 보유 **30**,
  정답 포맷 Android XML 19. 판정 JSON(`verdicts-mobile*.json`)이 Android 정답에 `basePath`를 싣는다. 경로 정규식(`res/values`)이 놓친 꼴이 둘 드러났다 —
  Compose Multiplatform `composeResources/values-{locale}`(Meshtastic)와 `src/main` 없는 `<모듈>/res`(stripe-android 등).

## 완료 조건

1. 모바일 홀드아웃 코퍼스의 Android 리포(사람이 판정한 정답 템플릿·`basePath`가 있는 리포)를 연결한 사용자가 **Android 후보 중** 정답 경로를 받고 →
   기준 언어 코드를 넣고 → 번역을 고치고 → 그 셀 외에 diff가 없는 PR/MR을 받는다(PRODUCT §1의 완료 조건을 이 포맷으로). 리포 전체의 1순위는 리포별
   대표 정답 하나로 따로 판정한다(Apple·Android를 함께 가진 리포에 포맷마다 다른 1순위를 동시에 요구하지 않는다). 언어 파일을 만든 뒤 **두 번째 번역**
   (그 파일에 아직 없는 키)도 같은 조건으로 PR에 나간다. `values/`만 있는 단일 언어 리포도 후보로 나오고, 기존 프로젝트에 소스로 추가할 때도 기준 언어
   코드를 넣을 수 있다.
2. **모바일 코퍼스**(학습 + 홀드아웃)의 Android 리포에서 `pnpm adapter-survey`가 지원 포맷 탐지 · 왕복 의미 동일 · 바이트 고정점 · 조용한 손실 0을
   기존 4포맷과 같은 기준으로 보고한다. 목표: 고정점 100%, 조용한 손실 0건. 탐지·오탐 수치는 목표가 아니라 **보고 대상**이다(§1.9 판정 ④).
3. **기존 코퍼스 회귀 0** — 학습 109·홀드아웃 20의 표(arb 26차 · apple-strings 27차 뒤)가 한 칸도 나빠지지 않고, 커밋된 기준선 `docs/adapter-survey/baseline/`
   (리포별 SHA 고정 — 앞 스펙이 갱신한다)과 리포별 1순위 경로 diff 0이다(POSTMORTEM 2026-09-14). **모바일 코퍼스는 Android가 정답인 리포의 1순위만 바뀐다** —
   ⚠️ Flutter 리포는 거의 모두 `android/app/src/main/res/values/strings.xml`(대개 `app_name` 하나)을 가진다. 그 후보가 ARB 정답 리포(학습 10 · 홀드아웃 4)나
   Apple 정답 리포의 1순위를 빼앗으면 회귀다. `basePath`가 null인 기존 표면의 동작이 바뀌지 않는다.
4. 번역하지 않는 구조(`<plurals>`, `<string-array>`, `translatable="false"`)가 Publish 뒤에도 **바이트 그대로** 남는다 — 골든 테스트로 고정한다.
5. 언어 추가·제거(§7.2 locale-add)가 동작하고, 지역이 붙은 언어는 Android 철자(`pt-rBR`)로만 추가된다 — `pt-BR` 꼴은 거부된다(design §2.5).
   언어 제거는 `values/strings.xml`을 지우지 않는다. Android 표면의 기준 언어 변경은 거부된다.
6. 인라인 태그가 기준 언어와 다른 저장은 웹 편집과 MCP 저장에서 똑같이 거부되고, 화면이 그 이유와 고칠 셀을 짚는다(design §3).
7. CI(GitHub action·GitLab CI 원본)가 세 스펙의 새 어댑터 이름을 모두 받는다 — 기능 `/merge` 한 번 → 그 커밋에 새 태그(`malmoi-i18n-push-v4`·
   `malmoi-i18n-push-gitlab-v3`) → GitLab SHA 후속 패치 릴리스 순서를 지난다. 기존 태그는 옮기지 않아 기존 소비자는 영향이 없다.

## 비목표

- **복수형 편집 UI** — PRODUCT §4.2 비범위 그대로. `<plurals>`는 읽지 않고 보존만 한다.
- Android `b+sr+Latn` 형식 한정자(`+`가 경로 안전 문자 밖이다) · 지역 외 한정자(`values-ko-night`, `values-sw600dp`, `values-car`)의 문자열.
- 인라인 태그의 하이라이트·칩 표시 — 새 토큰과 §4.1 mono 예외가 필요하다. 태그는 문자열 그대로 보인다.
- 크로스플랫폼 리포에서 같은 언어가 포맷마다 다른 코드(`zh-rCN`·`zh-Hans`·`zh_CN`)로 갈리는 것 — raw 코드 정책을 따른다.
- Android Studio·Gradle이 만드는 생성물 갱신.
- 화면 신규 표면은 **온보딩 ③의 기준 언어 코드 입력** 하나뿐이다 — 기존 프리미티브로 조립하므로 design-brief가 없다(design §3.1).
