import { auth } from "@/auth";

/**
 * 키 리스트 — **아직 셸이다.** 사이드바·리스트·인라인 편집은 TASK 5의 다음 커밋 경계다
 * (TASKS.md: auth / UI 골격 / 편집·저장 / 필터).
 */
export default async function KeysPage() {
  const session = await auth();

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-8">
      <h1 className="text-lg font-semibold tracking-tight">키</h1>
      <p className="text-muted-foreground text-sm">
        인가를 통과했다. 리스트 UI는 다음 단계에서.
      </p>
      <div className="border-border space-y-1 rounded-lg border p-4">
        <div className="text-muted-foreground text-xs">세션</div>
        <div className="text-mono">{session?.user.login ?? "(핸들 없음)"}</div>
      </div>
    </main>
  );
}
