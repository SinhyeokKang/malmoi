export type OpenImportPr = { number: number; url: string } | null | undefined;

export function planImportConfirmation(input: { unsent: number; openPr: OpenImportPr }) {
  return { ...input, recommendSend: input.unsent > 0, atRisk: input.unsent > 0 || input.openPr !== null };
}
