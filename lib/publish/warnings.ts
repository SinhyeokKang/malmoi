export function summarizeWarnings(warnings: readonly string[]) {
  const groups = new Map<string, string[]>();
  for (const warning of warnings) {
    const match = /^([^\n]*?: [^\n]*?): ([\s\S]*)$/.exec(warning);
    const file = match?.[1] ?? "";
    const messages = groups.get(file) ?? [];
    messages.push(match?.[2] ?? warning);
    groups.set(file, messages);
  }
  return [...groups].map(([file, messages]) => ({ file, messages }));
}
