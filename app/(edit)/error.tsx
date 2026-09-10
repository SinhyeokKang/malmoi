"use client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { m } from "@/lib/i18n";

export default function PageError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-4xl space-y-4 px-6 py-6">
    <Alert variant="danger">{m.errors.access.unavailable}</Alert>
    <Button type="button" onClick={reset}>{m.common.retry}</Button>
  </main>;
}
