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
import { routes } from "@/lib/routes";

/**
 * 초대 링크 발급 — **OWNER에게만 렌더된다** (호출부가 `canPerform`으로 가른다).
 *
 * 6a의 `components/invite-form.tsx`가 여기로 옮겨왔다. 그 파일은 번역 화면 툴바에 있던 **임시**
 * 자리였고(`createInvitation`에 호출부가 없으면 그 판정이 실재하지 않는다 — POSTMORTEM 2026-09-03),
 * 이제 제자리인 멤버 화면이 있으므로 삭제됐다. 초대 수단이 둘이면 하나가 낡는다.
 *
 * **메일을 보내지 않는다** (SAAS §4.3 ①) — OWNER가 링크를 슬랙·메신저로 직접 전달한다.
 */
export function InviteDialog({ slug }: { slug: string }) {
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
        // ⚠️ 경로는 `lib/routes.ts` 한 곳이다 — 문자열로 조립하면 라우트를 옮겨도 아무것도 안 깨지고
        // 발급된 링크만 조용히 404가 된다 (POSTMORTEM 2026-09-05).
        setLink(`${window.location.origin}${routes.invite(result.token)}`);
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
        <Button variant="primary">
          <UserPlus aria-hidden />
          {m.members.invite.open}
        </Button>
      </DialogTrigger>
      <DialogContent title={m.members.invite.title}>
        {/* ⚠️ 제출 버튼이 이 `<form>` 안에 있어야 Enter가 submit된다 (POSTMORTEM 2026-09-08). */}
        <form action={submit} className="space-y-3">
          <FormGroup label={m.members.invite.email} htmlFor="invite-email" help={m.members.invite.help}>
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
          <Button type="submit" variant="primary" loading={pending} loadingLabel={m.members.invite.creating}>
            {m.members.invite.create}
          </Button>
        </form>

        {error !== null && <Alert variant="danger">{inviteFailureText(error)}</Alert>}

        {link !== null && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">{m.members.invite.linkHint}</p>
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
  if (error === "already-member") return m.members.invite.alreadyMember;
  return m.members.invite.failed(error);
}
