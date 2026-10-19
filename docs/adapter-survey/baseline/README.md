# adapter-survey 회귀 기준선 (android-strings 뒤, 2026-10-19)

머신을 옮겨도 다음 어댑터 스펙이 같은 기준으로 회귀를 잴 수 있도록 **리포별 1순위와 `metrics`만** 커밋한다. 원자료 JSON은 크고 머신에 묶여 있어서
(`.scratch/`) 커밋하지 않는다. 필요하면 아래 명령으로 다시 만든다 — 핀이 있어 같은 SHA에서 돈다.

- 코드: android-strings 배치 A fix1(`android-strings` 포함 — `apple-xcstrings` 뒤). 출처는 그 배치의 고정 SHA 재측정이다(T3.4 · fix1 — fix1의 값 의미 수정은
  1순위·지표를 움직이지 않았고, 모바일 지표의 변화는 NewPipe 판정 하나다).
- `learning`·`heldout`: 학습 109 · 홀드아웃 20. 리포별 1순위와 `metrics`가 apple-xcstrings 뒤 기준선과 **바이트 단위로 같다** — Android 어댑터는 기존 코퍼스를 한 칸도 바꾸지 않았다.
- `mobile`·`mobile-heldout`: 모바일 학습 48 · 홀드아웃 12. **apple-xcstrings 뒤 기준선과 다르다** — 바뀐 1순위 20개(학습 16 · 홀드아웃 4)가 전부 Android 후보다.
  정답이 Android인 19리포 중 18리포가 바뀌었고, 새 1순위가 대표 정답이거나 `alsoValid`인 것이 18이다(EasyWatermark는 Apple `InfoPlist.strings`에서 Android 정답으로,
  butler는 json 오탐에서 대표 정답 `app/src/main/res/…`로, stripe는 json 오탐에서 `alsoValid` 모듈로). NewPipe는 1순위가 `shared/src/commonMain/composeResources/…`
  (110로케일)이고 대표 `app/src/main/res/…`(109)는 2순위다 — 판정 JSON이 그 Compose 카탈로그를 `alsoValid`로 받았다(orch 결정 16, 사용자 검수 대기 — `repos.md`).
  **open-u60-pro**는 그대로 iOS `Localizable.strings`(`alsoValid`)다 — Android 정답(기준 + zh-rCN)은 3순위다. 정답이 없는(`correctCatalogPath: null`)
  **android/security-certification-resources**가 `-`에서 단일 언어 Android 후보로 바뀌었다(테스트 앱 19개의 `values/`만 — 오탐이 새 후보로 바뀐 보고 대상).
  **ARB 정답 14개·`.strings`·String Catalog 정답의 1순위는 그대로다** — Flutter 앱의 `android/` 셸은 맨 뒤다. `leaf-type`이 늘어난 것은 Android 파일의
  `<plurals>`·`<string-array>`·리소스 참조(unmanaged — 파일에 그대로 남는다)다. arb·apple-strings·apple-xcstrings 뒤 기준선은 git 이력에 있다.

## 파일

| 파일 | 내용 |
|---|---|
| `<corpus>.top1.tsv` | `repo` · 측정 `commit` · 1순위 `adapter` · `pathTemplate`(후보가 없으면 `-`) |
| `<corpus>.metrics.json` | survey 보고서의 `metrics`에서 `ms`를 뺀 것 |

## 재측정 명령

```
pnpm --silent adapter-survey docs/adapter-survey/repos.txt --verdicts docs/adapter-survey/verdicts.json --pins docs/adapter-survey/pins.json --json --jobs 6 --out <밖>/learning.json
pnpm --silent adapter-survey docs/adapter-survey/repos-heldout.txt --verdicts docs/adapter-survey/verdicts-heldout.json --pins docs/adapter-survey/pins-heldout.json --json --jobs 6 --out <밖>/heldout.json
pnpm --silent adapter-survey docs/adapter-survey/repos-mobile.txt --verdicts docs/adapter-survey/verdicts-mobile.json --pins docs/adapter-survey/pins-mobile.json --json --jobs 6 --out <밖>/mobile.json
pnpm --silent adapter-survey docs/adapter-survey/repos-mobile-heldout.txt --verdicts docs/adapter-survey/verdicts-mobile-heldout.json --pins docs/adapter-survey/pins-mobile-heldout.json --json --jobs 6 --out <밖>/mobile-heldout.json
```

1순위 뽑기: `jq -r '.surveys|sort_by(.repo)[]|"\(.repo)\t\(.commit)\t\(.chosen.adapter // "-")\t\(.chosen.pathTemplate // "-")"'` — 이 표와 머리 줄만 빼고 같으면 diff 0이다.
`metrics` 대조: `jq -S 'del(.. | .ms?) | .metrics'`.

## 다음 스펙이 지킬 것

- **기존 코퍼스(`learning`·`heldout`)는 diff 0이어야 한다.** 바뀌면 `adapter`를 박지 않은 기존 워크플로가 `format mismatch` 409로 영구 red가 된다(POSTMORTEM 2026-09-14).
- **모바일은 새 어댑터의 정답 리포만 바뀌어야 한다.** 판정 JSON(`verdicts-mobile*.json`)의 `correctCatalogPath`가 리포별 대표 정답 하나다 — Flutter 앱은
  Android·Apple 파일도 함께 가지므로, 새 어댑터가 **ARB가 정답인 리포의 1순위를 빼앗으면 회귀**다(반대도 같다). 바뀐 리포마다 새 1순위가 그 리포의 정답인지 확인한다.
- 새 어댑터를 dev에 넣은 배치가 이 디렉터리를 갱신한다(같은 형식, README의 출처 줄도).
