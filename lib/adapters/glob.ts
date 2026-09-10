/** O(template.length * path.length), without regex backtracking. */
export function matchesGlob(template: string, path: string): boolean {
  let previous = new Uint8Array(template.length + 1);
  previous[0] = 1;
  for (let j = 1; j <= template.length; j++) previous[j] = template[j - 1] === "*" ? previous[j - 1]! : 0;
  for (let i = 0; i < path.length; i++) {
    const next = new Uint8Array(template.length + 1);
    for (let j = 1; j <= template.length; j++) {
      const token = template[j - 1];
      next[j] = token === "*"
        ? (next[j - 1] || (path[i] !== "/" && previous[j]) ? 1 : 0)
        : (token === path[i] ? previous[j - 1]! : 0);
    }
    previous = next;
  }
  return previous[template.length] === 1;
}
