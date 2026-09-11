"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "@/components/ui/button";

/** 폼 안에 배치해 Server Action 제출 상태를 로그인·초대가 함께 사용한다. */
export function SubmitButton({ icon, children, ...props }: Omit<ButtonProps, "loading" | "type"> & { icon?: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button {...props} type="submit" loading={pending}>
      {!pending && icon}
      {children}
    </Button>
  );
}
