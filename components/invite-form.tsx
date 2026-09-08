"use client";

import { UserPlus } from "lucide-react";
import { useState, useTransition } from "react";

import { createInvitation } from "@/app/(edit)/projects/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormGroup } from "@/components/ui/form-group";
import { Input } from "@/components/ui/input";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { m } from "@/lib/i18n";

/**
 * 초대 링크 발급 — **OWNER에게만 보인다.**
 *
 * ⚠️ **임시 화면이다.** 멤버 관리 화면은 6b이고, 여기 있는 이유는 하나다: 이게 없으면
 * `createInvitation`에 호출부가 없고, **spec 완료 조건 3(GitHub 계정 없이 번역)을 손으로도 밟을 수
 * 없다.** 만든 것이 실제로 호출되는지 묻지 않는 것이 이 리포의 반복 실패 유형이다
 * (POSTMORTEM 2026-09-03).
 *
 * **메일을 보내지 않는다** (SAAS §4.3 ①) — OWNER가 링크를 슬랙·메신저로 직접 전달한다.
 *
 * 6a에서 툴바의 인라인 폼에서 `Dialog`로 옮겼다 — 툴바가 필터 셋과 Publish를 이미 들어서
 * 이메일 입력까지 한 줄에 두면 903키 화면의 헤더가 두 줄로 접힌다.
 */
export function InviteForm({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setLink(null);
    setError(null);
    setCopied("idle");
    startTransition(async () => {
      const result = await createInvitation({
        slug,
        email: String(formData.get("email") ?? ""),
        role: "EDITOR",
      });
      if (result.ok) {
        // 원문은 서버가 저장하지 않는다 — **이 화면을 벗어나면 다시 볼 수 없다** (SAAS §5.6).
        setLink(`${window.location.origin}/invite/${result.token}`);
        setEmail("");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // 닫으면 링크도 사라진다 — 다시 열었을 때 남아 있으면 "아직 볼 수 있다"는 거짓 신호다.
        if (!next) {
          setLink(null);
          setError(null);
          setCopied("idle");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost">
          <UserPlus aria-hidden />
          {m.translations.invite.open}
        </Button>
      </DialogTrigger>
      <DialogContent title={m.translations.invite.title}>
        <form action={submit} className="space-y-3">
          <FormGroup label={m.translations.invite.email} htmlFor="invite-email" help={m.translations.invite.help}>
            <Input
              id="invite-email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full"
            />
          </FormGroup>
          <Button type="submit" variant="primary" loading={pending} loadingLabel={m.translations.invite.creating}>
            {m.translations.invite.create}
          </Button>
        </form>

        {error !== null && <Alert variant="danger">{inviteFailureText(error)}</Alert>}

        {link !== null && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">{m.translations.invite.linkHint}</p>
            <div className="flex items-center gap-2">
              {/* 링크는 식별자라 mono다 (DESIGN §4.1) */}
              <code className="text-mono bg-muted min-w-0 flex-1 truncate rounded px-2 py-1">{link}</code>
              {/* ⚠️ 복사 실패를 삼키지 않는다 — 사용자가 복사된 줄 알고 닫으면 링크를 영구히 잃는다. */}
              <Button
                variant="default"
                onClick={() => {
                  void navigator.clipboard.writeText(link).then(
                    () => setCopied("copied"),
                    () => setCopied("failed"),
                  );
                }}
              >
                {copied === "copied"
                  ? m.common.copied
                  : copied === "failed"
                    ? m.common.copyFailed
                    : m.common.copy}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function inviteFailureText(error: string): string {
  if (isAccessError(error)) return accessErrorMessage(error);
  if (error === "already-member") return m.translations.invite.alreadyMember;
  return m.translations.invite.failed(error);
}
