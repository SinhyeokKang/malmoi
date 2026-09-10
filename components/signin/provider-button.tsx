"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { m } from "@/lib/i18n";

/**
 * provider 버튼의 **제출 상태**만 든다 (8-1b).
 *
 * ⚠️ **`useFormStatus`는 `<form>` 안에서만 참을 낸다** — 그래서 이 조각이 폼 밖이 아니라 안에
 * 있어야 한다. 부모(Server Component)가 `action`을 들고, 이것은 그 폼의 상태를 읽는다.
 *
 * ⚠️ **OAuth 왕복은 눈에 보이는 지연이 있다** — 누른 뒤 아무 변화가 없으면 사용자가 다시 누른다.
 * §6.4의 형대로 **라벨을 교체**하고 스피너를 앞에 세운다.
 */
export function ProviderSubmit({
  label,
  variant,
  icon,
}: {
  label: string;
  variant: "primary" | "default";
  icon: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size="lg"
      className="w-full"
      loading={pending}
      loadingLabel={m.signIn.opening}
    >
      {/* 스피너가 대신 서므로 진행 중엔 아이콘을 숨긴다 — 둘 다 있으면 좁은 버튼이 붐빈다. */}
      {!pending && icon}
      {label}
    </Button>
  );
}
