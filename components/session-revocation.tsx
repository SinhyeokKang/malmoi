"use client";

import { useActionState } from "react";
import { startSessionRevocation } from "@/app/(edit)/account/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { m } from "@/lib/i18n";

export function SessionRevocation({ outcome }: { outcome?: string }) {
  const [failed, submit, pending] = useActionState(async () => {
    await startSessionRevocation();
    return true;
  }, false);
  const message = failed ? m.account.sessions.failed
    : outcome === "cancelled" ? m.account.sessions.cancelled
    : outcome === "wrong-account" ? m.account.sessions.wrongAccount
    : outcome === "expired" ? m.account.sessions.expired
    : outcome === "invalid" || outcome === "unavailable" ? m.account.sessions.failed : null;
  return (
    <form action={submit} className="space-y-2">
      {message !== null && <Alert variant="danger">{message}</Alert>}
      <Button type="submit" variant="danger" size="sm" loading={pending}>
        {m.account.sessions.button}
      </Button>
    </form>
  );
}
