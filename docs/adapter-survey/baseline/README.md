# adapter-survey 회귀 기준선 (apple-strings 뒤, 2026-10-19)

머신을 옮겨도 다음 어댑터 스펙이 같은 기준으로 회귀를 잴 수 있도록 **리포별 1순위와 `metrics`만** 커밋한다. 원자료 JSON은 크고 머신에 묶여 있어서
(`.scratch/`) 커밋하지 않는다. 필요하면 아래 명령으로 다시 만든다 — 핀이 있어 같은 SHA에서 돈다.

- 코드: apple-strings 배치 A(`apple-strings` 포함 — arb-catalog 뒤). 출처는 그 배치의 고정 SHA 재측정이다(T2.3).
- `learning`·`heldout`: 학습 109 · 홀드아웃 20. 리포별 1순위와 `metrics`가 arb 뒤 기준선과 **바이트 단위로 같다** — ARB·Apple strings는 기존 코퍼스를 한 칸도 바꾸지 않았다.
- `mobile`·`mobile-heldout`: 모바일 학습 48 · 홀드아웃 12. **arb 뒤 기준선과 다르다** — 바뀐 1순위 16개(학습 12 · 홀드아웃 4)가 전부 `apple-strings`다. 그중 정답 경로가 `.strings`인 리포 8개 중 7개는 정답이 됐고(Telegram-iOS는 정답이 2순위다),
  나머지 8개는 `-`(또는 이미 오탐)에서 Apple 후보로 바뀐 리포다(정답이 xcstrings·Android이거나 카탈로그 없음 — ARCHITECTURE §1.9 27차). **ARB 정답 14개는 1순위가 ARB 그대로다.**
  arb 뒤 기준선(M0 → ARB 14개 변경)은 git 이력에 있다.

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
