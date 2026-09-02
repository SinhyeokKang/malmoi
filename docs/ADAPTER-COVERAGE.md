# 어댑터 범용성 측정 결과

**오픈소스 리포 109개에 `detect`·`read`·왕복을 돌린 결과와, 그 숫자로 내린 판정이다.**
실험의 스펙·설계·태스크는 [features/adapter-generality/](./features/adapter-generality/)에 있다.

- 실행(학습 코퍼스): `pnpm adapter-survey docs/features/adapter-generality/repos.txt --verdicts docs/features/adapter-generality/verdicts.json`
- 실행(홀드아웃): `pnpm adapter-survey docs/features/adapter-generality/repos-heldout.txt --verdicts docs/features/adapter-generality/verdicts-heldout.json`
- 대상 목록: [repos.md](./features/adapter-generality/repos.md) / 정답 경로: [verdicts.json](./features/adapter-generality/verdicts.json)
- 규모: 학습 **109개 리포 · 1,900+ 로케일 · 43,000+ 키** + 홀드아웃 **20개**. clone 실패 0건

> **⚠️ 학습 코퍼스 109개의 숫자(§1~§4)는 어댑터를 그것에 맞춰 고친 뒤의 값이다.** 일반화 여부는
> 그 숫자가 아니라 **§0의 3차(홀드아웃 20개)** 가 답한다 — 고친 뒤에 처음 본 리포들이다.

## 0. 세 번의 측정 — 어댑터 3개 → 5개 → 홀드아웃 검증

**1차(2026-09-02 오전)는 판정을 위한 측정이었고, 2차(같은 날 오후)는 그 판정대로 만든 뒤의 측정이다.**
1차 결과로 어댑터 2개(`yaml-catalog`·`code-dict`)를 추가하고 결함 3건을 고쳤으며, 그 뒤 **같은 코퍼스에
7번 더 돌려** 결함 7건을 더 잡았다.

| 지표 | 1차 (어댑터 3개) | **2차 (어댑터 5개)** |
|---|---|---|
| ① `detect` 성공률 (지원 포맷) | 69/73 = 94.5% | **100/101 = 99.0%** |
| ① `detect` 성공률 (전체) | 72/109 = 66.1% | **100/109 = 91.7%** |
| ② 오탐률 (후보를 낸 리포) | 4/72 = 5.6% | **0/100 = 0.0%** |
| ④ 왕복 의미 동일 | 70/72 = 97.2% | 98/100 = 98.0% |
| ④ 바이트 고정점 (결정성) | 72/72 = 100% | **100/100 = 100%** |
| ④ 첫 write diff 중앙값 | 0.705 | **0.613** |
| **조용한 손실** | 2건 | **0건** |
| 미지원 포맷 리포 | 36 | **8** |

**이 작업이 실제로 바꾼 것은 "조용한 손실 0"이다.** 남은 왕복 실패 2건(siyuan 21키, musicblocks 324키)은
값을 잃는 것은 같지만 **어느 키에서 잃었는지 보고한다** — CI가 잡을 수 있는 상태가 됐다.

### 3차 — 처음 보는 리포 20개 (홀드아웃)

**1·2차의 숫자는 어댑터를 그 109개에 맞춰 고친 뒤의 값이라 일반화를 증명하지 않는다.** 그래서
겹치지 않는 리포 20개를 새로 골라, **손대기 전에** 한 번 돌렸다. 결과가 그 우려를 그대로 확인했다:

| 지표 | 홀드아웃 (수정 전) | **홀드아웃 (수정 후)** | 학습 109개 (참고) |
|---|---|---|---|
| ① `detect` (지원 포맷) | 0/0 = – | **16/17 = 94.1%** | 100/101 = 99.0% |
| ① `detect` (전체 20개) | 10/20 = 50.0% | **16/20 = 80.0%** | 100/109 = 91.7% |
| ② **오탐률** (후보를 낸 리포) | **4/10 = 40.0%** | **1/16 = 6.3%** | 0/100 = 0.0% |
| ④ 왕복 의미 동일 | 10/10 | **16/16 = 100%** | 98/100 = 98.0% |
| ④ 바이트 고정점 | 10/10 | **16/16 = 100%** | 100/100 = 100% |
| 조용한 손실 | 0건 | **0건** | 0건 |

**학습 코퍼스의 오탐 0.0%는 과적합이었다** — 처음 보는 20개에서 40%였다. 다만 실패의 성질이 다르다:
왕복(결정성·의미 보존)은 홀드아웃에서도 처음부터 100%였고, **무너진 것은 탐지뿐이다.** read/write
기계는 옮겨 갔고 "어느 파일이 카탈로그인가"의 판단이 옮겨 가지 않았다.

#### 못 보던 경로 모양 둘 — 20개 중 9개가 그 형태였다

| 모양 | 홀드아웃 빈도 | 예 |
|---|---|---|
| `{dir}/{locale}/<name>.json` — **로케일이 디렉터리** | 6/20 | grafana `public/locales/{locale}/grafana.json`, open-webui·outline `…/translation.json`, cal.com·Ghost `packages/i18n/locales/{locale}/…`, zulip `locale/{locale}/translations.json` |
| `{dir}/<prefix><sep>{locale}.<ext>` — **접두사 붙은 파일명** | 3/20 | discourse `config/locales/client.ar.yml`, gitea `options/locale/locale_de-DE.json`, jitsi `lang/main-af.json` |

**어댑터를 새로 만들지 않았다.** 두 모양 다 read·write가 기존 것과 완전히 같고 `pathTemplate`만
다르다 — `chrome-locales`가 애초에 첫 모양의 특수 사례(`_locales/{locale}/messages.json`)다.
`json-catalog`·`yaml-catalog`의 **탐지만** 넓혔다.

**로케일 디렉터리 형태는 디렉터리당 후보를 하나만 낸다** (`PRIMARY_NAMES`). `Project`가 포맷을 하나만
들기 때문이고, 그래서 Ghost의 네임스페이스 5개 중 1개만 덮는다 — 표면을 나누려면 프로젝트를
나눠야 한다 (MVP §7).

#### 3차가 잡은 결함 4건

| # | 결함 | 어떻게 드러났나 |
|---|---|---|
| 1 | **맨 3글자 이름이 로케일로 잡혔다** | `looksLikeLocale`이 `[a-z]{2,3}`을 받아 grafana의 `azuremonitor/dashboards/{adx,arg}.json`(대시보드 정의, read 에러 1,799)과 n8n의 `__schema__/…/{add,get}.json`이 **1순위**가 됐다. `add`·`get`·`adx`·`arg`가 전부 3글자다 |
| 2 | **로케일 디렉터리에서 파일 이름을 알파벳순으로 골랐다** | zulip이 `legacy_stream_translations.json`을, automa가 `blocks.json`을 집었다 — 둘 다 옆에 `translations.json`·`common.json`이 있다 |
| 3 | **접두사 후보가 맨 로케일 파일을 눌렀다** | rubygems.org의 `config/locales/avo.{locale}.yml`(Avo 관리자 UI)이 앱 카탈로그를 이겼다. 로케일 수·깊이가 같아 마지막 tiebreak인 **경로 사전순**으로 갔고 `a` < `{`였다 |
| 4 | **하위 카탈로그가 정본을 눌렀다** | DMPRoadmap/roadmap의 `config/locales/contact_us/contact_us.{locale}.yml`(17로케일 · **11키**)이 `config/locales/{locale}.yml`(15로케일)을 이겼다. **접두사 모양을 받으면서 생긴 회귀**이고, 자손 쪽 로케일 수가 실제로 더 많아 수 신호로는 안 뒤집힌다 |

1·2는 홀드아웃이 드러낸 것이고, **3·4는 이 라운드의 수정이 만든 회귀**다 — 4는 학습 코퍼스에서만
나타났으므로 **홀드아웃과 학습 코퍼스를 매 라운드 둘 다 돌린 것이 그것을 잡은 유일한 이유다.**

3은 `templateShapeRank`(맨 로케일 파일 > 로케일 디렉터리 > 접두사)로, 4는 `liftAncestors`(1순위의
조상 디렉터리에 있는 후보를 승격)로 고쳤다. **`liftAncestors`는 비교 함수가 아니라 정렬 뒤 후처리다** —
"조상이 이긴다"가 추이적이지 않아 `sort`에 넣으면 결과가 구현 정의가 된다.

#### 남은 오탐 1건 — 고치지 않고 보고한다

**discourse/discourse** — `plugins/discourse-cakeday/config/locales/client.{locale}.yml`(27키)을 고르고
정답 `config/locales/client.{locale}.yml`은 5순위다. 플러그인 쪽 로케일 파일이 **하나 더 많고**(50 vs 49)
다른 서브트리라 로케일 수도 조상 승격도 닿지 않는다. `plugins/` 감점을 넣으면 잡히지만 **관측이
1건뿐이라 만들지 않았다** — 근거 없는 규칙 추가가 이 프로젝트에서 결함이다. Ghost·payload처럼
`packages/`에 진짜 카탈로그를 두는 리포가 있어 "하위 디렉터리 감점"은 일반화할 수도 없다.

#### 미지원 3건 — 미탐지가 정답이다

| 리포 | 포맷 |
|---|---|
| mozilla/pdf.js | Fluent (`l10n/{locale}/viewer.ftl`) |
| Stirling-Tools/Stirling-PDF | Java `.properties` + 번들된 pdfjs `.ftl` |
| obsidianmd/obsidian-translations | `translations/{locale}.txt` — 줄 단위 텍스트 |

**n8n-io/n8n은 지원 포맷인데 미탐지다** — `packages/frontend/@n8n/i18n/src/locales/`에 `en.json`
하나뿐이라 zoom-redirector와 같은 "2개 이상" 정책에 걸린다. 수정 전에는 이 자리에
`packages/@n8n/{ai,di,db}/package.json`이 1순위로 올라와 있었다.

**TryGhost/Ghost는 첫 write diff를 못 잰다** — base(`en`)가 빈 스텁이다(영어 원문이 키 자체인 관례).
write가 `null`을 내므로 비교 대상이 없다. 결함이 아니라 그 리포의 성질이다.

## 1. 지표 4개 (학습 코퍼스 109개, 2차 이후 값 유지)

### ① `detect` 성공률 — 분모가 둘이다

| 분모 | 값 |
|---|---|
| **지원 포맷 리포** (101개) | **100/101 = 99.0%** |
| 측정된 전체 (109개) | 100/109 = 91.7% |

못 찾은 지원 포맷 1개는 **arkadiyt/zoom-redirector** — 로케일이 `en` 하나뿐이라 "2개 이상" 오탐 방지
규칙에 **의도적으로** 걸린다. 정책이지 결함이 아니다.

**미지원으로 남은 8개** — 어댑터를 더 만들 근거는 각 1~3개다:

| 사유 | 개수 | 리포 |
|---|---|---|
| 로케일 파일 없음 | 3 | huginn, veigar, unreal-ui-next |
| 소스 코드 내장 | 1 | primevue |
| 자체 포맷(`.config`) | 1 | darkreader |
| 빌드 시 외부 다운로드 | 1 | home-assistant/frontend |
| 서브모듈 | 1 | SponsorBlock (`public/_locales`가 gitlink) |
| **크롬 레이아웃 + YAML** | 1 | violentmonkey (`_locales/{locale}/messages.yml`) |

### ② 오탐률 — **0.0%**

**판정 주체는 `detect` 밖이다.** 리포별 정답 경로를 verdicts.json에 적고 후보 목록과 대조했다.
한 리포에 유효한 표면이 둘 이상이면(mastodon의 Rails YAML + 프런트 JSON, Kavita의 백엔드 + UI 등
11개) `alsoValid`로 등재했다 — 어느 쪽을 골라도 맞으므로 오탐으로 세면 숫자가 과장된다.

**정답 순위 분포**: `1순위 100 · 목록에 없음 1`. 1차의 `1순위 68 · 2순위 1 · 없음 4`에서 왔다.

### ③ `read` 에러 — 유형별

| 유형 | 건수 | 뜻 |
|---|---|---|
| `chrome-key` | 1,843 | 전부 kkapsner/CanvasBlocker 하나. 크롬 키 문자 제약은 실제로 걸린다 |
| `leaf-type` | 697 | 문자열이 아닌 리프(숫자·불린). Rails YAML에 흔하다 |
| `non-literal-value` | 621 | 코드 딕셔너리의 import 참조·템플릿 리터럴 (ant-design의 `Pagination` 등) |
| `key-collision` | 107 | YAML 중복 키 — **값 하나가 사라진다** |
| `non-object-root` | 4 | 최상위가 맵/객체가 아니다 |
| 무증상 skip | **0** | `ts-dict`가 자동 탐지에서 빠져 이 경로가 닫혔다 |

**`null` 리프는 에러가 아니다** (2차에서 정정). jsxc 한 리포가 이것만으로 5,099건을 냈는데, 그 리포는
미번역 키를 `null`로 두는 관례다 — 빈 문자열과 같은 취급이 맞고, 에러로 세면 남의 CI를 우리 관례로
실패시킨다.

### ④ 왕복 안정성 — 2층

| 층 | 값 | 실패의 뜻 |
|---|---|---|
| **의미 게이트** | **98/100 = 98.0%** | 데이터 손실 |
| **바이트 고정점** | **100/100 = 100%** | 결정성 결함 |

**결정성은 109개 리포 전수에서 성립한다.** MVP §4.1의 불변식이 남의 리포에서도 유지된다.

**첫 write 변경 줄 비율**: 중앙값 **0.613**, 절반 이상 바뀐 리포 **55/99 = 55.6%**.
1차의 0.705·77.8%에서 내려온 것은 **수술적 치환 어댑터가 diff 0.000을 내기 때문이다** —
`yaml-catalog` 18개, `code-dict` 11개가 원본을 바이트 그대로 보존한다.

## 2. 어댑터별

| 1순위 어댑터 | 리포 | 오탐 | 왕복 의미 동일 | 바이트 고정점 | diff 중앙값 | read 에러 | 무증상 skip |
|---|---|---|---|---|---|---|---|
| `chrome-locales` | 33 | 0/33 (0.0%) | 33/33 (100.0%) | 33/33 (100.0%) | 0.705 | 1843 | 0 |
| `code-dict` | 11 | 0/11 (0.0%) | 11/11 (100.0%) | 11/11 (100.0%) | 0.000 | 622 | 0 |
| `json-catalog` | 38 | 0/38 (0.0%) | 36/38 (94.7%) | 38/38 (100.0%) | 0.784 | 78 | 0 |
| `yaml-catalog` | 18 | 0/18 (0.0%) | 18/18 (100.0%) | 18/18 (100.0%) | 0.000 | 730 | 0 |
| `탐지 실패` | 9 | 0/0 (–%) | 0/0 (–%) | 0/0 (–%) | – | 0 | 0 |

**`json-catalog`만 diff가 크다** (중앙값 0.784). 재생성 방식이라 원본이 정렬돼 있지 않으면 파일이
통째로 재정렬된다 — 판정 ②가 요구하는 "원본 키 순서 보존"의 대상이 정확히 이 어댑터다.

## 3. 남은 손실 2건 — 이제 **보고된다**

| 리포 | 손실 | 보고 |
|---|---|---|
| siyuan-note/siyuan | 2,636키 중 1키 | `writeErrors` 21 |
| sugarlabs/musicblocks | 84로케일 중 81개에서 각 4키 | `writeErrors` 324 |

**뿌리는 `.`가 우리 조인 구분자이면서 실제 키에 들어 있는 문자라는 것이다.** `a.b`(문자열)와 `a.b.c`가
공존하면 중첩 복원에서 한쪽이 자리를 잃는다. 2차에서 고친 것:

- `nested`를 **파일 단위**로 관측한다 — 전에는 형제 파일 하나가 중첩이면 평평한 파일의 점 포함 키까지
  쪼개졌다(musicblocks가 그 형태였다).
- `setDeep`이 문자열 자리를 객체로 조용히 갈아끼우던 것을 **에러로 보고하고 얕은 쪽을 건너뛴다.**
  깊은 쪽을 살리는 건 임의 선택이 아니다 — 얕은 쪽을 살리면 그 아래 전부를 잃는다.

**완전한 해결은 `.`를 구분자로 쓰지 않는 것이고, 그건 계약 변경이라 별 기능이다** (§6-1).

## 4. 실측 루프가 잡은 결함 — 어댑터를 만든 뒤에 7건 더

**어댑터를 만들고 테스트를 통과시킨 뒤에도 실물 코퍼스가 7건을 더 잡았다.** 이게 이 실험의 존재
이유이고, 작은 픽스처가 원리적으로 못 잡는 계열이다 (`docs/POSTMORTEM.md` 2026-08-31).

| # | 결함 | 어떻게 드러났나 |
|---|---|---|
| 1 | **어댑터 간 순위가 고정 순서** | 2로케일 픽스처 JSON이 65로케일 YAML을 이겼다(GSA). 순위 신호가 어댑터 내부에만 있었다 |
| 2 | **껍데기가 `.yml`·`.js`를 안 골랐다** | `yaml-catalog`가 1순위로 잡힌 리포가 **0개**. 어댑터가 아니라 파일 선택의 문제였고, **먹이지 않으면 어댑터는 없는 것과 같다** |
| 3 | **survey가 `currentFiles`를 안 넘겼다** | code-dict 8개의 왕복이 `not-run` — **측정 안 됨이 실패로 안 보였다.** pull에서 고친 것과 같은 부류를 검증 층에서 놓쳤다 |
| 4 | **수술적 치환이 점 포함 키를 쪼갰다** | 평평한 점 키 파일에 중첩 객체를 새로 만들어 `diff 0.28`. 원본 규약을 갈아치우고 있었다 |
| 5 | **YAML 중복 키로 62로케일 카탈로그를 버렸다** | 파서가 중복을 에러로 보고 → "카탈로그 아님". 데이터 흠 하나가 리포 전체를 지웠다 |
| 6 | **중복 키에서 read는 마지막, write는 첫 항목** | 바이트 고정점 실패(solidus). 더 나쁘게 **앱이 보는 값과 고치는 값이 달라 번역이 조용히 무효**가 된다 |
| 7 | **시퀀스 경로를 못 걸어 키를 새로 만들었다** | `note.0`을 못 찾아 리터럴 `"note.0"`을 삽입 → 원본 시퀀스와 중복 → 값 진동(directus 70로케일 중 4개) |

**부수로 위양성 2건도 막았다**: `looksLikeLocale`이 이름만 보므로 `src/data/{fan,stt,tts}.ts`(도메인
모듈)가 로케일로 잡혀 **키 0개짜리 후보**가 됐다 — 문자열 리프가 하나라도 있어야 카탈로그다.

## 5. 판정 (2차 기준으로 갱신)

### 판정 ① 지원 선언 포맷

**`chrome-locales` · `json-catalog` · `yaml-catalog` · `code-dict` 넷을 "동작한다"고 말할 수 있다.**

근거: 넷이 1순위로 잡힌 100개 리포에서 **오탐 0%, 바이트 고정점 100%, 의미 왕복 98%**.
`ts-dict`는 **명시 지정 전용**이다 (판정 ③).

단서 하나: **중첩 JSON에서 키가 `.`을 품으면 값이 사라질 수 있다** (§3). 사라지는 것을 **보고**하므로
조용한 손실은 아니지만, 완전한 해결은 별 기능이다.

**경로 모양 3개** (2026-09-02 3차 추가). `json-catalog`·`yaml-catalog`이 read/write를 공유하고
`pathTemplate`만 다르다:

| 모양 | 어댑터 | 근거 |
|---|---|---|
| `{dir}/{locale}.{json,yml,ts,js}` | 전부 | 원래 형태 |
| `{dir}/{locale}/<name>.json` | `json-catalog` | 홀드아웃 6/20. **경로에 `locale(s)`·`i18n` 신호를 요구한다** — 디렉터리 이름이 로케일처럼 보이는 일이 파일 이름보다 훨씬 흔하다(n8n `packages/@n8n/{ai}/`) |
| `{dir}/<prefix><sep>{locale}.<ext>` | `json-catalog`·`yaml-catalog` | 홀드아웃 3/20. 구분자는 `.`·`-`·`_` |

**후보 그룹은 강한 로케일 코드를 하나 이상 요구한다** (`hasStrongLocale`). 맨 3글자(`add`·`get`)는
약하고, `en`·`zh-CN`·`koKR`·`fil-PH`는 강하다. 3글자 로케일(`fil`·`ceb`)은 강한 것 옆에 있으면 함께
인정된다 — 실제 카탈로그는 거의 항상 `en` 옆에 있다.

### 판정 ② MVP §4.1 "키 정렬" — **여전히 개정이 필요하다**

`json-catalog`의 첫 write diff 중앙값이 **0.784**다. 원본이 이미 정렬돼 있는 리포는 소수다.
**수술적 치환 어댑터가 diff 0.000을 내는 것이 대조군이 된다** — 같은 문제를 원본 보존으로 푸는 방식이
이미 코드베이스 안에 있고 18+11개 리포에서 동작한다.

→ **"원본 키 순서 보존" 모드를 별 `/feature`로 뺀다.** 재생성 writer에 `currentFiles`를 입력으로
주면 되고, pull은 이미 `writeStrategy === "surgical"`에서 원본을 받는 경로를 갖고 있다.

### 판정 ③ `ts-dict` 자동 탐지 — **제외 확정**

1차에서 109개 중 후보 **0회**였고, 코드 딕셔너리 리포는 전부 로케일당 파일 하나였다. 2차에서
`code-dict`를 만들어 **11개 리포를 왕복 100%·diff 0.000으로** 덮었다 — `ts-dict`가 덮지 못했던 것들이다.

`--adapter ts-dict` 명시 지정은 그대로 동작하고, 탐지 로직은 `tsDictDetectByContent`에 보관돼 있다.
bugshot-2가 그 경로의 유일한 사용자다.

### 판정 ④ 자동 포맷 탐지의 무인 신뢰 — **가능하다, 단 홀드아웃 6.3%가 실제 수치다**

| 코퍼스 | 오탐률 |
|---|---|
| 학습 109개 | 0.0% |
| **홀드아웃 20개 (수정 전)** | **40.0%** |
| **홀드아웃 20개 (수정 후)** | **6.3%** — 남은 1건은 discourse |

**보고할 숫자는 6.3%다.** 학습 코퍼스의 0.0%는 그 코퍼스에 맞춰 고친 뒤의 값이라 새 리포에서의
기대값이 아니다 — 홀드아웃이 정확히 그것을 재려고 있다. 중단 기준 30%(잠정값)는 수정 후 기준으로
통과하고, **수정 전 40%는 그 기준을 넘겼다.**

**"사람 확인 한 단계"는 없애지 않는다.** 3차가 그 근거를 강화했다:

- 오탐 4건 전부 **에러가 아니라 그럴듯한 답**이었다. grafana는 대시보드 정의 디렉터리를 카탈로그로
  내놓았고 read 에러 1,799건을 내면서도 후보 자격을 유지했다.
- 실패 모드가 한쪽으로 쏠린다: **read/write는 처음 보는 리포에서도 100%였고 무너진 것은 탐지뿐이다.**
  즉 위험은 "값을 잘못 쓴다"가 아니라 **"엉뚱한 파일을 대상으로 삼는다"** 이고, 그건 사람이 경로 하나
  보면 즉시 아는 종류다.

연동 시 후보 목록·로케일 수·키 수를 보여주고 고르게 하는 화면 하나가 여전히 값을 한다 —
`detectCandidates`가 그 데이터를 이미 준다.

## 6. 여기서 파생된 후속 작업

| 순위 | 항목 | 근거 |
|---|---|---|
| 1 | **키 구분자를 계약으로 뺀다** (`nested: boolean` → `tree: {style, separator}`) | §3의 손실 2건이 남아 있다. i18next의 `:` namespace 구분자도 같은 축 (비-점 구분자 8개 리포) |
| 2 | **"원본 키 순서 보존" 모드** (재생성 writer에 원본 입력) | 판정 ② — `json-catalog` diff 중앙값 0.784 |
| 3 | 크롬 레이아웃 + YAML (`_locales/{locale}/messages.yml`) | violentmonkey 1개 |
| 4 | 단일 로케일 리포 지원 여부 판정 | arkadiyt/zoom-redirector 1개. "2개 이상" 규칙의 대가다 |
| 5 | **하위 카탈로그가 정본을 누르는 경우** | discourse 1개. `plugins/` 감점은 관측 1건으로는 못 만든다 (§0 3차) |
| 6 | **로케일 디렉터리의 네임스페이스 여러 개** | Ghost 5개·automa 4개·Folo 10개. 한 프로젝트가 하나만 덮는다 — 프로젝트 분할이 답인지 판정 필요 |
| — | `.po`·`.arb`·`.strings`·`.properties` 어댑터 | **하지 않는다** — 표본 109개에 0개 |
| — | 설정 파일 기반 탐지 | **하지 않는다** — 표본 109개에 **0개** |
| — | ICU 복수형 지원 | **하지 않는다** — 2개 리포뿐, MVP §7 유지 |

## 7. 이 실험이 답하지 않은 것

- 첫 pull PR을 개발자가 실제로 머지하는가 (지표 ④는 대리 지표다)
- 번역자가 `refs` permalink를 클릭하는가
- **verdicts를 내가 적었다** — 표본을 고른 것도 정답을 적은 것도 같은 주체다. 오탐률은 그 전제 위의 숫자다
- **홀드아웃도 내가 골랐다** — "처음 보는 리포"라는 성질은 지켰지만(수정 전에 먼저 돌렸다) 무작위 표집이 아니다. 지원할 만한 포맷을 의도적으로 섞었으므로 전체 오픈소스 분포가 아니다
- **홀드아웃 20개는 학습 코퍼스가 됐다** — 이 라운드에서 그것에 맞춰 고쳤으므로, 다음 일반화 측정은 또 다른 새 리포가 필요하다

## 8. 리포별 상세

**행 하나가 곧 재현 경로다.** 판정: ✅ 1순위가 정답(또는 `alsoValid`) / ❌ 오탐·탐지 실패 / ➖ 미지원 포맷이라 안 잡는 게 맞음 / ❔ 정답 미등록.

| 리포 | 구간 | 1순위 후보 | 판정 | 정답 순위 | 로케일 | 키 | 에러 | skip | 충돌 | 왕복(의미/바이트) | diff | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [24pullrequests/24pullrequests](https://github.com/24pullrequests/24pullrequests) | B | `config/locales/{locale}.yml` | ✅ | 1 | 20 | 300 | 0 | 0 | 0 | same/same | 0.000 | – |
| [Afilmory/afilmory](https://github.com/Afilmory/afilmory) | A | `locales/app/{locale}.json` | ✅ | 1 | 6 | 446 | 0 | 0 | 0 | same/same | 0.000 | – |
| [Alanrk/LazyCat-Bookmark-Cleaner](https://github.com/Alanrk/LazyCat-Bookmark-Cleaner) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 2 | 211 | 0 | 0 | 0 | same/same | 0.670 | – |
| [AppFlowy-IO/AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) | A | `frontend/resources/translations/{locale}.json` | ✅ | 1 | 36 | 3644 | 0 | 0 | 0 | same/same | 0.862 | – |
| [CitizensFoundation/your-priorities](https://github.com/CitizensFoundation/your-priorities) | C | `config/locales/{locale}.yml` | ✅ | 1 | 62 | 1689 | 339 | 0 | 0 | same/same | 0.000 | – |
| [DMPRoadmap/roadmap](https://github.com/DMPRoadmap/roadmap) | B | `config/locales/{locale}.yml` | ✅ | 1 | 15 | 176 | 126 | 0 | 0 | same/same | 0.000 | – |
| [EYHN/Furigana](https://github.com/EYHN/Furigana) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 2 | 2 | 0 | 0 | 0 | same/same | 0.429 | – |
| [EralChen/vike-vue-content](https://github.com/EralChen/vike-vue-content) | C | `locale/lang/{locale}.ts` | ✅ | 1 | 2 | 17 | 0 | 0 | 0 | same/same | 0.000 | – |
| [FirefoxBar/HeaderEditor](https://github.com/FirefoxBar/HeaderEditor) | B | `public/_locales/{locale}/messages.json` | ✅ | 1 | 6 | 162 | 0 | 0 | 0 | same/same | 1.000 | – |
| [GSA/search-gov](https://github.com/GSA/search-gov) | C | `config/locales/{locale}.yml` | ✅ | 1 | 65 | 164 | 1 | 0 | 1 | same/same | 0.000 | – |
| [GoogleChrome/chromium-dashboard](https://github.com/GoogleChrome/chromium-dashboard) | B | `locales/release_notes/{locale}.json` | ✅ | 1 | 10 | 48 | 0 | 0 | 0 | same/same | 0.686 | – |
| [Growstuff/growstuff](https://github.com/Growstuff/growstuff) | B | `config/locales/{locale}.yml` | ✅ | 1 | 2 | 307 | 0 | 0 | 0 | same/same | 0.000 | – |
| [Js-Monkey/datepicker](https://github.com/Js-Monkey/datepicker) | C | `locale/{locale}.ts` | ✅ | 1 | 12 | 3 | 38 | 0 | 0 | same/same | 0.000 | – |
| [Kareadita/Kavita](https://github.com/Kareadita/Kavita) | A | `Kavita.Server/I18N/{locale}.json` | ✅ | 1 | 42 | 289 | 0 | 0 | 0 | same/same | 0.990 | 다른 유효 표면 |
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
| [ant-design/ant-design](https://github.com/ant-design/ant-design) | A | `components/locale/{locale}.ts` | ✅ | 1 | 12 | 84 | 216 | 0 | 0 | same/same | 0.000 | – |
| [arco-design/arco-design-vue](https://github.com/arco-design/arco-design-vue) | A | `packages/web-vue/components/locale/lang/{locale}.ts` | ✅ | 1 | 12 | 80 | 121 | 0 | 0 | same/same | 0.000 | – |
| [arkadiyt/zoom-redirector](https://github.com/arkadiyt/zoom-redirector) | B | – | ❌ | 없음 | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | – |
| [arunelias/session-alive](https://github.com/arunelias/session-alive) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 6 | 23 | 0 | 0 | 0 | same/same | 0.600 | – |
| [az0/linkgopher](https://github.com/az0/linkgopher) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 6 | 11 | 0 | 0 | 0 | same/same | 0.442 | – |
| [badsgahhl/pihole-browser-extension](https://github.com/badsgahhl/pihole-browser-extension) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 2 | 42 | 0 | 0 | 0 | same/same | 0.978 | – |
| [bitwarden/clients](https://github.com/bitwarden/clients) | A | `apps/browser/src/_locales/{locale}/messages.json` | ✅ | 1 | 63 | 2158 | 0 | 0 | 0 | same/same | 0.707 | – |
| [bluecaret/carettab](https://github.com/bluecaret/carettab) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 15 | 2 | 0 | 0 | 0 | same/same | 0.889 | – |
| [brandon1024/find](https://github.com/brandon1024/find) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 2 | 56 | 0 | 0 | 0 | same/same | 0.667 | – |
| [chatwoot/chatwoot](https://github.com/chatwoot/chatwoot) | A | `config/locales/{locale}.yml` | ✅ | 1 | 57 | 488 | 0 | 0 | 0 | same/same | 0.000 | 다른 유효 표면 |
| [codeforjapan/mapprint](https://github.com/codeforjapan/mapprint) | C | `locales/{locale}.json` | ✅ | 1 | 13 | 33 | 0 | 0 | 0 | same/same | 0.613 | – |
| [darkreader/darkreader](https://github.com/darkreader/darkreader) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: custom |
| [decidim/decidim](https://github.com/decidim/decidim) | B | `decidim-accountability/config/locales/{locale}.yml` | ✅ | 1 | 82 | 324 | 0 | 0 | 0 | same/same | 0.000 | 선택 잘림 |
| [dequelabs/axe-core](https://github.com/dequelabs/axe-core) | A | `locales/{locale}.json` | ✅ | 1 | 19 | 618 | 0 | 0 | 0 | same/same | 0.693 | – |
| [diaspora/diaspora](https://github.com/diaspora/diaspora) | A | `config/locales/diaspora/{locale}.yml` | ✅ | 1 | 95 | 1472 | 0 | 0 | 0 | same/same | 0.000 | – |
| [directus/directus](https://github.com/directus/directus) | A | `app/src/lang/translations/{locale}.yaml` | ✅ | 1 | 66 | 3014 | 3 | 0 | 0 | same/same | 0.000 | – |
| [element-hq/element-web](https://github.com/element-hq/element-web) | A | `apps/desktop/src/i18n/strings/{locale}.json` | ✅ | 1 | 41 | 76 | 0 | 0 | 0 | same/same | 0.957 | – |
| [element-plus/element-plus](https://github.com/element-plus/element-plus) | A | `packages/locale/lang/{locale}.ts` | ✅ | 1 | 12 | 144 | 12 | 0 | 0 | same/same | 0.000 | – |
| [esmBot/esmBot](https://github.com/esmBot/esmBot) | B | `locales/{locale}.json` | ✅ | 1 | 26 | 742 | 0 | 0 | 0 | same/same | – | – |
| [extesy/hoverzoom](https://github.com/extesy/hoverzoom) | A | `_locales/{locale}/messages.json` | ✅ | 1 | 52 | 296 | 0 | 0 | 0 | same/same | 0.983 | – |
| [fastladder/fastladder](https://github.com/fastladder/fastladder) | B | `config/locales/{locale}.yml` | ✅ | 1 | 3 | 92 | 2 | 0 | 0 | same/same | 0.000 | – |
| [forem/forem](https://github.com/forem/forem) | A | `config/locales/{locale}.yml` | ✅ | 1 | 3 | 254 | 0 | 0 | 0 | same/same | 0.000 | – |
| [g0v/newshelper-extension](https://github.com/g0v/newshelper-extension) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 2 | 9 | 0 | 0 | 0 | same/same | 0.425 | – |
| [gildas-lormeau/SingleFile](https://github.com/gildas-lormeau/SingleFile) | A | `_locales/{locale}/messages.json` | ✅ | 1 | 17 | 290 | 0 | 0 | 0 | same/same | 0.997 | – |
| [go-vikunja/vikunja](https://github.com/go-vikunja/vikunja) | A | `pkg/i18n/lang/{locale}.json` | ✅ | 1 | 37 | 107 | 0 | 0 | 0 | same/same | 0.943 | 다른 유효 표면 |
| [gorhill/uBlock](https://github.com/gorhill/uBlock) | A | `src/_locales/{locale}/messages.json` | ✅ | 1 | 71 | 328 | 0 | 0 | 0 | same/same | 0.724 | – |
| [hackmdio/codimd](https://github.com/hackmdio/codimd) | A | `locales/{locale}.json` | ✅ | 1 | 24 | 140 | 0 | 0 | 0 | same/same | 0.984 | – |
| [happy-func/next-official](https://github.com/happy-func/next-official) | C | `locale/article/{locale}.json` | ✅ | 1 | 2 | 1 | 0 | 0 | 0 | same/same | 0.143 | – |
| [henices/Chrome-proxy-helper](https://github.com/henices/Chrome-proxy-helper) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 4 | 97 | 0 | 0 | 0 | same/same | 0.988 | – |
| [home-assistant/frontend](https://github.com/home-assistant/frontend) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: build-time |
| [hoppscotch/hoppscotch](https://github.com/hoppscotch/hoppscotch) | A | `packages/hoppscotch-common/locales/{locale}.json` | ✅ | 1 | 34 | 2167 | 0 | 0 | 0 | same/same | 0.409 | – |
| [huginn/huginn](https://github.com/huginn/huginn) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: none |
| [immich-app/immich](https://github.com/immich-app/immich) | A | `i18n/{locale}.json` | ✅ | 1 | 89 | 2347 | 0 | 0 | 0 | same/same | 0.000 | – |
| [iv-org/invidious](https://github.com/iv-org/invidious) | A | `locales/{locale}.json` | ✅ | 1 | 63 | 614 | 0 | 0 | 0 | same/same | 0.813 | – |
| [ixrock/XTranslate](https://github.com/ixrock/XTranslate) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 20 | 226 | 0 | 0 | 0 | same/same | 0.653 | – |
| [jellyfin/jellyfin-web](https://github.com/jellyfin/jellyfin-web) | A | `src/strings/{locale}.json` | ✅ | 1 | 107 | 1947 | 0 | 0 | 0 | same/same | 0.500 | – |
| [jinliming2/Chrome-Charset](https://github.com/jinliming2/Chrome-Charset) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 47 | 34 | 0 | 0 | 0 | same/same | 0.541 | – |
| [jsxc/jsxc](https://github.com/jsxc/jsxc) | B | `locales/{locale}.json` | ✅ | 1 | 30 | 417 | 0 | 0 | 0 | same/same | 0.850 | – |
| [jumodada/better-datepicker](https://github.com/jumodada/better-datepicker) | C | `locale/{locale}.ts` | ✅ | 1 | 12 | 3 | 38 | 0 | 0 | same/same | 0.000 | – |
| [kee-org/browser-addon](https://github.com/kee-org/browser-addon) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 18 | 227 | 0 | 0 | 0 | same/same | 0.705 | – |
| [kkapsner/CanvasBlocker](https://github.com/kkapsner/CanvasBlocker) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 19 | 321 | 1843 | 0 | 0 | same/same | 0.998 | – |
| [lokalise/i18n-ally](https://github.com/lokalise/i18n-ally) | A | `locales/{locale}.json` | ✅ | 1 | 17 | 239 | 0 | 0 | 0 | same/same | 0.004 | – |
| [lyqht/mini-qr](https://github.com/lyqht/mini-qr) | A | `locales/{locale}.json` | ✅ | 1 | 50 | 375 | 0 | 0 | 0 | same/same | 0.306 | – |
| [mastodon/joinmastodon](https://github.com/mastodon/joinmastodon) | B | `locales/{locale}.json` | ✅ | 1 | 54 | 307 | 0 | 0 | 0 | same/same | 0.000 | – |
| [mastodon/mastodon](https://github.com/mastodon/mastodon) | A | `config/locales/{locale}.yml` | ✅ | 1 | 106 | 2201 | 0 | 0 | 0 | same/same | 0.000 | 다른 유효 표면 |
| [mcthesw/game-save-manager](https://github.com/mcthesw/game-save-manager) | B | `locales/{locale}.json` | ✅ | 1 | 7 | 1131 | 0 | 0 | 0 | same/same | 0.667 | – |
| [mdolr/survol](https://github.com/mdolr/survol) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 35 | 10 | 0 | 0 | 0 | same/same | 0.951 | – |
| [micz/ThunderAI](https://github.com/micz/ThunderAI) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 25 | 605 | 0 | 0 | 0 | same/same | 0.720 | – |
| [mikebryant/ac-nh-turnip-prices](https://github.com/mikebryant/ac-nh-turnip-prices) | B | `locales/{locale}.json` | ✅ | 1 | 21 | 62 | 0 | 0 | 0 | same/same | 0.641 | – |
| [misskey-dev/misskey](https://github.com/misskey-dev/misskey) | A | `locales/{locale}.yml` | ✅ | 1 | 41 | 3203 | 1 | 0 | 0 | same/same | 0.000 | – |
| [moebooru/moebooru](https://github.com/moebooru/moebooru) | B | `config/locales/{locale}.yml` | ✅ | 1 | 7 | 1582 | 9 | 0 | 0 | same/same | 0.000 | – |
| [nt1m/livemarks](https://github.com/nt1m/livemarks) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 19 | 62 | 0 | 0 | 0 | same/same | 0.644 | – |
| [okisdev/ChatChat](https://github.com/okisdev/ChatChat) | B | `locales/{locale}.json` | ✅ | 1 | 13 | 99 | 0 | 0 | 0 | same/same | 0.765 | – |
| [olegcherr/Reedy-for-Chrome](https://github.com/olegcherr/Reedy-for-Chrome) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 2 | 79 | 0 | 0 | 0 | same/same | 0.989 | – |
| [payloadcms/payload](https://github.com/payloadcms/payload) | A | `packages/translations/src/languages/{locale}.ts` | ✅ | 1 | 12 | 655 | 0 | 0 | 0 | same/same | 0.000 | – |
| [permacommons/lib.reviews](https://github.com/permacommons/lib.reviews) | B | `locales/{locale}.json` | ✅ | 1 | 40 | 740 | 0 | 0 | 0 | same/same | 0.996 | – |
| [pietervanheijningen/clickbait-remover-for-youtube](https://github.com/pietervanheijningen/clickbait-remover-for-youtube) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 9 | 13 | 0 | 0 | 0 | same/same | 0.636 | – |
| [primefaces/primevue](https://github.com/primefaces/primevue) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: in-code |
| [quasarframework/quasar](https://github.com/quasarframework/quasar) | A | `ui/lang/{locale}.js` | ✅ | 1 | 11 | 103 | 135 | 0 | 0 | same/same | 0.000 | – |
| [raingart/AutoHideDownloadsBar-extension](https://github.com/raingart/AutoHideDownloadsBar-extension) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 8 | 42 | 0 | 0 | 0 | same/same | 0.978 | – |
| [redmine/redmine](https://github.com/redmine/redmine) | A | `config/locales/{locale}.yml` | ✅ | 1 | 50 | 1552 | 185 | 0 | 0 | same/same | 0.000 | – |
| [refinery/refinerycms-news](https://github.com/refinery/refinerycms-news) | B | `config/locales/{locale}.yml` | ✅ | 1 | 21 | 28 | 0 | 0 | 0 | same/same | 0.000 | – |
| [rtorr/vim-cheat-sheet](https://github.com/rtorr/vim-cheat-sheet) | B | `locales/{locale}.json` | ✅ | 1 | 40 | 519 | 0 | 0 | 0 | same/same | 0.784 | – |
| [samueljun/tomato-clock](https://github.com/samueljun/tomato-clock) | B | `_locales/{locale}/messages.json` | ✅ | 1 | 10 | 71 | 0 | 0 | 0 | same/same | 0.648 | – |
| [scratchblocks/scratchblocks](https://github.com/scratchblocks/scratchblocks) | B | `locales/{locale}.json` | ✅ | 1 | 78 | 382 | 78 | 0 | 0 | same/same | 0.825 | – |
| [sitb-software/veigar](https://github.com/sitb-software/veigar) | C | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: none |
| [siyuan-note/siyuan](https://github.com/siyuan-note/siyuan) | A | `app/appearance/langs/{locale}.json` | ✅ | 1 | 21 | 2639 | 0 | 0 | 21 | different/same | 0.999 | – |
| [solidusio/solidus_i18n](https://github.com/solidusio/solidus_i18n) | C | `config/locales/{locale}.yml` | ✅ | 1 | 39 | 2513 | 64 | 0 | 0 | same/same | 0.000 | – |
| [strapi/strapi](https://github.com/strapi/strapi) | A | `packages/core/admin/admin/src/translations/{locale}.json` | ✅ | 1 | 35 | 1267 | 0 | 0 | 0 | same/same | 0.216 | – |
| [stringer-rss/stringer](https://github.com/stringer-rss/stringer) | A | `config/locales/{locale}.yml` | ✅ | 1 | 17 | 139 | 0 | 0 | 0 | same/same | 0.000 | – |
| [sugarlabs/musicblocks](https://github.com/sugarlabs/musicblocks) | B | `locales/{locale}.json` | ✅ | 1 | 84 | 5514 | 0 | 0 | 324 | different/same | 0.968 | – |
| [tusen-ai/naive-ui](https://github.com/tusen-ai/naive-ui) | A | `src/locales/common/{locale}.ts` | ✅ | 1 | 12 | 82 | 60 | 0 | 0 | same/same | 0.000 | – |
| [tyrasd/overpass-turbo](https://github.com/tyrasd/overpass-turbo) | B | `locales/{locale}.json` | ✅ | 1 | 48 | 307 | 0 | 0 | 0 | same/same | 0.851 | – |
| [uppinote20/claude-dashboard](https://github.com/uppinote20/claude-dashboard) | B | `locales/{locale}.json` | ✅ | 1 | 2 | 44 | 0 | 0 | 0 | same/same | 0.576 | – |
| [usememos/memos](https://github.com/usememos/memos) | A | `web/src/locales/{locale}.json` | ✅ | 1 | 44 | 959 | 0 | 0 | 0 | same/same | 0.196 | – |
| [violentmonkey/violentmonkey](https://github.com/violentmonkey/violentmonkey) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: yaml |
| [vuetifyjs/vuetify](https://github.com/vuetifyjs/vuetify) | A | `packages/vuetify/src/locale/{locale}.ts` | ✅ | 1 | 12 | 137 | 0 | 0 | 0 | same/same | 0.000 | – |
| [ylater/me-nuxt](https://github.com/ylater/me-nuxt) | C | `locale/{locale}.ts` | ✅ | 1 | 2 | 15 | 2 | 0 | 0 | same/same | 0.000 | – |
| [yui540/comimi](https://github.com/yui540/comimi) | B | `locales/{locale}.json` | ✅ | 1 | 6 | 43 | 0 | 0 | 0 | same/same | 0.652 | – |
| [z-------------/CPod](https://github.com/z-------------/CPod) | B | `locales/{locale}.json` | ✅ | 1 | 16 | 163 | 0 | 0 | 0 | same/same | 0.799 | – |
| [zmh-program/next-whois](https://github.com/zmh-program/next-whois) | B | `locales/{locale}.json` | ✅ | 1 | 8 | 138 | 0 | 0 | 0 | same/same | 0.799 | – |

## 9. 홀드아웃 20개 리포별 상세

**어댑터를 고친 뒤의 값이다.** 수정 전 값은 §0 3차의 표에 요약돼 있다.

| 리포 | 구간 | 1순위 후보 | 판정 | 정답 순위 | 로케일 | 키 | 에러 | skip | 충돌 | 왕복(의미/바이트) | diff | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [AutomaApp/automa](https://github.com/AutomaApp/automa) | B | `src/locales/{locale}/common.json` | ✅ | 1 | 9 | 67 | 1 | 0 | 0 | same/same | 0.667 | – |
| [RSSNext/Folo](https://github.com/RSSNext/Folo) | A | `locales/ai/{locale}.json` | ✅ | 1 | 5 | 369 | 0 | 0 | 0 | same/same | 0.001 | 다른 유효 표면 |
| [Stirling-Tools/Stirling-PDF](https://github.com/Stirling-Tools/Stirling-PDF) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: properties |
| [TryGhost/Ghost](https://github.com/TryGhost/Ghost) | A | `packages/i18n/locales/{locale}/comments.json` | ✅ | 1 | 12 | 84 | 0 | 0 | 0 | same/same | – | 다른 유효 표면 |
| [calcom/cal.com](https://github.com/calcom/cal.com) | A | `packages/i18n/locales/{locale}/common.json` | ✅ | 1 | 12 | 4770 | 0 | 0 | 0 | same/same | 0.959 | – |
| [discourse/discourse](https://github.com/discourse/discourse) | C | `plugins/discourse-cakeday/config/locales/client.{locale}.yml` | ❌ | 5 | 12 | 27 | 0 | 0 | 0 | same/same | 0.000 | – |
| [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw) | A | `packages/excalidraw/locales/{locale}.json` | ✅ | 1 | 57 | 614 | 0 | 0 | 0 | same/same | 0.843 | – |
| [go-gitea/gitea](https://github.com/go-gitea/gitea) | A | `options/locale/locale_{locale}.json` | ✅ | 1 | 12 | 3979 | 0 | 0 | 0 | same/same | 0.916 | – |
| [grafana/grafana](https://github.com/grafana/grafana) | A | `public/locales/{locale}/grafana.json` | ✅ | 1 | 12 | 11733 | 0 | 0 | 0 | same/same | 0.050 | – |
| [jitsi/jitsi-meet](https://github.com/jitsi/jitsi-meet) | A | `lang/main-{locale}.json` | ✅ | 1 | 12 | 1547 | 0 | 0 | 0 | same/same | 0.981 | – |
| [mattermost/mattermost](https://github.com/mattermost/mattermost) | A | `webapp/channels/src/i18n/{locale}.json` | ✅ | 1 | 64 | 8342 | 0 | 0 | 0 | same/same | 0.098 | – |
| [mozilla/pdf.js](https://github.com/mozilla/pdf.js) | A | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: fluent |
| [n8n-io/n8n](https://github.com/n8n-io/n8n) | A | – | ❌ | 없음 | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | – |
| [obsidianmd/obsidian-translations](https://github.com/obsidianmd/obsidian-translations) | B | – | ➖ | – | 0 | 0 | 0 | 0 | 0 | not-run/not-run | – | 미지원: txt |
| [open-webui/open-webui](https://github.com/open-webui/open-webui) | A | `src/lib/i18n/locales/{locale}/translation.json` | ✅ | 1 | 12 | 3150 | 0 | 0 | 0 | same/same | 0.999 | – |
| [outline/outline](https://github.com/outline/outline) | A | `shared/i18n/locales/{locale}/translation.json` | ✅ | 1 | 12 | 1906 | 0 | 0 | 0 | same/same | 0.943 | – |
| [rubygems/rubygems.org](https://github.com/rubygems/rubygems.org) | B | `config/locales/{locale}.yml` | ✅ | 1 | 9 | 838 | 0 | 0 | 0 | same/same | 0.000 | – |
| [spree/spree_i18n](https://github.com/spree/spree_i18n) | A | `config/locales/{locale}.yml` | ✅ | 1 | 47 | 3562 | 76 | 0 | 0 | same/same | 0.000 | – |
| [withastro/docs](https://github.com/withastro/docs) | A | `src/content/i18n/{locale}.yml` | ✅ | 1 | 14 | 77 | 0 | 0 | 0 | same/same | 0.000 | – |
| [zulip/zulip](https://github.com/zulip/zulip) | A | `locale/{locale}/translations.json` | ✅ | 1 | 12 | 2282 | 0 | 0 | 0 | same/same | 0.248 | – |
