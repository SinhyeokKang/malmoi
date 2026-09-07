import { CopyButton } from "./copy-button";

/**
 * 복사용 워크플로 YAML (design §7). **여러 줄이라 값 칩이 아니다** — `<pre>`를 DESIGN §6.4의
 * "코드 블록"으로 등재하고 그 클래스를 쓴다.
 *
 * ⚠️ **`overflow-x-auto`가 `<pre>` 자신에 붙는다.** 없으면 긴 줄(`${{ secrets.PUSH_TOKEN }}`이 들어간
 * 줄)이 페이지 본문을 좌우로 흔든다 — 넓은 표를 자기 컨테이너에서만 스크롤하게 하는 것과 같은 규칙이다.
 *
 * ⚠️ **`wrapper` input이 이 YAML에 없다.** 훅 기반 리포(`useTranslations()` 류)는 그것 없이는 코드
 * 참조가 조용히 0이므로 화면이 그 사실을 한 줄로 말한다 (spec §5의 빚).
 */
export function WorkflowBlock({ yaml }: { yaml: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          리포의 <span className="text-mono">.github/workflows/l10n.yml</span>로 저장해 주세요.
        </p>
        <CopyButton value={yaml} label="YAML 복사" />
      </div>
      <pre className="text-mono bg-muted overflow-x-auto rounded-md p-3">{yaml}</pre>
      <p className="text-muted-foreground text-xs">
        훅으로 번역을 읽는 리포(<span className="text-mono">useTranslations()</span> 류)는 <span className="text-mono">wrapper</span>{" "}
        설정이 더 필요해요 — <span className="text-mono">docs/ACTIONS.md</span>를 봐 주세요.
      </p>
    </div>
  );
}
