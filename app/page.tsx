export default function Home() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">i18n-poc</h1>
      <p className="text-muted-foreground text-sm">
        번역 값은 DB가 진실, 소스 키는 코드가 진실. 편집 UI는 구현 순서 5단계에서.
      </p>
      {/* 토큰 검증용 — 5단계에서 실제 UI로 대체된다 */}
      <div className="border-border space-y-2 rounded-lg border p-4">
        <div className="text-mono" data-testid="mono-probe">
          common.viewAll
        </div>
        <div className="text-destructive text-xs">orphaned</div>
        <div className="rounded bg-amber-100/80 px-2 py-0.5 text-xs text-amber-800 inline-block">
          검토필요
        </div>
      </div>
    </main>
  );
}
