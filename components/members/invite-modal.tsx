"use client";

import { CircleX, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type ClipboardEvent, type KeyboardEvent, type RefObject } from "react";
import { toast } from "sonner";

import { createInvitations, type InvitationsResult } from "@/app/(edit)/projects/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OnboardingModal } from "@/components/ui/modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import type { Role } from "@/lib/auth/permission";
import { m } from "@/lib/i18n";
import { parseRecipients, splitPastedEmails, type RecipientRowError } from "@/lib/invitation-email/recipients";
import type { IssueRowError } from "@/lib/invitation-email/plan";
import { retryAtLabel } from "@/lib/invitation-email/retry-at";

/**
 * 다중 초대 폼 — **입력 → 전송 → 성공이면 닫힘 / 오류면 같은 폼** (핸드오프 `Invite Modal.dc.html` `1a`–`1i`).
 * 결과 화면·링크 화면·Done이 없다. 요청은 전부 아니면 아무것도라서 성공자 목록도 없다.
 *
 * ⚠️ **오류가 서는 자리는 둘뿐이다** — 그 행 아래(주소·중복·이미 멤버)와 본문 맨 위의 폼 Alert 하나(제한·
 *   발송 오류·결과 미확인·메일 설정). 행 거부의 "아무것도 안 나갔다"는 새 Alert가 아니라 바닥 왼쪽이 말한다.
 * ⚠️ **제출 버튼이 `<form>` 바깥이다** — 모달 바닥은 본문 밖이라 `form=`으로 묶는다 (POSTMORTEM 2026-09-08).
 *   이메일에서 Enter는 제출이 아니라 행 추가다 — 여덟 행에서 Enter 제출은 다 치기 전에 나간다.
 * ⚠️ **행은 발송 결과를 들지 않는다** — 상태는 `email · role · error` 셋이다.
 */

const FORM_ID = "invite-form";

type Row = { id: number; email: string; role: Role };
type FormAlert = { variant: "warning" | "danger"; title?: string; body: string };
type FocusTarget = { kind: "email"; id: number } | { kind: "add" } | { kind: "submit" };

let nextRowId = 0;
const blank = (): Row => ({ id: ++nextRowId, email: "", role: "EDITOR" });
const filledOf = (rows: readonly Row[]) => rows.filter((r) => r.email.trim() !== "");

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
  const [rows, setRows] = useState<Row[]>(() => [blank()]);
  const [rowErrors, setRowErrors] = useState<ReadonlyMap<number, string>>(new Map());
  const [nothingSent, setNothingSent] = useState(false);
  const [alert, setAlert] = useState<FormAlert | null>(null);
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const [pending, startTransition] = useTransition();
  const submitRef = useRef<HTMLButtonElement | null>(null);
  const addRef = useRef<HTMLButtonElement | null>(null);

  /** 열릴 때 첫 이메일로 — 껍데기(`transitionKey`)는 패널에 포커스를 둔다. */
  useEffect(() => {
    // ⚠️ 열림 전이에서만 돈다 — `rows`를 의존성에 넣으면 행을 고칠 때마다 첫 행으로 끌려간다.
    if (open) setFocus({ kind: "email", id: rows[0]?.id ?? 0 });
  }, [open]);

  /**
   * ⚠️ **`pending`이 의존성에 있어야 한다** (malmoi#64). 응답이 커밋되는 시점엔 `useTransition`의 pending이
   * 아직 true라 대상이 `disabled`이고 `focus()`가 조용히 무시된다 — 잠금이 풀리는 커밋에서 한 번 더 돈다.
   */
  useEffect(() => {
    if (focus === null || pending) return;
    const target =
      focus.kind === "email" ? document.getElementById(`invite-email-${focus.id}`) : focus.kind === "add" ? addRef.current : submitRef.current;
    if (target === null || (target as HTMLButtonElement).disabled) return;
    target.focus();
    setFocus(null);
  }, [focus, pending]);

  function reset() {
    setRows([blank()]);
    setRowErrors(new Map());
    setNothingSent(false);
    setAlert(null);
  }

  function close() {
    // 닫으면 입력을 버린다 — 다시 열었을 때 남아 있으면 "아직 안 보냈다"가 거짓으로 읽힌다.
    reset();
    onClose();
  }

  function clearRowError(id: number) {
    if (!rowErrors.has(id)) return;
    const next = new Map(rowErrors);
    next.delete(id);
    setRowErrors(next);
    if (next.size === 0) setNothingSent(false);
  }

  function update(id: number, patch: Partial<Row>) {
    setRows((current) => current.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    clearRowError(id);
  }

  function insertAfter(index: number, added: Row[]) {
    setRows((current) => [...current.slice(0, index + 1), ...added, ...current.slice(index + 1)]);
    const last = added.at(-1);
    if (last !== undefined) setFocus({ kind: "email", id: last.id });
  }

  function removeRow(index: number) {
    const row = rows[index];
    if (row === undefined || rows.length === 1) return;
    const next = rows.filter((_, i) => i !== index);
    setRows(next);
    clearRowError(row.id);
    const after = next[index];
    setFocus(after === undefined ? { kind: "add" } : { kind: "email", id: after.id });
  }

  function onEmailKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    // IME 조합 중 Enter는 글자를 확정하는 키다 — 가로채면 한글·일본어 입력이 깨진다.
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    insertAfter(index, [blank()]);
  }

  function onEmailPaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const parts = splitPastedEmails(event.clipboardData.getData("text"));
    if (parts.length <= 1) return;
    event.preventDefault();
    const row = rows[index];
    if (row === undefined) return;
    // 빈 행이면 첫 주소가 그 행을 채우고, 채운 행이면 그 뒤에 전부 새 행으로 들어간다. 기존 행 역할은 그대로다.
    const [first, ...rest] = row.email.trim() === "" ? parts : ["", ...parts];
    if (row.email.trim() === "" && first !== undefined) update(row.id, { email: first });
    insertAfter(index, rest.map((email) => ({ ...blank(), email })));
  }

  /** 서버·클라이언트 행 오류 → 화면 행 id와 문구. `toRow`는 오류의 index를 화면 행 번호(0부터)로 옮긴다. */
  function describeRowErrors(errors: readonly (RecipientRowError | IssueRowError)[], toRow: (i: number) => number): Map<number, string> {
    const map = new Map<number, string>();
    for (const error of errors) {
      const row = rows[toRow(error.index)];
      if (row === undefined) continue;
      map.set(row.id, rowErrorText(error, (i) => toRow(i) + 1));
    }
    return map;
  }

  function showRowErrors(map: Map<number, string>, server: boolean) {
    setRowErrors(map);
    setNothingSent(server);
    const first = rows.find((r) => map.has(r.id));
    if (first !== undefined) setFocus({ kind: "email", id: first.id });
  }

  function submit() {
    const filled = filledOf(rows);
    if (filled.length === 0 || pending) return;
    setAlert(null);
    setNothingSent(false);

    // 형식·목록 안 중복은 제출 전에 **전부** 본다 — 하나라도 있으면 서버에 가지 않는다.
    const parsed = parseRecipients(rows.map((r) => ({ email: r.email, role: r.role })));
    if (parsed.status === "invalid-rows") {
      showRowErrors(describeRowErrors(parsed.rowErrors, (i) => i), false);
      return;
    }
    setRowErrors(new Map());
    if (parsed.status === "too-many") {
      setAlert({ variant: "danger", body: m.members.invite.tooMany });
      setFocus({ kind: "submit" });
      return;
    }

    // 빈 행은 보내지 않는다 — 서버 오류의 index는 보낸 목록 기준이라 화면 행으로 되돌린다.
    const sentRows = filled.map((r) => rows.indexOf(r));
    startTransition(async () => {
      let result: InvitationsResult | null;
      try {
        result = await createInvitations({ slug, recipients: filled.map((r) => ({ email: r.email, role: r.role })) });
      } catch {
        // 호출 자체가 끊기면 서버가 발급했는지 모른다 — 성공으로도 실패로도 단정하지 않는다.
        result = null;
      }
      if (result !== null && result.ok) {
        toast.success(m.members.invite.sentToast(result.count));
        reset();
        onClose();
        return;
      }
      if (result !== null && result.error === "invalid-rows" && "rowErrors" in result) {
        showRowErrors(describeRowErrors(result.rowErrors, (i) => sentRows[i] ?? -1), true);
        return;
      }
      setAlert(formAlertFor(result, (i) => filled[i]?.email.trim() ?? "", filled.length, seats.limit));
      setFocus({ kind: "submit" });
    });
  }

  const filledCount = filledOf(rows).length;
  const status = pending ? m.members.invite.sending : nothingSent ? m.members.invite.nothingSent : m.members.invite.seatsUsed(seats.n, seats.limit);

  return (
    <OnboardingModal
      open={open}
      onClose={close}
      transitionKey="form"
      closeLabel={m.common.close}
      closeDisabled={pending}
      returnFocusRef={returnFocusRef}
      title={m.members.invite.title}
      description={m.members.invite.description}
      bodyScroll="hidden"
      footer={
        <span data-invite-status aria-live="polite">
          {status}
        </span>
      }
      actions={
        <Button
          ref={submitRef}
          type="submit"
          form={FORM_ID}
          variant="primary"
          size="lg"
          loading={pending}
          disabled={filledCount === 0}
        >
          {m.members.invite.send(filledCount)}
        </Button>
      }
    >
      <form id={FORM_ID}
        noValidate
        className="flex min-h-0 flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {alert !== null && (
          <div data-form-alert className="shrink-0">
            <Alert variant={alert.variant} title={alert.title}>
              {alert.body}
            </Alert>
          </div>
        )}

        {/* 열 머리 — 행과 같은 그리드다(오른쪽 44 = 제거 36 + 갭 8). */}
        <div aria-hidden className="text-muted-foreground flex shrink-0 gap-2 pr-11 text-[13px]">
          <span className="min-w-0 flex-1">{m.members.invite.columns.email}</span>
          <span className="w-[168px] shrink-0">{m.members.invite.columns.role}</span>
        </div>

        {/*
          ⚠️ **스크롤하는 것은 행 목록뿐이다** (`1i`) — 열 머리·[Add another]·바닥은 고정이다.
          ⚠️ `overflow-y:auto`는 x도 자르므로 padding 4 + 음수 margin으로 포커스 링·테두리 자리를 둔다.
        */}
        <ul className="-mx-1 -my-0.5 flex min-h-0 shrink flex-col gap-2.5 overflow-y-auto p-1">
          {rows.map((row, index) => {
            const who = row.email.trim() === "" ? m.members.invite.emptyRecipient(index + 1) : row.email.trim();
            const error = rowErrors.get(row.id);
            const reasonId = `invite-reason-${row.id}`;
            return (
              <li key={row.id} data-recipient-row className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <Input
                    id={`invite-email-${row.id}`}
                    /*
                      ⚠️ **`type="email"`이 아니다** — 브라우저가 값의 앞뒤 공백을 지우고(표시가 원문이 아니게 된다)
                      제출 전에 자기 검증 말풍선을 띄워 행 사유 검증이 한 번도 돌지 않는다. 판정은 `parseRecipients` 하나다.
                    */
                    type="text"
                    inputMode="email"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={m.members.invite.placeholder}
                    aria-label={m.members.invite.columns.email}
                    aria-invalid={error !== undefined}
                    aria-describedby={error === undefined ? undefined : reasonId}
                    value={row.email}
                    disabled={pending}
                    onChange={(event) => update(row.id, { email: event.target.value })}
                    onKeyDown={(event) => onEmailKeyDown(index, event)}
                    onPaste={(event) => onEmailPaste(index, event)}
                    className="min-w-0 flex-1"
                  />
                  <Select value={row.role} onValueChange={(next) => update(row.id, { role: next as Role })} disabled={pending}>
                    <SelectTrigger aria-label={m.members.invite.roleFor(who)} className="w-[168px] shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="w-[280px]">
                      {(["EDITOR", "OWNER"] as const).map((option) => (
                        <SelectItem key={option} value={option} description={m.members.invite.roleHint[option]}>
                          {m.projects.role[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    data-remove
                    aria-label={m.members.invite.removeRecipient(who)}
                    disabled={pending || rows.length === 1}
                    onClick={() => removeRow(index)}
                    className="text-muted-foreground size-9 shrink-0 px-0"
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </div>
                {error !== undefined && (
                  <p id={reasonId} data-row-reason className="text-destructive flex items-start gap-1.5 text-[13px] leading-[1.6]">
                    <CircleX aria-hidden className="mt-[3px] size-3.5 shrink-0" />
                    <span>{error}</span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <div className="shrink-0">
          <Button ref={addRef} type="button" variant="ghost" disabled={pending} onClick={() => insertAfter(rows.length - 1, [blank()])} className="-ml-2">
            <Plus aria-hidden />
            {m.members.invite.addAnother}
          </Button>
        </div>
      </form>
    </OnboardingModal>
  );
}

function rowErrorText(error: RecipientRowError | IssueRowError, rowNumber: (index: number) => number): string {
  switch (error.code) {
    case "invalid-email":
      return m.members.invite.rowError.invalidEmail;
    case "invalid-role":
      return m.members.invite.rowError.invalidRole;
    case "duplicate":
      return m.members.invite.rowError.duplicate(rowNumber(error.otherIndex));
    case "role-conflict":
      return m.members.invite.rowError.roleConflict(rowNumber(error.otherIndex), m.projects.role[error.otherRole]);
    case "already-member":
      return m.members.invite.alreadyMember;
  }
}

/** 행이 아닌 거부 → 폼 Alert 한 장. `null`은 호출 자체가 끊긴 경우다(결과 미확인). */
function formAlertFor(result: Exclude<InvitationsResult, { ok: true }> | null, emailAt: (index: number) => string, count: number, seatsLimit: number): FormAlert {
  if (result === null || result.error === "email-unknown") {
    return { variant: "warning", title: m.members.invite.unconfirmed.title, body: m.members.invite.unconfirmed.body };
  }
  if (result.error === "rate-limited" && "limit" in result) {
    const time = retryAtLabel(result.retryAt);
    const body = result.limit === "project" ? m.members.invite.limit.project(result.used, count, time) : m.members.invite.limit.address(emailAt(result.index), time);
    return { variant: "warning", title: m.members.invite.limit.title, body };
  }
  if (result.error === "email-rejected") return { variant: "danger", body: m.members.invite.sendFailed };
  if (result.error === "email-unavailable") return { variant: "danger", body: m.members.invite.emailUnavailable };
  if (result.error === "too-many") return { variant: "danger", body: m.members.invite.tooMany };
  if (result.error === "member-limit") return { variant: "danger", body: m.members.seatsFull(seatsLimit) };
  if (isAccessError(result.error)) return { variant: "danger", body: accessErrorMessage(result.error) };
  return { variant: "danger", body: m.members.invite.failed(result.error) };
}
