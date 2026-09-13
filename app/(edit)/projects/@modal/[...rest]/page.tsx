import { requireUser } from "@/lib/auth/session";

/** default는 soft navigation의 활성 슬롯을 비우지 않는다. 생성 후 번역 화면으로 이동할 때도 닫는다. */
export default async function EmptyModal() {
  await requireUser();
  return null;
}
