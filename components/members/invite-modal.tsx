"use client";

import { useEffect, useRef, useState, useTransition, type RefObject } from "react";

import { createInvitation } from "@/app/(edit)/projects/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormGroup } from "@/components/ui/form-group";
import { Input } from "@/components/ui/input";
import { OnboardingModal } from "@/components/ui/modal";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import type { Role } from "@/lib/auth/permission";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * 초대 링크 발급 — **한 창의 두 얼굴**(폼 → 링크). `components/ui/modal.tsx`의 `OnboardingModal`을
 * 그대로 쓴다: 제목·설명·바닥이 얼굴마다 바뀌고 높이는 껍데기가 고정한다 (DESIGN §6.7).
 *
 * ⚠️ **`step`을 넘기지 않는다** — 그러면 `Step n of 4`가 뜬다. 초대는 단계가 아니라 두 얼굴이다.
 *
 * ⚠️ **사후 거부는 세 번째 얼굴이 아니다.** `createInvitation`이 `{ok:false, error}`를 **값으로**
 * 돌려주므로(throw가 아니다) 폼 얼굴에 머물며 본문 맨 아래 `Alert`으로 선다 — 입력값이 남고 포커스는
 * 누른 제출 버튼으로 돌아간다 (malmoi#53 관용구).
 *
 * ⚠️ **제출 버튼이 `<form>` 바깥이다** — 모달 바닥은 본문 밖이라 `form="invite-form"`으로 묶는다.
 * 안 묶으면 **Enter가 조용히 죽는다** (POSTMORTEM 2026-09-08). 이 속성은 리포 첫 도입이다.
 *
 * ⚠️ **링크 얼굴 제목의 라벨은 서버가 만든다** — `createInvitation` 응답의 `label`이다. 여기서 가리면
 * 유출은 아니지만 **세 번째 마스킹 구현**이 되고, `members-screen.test.ts`의 `maskEmail` 금지선이
 * 이 디렉터리 전체를 훑으므로 그 상시 검사가 예외를 하나 갖게 된다 (`lib/auth/email.ts` 주석).
 *
 * ⚠️ **발급 링크가 mono가 아니다** — [Copy]가 붙은 값이라 사람이 글자를 옮겨 적지 않는다 (DESIGN §4.1).
 */

/** ⚠️ 바닥의 제출 버튼과 본문의 `<form>`을 잇는 값. 둘이 어긋나면 Enter만 조용히 죽는다. */
const FORM_ID = "invite-form";

export function InviteModal({
  slug,
  open,
  onClose,
  seats,
  returnFocusRef,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
  /** 바닥 왼쪽의 `{n} of {limit} seats used`. 서버가 판정한 값이고 화면이 상한을 따로 들지 않는다. */
  seats: { n: number; limit: number };
  /** 닫으면 [Invite]로 포커스를 돌려준다. */
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("EDITOR");
  const [issued, setIssued] = useState<{ link: string; label: string; role: Role } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const [pending, startTransition] = useTransition();
  const submitRef = useRef<HTMLElement | null>(null);

  /**
   * ⚠️ **거부되면 누른 제출 버튼으로 포커스를 돌려준다** (malmoi#53). 그 버튼은 `loading` 동안
   * `disabled`라 브라우저가 포커스를 `body`로 떨어뜨린다. 응답 콜백에서 바로 부르면 `pending`이
   * 아직 커밋 전이라 여전히 `disabled`고 `focus()`가 무시된다 — 커밋 뒤인 effect에서 부른다.
   */
  useEffect(() => {
    if (error !== null) submitRef.current?.focus();
  }, [error]);

  function close() {
    // 닫으면 링크도 사라진다 — 다시 열었을 때 남아 있으면 "아직 볼 수 있다"는 거짓 신호다.
    setIssued(null);
    setError(null);
    setCopied("idle");
    onClose();
  }

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createInvitation({ slug, email: String(formData.get("email") ?? ""), role });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // 원문은 서버가 저장하지 않는다 — **이 화면을 벗어나면 다시 볼 수 없다** (ARCHITECTURE §6.02).
      // ⚠️ 경로는 `lib/routes.ts` 한 곳이다 — 문자열로 조립하면 라우트를 옮겨도 아무것도 안 깨지고
      // 발급된 링크만 조용히 404가 된다 (POSTMORTEM 2026-09-05).
      setIssued({ link: `${window.location.origin}${routes.invite(result.token)}`, label: result.label, role });
      setEmail("");
    });
  }

  if (issued !== null) {
    return (
      <OnboardingModal
        open={open}
        onClose={close}
        transitionKey="link"
        closeLabel={m.common.close}
        returnFocusRef={returnFocusRef}
        title={m.members.invite.ready(issued.label)}
        description={m.members.invite.readyHint}
        footer={m.members.invite.expiresIn(m.projects.role[issued.role])}
        actions={
          <Button type="button" variant="primary" size="lg" onClick={close}>
            {m.members.invite.done}
          </Button>
        }
      >
        <div className="flex items-center gap-2">
          {/* ⚠️ **sans 14다** — mono는 사람이 글자를 옮겨 적는 값의 형이고, 여기엔 [Copy]가 붙어 있다. */}
          <span className="bg-muted min-w-0 flex-1 truncate rounded px-2 py-1 text-sm">{issued.link}</span>
          {/* ⚠️ **복사 실패를 삼키지 않는다** — 복사된 줄 알고 닫으면 링크를 영구히 잃는다. */}
          <Button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(issued.link).then(
                () => setCopied("copied"),
                () => setCopied("failed"),
              );
            }}
          >
            {copied === "copied" ? m.common.copied : copied === "failed" ? m.common.copyFailed : m.common.copy}
          </Button>
        </div>
        <Alert variant="info" title={m.members.invite.notKept.title}>
          {m.members.invite.notKept.body}
        </Alert>
      </OnboardingModal>
    );
  }

  return (
    <OnboardingModal
      open={open}
      onClose={close}
      transitionKey="form"
      closeLabel={m.common.close}
      returnFocusRef={returnFocusRef}
      title={m.members.invite.title}
      description={m.members.invite.description}
      footer={m.members.invite.seatsUsed(seats.n, seats.limit)}
      actions={
        <Button
          type="submit"
          form={FORM_ID}
          variant="primary"
          size="lg"
          loading={pending}
          onClick={(event) => {
            submitRef.current = event.currentTarget;
          }}
        >
          {m.members.invite.create}
        </Button>
      }
    >
      <form id={FORM_ID} action={submit} className="space-y-5">
        <FormGroup label={m.members.invite.email} htmlFor="invite-email" help={m.members.invite.help}>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full"
          />
        </FormGroup>

        {/*
          ⚠️ **테두리 있는 카드 라디오를 만들지 않는다** — 리포 전수 0건인 시각 형이고, 만들면 DESIGN에
          등재해야 하는 새 부품이 하나 는다. `Radio`가 이미 라벨 행이고 보조 줄만 아래에 붙인다.
        */}
        {/*
          ⚠️ **`fieldset`/`legend`를 겹쳐 쓰지 않는다** — 그것도 그룹이고 `RadioGroup`도 그룹이라
          스크린리더가 그룹을 두 번 읽는다. 이름은 `aria-labelledby` **한 쪽만** 준다 (`radio.tsx`).
        */}
        <div className="space-y-2">
          <span id="invite-role-label" className="block text-sm font-medium">{m.members.invite.roleLabel}</span>
          <RadioGroup
            aria-labelledby="invite-role-label"
            value={role}
            onValueChange={(next) => setRole(next as Role)}
            className="space-y-2"
          >
            {(["EDITOR", "OWNER"] as const).map((option) => (
              <Radio
                key={option}
                value={option}
                id={`invite-role-${option}`}
                labelClassName="items-start gap-3"
                label={
                  <span className="flex flex-col gap-0.5">
                    <span>{m.projects.role[option]}</span>
                    <span className="text-muted-foreground text-xs">{m.members.invite.roleHint[option]}</span>
                  </span>
                }
              />
            ))}
          </RadioGroup>
        </div>

        {/* ⚠️ **본문 맨 아래다** — 세 번째 얼굴을 만들지 않고 입력값을 그대로 지킨다. */}
        {error !== null && <Alert variant="danger">{failureText(error)}</Alert>}
      </form>
    </OnboardingModal>
  );
}

function failureText(error: string): string {
  if (isAccessError(error)) return accessErrorMessage(error);
  if (error === "already-member") return m.members.invite.alreadyMember;
  return m.members.invite.failed(error);
}
