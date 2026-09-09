"use client";

import { Link2 } from "lucide-react";
import { useState, useTransition } from "react";

import { startGithubConnectForUser, type UserConnectDest } from "@/app/(edit)/projects/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { m } from "@/lib/i18n";
import { isOnboardError, onboardErrorMessage } from "@/lib/onboarding/message";

/**
 * GitHub 계정 연결 — **사용자 수준** (design §3.6). 설정 화면의 같은 버튼과 다른 것은 인가와 착지
 * 지점 둘뿐이다: 여기는 프로젝트가 없으므로 `requireUser`만 지나고, 왕복 후 `dest`가 가리키는
 * 사용자 축 화면(`/projects/new` 또는 `/account`)으로 돌아온다(서명된 값이 정한다).
 *
 * ⚠️ **렌더 중에 자동으로 튕기지 않는다** — 버튼이다. `github-account.tsx`의 `reauthorize`와 같은
 * 판단이다: callback이 실패하면 루프가 된다.
 *
 * ⚠️ **착지는 `dest`가 정하고 그 값은 갈래 이름뿐이다** (6b-4). `StateDest`를 통째로 넘길 수 있게
 * 하면 클라이언트가 착지를 고르게 되고, 그러면 Action에 open redirect 판정이 생긴다.
 *
 * 성공하면 Action이 GitHub으로 `redirect`하므로 이 컴포넌트는 실패만 그린다.
 */
export function ConnectGithubButton({ dest, label }: { dest: UserConnectDest; label: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        variant="primary"
        loading={pending}
        // ⚠️ 라벨과 같게 두면 대기 상태가 안 보인다 — GitHub으로 나가는 왕복이라 문구가 "이동"이다.
        loadingLabel={m.newProject.empty.connect.redirecting}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await startGithubConnectForUser(dest);
            // 거부는 값으로 온다 — 성공은 redirect라 여기 도달하지 않는다 (ARCHITECTURE §6.3).
            if (!result.ok) setError(result.error);
          });
        }}
      >
        {/* ⚠️ `lucide-react` 1.x에 브랜드 아이콘이 없다 (DESIGN §6.8) */}
        <Link2 aria-hidden />
        {label}
      </Button>
      {error !== null && <Alert variant="danger">{messageFor(error)}</Alert>}
    </div>
  );
}

function messageFor(error: string): string {
  if (isOnboardError(error)) return onboardErrorMessage(error);
  if (isConnectError(error)) return connectErrorMessage(error);
  return m.settings.repository.connectFailed;
}
