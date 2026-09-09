# 어댑터 범용성 측정 결과

**오픈소스 리포 109개에 `detect`·`read`·왕복을 돌린 결과와, 그 숫자로 내린 판정이다.**
실험의 스펙·설계는 [features/adapter-generality/](./features/adapter-generality/)에 있다(태스크는 전부 닫혀 삭제됐다 — 후속은 TASKS §8과 `features/README.md` 백로그).

- 실행(학습 코퍼스): `pnpm adapter-survey docs/features/adapter-generality/repos.txt --verdicts docs/features/adapter-generality/verdicts.json`
- 실행(홀드아웃): `pnpm adapter-survey docs/features/adapter-generality/repos-heldout.txt --verdicts docs/features/adapter-generality/verdicts-heldout.json`
- 대상 목록: [repos.md](./features/adapter-generality/repos.md) / 정답 경로: [verdicts.json](./features/adapter-generality/verdicts.json)
- 규모: 학습 **109개 리포 · 1,900+ 로케일 · 43,000+ 키** + 홀드아웃 **20개**. clone 실패 0건

> **⚠️ 학습 코퍼스 109개의 숫자(§1~§4)는 어댑터를 그것에 맞춰 고친 뒤의 값이다.** 일반화 여부는
> 그 숫자가 아니라 **§0의 3차(홀드아웃 20개)** 가 답한다 — 고친 뒤에 처음 본 리포들이다.
>
> **§10은 4차(2026-09-02), §11은 5차(2026-09-03)다** — 어댑터를 안 건드리고 **지표만 늘려** 학습·홀드아웃을 다시 돌렸다.
> 키 순서 보존(`docs/features/key-order-preservation/`)의 설계 판정 3개가 §10에, **그 기능을
> 구현한 뒤의 완료 조건 판정이 §11**에 있다.

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
**학습 14개 · 홀드아웃 4개**) `alsoValid`로 등재했다 — 어느 쪽을 골라도 맞으므로 오탐으로 세면
숫자가 과장된다. ⚠️ **§8 리포별 표의 비고 열은 그중 4개에만 "다른 유효 표면"을 단다** — 1순위가
정답과 다를 때만 달았기 때문이고, 등재 수 자체는 `verdicts.json`에서 센다(재측정 없이 셀 수 있는
값이라 2026-09-07에 11 → 14로 정정했다).

**정답 순위 분포**: `1순위 100 · 목록에 없음 1`. 1차의 `1순위 68 · 2순위 1 · 없음 4`에서 왔다.

### ③ `read` 에러 — 유형별

| 유형 | 건수 | 뜻 |
|---|---|---|
| `chrome-key` | 1,843 | 전부 kkapsner/CanvasBlocker 하나. 크롬 키 문자 제약은 실제로 걸린다 |
| `leaf-type` | 697 | 문자열이 아닌 리프(숫자·불린). Rails YAML에 흔하다 |
| `non-literal-value` | 621 | 코드 딕셔너리의 import 참조·템플릿 리터럴 (ant-design의 `Pagination` 등) |
| `key-collision` | 107 | YAML 중복 키 — **값 하나가 사라진다** |
| `non-object-root` | 4 | 최상위가 맵/객체가 아니다 |
| `json-parse` | **0** | JSON 자체가 안 읽힌다. **12차(§17)에서 유형으로 추가됐고 14차(§20)가 분모를 처음 줬다** — 학습 코퍼스에서 0건이다(홀드아웃은 1건) |
| `adapter-threw` | **0** | 어댑터가 예외를 던졌다(포맷 가정이 깨진 자리). 14차 값이다 — `surveyOne`의 `try`가 흡수하는 경로가 실제로 안 열린다 |
| `other` | **1** | 위 어디에도 안 맞는 것. 14차 값이고 **전부 `no-default-export` 한 갈래다**(quasarframework/quasar의 `code-dict` 파일 하나). 그 코드가 `other`로 가는 것은 옛 문구 기반 분류기의 **명시적 판정**이었고 — 읽기 실패의 *유형*이 아니라 포맷 불일치다 — 이 1건이 §20의 등식이 공허하지 않다는 증거다 |
| 무증상 skip | **0** | `ts-dict`가 자동 탐지에서 빠져 이 경로가 닫혔다 |

⚠️ **이 문서의 탐지 지표는 "전 후보에 probe를 먹인" 조건의 값이다** (`lib/survey/select.ts`가 `FILE_BUDGET` 1200까지 로컬 clone 파일을 넣는다). **프로덕션 온보딩은 상위 5+2만 probe한다** (`lib/onboarding/detect.ts`의 `PROBE_LIMITS`, blob ≤21) — 그리고 `chrome-locales`·`json-catalog`·`yaml-catalog`은 probe 내용이 없으면 `verifySamples`가 `false`라 **미검증 = 탈락**이다. 즉 **6순위 이하 후보는 프로덕션에서 조용히 사라지는데 실측 코퍼스에서는 살아 있었다** — §0의 "discourse의 정답이 5순위였다"가 정확히 그 경계선이다.

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

## 3. 남은 손실 1건 — 조용한 손실은 0이다 (7차 갱신)

> **2026-09-04 (§13.1)**: 2건 중 musicblocks가 `nestedByPath` 배선으로 없어졌고, siyuan은 남았지만
> `writeErrors: 21`로 **보고된다**. 아래 서술은 2차 시점의 것이다.

| 리포 | 손실 | 보고 |
|---|---|---|
| siyuan-note/siyuan | 2,636키 중 1키 | `writeErrors` 21 |
| sugarlabs/musicblocks | 84로케일 중 81개에서 각 4키 | `writeErrors` 324 |

**뿌리는 `.`가 우리 조인 구분자이면서 실제 키에 들어 있는 문자라는 것이다.** `a.b`(문자열)와 `a.b.c`가
공존하면 중첩 복원에서 한쪽이 자리를 잃는다. 2차에서 고친 것:

- `nested`를 **파일 단위**로 관측한다 — 전에는 형제 파일 하나가 중첩이면 평평한 파일의 점 포함 키까지
  쪼개졌다(musicblocks가 그 형태였다).
- 문자열 자리를 객체로 조용히 갈아끼우던 것을 **에러로 보고하고 얕은 쪽을 건너뛴다.** 판정은 `setDeep` 밖이다 — `writeWithErrors`가 `shadowed` 집합을 먼저 계산해 얕은 키마다 `AdapterError`를 밀고 건너뛰며, 살아남은 키만 `setDeep`에 넘긴다(그 함수 자체는 에러 처리가 없는 순수 재귀 할당이다).
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

**경로 모양 3개** (2026-09-02 3차 추가). 각 어댑터가 **자기** read/write를 그대로 쓰고 `pathTemplate`만
늘렸다 — 공유하는 것은 경로 후보 생성 헬퍼(`splitLocaleSuffix`·`hasStrongLocale`·`pathSignals`,
`lib/adapters/shared.ts`)뿐이다. ⚠️ **두 어댑터가 read/write를 공유한다는 뜻이 아니다**: `json-catalog`은
`regenerate`, `yaml-catalog`은 `surgical`이라 write 기계가 아예 다르다 (CLAUDE.md "layout과
writeStrategy는 별개 축"):

| 모양 | 어댑터 | 근거 |
|---|---|---|
| `{dir}/{locale}.<ext>` — 확장자는 어댑터별 정규식(`json` / `ya?ml` / `tsx?`·`m?js`) | 전부 | 원래 형태 |
| `{dir}/{locale}/<name>.json` | `json-catalog` | 홀드아웃 6/20. **경로에 i18n 계열 디렉터리 이름(`I18N_HINT` — `locale(s)`·`i18n`·`lang(s)`·`messages`·`translation(s)`)을 요구한다** — 디렉터리 이름이 로케일처럼 보이는 일이 파일 이름보다 훨씬 흔하다(n8n `packages/@n8n/{ai}/`). 크롬 경로(`_locales/…/messages.json`)는 이 모양의 후보에서 제외해 같은 후보를 두 번 안 낸다 |
| `{dir}/<prefix><sep>{locale}.<ext>` | `json-catalog`·`yaml-catalog` | 홀드아웃 3/20. 구분자는 `.`·`-`·`_` |

**후보 그룹은 강한 로케일 코드를 하나 이상 요구한다** (`hasStrongLocale`). 맨 3글자(`add`·`get`)는
약하고, `en`·`zh-CN`·`koKR`·`fil-PH`는 강하다. 3글자 로케일(`fil`·`ceb`)은 강한 것 옆에 있으면 함께
인정된다 — 실제 카탈로그는 거의 항상 `en` 옆에 있다.

### 판정 ② MVP §4.1 "키 정렬" — **개정 완료** (2026-09-03 해소)

**구현이 끝났고 5차 측정이 그것을 확인했다** (§11). 순서가 원인인 목표 초과는 학습·홀드아웃
통틀어 **0건**이고, 전체 코퍼스 중앙값이 **0.613 → 0.001**로 떨어졌다. MVP §4.1의 "키 정렬"
규칙은 `LocaleEntry.order` 오름차순(없으면 `<` 비교, 동률은 키로)으로 개정됐다.

아래는 그 판정에 이르기까지의 근거이고, 역사로 남긴다.



`json-catalog`의 첫 write diff 중앙값이 **0.784**(학습) / **0.843**(홀드아웃)이다. 원본이 이미
정렬돼 있는 리포는 소수다. **수술적 치환 어댑터가 diff 0.000을 내는 것이 대조군이 된다** — 같은
문제를 원본 보존으로 푸는 방식이 이미 코드베이스 안에 있고 18+11개 리포에서 동작한다.

→ **`docs/features/key-order-preservation/`으로 분리했다.** 그 기능의 태스크 0(측정)이 4차 측정으로
돌았고, 결과와 세 판정은 **아래 §10**에 있다. **채택안은 `currentFiles`를 주는 것이 아니라 순서를
DB(`StringKey.sortIndex`)에 두는 것이다** — 원본을 write 입력으로 받으면
`같은 DB 상태 → 같은 바이트` 불변식의 뜻이 바뀐다 (그 기능의 design.md §대안 B).

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

연동 시 후보 목록·로케일 수를 보여주고 고르게 하는 화면 하나가 값을 했고, **SaaS 5단계가 그것을 만들었다** (2026-09-07, `lib/onboarding/detect.ts` + `/projects/new` — `countKeys`가 여기서 말한 그 `read`를 실제로 돌려 기준 로케일 키 수를 낸다). 당시 서술은 이랬다 —
`detectCandidatesAcross`가 그 데이터를 이미 준다(키 수는 `read`가 필요하다). 어댑터를 가로지르는 순위는 `chrome-locales` 최우선(예제 디렉터리 안은 예외) → i18n 신호 → 예제 감점 → 로케일 수 → 경로 모양 → 얕은 경로 → 경로순, 그 뒤 `liftAncestors`이고 **버킷별로 적용된다** — 크롬 버킷과 `rest`에 따로 돌린다(가로질러 적용하면 크롬 최우선이 무너진다). ⚠️ **순위 뒤에 내용 검증 층이 하나 더 있어 후보를 떨어뜨린다**(`verifySamples`·`catalogVerdict`) — 아래 배제 규칙 둘과 별개의 셋째 탈락 경로다. 배제 규칙 둘: yaml은 `.github/` 아래를 후보에서 빼고(워크플로 오탐), `code-dict`는 probe 없이는 후보를 내지 않는다.

## 6. 여기서 파생된 후속 작업

> **2026-09-04 추가 (§13.3)**: **`yaml-catalog`의 범위 기반 치환.** `doc.toString()`이 문서를 다시
> 찍으므로 편집 하나가 파일 절반을 바꾼다(redmine 1,585줄 중 816줄). 편집된 스칼라의 `range`로 원본
> 문자열을 직접 갈아끼우는 방식만이 1키 편집 → 1 hunk를 만든다. 별 `/feature`.

| 순위 | 항목 | 근거 |
|---|---|---|
| 1 | **키 구분자를 계약으로 뺀다** (`nested: boolean` → `tree: {style, separator}`) — 문서는 [`features/key-separator-contract/`](./features/key-separator-contract/)에 있고 **⏸️ 보류 판정**이다(도입 대상 bugshot-2가 `ts-dict`라 효과 0) | §3의 손실은 siyuan 1건이 남아 있다(musicblocks는 `nestedByPath`로 해소 — §13.1). i18next의 `:` namespace 구분자도 같은 축 (비-점 구분자 8개 리포) |
| 2 | ~~**"원본 키 순서 보존" 모드**~~ → **완료** (2026-09-03, §11) | 판정 ② 해소 — 0.784 → 0.022 |
| 3 | 크롬 레이아웃 + YAML (`_locales/{locale}/messages.yml`) | violentmonkey 1개 |
| 4 | 단일 로케일 리포 지원 여부 판정 | arkadiyt/zoom-redirector 1개. "2개 이상" 규칙의 대가다 |
| 5 | **하위 카탈로그가 정본을 누르는 경우** | discourse 1개. `plugins/` 감점은 관측 1건으로는 못 만든다 (§0 3차) |
| 6 | **로케일 디렉터리의 네임스페이스 여러 개** | Ghost 5개·automa 4개·Folo 10개(**리포 3개**의 네임스페이스 수다). 한 프로젝트가 하나만 덮는다 — **5단계가 답하지 않고 이월했다** (2026-09-07): `(repoOwner, repoName)`에 unique가 없어 같은 리포로 프로젝트를 두 번 만드는 것이 막히지 않고, 안내를 넣으려면 "표면이 둘"을 탐지가 먼저 알아야 하는데 그 판정 규칙이 없다 |
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

---

## 10. 4차 측정 — 키 순서 보존의 근거 (2026-09-02)

**`docs/features/key-order-preservation/` 태스크 0-2의 실행 결과다.** 지표 4개는 이 라운드에서
바뀌지 않았고(어댑터를 안 건드렸다), **새로 추가된 것은 순서·들여쓰기·잔여 diff 원인 지표다.**

⚠️ **분모는 재생성 어댑터 리포뿐이다** (`json-catalog` + `chrome-locales`). 수술적 3개는 이미
diff 0.000이라 이 기능이 닿지 않는다 — 닿으면 회귀다.

### 10.1 로케일 간 키 순서 일치율

일치율(리포) = (base와 **공통 키 순서가 완전히 같은** 비-base 파일 수) / (전체 비-base 파일 수).
base에 없는 키는 제외하고 공통 키만 비교한다.

| | 학습 71개 | 홀드아웃 12개 |
|---|---|---|
| 중앙값 | **1.000** | **1.000** |
| 일치율 == 1.0 | 37 (52%) | 8 (67%) |
| 일치율 ≥ 0.9 | 42 (59%) | 10 (83%) |
| 일치율 < 0.5 | **22 (31%)** | 1 (8%) |

⚠️ **중앙값이 꼬리를 가린다.** 분포가 이중 최빈이라(1.0 아니면 낮음) 중앙값 1.000은 "절반 이상이
완전 일치"만 말하고, **31%가 0.5 미만**이라는 사실을 지우지 않는다. 판정 경계를 중앙값으로 잡은
것은 이 모양을 예상하지 못한 것이다 — 다음에 순서 지표를 쓸 때는 분포를 먼저 본다.

일치율 < 0.5인 22개의 어댑터별 분포: `json-catalog` 15/38, `chrome-locales` 7/33.

**악화 후보는 0건이다.** "비-base가 이미 우리 순서(diff < 0.05)인데 base만 흐트러진(diff > 0.3)"
리포가 학습·홀드아웃 둘 다 없다 — 즉 base 순서를 전 로케일에 전파해도 **어느 리포도 지금보다
나빠지지 않는다.** 이것이 A안 확정의 실질 근거다.

### 10.2 원본 들여쓰기 분포

| | 학습 71개 | 홀드아웃 12개 |
|---|---|---|
| 2칸 스페이스 | **49 (69.0%)** | **9 (75.0%)** |
| 4칸 스페이스 | 12 | 2 |
| 탭 | 7 | 1 |
| 3칸 | 1 | – |
| 관측 불가(한 줄) | 2 | – |

### 10.3 잔여 diff 원인 — 순서를 고쳐도 남는 것

리포 수 기준(리포 하나가 여러 원인을 가질 수 있다). 재생성 어댑터 71개 중:

| 원인 | 학습 | 홀드아웃 | 성질 |
|---|---|---|---|
| 들여쓰기가 2칸 아님 | **30** | 3 | `serialize`가 2칸 고정 |
| chrome 비-base `description` | **20** | 0 | `write`가 base에서만 낸다 |
| chrome `placeholders` | **12** | 0 | `read`가 아예 안 읽는다 |
| 정수형 키 hoisting | 4 | 0 | **원리적으로 보존 불가** |
| 비ASCII `\uXXXX` 이스케이프 | 2 | 0 | `JSON.stringify`가 푼다 |
| **원인 하나도 없음** | **23 (32%)** | **9 (75%)** | 순서만 고치면 diff 0 후보 |

그 23개의 **현재** diff 중앙값은 **0.648**이다 — 순서 보존이 실제로 큰 몫을 차지한다는 뜻이고,
동시에 **전체 코퍼스에서 diff ≤ 0.10을 순서만으로 달성할 수는 없다**는 뜻이다(68%가 다른 원인을
갖는다).

### 10.4 어댑터별 diff (4차, 새 열 포함)

| 어댑터 | 학습 중앙값 | 학습 목표(0.10) 초과 | 홀드아웃 중앙값 | 비-base 중앙값(전체) |
|---|---|---|---|---|
| `json-catalog` | 0.784 | 33/37 (89.2%) | 0.843 | 학습 0.643 / 홀드아웃 0.593 |
| `chrome-locales` | 0.705 | 33/33 (100%) | **표본 없음** | 〃 |
| `yaml-catalog` | 0.000 | 0/18 (0%) | 0.000 | 〃 |
| `code-dict` | 0.000 | 0/11 (0%) | 표본 없음 | 〃 |

**`chrome-locales`는 홀드아웃 20개에 1순위 리포가 0개다.** 그러므로 chrome의 일반화 수치는
존재하지 않는다 — "129개 기준 0.705" 같은 문장을 쓰면 거짓이다.

### 10.5 `not-run`과 손실 기준선 — 재측정 때 대조할 값

이번 라운드에서 **처음 보이게 된 숫자**다. 전에는 분모에서 조용히 빠졌다.

| | 학습 | 홀드아웃 |
|---|---|---|
| 왕복 못 돌림(`not-run`) | **9** | **4** |
| 왕복 의미 동일 | 98/100 | 16/16 |
| 바이트 고정점 | 100/100 | 16/16 |
| 설정 파일을 둔 리포 | **20** | **6** |

⚠️ **"설정 파일" 값은 이번에 처음 진짜다.** 전 회차의 0은 껍데기가 `configFiles`를 구조 분해에서
버려서 나온 값이었다 (`docs/POSTMORTEM.md` 2026-09-02).

손실 기준선(재측정에서 이 값이 커지면 회귀다): siyuan `keyCollisions` **21** ·
musicblocks — 이번 학습 라운드 합계 `키 충돌` **346**, `read` 에러 합계 3,273.

### 10.6 표본 상한 — 이 숫자들의 한계

`lib/survey/select.ts`가 세우는 상한은 **다섯**이다:

| 상수 | 값 | 무엇을 자르나 |
|---|---|---|
| `FILE_BUDGET` | 1200 | **리포당 파일 총량.** 키 수가 만 단위인 리포(grafana 11,733키)의 지표가 어디까지 표본인지를 이것이 정한다 |
| `MAX_SHAPE_GROUPS` | 8 | 경로 모양 그룹의 수 |
| `MAX_PER_SHAPE_GROUP` | 12 | 모양 그룹 하나에서 고르는 파일 수 |
| `LOCALE_CODE_PER_DIR` | 12 | 로케일 디렉터리 하나에서 고르는 로케일 수 |
| `TS_PER_DIR` | 8 | TS/JS 딕셔너리 디렉터리 하나에서 고르는 파일 수 |

로케일이 12개를 넘는 리포(mastodon 106, jellyfin-web 107)에서 일치율·비-base diff는 **12개 표본
값**이다. 전 로케일을 물리화하면 리포당 수백 파일을 받아야 해서 그대로 둔다.

### 10.7 판정 3개

| # | 🔒 경계 | 실측 | 판정 |
|---|---|---|---|
| ① A안 vs 대안 E | 일치율 중앙값 ≥ 0.9 | **1.000** (학습·홀드아웃 둘 다) | **A안 확정** — `StringKey.sortIndex`. 악화 후보 0건이 실질 근거다. 일치율 < 0.5인 31%는 비-base가 여전히 재정렬되지만 **지금보다 나빠지지 않는다** |
| ② 들여쓰기 | 2칸 비율 ≥ 0.8 | **69.0%** / 75.0% | **미달 → 별 기능 확정.** 들여쓰기 보존은 이번 범위 밖이고, 완료 조건의 목표 수치를 이 비율로 재산했다 |
| ③ 완료 조건 분모 | (규칙 밖 — 측정이 새로 드러낸 것) | 순서 외 원인 없는 리포 32% | **게이트 분모를 좁힌다.** diff 게이트를 "순서 외 원인이 없는 리포"에서만 잰다. 전체 코퍼스에 걸면 68%가 다른 이유로 초과해 **어느 기능이 실패했는지 못 가른다** |

**추가 판정 — chrome 필드 보존을 범위로 끌어왔다.** `chrome-locales`는 우리 도입 대상인데 33개 중
순서 외 원인이 없는 것이 **5개(15%)** 뿐이다. 순서만 고쳐도 그 어댑터의 첫 PR은 여전히 안 읽힌다
→ `placeholders`와 비-base `description` 보존을 같은 기능에 넣는다
(`docs/features/key-order-preservation/`).

---

## 11. 5차 측정 — 키 순서 보존을 구현한 뒤 (2026-09-03)

**`docs/features/key-order-preservation/` 태스크 6의 실행 결과이자 그 기능의 완료 조건 판정이다.**
어댑터의 `read`·`write`가 바뀌었으므로(태스크 1·2) 학습·홀드아웃을 **둘 다** 다시 돌렸다.

### 11.1 첫 write diff — 무엇이 얼마나 움직였나

| 어댑터 | 학습 4차 | 학습 5차 | 홀드아웃 4차 | 홀드아웃 5차 |
|---|---|---|---|---|
| `json-catalog` | 0.784 | **0.022** | 0.843 | **0.000** |
| `chrome-locales` | 0.705 | **0.096** | 표본 없음 | 표본 없음 |
| `yaml-catalog` | 0.000 | 0.000 | 0.000 | 0.000 |
| `code-dict` | 0.000 | 0.000 | 표본 없음 | 표본 없음 |
| **전체 중앙값** | 0.613 | **0.001** | 0.248 | **0.000** |

#### 그 숫자들의 원자료 — 홀드아웃 `json-catalog` 11개

spec이 인용하는 **개정 전 0.843**은 §9 표의 개별 값에서 뽑은 중앙값인데, 그 문서에 어댑터별
집계 열이 없어 사람이 검증할 수 없었다. 여기 남긴다:

| | 개별 diff (오름차순) | 중앙값 |
|---|---|---|
| 4차 (개정 전) | 0.001 · 0.050 · 0.098 · 0.248 · 0.667 · **0.843** · 0.916 · 0.943 · 0.959 · 0.981 · 0.999 | **0.843** |
| 5차 (개정 후) | 0 · 0 · 0 · 0 · 0 · **0** · 0.001 · 0.031 · 0.248 · 0.981 · 0.999 | **0.000** |

5차에 남은 셋(0.248 zulip · 0.981 · 0.999)은 전부 §11.3의 원인이 붙어 있어 `clean` 분모에서
빠진다 — 순서가 원인이 아니다.

### 11.2 완료 조건 판정 — 분모는 "순서 외 원인이 없는 리포"

전체 코퍼스에 목표를 걸면 68%가 **이 기능이 책임지지 않는 이유**로 초과해서 어느 기능이
실패했는지 못 가른다 (§10.3). 그래서 게이트를 순서 보존이 자기 책임을 지는 부분집합에서 잰다.

| 조건 | 목표 | 학습 | 홀드아웃 | |
|---|---|---|---|---|
| clean 부분집합 diff 중앙값 | ≤ 0.10 | **0.000** (19개) | **0.000** (4개) | ✅ |
| clean 부분집합 목표 초과 비율 | ≤ 20% | **5.3%** (1/19) | **0.0%** (0/4) | ✅ |
| 수술적 어댑터 diff 중앙값 | 0.000 유지 | 0.000 | 0.000 | ✅ |
| 바이트 고정점 | 유지 | **100/100** | **16/16** | ✅ |
| 왕복 의미 동일 | 유지 | **98/100** | **16/16** | ✅ |
| `not-run` | 기준선 유지 | **9** | **4** | ✅ |
| 로케일 간 순서 일치율 | 참고 | 중앙값 1.000 | 중앙값 1.000 | — |

`clean` 분모의 정의: **재생성 어댑터 + 순서 외 원인 0 + 키 20개 이상.** 마지막 조건은
carettab(키 2개에 diff 0.889)·next-official(키 1개에 0.143)처럼 줄 하나가 비율을 수십 %
움직이는 리포를 빼기 위한 것이다 — 그 값은 "순서가 안 지켜졌다"를 뜻하지 않는다.

### 11.3 잔여 diff 원인 — 전부 다른 축이다

리포 수 기준(중복 가능). 재생성 어댑터 71개 중:

| 원인 | 학습 | 홀드아웃 | 누가 담당하나 |
|---|---|---|---|
| 들여쓰기가 2칸 아님 | **30** | 3 | 들여쓰기·공백 보존 (별 기능) |
| **미번역(`""`·`null`) 제외로 줄이 사라짐** | **21** | **8** | **아무도 — 의도된 규칙이다** (MVP §4.1) |
| 점 포함 키가 중첩과 공존 | **8** | 0 | 키 구분자 계약 (별 기능) |
| 정수형 키 hoisting | 4 | 0 | **원리적으로 보존 불가** |
| **한 줄에 담은 객체·배열** | **4** | 0 | 들여쓰기와 같은 축 (별 기능) |
| 비ASCII `\uXXXX` 이스케이프 | 2 | 0 | 별 기능 |
| 빈 값이 낀 배열 | 0 | 0 | 별 기능 |

**5차에서 원인 셋이 새로 이름을 얻었다.** 4차에서는 이들이 "순서 외 원인 없음"으로 분류돼
**순서 보존의 실패처럼 보였다**:

- **`emptyValues`** — zulip 실측: base가 `ar`이고 미번역이 `""`라 2285줄이 1378줄이 됐다.
  **고쳐서도 안 된다** — 빈 값을 남기면 크롬이 빈 문자열을 그대로 렌더한다.
- **`dottedWithNested`** — musicblocks·scratchblocks: `"music.restForBeats"`가 경로로 쪼개진다.
  판정은 **원본 키 이름**의 점을 본다 — 평탄화 경로의 점은 우리가 만든 조인 구분자라 중첩이면
  늘 있다.
- **`compactContainer`** — button-stealer: `"k": { "message": "…" }`를 `serialize`가 2칸으로
  펼쳐 38줄이 128줄이 됐다. **순서 일치율 100%에 diff 0.964**였다.

### 11.4 chrome 필드는 이제 원인이 아니다

| | 학습 | 홀드아웃 |
|---|---|---|
| 원본에 `placeholders`가 있는 리포 | 12 / 33 | 0 |
| 원본에 비-base `description`이 있는 리포 | 20 / 33 | 0 |

**둘 다 왕복에서 보존된다** (태스크 2·4). 4차까지는 `diffCauses`에 있었고, 그 때문에 chrome
리포 **13개가 `clean` 분모에서 부당하게 빠졌다** — 그 13개의 diff 중앙값은 0.032로 목표
통과였다. 5차에서 `RepoSurvey.chromeFields`(관측치)로 옮겼다.

⚠️ **왕복 의미 게이트는 이 두 필드를 여전히 못 본다** — `sameMeaning`이 key·message만 비교한다.
회귀가 나도 그쪽은 조용하므로 **바이트 왕복**(`lib/adapters/__tests__/key-order-golden.test.ts`)이
유일한 그물이다.

### 11.5 clean에 남은 1건 — 엔트리 **안**의 필드 순서

`Midnight-Lizard/Midnight-Lizard` (chrome, 329키, diff 0.456, hunk 346). **키 순서 일치율은
100%다** — 원본이 리프 안에서 `description`을 `message`보다 먼저 쓰는데 우리는
`{ message, description, placeholders }` 순으로 고정해서 낸다. 엔트리마다 두 줄이 맞바뀐다.

**키 순서와 다른 축이고 지표를 늘리지 않았다** — 관측이 1건뿐이라 원인 카운터를 만들 근거가
얇다. 들여쓰기·`compactContainer`와 같은 부류(포맷 규칙)이므로 그 별 기능이 함께 다룬다.

### 11.6 판정

**키 순서 보존은 자기 책임 범위에서 닫혔다.** 순서가 원인인 초과는 학습·홀드아웃 통틀어 **0건**
이고, 남은 것은 전부 이름이 붙은 다른 축이다. 전체 코퍼스 중앙값이 0.613 → 0.001로 떨어진 것이
그 부수 효과다.

**실물 PR로도 확인했다** (2026-09-03): 23키 × 3로케일 리포에서 편집 0건 pull은
`skipped/no-changes`로 끝났고(2층 blob SHA가 "바꿀 것 없음"으로 판정 — 커밋을 만들 이유조차
없었다), 키 3개를 흩어지게 편집한 pull은 **`3 insertions(+), 3 deletions(-)` / hunk 3**이었다.
[SinhyeokKang/i18n-order-check#1](https://github.com/SinhyeokKang/i18n-order-check/pull/1)

**남은 최대 원인은 들여쓰기(30) + 한 줄 컨테이너(4) + 이스케이프(2)** — 전부 `serialize`의
결정성 규칙이 만드는 포맷 차이라 **한 별 기능이 묶어서 다루는 것이 맞다.** 그다음이 미번역
제외(21)인데 그건 고칠 대상이 아니다.

## 12. 6차 측정 — 인용 부호 보존 뒤 (2026-09-03)

**어댑터 writer의 출력이 바뀌었으므로(`code-dict`·`ts-dict`가 원본의 인용 부호를 쓴다) 재측정했다.
결론은 "지표가 움직이지 않았다"이고, 그것이 이 회차가 답해야 할 질문이었다.**

| 지표 | 학습 109 | 홀드아웃 20 | 직전(4·5차) 대비 |
|---|---|---|---|
| 탐지 (지원 포맷) | 100/101 = 99.0% | 16/17 = 94.1% | 동일 |
| 오탐 | 0/100 = 0.0% | 1/16 = 6.2% | 동일 |
| 왕복 의미 동일 | 98/100 = 98.0% | 16/16 = 100% | 동일 |
| **바이트 고정점** | **100/100 = 100%** | **16/16 = 100%** | 동일 |
| 무증상 skip | 0 | 0 | 동일 |
| 첫 write diff 중앙값 | 0.0006 | 0.0000 | 동일 (§10의 0.001) |

**바이트 고정점이 양쪽 100%라는 것이 이 회차의 핵심이다.** 인용 부호를 원본에서 읽어오면 write가
원본 텍스트에 의존하게 되므로, 2차 write가 1차와 달라질 여지가 새로 생긴다 — 그러면 blob 비교가
매일 "변경됨"을 뱉어 야간 cron이 빈 커밋을 쌓는다. 실측이 그 여지가 닫혀 있음을 확인한다.

**이 회차는 인용 부호 자체를 재지 못한다.** `lib/survey/`의 지표 넷(탐지·오탐·read 에러·왕복 의미
동일)은 전부 **값**을 보고, 인용 부호는 값이 아니라 표현이다. 실제로 이 결함은 4회차의 실측을
전부 통과한 채 실물 PR에서야 드러났다 (POSTMORTEM 2026-09-03). `json-shape.ts`가 재생성 어댑터의
표현 손실(비ASCII `\uXXXX` 풀림)을 재는 것처럼 **코드 딕셔너리용 표현 지표가 있어야 이 부류가
집계에 들어온다** — 지금은 없다.

---

## 13. 7차 측정 — 감사 2라운드 뒤 (2026-09-04)

- 실행(학습): `pnpm adapter-survey docs/features/adapter-generality/repos.txt --verdicts docs/features/adapter-generality/verdicts.json`
- 실행(홀드아웃): `pnpm adapter-survey docs/features/adapter-generality/repos-heldout.txt --verdicts docs/features/adapter-generality/verdicts-heldout.json`

**두 번의 `/audit` 라운드가 `lib/adapters/**`·`lib/survey/**`를 실질적으로 바꿨으므로 재측정했다.**
이 회차가 답한 질문은 셋이다: 기존 지표가 흔들렸는가 · `nestedByPath` 배선이 실제로 손실을 줄였는가 ·
**새로 넣은 지표가 무엇을 처음 보여주는가.**

| 지표 | 학습 109 | 홀드아웃 20 | 6차 대비 |
|---|---|---|---|
| 탐지 (지원 포맷) | 100/101 = 99.0% | 16/17 = 94.1% | 동일 |
| 오탐 | 0/100 = 0.0% | 1/16 = 6.2% | 동일 |
| **왕복 의미 동일** | **99/100 = 99.0%** | 16/16 = 100% | **98.0% → 99.0%** |
| 바이트 고정점 | 100/100 = 100% | 16/16 = 100% | 동일 |
| 무증상 skip | 0 | 0 | 동일 |
| 첫 write diff 중앙값 | 0.0006 | 0.0000 | 동일 |
| clean 부분집합 중앙값 | 0.000 (19개) | 0.000 (4개) | 동일 |

### 13.1 `nestedByPath` 배선이 손실 하나를 실제로 없앴다

**남은 조용한 손실 2건이 1건이 됐다.** sugarlabs/musicblocks가 의미 동일로 넘어왔다 — 파일별 중첩
관측값이 write에 도달하면서 `th.json`의 평평한 점 키가 더 이상 쪼개지지 않는다. 그 리포의 키 충돌
카운터는 여전히 **324**지만 이제 무해하다: 충돌은 관측치이고 손실이 아니다.

siyuan-note/siyuan은 남았고(충돌 21) **`writeErrors: 21`로 보고된다** — 감사 라운드가 만든 통로다.
그래서 지금 남은 것은 **조용한 손실 0건 / 알려진 손실 1건**이다. 이 차이가 §3의 서술을 갱신한다.

### 13.2 새 지표 — 수술적 어댑터의 **1키 편집 hunk 수**

**직전까지 수술적 어댑터의 왕복·고정점·diff 0.000은 공허했다.** read 결과를 그대로 write에 넣으면
값이 전부 같아 원본을 바이트 그대로 돌려주므로 **치환 경로를 한 줄도 밟지 않는다.** 그래서 base
파일의 키 하나만 값을 바꿔 write하고 변경 hunk 수를 재는 지표를 넣었다 (정상은 1).

| | 학습 | 홀드아웃 |
|---|---|---|
| hunk = 1 | **20/29 = 69.0%** | **2/4 = 50.0%** |

초과한 11개가 **전부 `yaml-catalog`** 다: your-priorities · DMPRoadmap/roadmap · GSA/search-gov ·
Growstuff/growstuff · diaspora · forem · misskey · redmine · stringer-rss · rubygems.org ·
withastro/docs. `code-dict`·`ts-dict`는 전부 1이다 — ts-morph가 원본 텍스트를 스플라이스하기 때문이다.

### 13.3 `yaml-catalog`는 편집이 하나라도 있으면 수술적이 아니다

`write`가 `doc.toString()`으로 **문서 전체를 다시 찍는다.** 값이 안 바뀌면 원본을 그대로 돌려주므로
지금까지의 지표가 전부 통과했고, 실물 PR(`i18n-format-check#1`, `+4 -5`)도 픽스처가 2칸·정렬 없는
작은 파일이라 드러나지 않았다. redmine의 실제 `ko.yml`(1,585줄)에 **키 하나**를 편집하면:

| | hunk | 다른 줄 | diff 비율 |
|---|---|---|---|
| 옵션 없음 (7차 이전) | 60 | 807 | 0.0908 |
| 원본 관측 옵션 적용 후 | 55 | 816 | 0.0709 |

**옵션으로 되돌릴 수 있는 축은 이번에 다 닫았다** — 들여쓰기 폭·줄 접기(6차 이후)에 더해
**시퀀스 들여쓰기**(`indentSeq`: Rails는 부모와 같은 열에 `-`를 쓴다)와 **플로우 컬렉션 여백**
(`flowCollectionPadding`: `[일, 월]` → `[ 일, 월 ]`)을 원본에서 관측한다. diff 비율이 22% 줄었다.

**남은 축은 옵션으로 닫을 수 없다.** 대표가 콜론 뒤 정렬 공백이다:

```
-        one:   "일초 이하"
+        one: "일초 이하"
```

`yaml`은 AST에서 다시 찍으므로 이 공백이 남지 않는다. **진짜 수술적 치환은 편집된 스칼라의
`range`로 원본 문자열을 직접 갈아끼우는 것**이고, 그것이 이 지표를 1로 만드는 유일한 길이다.
→ §6에 후속으로 등재.

### 13.4 흔들리지 않은 것

- **바이트 고정점 100%** — 옵션을 원본에서 읽어오면 2차 write가 1차와 달라질 여지가 새로 생기는데
  실측이 그 여지가 닫혀 있음을 확인한다 (6차의 인용 부호와 같은 축).
- **탐지·오탐 동일** — 감사 라운드가 `matchGlobPaths`로 `multi-locale` 경로 규칙을 하나로 모았지만
  `ts-dict`는 자동 탐지에서 빠져 있어 코퍼스 지표에 닿지 않는다. 예상대로다.
- **잔여 diff 원인 분포 동일** — 들여쓰기 **30** · 빈 값 21 · 점-키/중첩 공존 8 · 정수형 키 4 ·
  한 줄 컨테이너 4 · 비ASCII 이스케이프 2 (학습). 재생성 writer의 원본 포맷 보존이 여전히 최대
  잔여 원인이고, 그 기능의 대상 부분집합(재생성 + 키 20개 이상 + 표현 원인 하나 이상, 29개)의
  현재 diff 중앙값은 **0.9705**다.

### 13.5 판정

1. **기존 지표는 흔들리지 않았다** — 감사 2라운드가 회귀를 만들지 않았다.
2. **조용한 손실이 0이 됐다** (알려진 손실 1건). §3을 그렇게 갱신한다.
3. **`yaml-catalog`의 수술적 치환은 미완이다** — 편집이 있으면 파일 절반을 다시 쓴다. 옵션으로
   닫을 수 있는 축은 닫았고, 나머지는 범위 기반 치환이라는 별 기능이 필요하다.
4. ⚠️ **지표가 없으면 이 부류는 원리적으로 안 보인다.** 6차까지의 네 지표는 전부 "값이 맞는가"를
   묻고, 수술적 어댑터에서는 **값을 바꾸지 않은 왕복**만 재고 있었다. 편집 프로브를 넣은 첫 회차에
   11개 리포가 드러났다 — POSTMORTEM 2026-09-03의 "값이 맞으면 통과하는 검증"과 같은 계열이다.

---

## 14. 8차 측정 — 원본 들여쓰기 보존 뒤 (2026-09-04)

- 실행(학습): `pnpm adapter-survey docs/features/adapter-generality/repos.txt --verdicts docs/features/adapter-generality/verdicts.json`
- 실행(홀드아웃): `pnpm adapter-survey docs/features/adapter-generality/repos-heldout.txt --verdicts docs/features/adapter-generality/verdicts-heldout.json`

**`docs/features/format-preservation/` 태스크 1a~5의 결과다.** 재생성 writer(`chrome-locales`·
`json-catalog`)가 `serialize`로 표현을 2칸에 고정하던 것을 **원본에서 관측한 폭**으로 바꿨다.
이 회차가 답한 질문은 하나다 — **들여쓰기 축이 실제로 닫혔는가, 그리고 무엇도 안 깨뜨렸는가.**

| 지표 | 7차 학습 | **8차 학습** | 7차 홀드아웃 | **8차 홀드아웃** |
|---|---|---|---|---|
| 탐지 (지원 포맷) | 100/101 = 99.0% | 동일 | 16/17 = 94.1% | 동일 |
| 오탐 | 0/100 = 0.0% | 동일 | 1/16 = 6.2% | 동일 |
| 왕복 의미 동일 | 99/100 = 99.0% | 동일 | 16/16 = 100% | 동일 |
| **바이트 고정점** | 100/100 = 100% | **동일** | 16/16 = 100% | **동일** |
| `not-run` | 9 | 동일 | 4 | 동일 |
| **첫 write diff 중앙값** | 0.0006 | **0.0000** | 0.0000 | 동일 |
| **목표(0.10) 초과 비율** | 31/99 = 31.3% | **14/99 = 14.1%** | 3/15 = 20.0% | 동일 |
| `chrome-locales` 중앙값 | 0.0962 | **0.0362** | 표본 0 | 표본 0 |
| `json-catalog` 중앙값 | 0.0075 | **0.0000** | 0.0000 | 동일 |
| `surgicalEditHunks` | 20/29 = 69.0% | 동일 | 2/4 = 50% | 동일 |

### 14.1 들여쓰기가 원인 목록에서 사라졌다

**학습 `indent` 30 → 0, 홀드아웃 3 → 0.** 원인이 아니라 **관측치**가 됐다(`JsonShape.indent`는
그대로 4칸·탭을 보고한다). 고쳐진 축을 `DiffCauses`에 남겨 두면 그 리포들이 `clean` 분모에서 계속
빠져 **개선이 게이트에 나타나지 않는다** — chrome 필드에서 리포 13개가 그렇게 부당하게 빠졌다
(POSTMORTEM 2026-09-03).

그 결과 `clean` 분모가 **19 → 34개**로 넓어졌다. ⚠️ **넓어진 분모의 초과 비율(5.3% → 2.9%)을
개선으로 읽으면 안 된다** — 희석이다. 그래서 **7차 시점의 clean 리포를 slug로 고정해** 따로 쟀고,
그 고정 집합에서 **중앙값 0.0000 · 초과 1건**으로 7차와 같다(초과 1건은 Midnight-Lizard, 엔트리
필드 순서 — 아직 안 고친 축이다).

### 14.2 가장 크게 내려간 리포

**20개가 0.3 이상 내려갔고 대부분이 1.0 → 0.000이다.** 4칸·탭 파일에 2칸을 쓰면 값 편집이 0건이어도
모든 줄이 바뀌던 그 리포들이다.

| 리포 | 7차 | 8차 |
|---|---|---|
| ZeusLN/zeus | 0.999 | **0.000** |
| gildas-lormeau/SingleFile | 0.998 | **0.000** |
| YunoHost/yunohost | 0.997 | **0.000** |
| RoderickQiu/wnr | 0.994 | **0.000** |
| Kareadita/Kavita | 0.990 | **0.000** |
| siyuan-note/siyuan | 0.999 | **0.011** |
| hackmdio/codimd | 0.984 | **0.004** |
| element-hq/element-web | 0.957 | **0.000** |

siyuan이 0.011로 남은 것은 **정수형 키 hoisting**(기록된 비목표)이고, 탭 들여쓰기는 닫혔다.

### 14.3 남은 초과 14건은 전부 다른 축이다

**들여쓰기가 원인인 초과는 학습·홀드아웃 통틀어 0건이다.**

| 원인 | 리포 | 담당 |
|---|---|---|
| 한 줄 컨테이너 | button-stealer 0.964 · HeaderEditor 1.000 | **태스크 1b** (같은 기능, 갈라 둠) |
| 엔트리 필드 순서 | Midnight-Lizard 0.456 | 같은 기능, 미착수 |
| 미번역 제외 | CPod 0.106 · Neat-URL 0.157 · kee-org 0.294 | **의도된 규칙** (MVP §4.1) — 고칠 대상이 아니다 |
| 점 키 + 중첩 | scratchblocks 0.378 | 키 구분자 계약 (보류) |
| 비ASCII 이스케이프 | CanvasBlocker 0.538 (+다른 원인 둘) | **태스크 1b** |

**좁힌 게이트 분모(표현 원인 + 그 외 원인 0 + 키 20개 이상)가 19개 → 4개로 줄었다.** 남은 넷의
중앙값이 0.5079이고 전부 한 줄 컨테이너·이스케이프다 — 즉 **태스크 1a의 책임 범위는 비었고,
게이트가 이제 1b를 가리킨다.** 완료 조건 ①의 목표(≤ 0.10)는 1b가 닫는다.

### 14.4 흔들리지 않은 것 — 이 회차의 최대 위험

**바이트 고정점이 양쪽 100%다.** write 출력이 원본 텍스트에 의존하게 되면 2차 write가 1차와
달라질 여지가 새로 생기고, 그러면 blob 비교가 매일 "변경됨"을 뱉어 야간 cron이 빈 커밋을 쌓는다.
성립 근거는 관측의 고정점 성질(`observe(write(v, observe(src))) === observe(src)`)이고, 6차의
`dominantQuote`가 같은 논증을 통과했다.

`surgicalEditHunks`도 그대로다(20/29 · 2/4) — 이 기능이 수술적 어댑터에 닿지 않았다는 확인이다.
탐지·오탐·왕복·`not-run`도 전부 동일하다.

### 14.5 판정

1. **들여쓰기 축은 닫혔다.** 원인 30 → 0, 20개 리포가 1.0 → 0.000, 초과 비율 31.3% → 14.1%.
2. **아무것도 안 깨졌다.** 고정점·왕복·탐지·오탐·수술적 편집 hunk 전부 유지.
3. **게이트가 다음 축을 가리킨다.** 좁힌 분모 4개가 전부 한 줄 컨테이너·이스케이프다 —
   태스크 1b가 그 자리이고, 완료 조건 ①의 수치 목표는 거기서 판정한다.
4. ⚠️ **`clean`의 초과 비율 하락(5.3% → 2.9%)은 희석이지 개선이 아니다.** 고정 slug 집합이
   그 함정을 막는다 — 이 문서에서 같은 함정을 두 번째로 밟을 뻔했다.

## 15. 9차 측정 — 한 줄 컨테이너·비ASCII 이스케이프 보존 뒤 (2026-09-04)

- 실행(학습): `pnpm adapter-survey docs/features/adapter-generality/repos.txt --verdicts docs/features/adapter-generality/verdicts.json`
- 실행(홀드아웃): `pnpm adapter-survey docs/features/adapter-generality/repos-heldout.txt --verdicts docs/features/adapter-generality/verdicts-heldout.json`

**`docs/features/format-preservation/` 태스크 1b의 결과다.** 재생성 writer가 원본에서 한 줄이던
컨테이너를 한 줄로 내고, 원본이 `\uXXXX`로 쓴 비ASCII를 그대로 쓴다. 8차 판정 ③이 "좁힌 분모
4개가 전부 이 두 축"이라고 가리킨 자리다.

| 지표 | 8차 학습 | **9차 학습** | 8차 홀드아웃 | **9차 홀드아웃** |
|---|---|---|---|---|
| 탐지 (지원 포맷) | 100/101 = 99.0% | 동일 | 16/17 = 94.1% | 동일 |
| 오탐 | 0/100 = 0.0% | 동일 | 1/16 = 6.3% | 동일 |
| 왕복 의미 동일 | 99/100 = 99.0% | 동일 | 16/16 = 100% | 동일 |
| **바이트 고정점** | 100/100 = 100% | **동일** | 16/16 = 100% | **동일** |
| `not-run` | 9 | 동일 | 4 | 동일 |
| 첫 write diff 중앙값 | 0.0000 | 동일 | 0.0000 | 동일 |
| **목표(0.10) 초과 비율** | 14/99 = 14.1% | **13/99 = 13.1%** | 3/15 = 20.0% | 동일 |
| **`chrome-locales` 중앙값** | 0.0362 | **0.0280** | 표본 0 | 표본 0 |
| `json-catalog` 중앙값 | 0.0000 | 동일 | 0.0000 | 동일 |
| `surgicalEditHunks` | 20/29 = 69.0% | 동일 | 2/4 = 50% | 동일 |
| **`clean` 분모** | 34 | **38** | 4 | 동일 |

⚠️ **홀드아웃이 전부 "동일"인 것은 우연이 아니다.** 그 20개에 두 축을 가진 리포가 **0개**다
(`JSON 표현(관측): {"escapedNonAscii":0,"compactContainer":0}`). 이 회차의 홀드아웃은 **개선을
재는 표본이 아니라 회귀를 재는 표본**이었고, 그 역할로는 통과했다 — **3차(홀드아웃 검증)** 의 수정 4건 중 2건이
수정이 만든 회귀였고 그중 하나는 학습에서만 보였다(§0 3차, TASKS §8).

### 15.1 두 축이 원인 목록에서 사라졌다

**학습 `escapedNonAscii` 2 → 0, `compactContainer` 4 → 0.** 둘 다 원인이 아니라 **관측치**가 됐다
(`JsonShape.escapedNonAscii`·`compactContainer`는 그대로 보고한다). 그 결과 `clean` 분모가
**34 → 38개**로 넓어졌다.

⚠️ **넓어진 분모의 초과 비율(2.9% → 5.3%)을 악화로 읽으면 안 된다** — 새로 들어온 4개 중 하나가
초과라서 비율이 오른 것이다. 들어온 넷은 button-stealer **0.000** · WordPress/browser-extension
**0.015** · Reedy-for-Chrome(다른 원인 잔존) · **HeaderEditor 1.000**이고, 마지막 하나가 §15.3의
남은 한계다.

### 15.2 한 줄 컨테이너가 실제로 닫혔다

| 리포 | 8차 | 9차 | 무엇이 |
|---|---|---|---|
| anatolyzenkov/button-stealer | 0.964 | **0.000** | `"k": { "message": … }` 22개 로케일 전부 한 줄 유지 |
| WordPress/browser-extension | – | **0.015** | 같은 관례. 잔여는 미번역 제외분 |
| kkapsner/CanvasBlocker | 0.538 | 0.538 | 이스케이프는 보존됐다 — 지배 원인이 다른 축이다(§15.3) |

`chrome-locales` 중앙값이 **0.0362 → 0.0280**으로 내려간 것이 이 축의 집계 효과다.

### 15.3 남은 초과 13건 — 이 기능이 닫을 수 있는 것은 하나 남았다

| 원인 | 리포 | 담당 |
|---|---|---|
| 엔트리 필드 순서 | Midnight-Lizard 0.456 | **같은 기능, 미착수** (chrome `description` 선행 다수결) |
| **minify된 파일** | FirefoxBar/HeaderEditor 1.000 | ⚠️ **알려진 한계** — 아래 |
| 미번역 제외 | CPod 0.106 · Neat-URL 0.157 · kee-org 0.294 · Reedy-for-Chrome 0.102 | **의도된 규칙** (MVP §4.1) |
| 점 키 + 중첩 | scratchblocks 0.378 · CanvasBlocker 0.538(복합) | 키 구분자 계약 (보류) |

⚠️ **minify된 파일은 이 기능이 안 닫는다.** HeaderEditor의 `messages.json`은 **개행이 0개**인
한 줄 파일이라 `compactPaths`가 담아야 할 컨테이너가 **루트**인데, 설계가 루트를 의도적으로
제외한다(담으면 우리가 한 줄짜리 파일을 낸다). 제외를 풀어도 안 닫힌다 — 우리는 `, `·`: `로
쓰는데 원본은 `,`·`:`라 **여백까지 관측해야** 바이트가 맞는다. 관측 상태를 하나 더 늘릴 값이
있는지는 리포 1건으로 판단하지 않는다.

### 15.4 흔들리지 않은 것

**바이트 고정점이 양쪽 100%다.** 이 회차가 가장 신경 쓴 지점이다 — 이스케이프 관측을 전역
정규식으로 두면 DB 값이 담은 리터럴 백슬래시-u에서 재관측이 뒤집혀 2차 write가 1차와 달라진다.
관측을 문자열 리터럴 안(`Scanner.string()`)으로 옮긴 것이 그 방어이고, 단위 테스트와 L2 골든이
둘 다 그 명제를 든다.

탐지·오탐·왕복 의미 동일·`not-run`·`surgicalEditHunks`·잔여 원인(`emptyValues` 21 ·
`dottedWithNested` 8 · `integerKeys` 4)이 전부 동일하다.

### 15.5 판정

1. **한 줄 컨테이너·이스케이프 축이 닫혔다.** 원인 4 + 2 → 0, button-stealer 0.964 → 0.000,
   `chrome-locales` 중앙값 0.0362 → 0.0280, 전체 초과 14.1% → 13.1%.
2. **아무것도 안 깨졌다.** 고정점·왕복·탐지·오탐·수술적 편집 hunk 전부 유지. 홀드아웃은 이
   회차에 개선 표본이 아니라 **회귀 표본**이었고 그 역할로 통과했다.
3. **이 기능에 남은 것은 엔트리 필드 순서 하나다** (Midnight-Lizard 0.456). 완료 조건 ①의 수치
   목표는 거기서 판정한다.
4. ⚠️ **minify된 파일(HeaderEditor 1.000)은 이 기능의 범위 밖으로 기록한다.** 루트 제외 + 한 줄
   여백 미관측이 겹친 자리이고, 관측 상태를 늘릴 근거가 리포 1건뿐이다.

## 16. 10·11차 측정 — 엔트리 필드 순서, 그리고 슬래시 이스케이프 (2026-09-04)

- 실행(학습): `pnpm adapter-survey docs/features/adapter-generality/repos.txt --verdicts docs/features/adapter-generality/verdicts.json`
- 실행(홀드아웃): `pnpm adapter-survey docs/features/adapter-generality/repos-heldout.txt --verdicts docs/features/adapter-generality/verdicts-heldout.json`

**두 회차를 한 절에 적는 이유는 10차가 11차를 낳았기 때문이다.** 10차(엔트리 필드 순서)가
Midnight-Lizard를 0.456 → **0.109**로 내렸는데 목표를 0.009 넘었고, 잔여 줄이 **전부 `\/`**였다.
계획에 없던 **네 번째 표현 축**이 거기서 나왔고 11차가 그것을 잰다.

| 지표 | 9차 학습 | 10차 학습 | **11차 학습** | 9차 홀드아웃 | **11차 홀드아웃** |
|---|---|---|---|---|---|
| 탐지 (지원 포맷) | 100/101 = 99.0% | 동일 | 동일 | 16/17 = 94.1% | 동일 |
| 오탐 | 0/100 = 0.0% | 동일 | 동일 | 1/16 = 6.3% | 동일 |
| 왕복 의미 동일 | 99/100 | 동일 | 동일 | 16/16 | 동일 |
| **바이트 고정점** | 100/100 | 동일 | **동일** | 16/16 | **동일** |
| `not-run` | 9 | 동일 | 동일 | 4 | 동일 |
| **목표(0.10) 초과 비율** | 13/99 = 13.1% | 13/99 | **12/99 = 12.1%** | 3/15 = 20.0% | 동일 |
| **`chrome-locales` 중앙값** | 0.0280 | 0.0280 | **0.0250** | 표본 0 | 표본 0 |
| **`clean` 초과** | 2/38 | 2/38 | **1/38 = 2.6%** | 0/4 | 동일 |
| `surgicalEditHunks` | 20/29 = 69.0% | 동일 | 동일 | 2/4 = 50% | 동일 |

### 16.1 Midnight-Lizard — 0.456 → 0.0004

전 엔트리가 `description` → `message` 순인데 우리가 반대로 냈다. `dominantFieldOrder`가 원본에서
세어 다수결로 정한 뒤 **0.456 → 0.109**, 슬래시 축까지 닫고 **0.0004**다. 남은 0.0004는 **줄
하나** — 그 파일에 끝 개행이 없고, 우리는 정확히 1개를 붙인다. **원본과 무관한 불변식이라
고칠 대상이 아니다** (MVP §4.1).

`chromeFields.descriptionFirst`를 같은 커밋에서 배선했고 학습에서 **2**(Midnight-Lizard ·
livemarks)가 나왔다 — 지표를 넣고 배선을 안 하는 것이 이 리포에서 세 번 반복된 실패다
(POSTMORTEM 2026-09-02).

### 16.2 슬래시 이스케이프 — 계획에 없던 네 번째 축

`/`를 `\/`로 쓰는 것은 **합법이지만 선택적인** JSON 이스케이프라 `JSON.stringify`가 절대 안
낸다. 원본이 그렇게 쓴 파일에서는 그 줄이 전부 diff였다. 학습 관측 **1개**(Midnight-Lizard)라
표본은 얇지만, 관측이 비ASCII 축과 **같은 문자열 리더 안**에 들어가고 되돌림이 `JSON.stringify`
뒤의 치환 한 줄이라 비용이 사실상 0이다.

⚠️ **고정점 논증이 여기서도 같다.** 값이 리터럴 백슬래시-슬래시를 담고 있으면 세지 않는다 —
전역 정규식이면 재관측이 뒤집혀 2차 write가 1차와 달라진다.

### 16.3 완료 조건 판정 — `docs/features/format-preservation/spec.md`

| 조건 | 기준 | 11차 결과 |
|---|---|---|
| ① 좁힌 분모 diff 중앙값 ≤ 0.10 | 기준선 **19개 · 0.9779** (7차) | **18개 · 0.0000** ✅ |
| ② 고정 19 slug 집합 | 중앙값 0.000 · 초과 0 | **0.0000 · 0** ✅ |
| ③ `changedHunks` 방향 | 내려간다 | ⚠️ **판정 불가** — 아래 |
| ④ `chrome-locales` 중앙값 하락 | 0.0962 (5차) | **0.0250** ✅ |
| ⑤ 바이트 고정점 | 학습 100/100 · 홀드아웃 16/16 | **유지** ✅ |
| ⑥ 왕복 의미 동일 | 99/100 · 16/16 | **유지** ✅ |
| ⑦ `surgicalEditHunks` | 20/29 · 2/4 | **동일** ✅ |
| ⑧ `not-run` | 9 / 4 | **동일** ✅ |
| ⑨ 지표 이관 + `descriptionFirst` ≠ 0 | — | **2** ✅ |

⚠️ **③은 코퍼스로 잴 수단이 없다.** `changedHunks`는 `lib/survey/diff.ts`에 있지만 `RepoSurvey`에
실리는 것은 **수술적 어댑터 전용** `surgicalEditHunks`뿐이라, 재생성 리포의 hunk 수가 회차 간
비교 가능한 형태로 기록되지 않는다. 대체 근거는 L2 골든 픽스처가 표현 축마다
`changedHunks === 0`을 단언하는 것이다(`key-order-golden.test.ts`). **"방향만 게이트"라고 써
놓고 잴 수단을 안 만든 것**이 이 조건의 결함이고, 필요해지면 지표를 먼저 만든다.

### 16.4 남은 초과 — 이 기능의 범위 밖이다

| 원인 | 리포 | 담당 |
|---|---|---|
| **minify된 파일** | FirefoxBar/HeaderEditor 1.000 | ⚠️ **알려진 한계** (§15.3) — `clean` 초과 1/38이 이것 하나다 |
| 미번역 제외 | CPod 0.106 · Neat-URL 0.157 · kee-org 0.294 · Reedy-for-Chrome 0.102 | **의도된 규칙** (MVP §4.1) |
| 점 키 + 중첩 | scratchblocks 0.378 · CanvasBlocker 0.538(복합) | 키 구분자 계약 (보류) |
| 정수형 키 | siyuan 0.011 | **기록된 비목표** |

### 16.5 판정

1. **원본 포맷 보존 기능이 닫혔다.** 축 넷(들여쓰기 · 한 줄 컨테이너 · 비ASCII 이스케이프 ·
   엔트리 필드 순서) + 계획에 없던 슬래시 이스케이프. 좁힌 분모 **0.9779 → 0.0000**.
2. **아무것도 안 깨졌다.** 고정점·왕복·탐지·오탐·수술적 편집 hunk·`not-run` 전부 유지.
3. **홀드아웃은 이 기능 내내 회귀 표본이었다** — 표현 축을 가진 리포가 0개라 개선이 안 나타나는
   것이 정상이고, 그 사실을 회차마다 명시했다.
4. ⚠️ **완료 조건 ③이 판정 불가로 남는다.** 게이트를 쓸 때 잴 수단이 있는지 먼저 확인하지
   않은 결과다.

## 17. 12차 측정 — 감사 3라운드(50건 리팩터) 뒤 (2026-09-04)

- 실행(학습): `pnpm adapter-survey docs/features/adapter-generality/repos.txt --verdicts docs/features/adapter-generality/verdicts.json`
- 실행(홀드아웃): `pnpm adapter-survey docs/features/adapter-generality/repos-heldout.txt --verdicts docs/features/adapter-generality/verdicts-heldout.json`

**리팩터가 writer 출력을 바꾸지 않았다는 확인이다.** `/audit` 3라운드(Claude 4관점 + Codex)의
50건 중 `lib/adapters/**`·`lib/survey/**`에 닿은 것: ts-dict·code-dict의 구문 진단, code-dict 탐지
키 구분자, `KEY_SEP` 단일화, `replaceAll`, 그리고 **지표 정의 셋** — `descriptionFirst`가 "한 엔트리
라도"에서 프로덕션과 같은 **파일 단위 다수결**로, failed 파일의 표현 관측 제외, yaml 확장자 그룹.

| 지표 | 11차 학습 | **12차 학습** | 11차 홀드아웃 | **12차 홀드아웃** |
|---|---|---|---|---|
| 탐지 · 오탐 · 왕복 의미 · **바이트 고정점** · `not-run` | 99.0% · 0.0% · 99/100 · 100/100 · 9 | **전부 동일** | 94.1% · 6.3% · 16/16 · 16/16 · 4 | **전부 동일** |
| 목표(0.10) 초과 | 12/99 | 동일 | 3/15 | 동일 |
| `chrome-locales` 중앙값 · `clean` 초과 | 0.0250 · 1/38 | 동일 | — · 0/4 | 동일 |
| `surgicalEditHunks` | 20/29 | 동일 | 2/4 | 동일 |
| **`descriptionFirst`(관측)** | **2** | **1** | 0 | 0 |

### 17.1 `descriptionFirst` 2 → 1 — 지표가 프로덕션을 따라간 결과다

11차의 2는 Midnight-Lizard + livemarks였다. livemarks는 **엔트리 몇 개만** description을 먼저 쓰고
파일 다수는 message가 먼저다 — 옛 지표("한 엔트리라도")는 축 적용으로 셌지만 writer(`dominantFieldOrder`
다수결)는 message를 먼저 낸다. 지표와 프로덕션이 다른 판정을 했던 것이고(감사 #20), 이제 같은
함수를 쓰므로 **1이 맞는 수**다. livemarks의 diff(0.0386)는 그대로다 — 그 리포에서 필드 순서는
원래 원인이 아니었다.

### 17.2 판정

1. **회귀 0.** writer 출력·탐지·고정점·왕복 전부 11차와 같다. 구문 진단 추가가 유효 파일에 닿지
   않았다는 확인이다 (깨진 파일은 코퍼스에 없다 — `json-parse 1`은 홀드아웃의 기존 값).
2. **지표 정의 변경이 낸 차이는 `descriptionFirst` 하나**이고 그 방향이 옳다.
3. 홀드아웃은 이 회차에도 회귀 표본이었고 통과했다.

## 18. 13차 측정 — 계약 필드 제거 뒤 (2026-09-04)

- 실행: 12차와 같다 (학습 `repos.txt` / 홀드아웃 `repos-heldout.txt`).

**`lib/adapters/types.ts`에서 필드 둘을 지운 것의 확인이다** — `DetectedFormat`·`ReadResult`의
`rootKeyedByPath`(write가 원본에서 재관측하므로 안 믿던 값)와 `WriteInput.isBase`(어댑터 독자 0).
`yaml-catalog.read`의 반환 모양이 바뀌므로 그 18개 리포가 대상이다.

**학습·홀드아웃 전 지표가 12차와 같다.** 탐지 100/101 · 오탐 0/100 · 왕복 의미 99/100 ·
바이트 고정점 100/100 · 목표 초과 12/99 · `clean` 초과 1/38 · `surgicalEditHunks` 20/29 ·
`yaml-catalog` 중앙값 0.000 / 초과 0/18 · 표현·chrome 관측치까지 동일. 홀드아웃도 16/16 · 3/15로 같다.

**판정**: 제거한 둘이 실제로 흐르지 않았다는 실측 확인이다. 필드가 소비되고 있었다면
`yaml-catalog`의 루트 키 판정이 흔들려 그 18개 중 하나라도 diff나 왕복에 나타났을 것이다.

## 19. 회차를 더하지 않은 변경 — `codeDictCandidatePaths` 분리 (2026-09-07)

`lib/adapters/code-dict.ts`의 `detectCandidates` 앞부분(경로 → 그룹, probe 이전)을 `codeDictCandidatePaths(paths)`로
분리해 export했다 (온보딩 design §3.1 2b — 서버는 동기 probe가 없어 내려받을 파일을 고를 그룹이 먼저 필요하다).
**판정은 한 줄도 바뀌지 않았다** — `detectCandidates`가 그 함수를 그대로 부르고 `hasDictionary` 검증만 얹는다.

**같은 날 둘째 변경**: `chrome-locales.write`에서 계약에 없던 `isBase` 파라미터를 뺐다(`lib/adapters/types.ts`의
`WriteInput`대로). **본문은 그 값을 읽지 않았으므로 출력 바이트가 동일하다** — writer 로직 0줄이다. 다만
`lib/survey/one.ts`가 그 필드를 넘기고 있었으므로 **측정 경로의 입력이 프로덕션과 같아진 것이 이 변경의
값이다**(전에는 갈려 있었다). 지표에 영향이 없어 회차를 더하지 않는다.
`lib/adapters/__tests__/code-dict-paths.test.ts`가 부분집합·순서 보존·로케일 집합 동일을 단언하고, `detect-candidates`·
`key-order-golden`·`write-contract`(`write`·`writeWithErrors`가 `WriteInput`을 **이름으로** 받는지 소스로 센다 — 메서드 파라미터 양변성 때문에 타입 검사가 못 보는 부류이고, 이 절이 서술하는 결함이 정확히 그것이다)이 그대로 green이다. `lib/adapters/**` 변경이지만 **재측정 트리거로 보지 않고 회차를 더하지 않는다** —
같은 입력에 같은 후보를 내는 코드 이동이라 잴 것이 없다.

## 20. 14차 측정 — 어댑터 오류가 코드가 된 뒤 (2026-09-08)

- 실행: 13차와 같다 (학습 `repos.txt` 109개 / 홀드아웃 `repos-heldout.txt` 20개).

**`AdapterError.message`(자유 문자열)가 `AdapterErrorCode`(스물둘)로 바뀐 것의 확인이다**
(translation-ui 6b-1). 생성 지점 35곳이 코드를 내고 문장은 `messages/en.tsx`가 낸다. **측정에 이것이
걸리는 이유는 `lib/survey/one.ts`의 `classify`다** — 지표 ③이 그 문구의 부분 문자열로 갈리고 있었고,
이 회차로 `classify(code)`가 됐다. 함께 들어간 어댑터 변경 하나가 더 있다: `json-catalog`의 파일별
중첩 조회를 `Object.hasOwn`으로 감쌌다(프로토타입 키가 `?.[path] ?? …`를 우회해 평평한 파일을
중첩으로 쓰던 경로 — §1.35의 손실 계열).

**전 지표가 13차와 같다.**

| 지표 | 코퍼스 | 14차 | 13차 |
|---|---|---|---|
| ① 탐지 (지원 포맷) | 학습 | 100/101 | 100/101 |
| ② 오탐 | 학습 | 0/100 | 0/100 |
| ④ 왕복 의미 동일 | 학습 | 99/100 | 99/100 |
| ④ 바이트 고정점 | 학습 | 100/100 | 100/100 |
| ④ 목표(0.1) 초과 | 학습 | 12/99 | 12/99 |
| ⑤ `clean` 목표 초과 | 학습 | 1/38 | 1/38 |
| ⑤ 수술적 1키 편집 hunk=1 | 학습 | 20/29 | 20/29 |
| ④ `yaml-catalog` 중앙값 / 초과 | 학습 | 0.000 / 0/18 | 0.000 / 0/18 |
| ① 탐지 (지원 포맷) | 홀드아웃 | 16/17 | 16/17 |
| ② 오탐 | 홀드아웃 | 1/16 | 1/16 |
| ④ 왕복 의미·고정점 | 홀드아웃 | 16/16 · 16/16 | 16/16 |
| ④ 목표 초과 | 홀드아웃 | 3/15 | 3/15 |

표현·chrome 관측치도 동일하다 — `placeholders` 12 · `nonBaseDescription` 20 · `descriptionFirst` 1 ·
`escapedNonAscii` 2 · `compactContainer` 4 · `escapedSlash` 1.

### 20.1 지표 ③이 이 회차의 실제 대상이다

**분류기를 바꾼 회차이므로 유형별 건수가 곧 검증 대상이다.** §1 ③의 다섯 행이 그대로다 —
`chrome-key` 1,843 · `leaf-type` 697 · `non-literal-value` 621 · `key-collision` 107 ·
`non-object-root` 4. **그리고 §1이 "분모 없음 — 재측정 필요"로 비워 뒀던 세 행이 이 회차로 채워졌다**:
`json-parse` 0 · `adapter-threw` 0 · `other` 1(전부 `no-default-export`).

⚠️ **그럼에도 재측정이 이 변경의 주된 방어선은 아니다.** 옛 `classify`는 **단위 테스트가 0건**이었고
(tasks 6b-1이 "재측정만이 판정한다"고 적은 자리), 코퍼스가 한 번도 만들지 않는 갈래는 회귀가
**0으로 조용히** 남는다 — 실제로 스물둘 중 코퍼스가 밟는 것은 여섯이다. 그래서 옛 문구 스물둘과
**옛 분류기 본문**을 픽스처로 든 `lib/survey/__tests__/classify.test.ts`가 들어갔다. 재측정이 답하는
것은 그 표가 프로덕션 경로에서 실제로 불린다는 것뿐이다(POSTMORTEM 2026-09-02 "순위·분류를 고칠
때는 진입점에서 검증한다"의 형태).

**골든 등식을 write 층에 걸지 않았다.** `write-parse-failed`의 옛 문구는 `구문 오류로 원본을 그대로
둔다: …`라 옛 분류기에 먹이면 `json-parse`가 나오는데, 그 코드는 `read1.errors`에 **도달할 수 없어**
지표에 한 번도 실린 적이 없다. 관측 불가능한 자리를 고정하면 등식이 거짓 정밀도를 갖는다 —
테스트의 `NON_READ` 아홉이 그 경계다.

### 20.2 판정

**코드화가 지표를 움직이지 않았다.** 움직였다면 ③의 유형별 건수가 먼저 갈렸을 것이고, 그것이
`classify`의 유일한 관측 창이다. `json-catalog`의 `hasOwn` 가드도 바이트에 닿지 않았다 — 정상 입력에서
`false ?? x`가 `false`를 유지하므로 결과가 같고, 달라지는 유일한 입력이 프로토타입 키 이름의 로케일이다.

⚠️ **홀드아웃은 이제 학습 코퍼스다** (§0 3차 마지막 줄 — 이번이 그것을 쓴 네 번째 회차다). 다음
일반화 측정에는 또 다른 새 리포가 필요하고, 이 회차의 홀드아웃 값은 "회귀가 없다"만 말한다.

## 21. 15차 측정 — 프로토타입 키와 글롭 예산 뒤 (2026-09-09)

- 실행: 14차와 같다 (학습 `repos.txt` 109개 / 홀드아웃 `repos-heldout.txt` 20개).

**sec-audit ship 1의 확인이다** (`docs/features/sec-audit/` 발견 1·17·11). 어댑터에 닿은 변경은 둘이다:
`json-catalog`·`chrome-locales`의 **대입 자리 다섯**이 프로토타입 없는 객체가 됐고(`setDeep`의 중간
노드 · `normalizeArrays`의 재조립 · flat `out` 둘), `matchGlobPaths`가 **템플릿 예산**을 지나게 됐다
(인접 양자 4개 · 길이 200자를 넘으면 빈 배열).

**전 지표가 14차와 같다.**

| 지표 | 코퍼스 | 15차 | 14차 |
|---|---|---|---|
| ① 탐지 (지원 포맷) | 학습 | 100/101 | 100/101 |
| ② 오탐 | 학습 | 0/100 | 0/100 |
| ④ 왕복 의미 동일 | 학습 | 99/100 | 99/100 |
| ④ 바이트 고정점 | 학습 | 100/100 | 100/100 |
| ④ 목표(0.1) 초과 | 학습 | 12/99 | 12/99 |
| ⑤ `clean` 목표 초과 | 학습 | 1/38 | 1/38 |
| ⑤ 수술적 1키 편집 hunk=1 | 학습 | 20/29 | 20/29 |
| ④ `yaml-catalog` 중앙값 / 초과 | 학습 | 0.000 / 0/18 | 0.000 / 0/18 |
| ③ 유형별 건수 | 학습 | `chrome-key` 1,843 · `leaf-type` 697 · `non-literal-value` 621 · `key-collision` 107 · `non-object-root` 4 · `other` 1 | 동일 |
| ① 탐지 (지원 포맷) | 홀드아웃 | 16/17 | 16/17 |
| ② 오탐 | 홀드아웃 | 1/16 | 1/16 |
| ④ 왕복 의미·고정점 | 홀드아웃 | 16/16 · 16/16 | 16/16 · 16/16 |
| ④ 목표 초과 | 홀드아웃 | 3/15 | 3/15 |

표현·chrome 관측치도 동일하다 — `placeholders` 12 · `nonBaseDescription` 20 · `descriptionFirst` 1 ·
`escapedNonAscii` 2 · `compactContainer` 4 · `escapedSlash` 1.

### 21.1 이 회차가 실제로 답한 것은 둘이다

1. **프로토타입 없는 객체가 바이트를 안 바꾼다.** `JSON.stringify`도 `Object.entries`도 프로토타입을
   보지 않으므로 출력이 같아야 하고, **바이트 고정점 100/100과 diff 중앙값 0.000이 그 확인이다.**
   틀렸다면 재생성 어댑터 71개 전부에서 동시에 나타났을 것이다.
2. **코퍼스에 예산을 넘는 템플릿이 없다.** 있었다면 `matchGlobPaths`가 빈 배열을 내 그 리포의 탐지나
   왕복이 즉시 갈렸을 것이다 — ①이 100/101 그대로인 것이 그 뜻이다. 실측 템플릿은 전부 양자 1개다.

⚠️ **재측정이 이 ship의 주된 방어선은 아니다** (14차 §20.1과 같은 형태). 프로토타입 키를 가진 로케일
파일은 코퍼스에 **없고**, 없는 것은 지표에 0으로 조용히 남는다. 그 자리를 메우는 것은
`lib/adapters/__tests__/contract.ts`의 `prototypeKeyViolations`이고 — `ADAPTERS` 전수라 어댑터가 늘면
같이 는다 — 재측정이 답하는 것은 **"고친 것이 정상 입력을 안 건드렸다"** 뿐이다.

⚠️ **홀드아웃은 여전히 학습 코퍼스다** (§0 3차 — 이번이 다섯 번째 회차다). 일반화를 다시 재려면
새 리포가 필요하고, 이 회차의 홀드아웃 값은 "회귀가 없다"만 말한다.
