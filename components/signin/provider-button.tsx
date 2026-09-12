"use client";

import { SubmitButton } from "@/components/submit-button";

/**
 * provider 버튼의 **제출 상태**만 든다 (8-1b).
 *
 * ⚠️ **`useFormStatus`는 `<form>` 안에서만 참을 낸다** — 그래서 이 조각이 폼 밖이 아니라 안에
 * 있어야 한다. 부모(Server Component)가 `action`을 들고, 이것은 그 폼의 상태를 읽는다.
 *
 * ⚠️ **OAuth 왕복은 눈에 보이는 지연이 있다** — 누른 뒤 아무 변화가 없으면 사용자가 다시 누른다.
 * **스피너만 세우고 라벨은 그대로 둔다**(2026-09-10 사용자) — 문구까지 바뀌면 폭이 흔들리고,
 * 화면에 버튼이 둘뿐이라 "어느 것을 눌렀나"는 스피너 위치로 이미 보인다.
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
  return (
    <SubmitButton
      icon={icon}
      variant={variant}
      size="lg"
      className="w-full"
    >
      {label}
    </SubmitButton>
  );
}
