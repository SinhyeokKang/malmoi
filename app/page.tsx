import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { signInErrorMessage } from "@/lib/auth/message";
import { readSession } from "@/lib/auth/read-session";
import { m } from "@/lib/i18n";

/**
 * 로그인 진입점. 미들웨어가 세션 없는 보호 라우트 요청을 여기로 보낸다.
 *
 * 이미 로그인돼 있으면 바로 `/projects`로 — 로그인 화면을 두 번 보여줄 이유가 없다.
 *
 * ⚠️ **거부 사유를 여기서 보인다.** `signIn` 콜백이 false를 내면 Auth.js가 `pages.error`로 보내고,
 * 그것을 이 화면으로 돌려놨다 — 기본 `/api/auth/error`는 우리 디자인 밖의 무스타일 페이지다.
 *
 * 형은 2열이다 (design §3.12): 폼 좌 · 장식 우. **장식은 CSS와 인라인 SVG뿐이고 raw 색이 0이다** —
 * `public/`에 생성물 아닌 바이너리를 늘리지 않고, 그러면 다크·해상도 문제가 애초에 없다.
 */
export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const session = await readSession();
  if (session.status === "ok") redirect("/projects");
  // 세션을 못 읽었으면 `?error=`가 없어도 장애 문구를 보인다 — 로그인 버튼만 보이면 사용자가 헛로그인한다.
  const shown = error ?? (session.status === "unavailable" ? "Unavailable" : undefined);

  return (
    <main className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col justify-center px-8 py-12">
        <div className="mx-auto w-full max-w-sm space-y-6">
          <div className="space-y-2">
            <h1 className="text-lg font-semibold tracking-tight">{m.common.appName}</h1>
            <p className="text-muted-foreground text-sm">{m.signIn.tagline}</p>
          </div>

          {shown !== undefined && <Alert variant="danger">{signInErrorMessage(shown)}</Alert>}

          <div className="flex flex-col gap-2">
            <ProviderButton provider="github" label={m.signIn.github} variant="primary" />
            <ProviderButton provider="google" label={m.signIn.google} variant="default" />
          </div>
        </div>
      </div>

      <Decoration />
    </main>
  );
}

function ProviderButton({
  provider,
  label,
  variant,
}: {
  provider: string;
  label: string;
  variant: "primary" | "default";
}) {
  return (
    <form
      action={async () => {
        "use server";
        await signIn(provider, { redirectTo: "/projects" });
      }}
    >
      <Button type="submit" variant={variant} className="h-9 w-full">
        {label}
      </Button>
    </form>
  );
}

/**
 * 우측 장식. **토큰만 쓴다** — dot-grid는 `--border`, 그라디언트는 `from-primary/5 to-muted`다.
 * 처음 초안의 연보라는 DESIGN §6.2가 명시로 막은 raw 색이자 레퍼런스의 브랜드 색이라, "배치는
 * 가져오고 색은 안 가져온다"는 경계를 유일하게 넘는 자리였다 (design §3.12).
 *
 * `lg` 미만에서는 통째로 사라진다 — 좁은 화면에서 장식이 폼을 밀어내면 그건 장식이 아니다.
 */
function Decoration() {
  return (
    <div className="from-primary/5 to-muted relative hidden overflow-hidden bg-gradient-to-br lg:block">
      <div
        aria-hidden
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      />
      <div className="relative flex h-full items-center justify-center p-12">
        {/* 정적 모형 카드 — 실제 데이터가 아니다. 이 도구가 무엇을 하는지 한 장으로 말한다. */}
        <div className="bg-background border-border w-full max-w-sm space-y-3 rounded-lg border p-4 shadow-sm">
          <p className="text-mono text-muted-foreground">{m.signIn.sample.file}</p>
          <div className="space-y-2">
            <SampleRow label="ko" done />
            <SampleRow label="en" done />
            <SampleRow label="fr" />
          </div>
          <div className="border-border flex items-center justify-between border-t pt-3">
            <span className="text-mono text-muted-foreground">{m.signIn.sample.branch}</span>
            <span className="text-muted-foreground text-xs">{m.signIn.sample.sent}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SampleRow({ label, done = false }: { label: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-mono text-muted-foreground w-6">{label}</span>
      <span className={done ? "bg-primary/30 h-2 flex-1 rounded" : "bg-muted h-2 flex-1 rounded"} />
    </div>
  );
}
