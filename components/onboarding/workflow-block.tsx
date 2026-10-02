import { CodeBlock } from "@/components/ui/code-block";
import { m } from "@/lib/i18n";

/** 대상 리포에 둘 자리 — 블록 머리의 파일명 바가 든다. */
const WORKFLOW_PATH = ".github/workflows/malmoi-i18n.yml";

/**
 * 복사용 워크플로 YAML (DESIGN §6.6) — **`/docs` 원고와 같은 `CodeBlock`이다**(2026-10-01 사용자 — 앱 쪽이 docs 형으로
 * 맞췄다). 경로는 블록 머리의 파일명 바가 들고, 위 문장은 경로 없이 할 일만 말한다 — 경로가 두 번 서지 않는다.
 * 블록이 남은 높이를 먹는다(`fill`) — 온보딩 ④·설정 모달 둘 다 본문이 아니라 블록이 스크롤한다.
 *
 * ⚠️ **훅 안내(`wrapper` input)를 이 컴포넌트가 들지 않는다** (2026-09-13 사용자 — 핸드오프 1d의
 * `<pre>` 아래는 **한 줄뿐**이다). 훅 기반 리포(`useTranslations()` 류)가 코드 참조 0을 받는 것은
 * 실재하는 빚이지만, **그 사실이 드러나는 시점은 첫 CI push 뒤**다 — 아직 아무것도 안 돌린 ④에서
 * 미리 말하면 그 화면이 읽어야 할 것(토큰·YAML) 옆에 지금 할 수 없는 일이 나란히 선다.
 * **설정 화면이 든다** — 거기는 참조가 0인 것을 이미 볼 수 있는 자리다.
 */
export function WorkflowBlock({ yaml }: { yaml: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="text-muted-foreground shrink-0 text-xs leading-body">{m.settings.workflow.saveAs}</p>
      <CodeBlock code={yaml} filename={WORKFLOW_PATH} fill />
    </div>
  );
}
