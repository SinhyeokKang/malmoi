# mit-license — tasks

새 인터페이스가 없어 "순수 함수 → 껍데기 → UI" 순서가 해당되지 않는다. 자산 → 라이선스 파일 → 문서 순이다.
자동 검증(`pnpm test`·`diff`·`grep`)과 수동 확인(`pnpm dev`로 눈으로 봄)을 태스크마다 구분해 적는다.

## T1. 국기 교체

- `npm pack country-flag-icons@1.6.20`을 `.scratch/`에 풀고, **현재 `public/flags/*.svg` 파일명을 대문자로 바꿔 `3x2/`에서 하나씩** 가져와 덮는다.
  디렉터리 통째 복사 금지(`flags.css`·`flags.zip`·upstream 전용 12개가 딸려 온다).
- `public/flags/LICENSE` — upstream `LICENSE` 원문 그대로.
- `lib/keys/flag.ts:19-25` docstring — 출처를 `country-flag-icons@1.6.20` `3x2/`(MIT)로, "원본 세트에 `GE-AB`·`GE-OS`가 있다"를
  새 원본 기준(upstream 전용 12개를 안 들인다)으로 고쳐 쓴다. `flag-assets.test.ts:38-41` 주석도 같이. 테스트 로직은 그대로.

검증(자동):
- `pnpm test lib/keys/__tests__/flag-assets.test.ts` green
- `ls public/flags | grep -v '\.svg$'` 출력이 `LICENSE` 한 줄
- `ls public/flags/*.svg | wc -l` = 253
- `diff public/flags/LICENSE .scratch/package/LICENSE` 빈 출력

검증(수동, `pnpm dev`): 랜딩 목업(`components/landing/mockup/publish.tsx`) · Publish 미리보기 Dialog(`<img>` 경로) ·
번역 표 로케일 배지(`sm` 16×11) · 온보딩 ③ 칩(`md` 24×17)에서 `gb`·`fr`·`kr`·`np`를 본다 —
**의도한 색 변화 외에** 깨짐·잘림·빈 배경이 없다.

**커밋 ①**: `chore(flags): replace the flag set with country-flag-icons 1.6.20 (MIT)`

## T2. shadcn 고지

- `components/ui/table.tsx` 헤더 주석에 `Portions Copyright (c) 2023 shadcn — MIT` 한 줄.
- `empty-state.tsx`·`select.tsx` — shadcn 원본과 클래스 문자열을 diff해 복제인지 판정. 복제면 같은 한 줄, 구조 참고면 손대지 않는다.

검증(자동): `grep -l 'Copyright (c) 2023 shadcn' components/ui/*.tsx`에 `table.tsx`(+ 복제로 판정된 파일)가 나온다 · `pnpm typecheck` green.

**커밋 ②**: `chore(ui): credit shadcn/ui in the components derived from it`

## T3. `LICENSE` + `package.json`

- 루트 `LICENSE` — `~/code/bugshot-2/LICENSE`와 같은 내용(MIT 표준 전문, `Copyright (c) 2026 Sinhyeok Kang`).
- `package.json` — `"private": true` 아래 `"license": "MIT"`.

검증(자동): `diff ~/code/bugshot-2/LICENSE LICENSE` 빈 출력 · `node -p "require('./package.json').license"` = `MIT` ·
`node -p "require('./package.json').private"` = `true`.

**커밋 ③**: `chore: license the repository under MIT`

## T4. README `## License` 절

맨 끝(`## The name` 뒤). design.md 초안대로 — 브랜드 제외 조항 없음, 국기 크레딧 한 줄.

검증(자동): `tail -5 README.md`에 `## License`와 `(LICENSE)` 링크. (수동) push 뒤 GitHub 리포 페이지에서 링크가 열린다.

**커밋 ④**: `docs(README): add a license section`

## T5. 문서 갱신

- `CLAUDE.md:19` — "사내" 삭제 → `pnpm sync:agents`로 `AGENTS.md` 미러.
- `docs/DIRECTORY.md` — 루트 `LICENSE` 등재, `:613` flags 줄에 출처 한 마디.
- `docs/DESIGN.md:492` — 국기 항목에 출처 한 마디(규칙 문장은 유지).

검증(자동): `pnpm sync:agents:check` 통과 · `grep -n '사내' CLAUDE.md` 0건 · `grep -n 'LICENSE' docs/DIRECTORY.md` 히트 ·
`grep -n 'country-flag-icons' docs/DESIGN.md docs/DIRECTORY.md` 각 히트.

**커밋 ⑤**: `docs(CLAUDE): drop the in-house wording` · **⑥** `docs(AGENTS): sync codex mirror` ·
**⑦** `docs(DIRECTORY): map the license files` · **⑧** `docs(DESIGN): record the flag set's source` (문서별 별도 커밋 — CLAUDE.md 문서 지도)

## T6. 게이트

`/push`(dev) — 1단계가 `pnpm typecheck` + `pnpm test` + `pnpm build`를 돈다.

## T7. 프로덕션 반영 후 확인

default branch가 `main`이라 GitHub 라이선스 인식은 `/merge` 뒤에야 보인다.
검증(자동): `gh repo view --json licenseInfo` → `"key":"mit"`. 안 뜨면 LICENSE 전문 변형을 의심한다(T3 diff).

## T8. 정리

올릴 결론이 PRODUCT/ARCHITECTURE/DESIGN 어디에도 없다(LICENSE·README·DESIGN 한 마디가 곧 정본) — 기능 종료 시 이 디렉터리를 지운다.

## 결정

- **저작권자**: `Sinhyeok Kang` (2026-09-27 사용자 — 개인 프로젝트, bugshot-2와 동일).
- **국기**: Figma 커뮤니티 파일, 라이선스·작성자 불명(2026-09-27 사용자) → `country-flag-icons@1.6.20`(MIT)로 교체, 이 과업에 포함.
  **색 변화 약 90개 수용**(2026-09-27 사용자, feature-review).
- **브랜드 자산**: 제외 조항 없음 — MIT 범위에 그대로 둔다(2026-09-27 사용자).
- **README 절 위치**: 맨 끝(2026-09-27 사용자).
- **shadcn 고지**: 파일 헤더 주석(2026-09-27 사용자, feature-review).
- **CLAUDE.md "사내"**: 이번에 고친다(2026-09-27 사용자, feature-review).
- **스크린샷 재촬영**: 안 한다(2026-09-27 사용자, feature-review).
