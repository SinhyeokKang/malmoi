"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { m } from "@/lib/i18n";
import { utcMinute } from "@/lib/utc-time";

/**
 * **Sync가 도는 동안의 쓰기 잠금을 편집자에게 보이는 두 자리** (sync-lock S4 — DESIGN §7).
 *
 * ⚠️ **이 파일은 판정하지 않는다** — lease 판정(`planWriteLock`)은 `lib/sync/plan.ts`에 있고 그 모듈은 잎이 아니다(`node:crypto`까지 물린다 —
 * POSTMORTEM 2026-09-07의 번들 7.2MB). 서버가 판정해 시각만 넘긴다. 실행권 토큰은 클라이언트에 오지 않는다.
 */
const stamp = (at: Date) => <time dateTime={at.toISOString()}>{utcMinute(at)}</time>;

/**
 * 착지 배너 (R1) — 들어왔을 때 lease가 살아 있었다는 **그 시점의 사실**이다. Save를 끄지 않는다: 막는 것은 서버 거부이고, 끄면 lease가 끝난
 * 뒤 다시 켤 장치(폴링)가 없다. ⚠️ live 영역이 아니다(`neutral`은 `role`이 없다) — 상시 상태라 들어올 때마다 읽던 것을 끊으면 안 된다.
 */
export function SyncLockBanner({ reopensBy }: { reopensBy: Date | null }) {
  if (reopensBy === null) return null;
  const w = m.translations.workspace.syncLock;
  return <Alert variant="neutral" title={<>{w.title} {w.until(stamp(reopensBy))}</>} />;
}

/**
 * 쓰기 거부 Dialog — 저장과 Revert(R4)가 `sync-running`으로 거부되면 같은 형으로 선다. 번역 화면의 다른 저장 실패는 전부 푸터 위 Alert인데
 * 이것만 Dialog다: **화면 밖 사건이 끼어드는 유일한 거부**라서다(DESIGN §7).
 * ⚠️ **초안을 건드리지 않는다** — 거부는 아무것도 쓰지 않았고, 편집자가 lease가 끝난 뒤 같은 초안으로 다시 저장한다.
 * ⚠️ 닫히면 연 자리로 간다 — `DialogContent`의 최근 포커스 기록이 [Save] 클릭이면 Save, 단축키면 그 입력을 든다.
 */
export function SyncLockDialog({ reopensBy, onClose }: { reopensBy: Date | null; onClose: () => void }) {
  const w = m.translations.workspace.syncLock;
  return (
    <Dialog open={reopensBy !== null} onOpenChange={next => { if (!next) onClose(); }}>
      {reopensBy !== null && (
        <DialogContent title={w.title} description={<>{w.until(stamp(reopensBy))}.</>}
          actions={<DialogClose asChild><Button variant="primary" data-initial-focus>{w.ok}</Button></DialogClose>} />
      )}
    </Dialog>
  );
}
