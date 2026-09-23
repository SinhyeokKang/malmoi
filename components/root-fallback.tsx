import type { ReactNode } from "react";

/**
 * 셸 밖 경계 화면 둘(루트 not-found · error)의 골격 (audit #17).
 *
 * ⚠️ **`AuthLayout`을 쓰지 않는다** — 키비주얼·도트 필드까지 딸려 와서, 오류 경계가 그리는 것 자체가 다시 던질 표면이
 * 커진다. 경계는 가장 적게 그린다: 제목 + 설명 + 출구. ⚠️ **로고도 없다** — `app/error.tsx`가 클라이언트라 이 파일이
 * 클라이언트 그래프에 들고, 이미지 import는 그 그래프의 허용 목록 밖이다(`client-graph.test.ts`).
 */
export function RootFallback({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="bg-background flex min-h-svh items-center justify-center p-8">
      <div className="flex w-[320px] flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-medium">{title}</h1>
        <p className="text-muted-foreground text-sm">{description}</p>
        <div className="flex w-full flex-col gap-2">{children}</div>
      </div>
    </main>
  );
}
