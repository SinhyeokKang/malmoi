import { CredentialError } from "./crypto";
export const FINALIZE_MIGRATION = "20260910060000_finalize_credential_storage";
type File = { name: string; checksum: string };
type Applied = File & { finished: boolean; rolledBack: boolean };
export function finalizationPending(files: File[], history: Applied[], name: string): boolean {
  if (!files.some(f => f.name === name)) throw new CredentialError();
  const active = history.filter(row => !row.rolledBack);
  for (const row of active) {
    if (!row.finished || files.find(f => f.name === row.name)?.checksum !== row.checksum) throw new CredentialError();
  }
  const pending = files.filter(f => !active.some(row => row.name === f.name));
  if (pending.length === 0) return false;
  if (pending.length !== 1 || pending[0]!.name !== name) throw new CredentialError();
  return true;
}
