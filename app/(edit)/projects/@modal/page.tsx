import { requireUser } from "@/lib/auth/session";

/** 목록으로 soft navigation할 때도 열린 슬롯을 비운다 — default는 이 전이를 처리하지 않는다. */
export default async function EmptyModalRoot() {
  await requireUser();
  return null;
}
