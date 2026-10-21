// Which lines of the new version of a file were added or changed, for marking them in the plain "Code" view.
// A line diff on what is left after trimming the common start and end: changes are usually small, so this is cheap.

const MAX_MIDDLE = 4000; // lines; beyond this the view skips the marks rather than freeze

/** 1-based line numbers in `modified` that are not in `original`. Null when the change is too big to mark. */
export function addedLines(original: string, modified: string): number[] | null {
  const a = original.split("\n");
  const b = modified.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const x = a.slice(start, endA), y = b.slice(start, endB);
  if (x.length > MAX_MIDDLE || y.length > MAX_MIDDLE) return null;
  // Longest common subsequence of the middles; lines of y that are not on it are the added ones.
  const w = y.length + 1;
  const t = new Uint32Array((x.length + 1) * w);
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--)
      t[i * w + j] = x[i] === y[j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
  const added: number[] = [];
  let i = 0, j = 0;
  while (j < y.length) {
    if (i < x.length && x[i] === y[j]) { i++; j++; }
    else if (i < x.length && t[(i + 1) * w + j] >= t[i * w + j + 1]) i++;
    else { added.push(start + j + 1); j++; }
  }
  return added;
}
