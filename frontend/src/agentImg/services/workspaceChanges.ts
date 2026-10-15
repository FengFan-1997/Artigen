import { diff } from '@codemirror/merge';
// Count each touched line once, including a final unterminated line; character
// diff fragments on the same line must not inflate the change summary.
export function changedLineCounts(before: string, after: string) {
  const changes = diff(before, after, { scanLimit: 2000, timeout: 100 });
  const touched = (text: string, ranges: Array<[number, number]>) => {
    const starts = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
    const lines = new Set<number>();
    const lineAt = (position: number) => {
      let low = 0,
        high = starts.length;
      while (low + 1 < high) {
        const middle = (low + high) >>> 1;
        if (starts[middle] <= position) low = middle;
        else high = middle;
      }
      return low;
    };
    for (const [from, to] of ranges)
      if (to > from) for (let i = lineAt(from), last = lineAt(to - 1); i <= last; i++) lines.add(i);
    return lines.size;
  };
  return {
    added: touched(
      after,
      changes.map((c) => [c.fromB, c.toB])
    ),
    removed: touched(
      before,
      changes.map((c) => [c.fromA, c.toA])
    )
  };
}
