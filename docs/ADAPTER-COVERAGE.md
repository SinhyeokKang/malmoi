# 어댑터 범용성 측정 결과

**오픈소스 리포 109개에 `detect`·`read`·왕복을 돌린 결과와, 그 숫자로 내린 판정 4개다.**
실험의 스펙·설계·태스크는 [features/adapter-generality/](./features/adapter-generality/)에 있다.

- 실행: `pnpm adapter-survey docs/features/adapter-generality/repos.txt --verdicts docs/features/adapter-generality/verdicts.json`
- 실행일: **2026-09-02** / 대상 목록: [repos.md](./features/adapter-generality/repos.md) / 정답 경로: [verdicts.json](./features/adapter-generality/verdicts.json)
- 규모: **109개 리포 · 1,888 로케일 · 43,613 키**. clone 실패 0건, 전체 3분 26초(동시 8), 판정 로직 자체는 20.9초

> **왜 만들었나**: 어댑터가 남의 리포에서 동작한다는 근거가 자기 리포 4개뿐이었다. 그 4개는 같은
> 사람이 같은 관례로 쓴 것이라 "범용적이다"를 뒷받침하지 못한다.

## 1. 지표 4개

### ① `detect` 성공률 — 분모가 둘이다

| 분모 | 값 | 뜻 |
|---|---|---|
| **지원 포맷 리포** (73개) | **69/73 = 94.5%** | 우리 어댑터가 다룰 수 있는 포맷을 실제로 찾아내는가 |
| 측정된 전체 (109개) | 72/109 = 66.1% | 미지원 포맷의 실제 빈도를 포함한 값 |

분모를 하나로 합치지 않는 이유: 표본에 **어댑터가 없는 포맷을 일부러 넣었으므로**(YAML 17개 등)
합산 성공률은 "미지원 포맷을 몇 개 넣었느냐"로 임의 조정되는 숫자가 된다.

**미지원 36개의 내역** — 이것이 곧 "무엇을 더 만들어야 하는가"의 우선순위다:

| 사유 | 개수 | 대표 |
|---|---|---|
| `yaml` | **17** | misskey(42로케일), mastodon(106), decidim(82), redmine(50), directus(69) |
| `ts-per-locale` | **11** | ant-design(73), element-plus(67), vuetify(43), payload(40) |
| 로케일 파일 없음 | 3 | huginn, veigar, unreal-ui-next |
| `js-per-locale` | 1 | quasar(74) |
| 소스 코드 내장 | 1 | primevue |
| 자체 포맷(`.config`) | 1 | darkreader |
| 빌드 시 외부에서 받음 | 1 | home-assistant/frontend |
| 서브모듈 | 1 | SponsorBlock (`public/_locales`가 gitlink) |

### ② 오탐률 — 사람 판정

**판정 주체는 `detect` 밖이다.** 리포별 "실제로 번역이 사는 경로"를 verdicts.json에 적고
후보 목록과 대조했다 — 코드가 자기 출력을 채점하면 순환이다.

| 분모 | 값 |
|---|---|
| 지원 포맷이면서 후보를 낸 리포 (69개) | **1/69 = 1.4%** |
| **후보를 낸 리포 전체 (72개)** | **4/72 = 5.6%** |

두 번째 값이 판정의 근거다 — **미지원 포맷 리포에서 뭔가를 잡은 것도 오탐**이기 때문이다.
우리 어댑터가 맞을 수 있는 정답이 애초에 없는 리포다.

**정답 순위 분포**: `1순위 68 · 2순위 1 · 목록에 없음 4`.
2순위가 존재한다는 사실은 `detectCandidates`(이 실험이 추가한 유일한 프로덕션 변경)가 없으면
**관측 자체가 불가능**했다.

오탐 4건 전부:

| 리포 | 1순위로 잡은 것 | 진짜 | 부류 |
|---|---|---|---|
| lokalise/i18n-ally | `examples/by-frameworks/chrome-extension/_locales/…` | `locales/{locale}.json` (2순위) | **예제 디렉터리가 진짜를 가림** |
| ant-design/ant-design | `.dumi/theme/locales/{locale}.json` (2로케일) | `components/locale/{locale}.ts` (73, 미지원) | 문서 사이트 부속물 |
| payloadcms/payload | `examples/localization/src/i18n/messages/…` | `packages/translations/src/languages/{locale}.ts` (40, 미지원) | **예제 디렉터리** |
| happy-func/next-official | `locale/article/{locale}.json` | `locale/{locale}.ts` (미지원) | 콘텐츠를 UI 카탈로그로 오인 |

**새 부류가 하나 드러났다: `examples/`·`.dumi/` 같은 부속 디렉터리.** 지금 순위 규칙(i18n 경로
신호 → 로케일 수 → 경로순)에는 "예제·픽스처 디렉터리를 내린다"는 신호가 없다.

### ③ `read` 에러 — 유형별

| 유형 | 건수 | 어디서 |
|---|---|---|
| `chrome-key`(크롬 키 문자 위반) | **1,843** | **전부 kkapsner/CanvasBlocker 하나** |
| **키 충돌** | **345** | musicblocks 324 · siyuan 21 |
| 무증상 skip(spread·shorthand·computed) | **0** | ts-dict가 한 번도 안 잡혔다 (아래 판정 ③) |
| JSON 파싱 실패 / 최상위 비객체 / 리프 타입 / 문자열 리터럴 아님 | 0 | — |

**에러가 거의 안 난다는 것이 좋은 소식만은 아니다** — 아래 ④가 보여주듯 **에러 없이 사라지는
데이터**가 따로 있었다.

### ④ 왕복 안정성 — 2층

첫 write가 원본과 바이트가 다른 것은 **정상**이다(원본이 우리 정렬 규칙을 따를 이유가 없다 —
ARCHITECTURE §1.2). 그래서 "같다"를 두 뜻으로 나눠 쟀다.

| 층 | 값 | 실패의 뜻 |
|---|---|---|
| **의미 게이트** (read→write→read = 1차 read) | **70/72 = 97.2%** | **데이터 손실** |
| **바이트 고정점** (2차 write = 1차 write) | **72/72 = 100%** | 결정성 결함 |

**결정성은 109개 리포 전수에서 깨지지 않았다.** MVP §4.1의 불변식이 남의 리포에서도 성립한다.

**첫 write의 변경 줄 비율** (원본 대비, base 로케일 파일 기준):

| p10 | p25 | **중앙값** | p75 | p90 | 절반 이상 바뀐 리포 |
|---|---|---|---|---|---|
| 0.216 | 0.566 | **0.705** | 0.957 | 0.996 | **56/72 = 77.8%** |

0에 가까운 리포는 **4개뿐**이다(immich·mastodon·Afilmory·joinmastodon — 원본이 이미 정렬돼 있다).

## 2. 조용한 데이터 손실 2건 — 이 실험의 가장 무거운 발견

의미 게이트를 통과하지 못한 2건은 **`read` 에러가 0이었다.** 즉 CI 게이트도, 에러 카운터도
잡지 못하고 값만 사라진다.

| 리포 | 손실 | 형태 |
|---|---|---|
| siyuan-note/siyuan | 2,636키 중 1키 | 중첩 객체 안의 키가 점을 품어 `_taskAction.task.database`(문자열)와 `_taskAction.task.database.index`가 공존 |
| sugarlabs/musicblocks | 84로케일 중 **81개**에서 각 4키 | `"Clear workspace"`와 `"Clear workspace."`(끝점)가 나란히 있다 |

**뿌리는 하나다: `.`가 우리 조인 구분자이면서 실제 키에 들어 있는 문자다.** `flatten`/`setDeep`
쌍이 단사가 아니라, 한 키가 다른 키의 점 경계 접두이면 복원에서 한쪽이 객체로 덮인다.

증폭 요인이 둘 더 있다:

- **`ReadResult.nested`가 파일이 아니라 포맷 단위 boolean이다.** musicblocks의 `th.json`은 최상위가
  전부 문자열인데, **다른 로케일 파일** 하나에 객체가 있어서 포맷 전체가 nested로 판정되고 →
  th.json의 평평한 키까지 `.`으로 쪼개진다.
- **`setDeep`이 문자열 자리를 빈 객체로 조용히 갈아끼운다.** 경고도 에러도 없다.

**지표 ③이 이걸 처음엔 0으로 셌다.** 충돌 카운터가 *정확히 같은 키*만 봤기 때문이다. 접두 충돌을
세도록 고친 뒤 345건이 나왔고, **충돌이 있는 리포와 왕복이 실패한 리포가 정확히 일치**한다
(musicblocks·siyuan 둘뿐). 왕복 검증이 없었으면 이 계열은 통째로 안 보였다.

## 3. `detect` 실패 4건 — 원인이 전부 다르다

지원 포맷인데 못 찾은 4개. 셋은 **probe가 정렬상 첫 로케일 하나만 샘플로 읽는다**는 같은 구조에서
나왔고, 그 첫 로케일이 체계적으로 **가장 덜 관리된 파일**이다.

| 리포 | 샘플 파일 | 왜 떨어졌나 |
|---|---|---|
| esmBot/esmBot (26로케일) | `locales/bg.json` | 내용이 `{}` — **빈 스텁 로케일** |
| jsxc/jsxc (30로케일) | `locales/ar.json` | 최상위에 `"Notifications": null` — **`null` 값** |
| scratchblocks (78로케일) | `locales/ab.json` | 최상위에 `percentTranslated`(숫자) — **메타데이터 필드** |
| arkadiyt/zoom-redirector | — | 로케일이 `en` 하나뿐 — **"2개 이상" 오탐 방지 규칙에 의도적으로 걸림** |

앞의 셋은 `looksLikeCatalog`가 최상위 값 중 **하나라도** 문자열·객체가 아니면 리포 전체를 버리는
데서 온다. 정책이 "샘플 1개 × 전부 통과"라 가장 약한 파일이 전체를 결정한다.

## 4. 규모·구간별 관측

| 스타 구간 | 리포 | 후보를 낸 리포 |
|---|---|---|
| A (>2k) | 43 | 26 (60.5%) |
| B (100~2k) | 55 | 44 (80.0%) |
| C (<100) | 11 | 2 (18.2%) |

**큰 리포일수록 탐지율이 낮다.** A 구간에 YAML(mastodon·decidim·redmine·directus)과 per-locale TS
(ant-design·element-plus·vuetify·payload) 같은 성숙한 생태계 관례가 몰려 있기 때문이다. C 구간이
낮은 것은 표본 때문이다 — 코드 검색으로 뽑다 보니 소형 TS 데이트피커 라이브러리가 몰렸다.

부수 관측:

- **한 리포에 후보가 2개 이상**: 15개. 최다는 chatwoot **58개**(로케일마다 디렉터리가 하나씩 잡힌다)
- **ICU 복수형**: 3개 리포뿐 (immich 137키, mastodon 72, strapi 28) — MVP §7 비범위 유지의 근거
- **단순 치환자(`{name}`)**: 29개 리포 — 이쪽이 훨씬 흔하다
- **`.`이 아닌 구분자**: 5개 리포 (invidious·mini-qr·vim-cheat-sheet·musicblocks·lib.reviews)
- **설정 파일**(`i18next-parser.config.*`·`crowdin.yml`·`lingui.config.*` 등): **0개.** 설정 기반 탐지의
  우선순위는 낮다 — 근거가 없어졌다
- **파일 선택 예산(1,200개) 초과**: 0개 / **diff 근사 폴백**: 0회 — 두 안전장치 모두 실제로는 안 걸렸다

## 5. 판정 4개

### 판정 ① 지원 선언 포맷

**`chrome-locales`와 `json-catalog`를 "동작한다"고 말할 수 있다.**

근거: 두 포맷이 1순위로 잡힌 72개 리포에서 **바이트 고정점 100%**, 의미 왕복 97.2%, 오탐 5.6%.
다만 **선언에 단서 둘을 붙인다**:

1. **중첩 JSON에서 키가 `.`을 품으면 값이 사라질 수 있다** (§2). json-catalog의 중첩 모드는
   "동작한다"의 범위 밖으로 뺀다 — 고치기 전까지는.
2. `chrome-locales`의 키 문자 제약은 실제로 걸린다(CanvasBlocker 1,843건).

**`ts-dict`는 지원 선언에서 뺀다** (판정 ③).

### 판정 ② MVP §4.1 "키 정렬" — **개정이 필요하다**

지표 ④의 첫 write 변경 줄 비율이 **중앙값 0.705, 77.8%의 리포가 절반 이상**, p90은 0.996이다.
원본이 이미 정렬돼 있는 리포는 **72개 중 4개**뿐이다.

즉 **연동 첫 pull PR은 대부분의 리포에서 로케일 파일이 통째로 재정렬된 diff로 나간다.**
`ts-dict`에 수술적 치환을 도입한 이유(빈 줄·주석 파괴)와 같은 문제이고, 규모가 큰 쪽이 더 나쁘다 —
skillflo 1446키, musicblocks 5514키짜리 전면 재정렬 PR을 리뷰어가 머지하지 않는다.

→ **"원본 키 순서 보존" 모드를 별 `/feature`로 뺀다.** 원본을 write 입력에 포함시키면 결정성과
양립한다(같은 `DB 상태 + 원본` → 같은 바이트). `ts-dict`가 이미 그 구조이고 `DetectedFormat.currentFiles`에
자리도 있다. 대가는 pull이 blob SHA만이 아니라 내용을 받는 것인데, MVP §3.3 1층(DB 측 스킵)이
편집 없는 날의 호출을 이미 0으로 만들므로 추가 비용이 편집 있는 날로 한정된다.

### 판정 ③ `ts-dict` 자동 탐지 — **제외한다**

**109개 리포에서 `ts-dict`가 후보 목록에 단 한 번도 오르지 않았다.** 반면 코드 딕셔너리를 쓰는
리포는 12개 있었고 **전부 `per-locale` TS**(로케일당 파일 하나)였다 — `ts-dict`가 전제하는
"한 파일에 로케일 여러 개"는 bugshot-2의 관례이지 생태계의 관례가 아니다.

따라서 자동 탐지 후보에서 뺀다. 근거는 오탐이 아니라 **적중이 0이라는 것**이다 — probe에서
`.ts` 디렉터리마다 ts-morph를 돌리는 비용만 남는다.

⚠️ **하류 영향**: 제외하면 코드 딕셔너리 리포의 온보딩 경로가 **`--adapter ts-dict` 명시 지정**이
된다. 실전 검증 대상인 bugshot-2(903키)가 바로 그 리포라 6·7단계 하네스 명령이 바뀐다.

⚠️ **측정의 한계를 함께 적는다**: `selectSurveyFiles`가 ts 후보를 i18n 신호 디렉터리로 좁힌다.
이 편향은 한 방향뿐이라 `ts-dict` 탐지를 **과소** 보고할 뿐이지만, "0회"가 "0에 가깝다"일 수는 있다.

### 판정 ④ 자동 포맷 탐지의 무인 신뢰 — **조건부로 가능하다**

오탐률 **5.6%**로 중단 기준(30%, 잠정값)을 크게 밑돈다. 다만 **무인으로 열어도 된다는 뜻은
아니다** — 남은 5.6%가 전부 **조용한 오탐**이기 때문이다: 잘못 잡아도 에러가 안 나고, 잘못 잡은 채
pull이 돌면 남의 예제 디렉터리를 덮어쓴다.

→ **연동 시 1순위 후보를 사람이 확인하는 단계 하나**면 충분하다(후보 목록과 로케일·키 수를 보여주고
고르게 한다). 전면 수동으로 돌릴 근거는 없다. `detectCandidates`가 이미 그 화면에 필요한 데이터를 준다.

*30%는 도출 근거가 없는 잠정값이었고, 표본이 손으로 고른 비확률 표본이라 그 위의 고정 임계값은
유사 정밀성이다. 실측이 그 1/5 수준으로 나와 임계값 논쟁 없이 결론이 났다.*

## 6. 이 실험이 답하지 않은 것

- 첫 pull PR을 개발자가 실제로 머지하는가 (지표 ④는 대리 지표다)
- 번역자가 `refs` permalink를 클릭하는가
- YAML·`.po`·per-locale TS 어댑터를 실제로 만들었을 때의 왕복 품질

## 7. 여기서 파생된 후속 작업

| 순위 | 항목 | 근거 |
|---|---|---|
| 1 | **키에 `.`이 든 경우의 손실 수리** — `nested`를 파일 단위로, `setDeep` 충돌을 에러로 | §2 (조용한 데이터 손실) |
| 2 | **"원본 키 순서 보존" 모드** | 판정 ② |
| 3 | **YAML 어댑터** | 미지원 36개 중 17개 |
| 4 | **per-locale 코드 딕셔너리 어댑터** (TS/JS) | 미지원 12개 |
| 5 | **`looksLikeCatalog` 완화** — 샘플 여러 개, 최상위 메타데이터·`null` 허용 | §3 (탐지 실패 3건) |
| 6 | **순위에 "예제·픽스처 디렉터리" 감점 신호** | ②의 오탐 4건 중 2건 |
| 7 | `ts-dict`를 자동 탐지에서 제외 + `--adapter` 명시를 공식 경로로 | 판정 ③ |
| — | 설정 파일 기반 탐지 | **하지 않는다** — 표본 109개 중 0개 |
| — | ICU 복수형 지원 | **하지 않는다** — 3개 리포뿐, MVP §7 유지 |


## 8. 포맷별 요약

| 1순위 어댑터 | 리포 | 오탐 | 왕복 의미 동일 | 바이트 고정점 | diff 중앙값 | read 에러 | 무증상 skip |
|---|---|---|---|---|---|---|---|
| `chrome-locales` | 34 | 1/34 (2.9%) | 34/34 (100.0%) | 34/34 (100.0%) | 0.669 | 1843 | 0 |
| `json-catalog` | 38 | 3/38 (7.9%) | 36/38 (94.7%) | 38/38 (100.0%) | 0.744 | 0 | 0 |
| `탐지 실패` | 37 | 0/0 (–%) | 0/0 (–%) | 0/0 (–%) | – | 0 | 0 |

## 9. 리포별 상세

**행 하나가 곧 재현 경로다.** 판정: ✅ 1순위가 정답 / ❌ 오탐 또는 탐지 실패 / ➖ 미지원 포맷이라 안 잡는 게 맞음 / ❔ 정답 미등록.

| 리포 | 구간 | 1순위 후보 | 판정 | 정답 순위 | 로케일 | 키 | 에러 | skip | 충돌 | 왕복(의미/바이트) | diff | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [24pullrequests/24pullrequests](https://github.com/24pullrequests/24pullrequests) | B | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: yaml |
| [Afilmory/afilmory](https://github.com/Afilmory/afilmory) | A | `locales/app/{locale}.json` | ✅ | 1 | 6 | 446 | 0 | 0 | 0 | same/same | 0.000 | – |
| [Alanrk/LazyCat-Bookmark-Cleaner](https://github.com/Alanrk/LazyCat-Bookmark-Cleaner) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 2 | 211 | 0 | 0 | 0 | same/same | 0.670 | – |
| [AppFlowy-IO/AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) | A | `frontend/resources/translations/{locale}.json` | ✅ | 1 | 36 | 3644 | 0 | 0 | 0 | same/same | 0.862 | – |
| [CitizensFoundation/your-priorities](https://github.com/CitizensFoundation/your-priorities) | C | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: yaml |
| [DMPRoadmap/roadmap](https://github.com/DMPRoadmap/roadmap) | B | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: yaml |
| [EYHN/Furigana](https://github.com/EYHN/Furigana) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 2 | 2 | 0 | 0 | 0 | same/same | 0.429 | – |
| [EralChen/vike-vue-content](https://github.com/EralChen/vike-vue-content) | C | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: ts-per-locale |
| [FirefoxBar/HeaderEditor](https://github.com/FirefoxBar/HeaderEditor) | B | `public/_locales/{locale}/messages.json` | ✅ | 1 | 6 | 162 | 0 | 0 | 0 | same/same | 1.000 | – |
| [GSA/search-gov](https://github.com/GSA/search-gov) | C | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: yaml |
| [GoogleChrome/chromium-dashboard](https://github.com/GoogleChrome/chromium-dashboard) | B | `locales/release_notes/{locale}.json` | ✅ | 1 | 10 | 48 | 0 | 0 | 0 | same/same | 0.686 | – |
| [Growstuff/growstuff](https://github.com/Growstuff/growstuff) | B | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: yaml |
| [Js-Monkey/datepicker](https://github.com/Js-Monkey/datepicker) | C | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: ts-per-locale |
| [Kareadita/Kavita](https://github.com/Kareadita/Kavita) | A | `UI/Web/src/assets/langs/{locale}.json` | ✅ | 1 | 39 | 3790 | 0 | 0 | 0 | same/same | 0.996 | – |
| [Midnight-Lizard/Midnight-Lizard](https://github.com/Midnight-Lizard/Midnight-Lizard) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 51 | 329 | 0 | 0 | 0 | same/same | 0.757 | – |
| [NativeMindBrowser/NativeMindExtension](https://github.com/NativeMindBrowser/NativeMindExtension) | B | `public/_locales/{locale}/messages.json` | ✅ | 1 | 14 | 4 | 0 | 0 | 0 | same/same | 0.400 | – |
| [RoderickQiu/wnr](https://github.com/RoderickQiu/wnr) | B | `locales/{locale}.json` | ✅ | 1 | 6 | 537 | 0 | 0 | 0 | same/same | 0.994 | – |
| [SchizoDuckie/DuckieTV](https://github.com/SchizoDuckie/DuckieTV) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 27 | 6 | 0 | 0 | 0 | same/same | 0.333 | – |
| [Shopify/dawn](https://github.com/Shopify/dawn) | A | `locales/{locale}.json` | ✅ | 1 | 30 | 419 | 0 | 0 | 0 | same/same | 0.791 | – |
| [Smile4ever/Neat-URL](https://github.com/Smile4ever/Neat-URL) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 8 | 38 | 0 | 0 | 0 | same/same | 0.566 | – |
| [Tardo/OdooTerminal](https://github.com/Tardo/OdooTerminal) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 3 | 119 | 0 | 0 | 0 | same/same | 0.623 | – |
| [Warma10032/VideoAdGuard](https://github.com/Warma10032/VideoAdGuard) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 2 | 29 | 0 | 0 | 0 | same/same | 0.597 | – |
| [WordPress/browser-extension](https://github.com/WordPress/browser-extension) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 3 | 98 | 0 | 0 | 0 | same/same | 0.715 | – |
| [YunoHost/yunohost](https://github.com/YunoHost/yunohost) | A | `locales/{locale}.json` | ✅ | 1 | 45 | 925 | 0 | 0 | 0 | same/same | 0.997 | – |
| [ZeusLN/zeus](https://github.com/ZeusLN/zeus) | B | `locales/{locale}.json` | ✅ | 1 | 34 | 2648 | 0 | 0 | 0 | same/same | 0.999 | – |
| [Zimomo333/unreal-ui-next](https://github.com/Zimomo333/unreal-ui-next) | C | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: none |
| [ajayyy/SponsorBlock](https://github.com/ajayyy/SponsorBlock) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: submodule |
| [anatolyzenkov/button-stealer](https://github.com/anatolyzenkov/button-stealer) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 22 | 35 | 0 | 0 | 0 | same/same | 0.959 | – |
| [ant-design/ant-design](https://github.com/ant-design/ant-design) | A | `.dumi/theme/locales/{locale}.json` | ❌ | – | 2 | 135 | 0 | 0 | 0 | same/same | 0.804 | 미지원: ts-per-locale |
| [arco-design/arco-design-vue](https://github.com/arco-design/arco-design-vue) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: ts-per-locale |
| [arkadiyt/zoom-redirector](https://github.com/arkadiyt/zoom-redirector) | B | – | ❌ | 없음 | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | – |
| [arunelias/session-alive](https://github.com/arunelias/session-alive) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 6 | 23 | 0 | 0 | 0 | same/same | 0.600 | – |
| [az0/linkgopher](https://github.com/az0/linkgopher) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 6 | 11 | 0 | 0 | 0 | same/same | 0.442 | – |
| [badsgahhl/pihole-browser-extension](https://github.com/badsgahhl/pihole-browser-extension) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 2 | 42 | 0 | 0 | 0 | same/same | 0.978 | – |
| [bitwarden/clients](https://github.com/bitwarden/clients) | A | `apps/browser/src/_locales/{locale}/messages.json` | ✅ | 1 | 63 | 2158 | 0 | 0 | 0 | same/same | 0.707 | – |
| [bluecaret/carettab](https://github.com/bluecaret/carettab) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 15 | 2 | 0 | 0 | 0 | same/same | 0.889 | – |
| [brandon1024/find](https://github.com/brandon1024/find) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 2 | 56 | 0 | 0 | 0 | same/same | 0.667 | – |
| [chatwoot/chatwoot](https://github.com/chatwoot/chatwoot) | A | `app/javascript/widget/i18n/locale/{locale}.json` | ✅ | 1 | 57 | 88 | 0 | 0 | 0 | same/same | 0.723 | – |
| [codeforjapan/mapprint](https://github.com/codeforjapan/mapprint) | C | `locales/{locale}.json` | ✅ | 1 | 13 | 33 | 0 | 0 | 0 | same/same | 0.613 | – |
| [darkreader/darkreader](https://github.com/darkreader/darkreader) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: custom |
| [decidim/decidim](https://github.com/decidim/decidim) | B | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: yaml |
| [dequelabs/axe-core](https://github.com/dequelabs/axe-core) | A | `locales/{locale}.json` | ✅ | 1 | 19 | 618 | 0 | 0 | 0 | same/same | 0.693 | – |
| [diaspora/diaspora](https://github.com/diaspora/diaspora) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: yaml |
| [directus/directus](https://github.com/directus/directus) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: yaml |
| [element-hq/element-web](https://github.com/element-hq/element-web) | A | `apps/desktop/src/i18n/strings/{locale}.json` | ✅ | 1 | 41 | 76 | 0 | 0 | 0 | same/same | 0.957 | – |
| [element-plus/element-plus](https://github.com/element-plus/element-plus) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: ts-per-locale |
| [esmBot/esmBot](https://github.com/esmBot/esmBot) | B | – | ❌ | 없음 | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | – |
| [extesy/hoverzoom](https://github.com/extesy/hoverzoom) | A | `_locales/{locale}/messages.json` | ✅ | 1 | 52 | 296 | 0 | 0 | 0 | same/same | 0.983 | – |
| [fastladder/fastladder](https://github.com/fastladder/fastladder) | B | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: yaml |
| [forem/forem](https://github.com/forem/forem) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: yaml |
| [g0v/newshelper-extension](https://github.com/g0v/newshelper-extension) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 2 | 9 | 0 | 0 | 0 | same/same | 0.425 | – |
| [gildas-lormeau/SingleFile](https://github.com/gildas-lormeau/SingleFile) | A | `_locales/{locale}/messages.json` | ✅ | 1 | 17 | 290 | 0 | 0 | 0 | same/same | 0.997 | – |
| [go-vikunja/vikunja](https://github.com/go-vikunja/vikunja) | A | `frontend/src/i18n/lang/{locale}.json` | ✅ | 1 | 37 | 1364 | 0 | 0 | 0 | same/same | 0.874 | – |
| [gorhill/uBlock](https://github.com/gorhill/uBlock) | A | `platform/mv3/extension/_locales/{locale}/messages.json` | ✅ | 1 | 71 | 115 | 0 | 0 | 0 | same/same | 0.663 | – |
| [hackmdio/codimd](https://github.com/hackmdio/codimd) | A | `locales/{locale}.json` | ✅ | 1 | 24 | 140 | 0 | 0 | 0 | same/same | 0.984 | – |
| [happy-func/next-official](https://github.com/happy-func/next-official) | C | `locale/article/{locale}.json` | ❌ | – | 2 | 1 | 0 | 0 | 0 | same/same | 0.143 | 미지원: ts-per-locale |
| [henices/Chrome-proxy-helper](https://github.com/henices/Chrome-proxy-helper) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 4 | 97 | 0 | 0 | 0 | same/same | 0.988 | – |
| [home-assistant/frontend](https://github.com/home-assistant/frontend) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: build-time |
| [hoppscotch/hoppscotch](https://github.com/hoppscotch/hoppscotch) | A | `packages/hoppscotch-common/locales/{locale}.json` | ✅ | 1 | 34 | 2167 | 0 | 0 | 0 | same/same | 0.409 | – |
| [huginn/huginn](https://github.com/huginn/huginn) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: none |
| [immich-app/immich](https://github.com/immich-app/immich) | A | `i18n/{locale}.json` | ✅ | 1 | 89 | 2347 | 0 | 0 | 0 | same/same | 0.000 | – |
| [iv-org/invidious](https://github.com/iv-org/invidious) | A | `locales/{locale}.json` | ✅ | 1 | 63 | 614 | 0 | 0 | 0 | same/same | 0.813 | – |
| [ixrock/XTranslate](https://github.com/ixrock/XTranslate) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 20 | 226 | 0 | 0 | 0 | same/same | 0.653 | – |
| [jellyfin/jellyfin-web](https://github.com/jellyfin/jellyfin-web) | A | `src/strings/{locale}.json` | ✅ | 1 | 107 | 1947 | 0 | 0 | 0 | same/same | 0.500 | – |
| [jinliming2/Chrome-Charset](https://github.com/jinliming2/Chrome-Charset) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 47 | 34 | 0 | 0 | 0 | same/same | 0.541 | – |
| [jsxc/jsxc](https://github.com/jsxc/jsxc) | B | – | ❌ | 없음 | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | – |
| [jumodada/better-datepicker](https://github.com/jumodada/better-datepicker) | C | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: ts-per-locale |
| [kee-org/browser-addon](https://github.com/kee-org/browser-addon) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 18 | 227 | 0 | 0 | 0 | same/same | 0.705 | – |
| [kkapsner/CanvasBlocker](https://github.com/kkapsner/CanvasBlocker) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 19 | 321 | 1843 | 0 | 0 | same/same | 0.998 | – |
| [lokalise/i18n-ally](https://github.com/lokalise/i18n-ally) | A | `examples/by-frameworks/chrome-extension/_locales/{locale}/messages.json` | ❌ | 2 | 2 | 2 | 0 | 0 | 0 | same/same | 0.143 | – |
| [lyqht/mini-qr](https://github.com/lyqht/mini-qr) | A | `locales/{locale}.json` | ✅ | 1 | 50 | 375 | 0 | 0 | 0 | same/same | 0.306 | – |
| [mastodon/joinmastodon](https://github.com/mastodon/joinmastodon) | B | `locales/{locale}.json` | ✅ | 1 | 54 | 307 | 0 | 0 | 0 | same/same | 0.000 | – |
| [mastodon/mastodon](https://github.com/mastodon/mastodon) | A | `app/javascript/mastodon/locales/{locale}.json` | ✅ | 1 | 106 | 1481 | 0 | 0 | 0 | same/same | 0.000 | – |
| [mcthesw/game-save-manager](https://github.com/mcthesw/game-save-manager) | B | `locales/{locale}.json` | ✅ | 1 | 7 | 1131 | 0 | 0 | 0 | same/same | 0.667 | – |
| [mdolr/survol](https://github.com/mdolr/survol) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 35 | 10 | 0 | 0 | 0 | same/same | 0.951 | – |
| [micz/ThunderAI](https://github.com/micz/ThunderAI) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 25 | 605 | 0 | 0 | 0 | same/same | 0.720 | – |
| [mikebryant/ac-nh-turnip-prices](https://github.com/mikebryant/ac-nh-turnip-prices) | B | `locales/{locale}.json` | ✅ | 1 | 21 | 62 | 0 | 0 | 0 | same/same | 0.641 | – |
| [misskey-dev/misskey](https://github.com/misskey-dev/misskey) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: yaml |
| [moebooru/moebooru](https://github.com/moebooru/moebooru) | B | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: yaml |
| [nt1m/livemarks](https://github.com/nt1m/livemarks) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 19 | 62 | 0 | 0 | 0 | same/same | 0.644 | – |
| [okisdev/ChatChat](https://github.com/okisdev/ChatChat) | B | `locales/{locale}.json` | ✅ | 1 | 13 | 99 | 0 | 0 | 0 | same/same | 0.765 | – |
| [olegcherr/Reedy-for-Chrome](https://github.com/olegcherr/Reedy-for-Chrome) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 2 | 79 | 0 | 0 | 0 | same/same | 0.989 | – |
| [payloadcms/payload](https://github.com/payloadcms/payload) | A | `examples/localization/src/i18n/messages/{locale}.json` | ❌ | – | 5 | 14 | 0 | 0 | 0 | same/same | 0.529 | 미지원: ts-per-locale |
| [permacommons/lib.reviews](https://github.com/permacommons/lib.reviews) | B | `locales/{locale}.json` | ✅ | 1 | 40 | 740 | 0 | 0 | 0 | same/same | 0.996 | – |
| [pietervanheijningen/clickbait-remover-for-youtube](https://github.com/pietervanheijningen/clickbait-remover-for-youtube) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 9 | 13 | 0 | 0 | 0 | same/same | 0.636 | – |
| [primefaces/primevue](https://github.com/primefaces/primevue) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: in-code |
| [quasarframework/quasar](https://github.com/quasarframework/quasar) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: js-per-locale |
| [raingart/AutoHideDownloadsBar-extension](https://github.com/raingart/AutoHideDownloadsBar-extension) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 8 | 42 | 0 | 0 | 0 | same/same | 0.978 | – |
| [redmine/redmine](https://github.com/redmine/redmine) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: yaml |
| [refinery/refinerycms-news](https://github.com/refinery/refinerycms-news) | B | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: yaml |
| [rtorr/vim-cheat-sheet](https://github.com/rtorr/vim-cheat-sheet) | B | `locales/{locale}.json` | ✅ | 1 | 40 | 519 | 0 | 0 | 0 | same/same | 0.784 | – |
| [samueljun/tomato-clock](https://github.com/samueljun/tomato-clock) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 10 | 71 | 0 | 0 | 0 | same/same | 0.648 | – |
| [scratchblocks/scratchblocks](https://github.com/scratchblocks/scratchblocks) | B | – | ❌ | 없음 | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | – |
| [sitb-software/veigar](https://github.com/sitb-software/veigar) | C | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: none |
| [siyuan-note/siyuan](https://github.com/siyuan-note/siyuan) | A | `app/appearance/langs/{locale}.json` | ✅ | 1 | 21 | 2639 | 0 | 0 | 21 | different/same | 0.999 | – |
| [solidusio/solidus_i18n](https://github.com/solidusio/solidus_i18n) | C | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: yaml |
| [strapi/strapi](https://github.com/strapi/strapi) | A | `packages/core/admin/admin/src/translations/{locale}.json` | ✅ | 1 | 35 | 1267 | 0 | 0 | 0 | same/same | 0.216 | – |
| [stringer-rss/stringer](https://github.com/stringer-rss/stringer) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: yaml |
| [sugarlabs/musicblocks](https://github.com/sugarlabs/musicblocks) | B | `locales/{locale}.json` | ✅ | 1 | 84 | 5514 | 0 | 0 | 324 | different/same | 0.968 | – |
| [tusen-ai/naive-ui](https://github.com/tusen-ai/naive-ui) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: ts-per-locale |
| [tyrasd/overpass-turbo](https://github.com/tyrasd/overpass-turbo) | B | `locales/{locale}.json` | ✅ | 1 | 48 | 307 | 0 | 0 | 0 | same/same | 0.851 | – |
| [uppinote20/claude-dashboard](https://github.com/uppinote20/claude-dashboard) | B | `locales/{locale}.json` | ✅ | 1 | 2 | 44 | 0 | 0 | 0 | same/same | 0.576 | – |
| [usememos/memos](https://github.com/usememos/memos) | A | `web/src/locales/{locale}.json` | ✅ | 1 | 44 | 959 | 0 | 0 | 0 | same/same | 0.196 | – |
| [violentmonkey/violentmonkey](https://github.com/violentmonkey/violentmonkey) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: yaml |
| [vuetifyjs/vuetify](https://github.com/vuetifyjs/vuetify) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: ts-per-locale |
| [ylater/me-nuxt](https://github.com/ylater/me-nuxt) | C | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: ts-per-locale |
| [yui540/comimi](https://github.com/yui540/comimi) | B | `locales/{locale}.json` | ✅ | 1 | 6 | 43 | 0 | 0 | 0 | same/same | 0.652 | – |
| [z-------------/CPod](https://github.com/z-------------/CPod) | B | `locales/{locale}.json` | ✅ | 1 | 16 | 163 | 0 | 0 | 0 | same/same | 0.799 | – |
| [zmh-program/next-whois](https://github.com/zmh-program/next-whois) | B | `locales/{locale}.json` | ✅ | 1 | 8 | 138 | 0 | 0 | 0 | same/same | 0.799 | – |
