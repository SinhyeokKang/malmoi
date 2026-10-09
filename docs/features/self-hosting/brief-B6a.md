# B6a — 문서 1부 (compose와 무관한 것) (self-hosting)

공통 규칙: `docs/features/self-hosting/brief-common.md`. 정본 문서·가이드만 고친다(코드 0 — i18n 테스트 승격 예외). 사실 대조 소스는 dev의 코드. 인계 사본: `/private/tmp/claude-501/-Users-sinhyeok-code-malmoi/f5cf1603-70aa-4e36-9752-284510968f3e/scratchpad/handoff-B1.md`·`handoff-B2.md`·`handoff-B3.md`·`handoff-B5.md`(낱말 표).

## 담당 (tasks §6 중 compose·설치 절차 제외 — 그건 B6b)
1. **App 호칭 원고 + 금지 승격**(orch.md B5 항목, 같은 커밋): en·ko·es × `ai-agents/README.md`·`ai-agents/prompts.md`·`reference/troubleshooting.md` 치환(B5 낱말 표) → `lib/i18n/__tests__/helpers/banned-terms.ts` ko·es에 `Malmoi GitHub App`(es `GitHub App de Malmoi` 포함) 승격 → `terminology.test.ts` en `TERMS`에 `/\bMalmoi GitHub App\b/` → 사전 전용 describe의 **첫 `it`(App 고유명)만** 삭제(동의문 `it`은 남긴다).
2. **가이드 en·ko·es**(design §7 마지막 단락): `ai-agents/README.md`·`browser.md`·`token.md`·`prompts.md`, 루트 `faq.md`, `reference/troubleshooting.md`, `account/preferences.md`(Privacy 언어 문장), `setup/workflow.md`(self-hosted 워크플로엔 `api-url` 줄이 항상 있다). MCP 주소는 **Copy server URL** 안내, 개인정보 문의는 그 설치의 `/privacy`, 30일 응답은 hosted만. 세 언어 원고의 하드코딩 `mal-moi.com/api/mcp` 0건. `guide/SHOOTING.md:69,159` 컷 전제 대조. 규칙은 `guide/AUTHORING.md`(`/guide` 스킬을 따른다).
3. **`docs/ACTIONS.md`**: self-hosted 복사 예시(`api-url` 필수, 값은 설치 origin 자리표시자) + 대상 리포 CI가 상류 action 태그를 실행한다는 공급망 의존 한 단락.
4. **정본 SH-14 중 compose 무관 부분**: PRODUCT(배포 범위·Cron·robots의 Vercel 전제 서술), ARCHITECTURE(불변식 5의 ⚠️ Supabase 주석·§7에 self-hosted 대응 — **불변식 본문은 그대로**), CLAUDE.md(Supabase 권한 절·스택 표·명령어 표에 `credentials:self-hosted`·`credentials:finalize:self-hosted`·`preflight` — 미러 재생성), README(Privacy 전송처), DIRECTORY(`lib/deployment/`·`scripts/preflight.ts`·`lib/upload/file-store.ts`·`deploy/bootstrap.sql` — `deploy/`의 나머지는 B6b), spec.md SH-15 ② 분류 셋→넷(`command`). DESIGN §10.1은 B5가 끝냈다.
5. 문서별 별도 커밋(`docs(PRODUCT): …` 꼴).

## 건드리지 않는 것
`docs/OPERATIONS.md`·`.env.example` 산문·`.claude/commands/merge.md`(B6b) · `Dockerfile`·`deploy/**`(B4) · 그 밖 코드.
모델: Sonnet. 막히면 `ask`.
