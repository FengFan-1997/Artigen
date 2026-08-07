export const moveListItem = <T>(items: T[], index: number, direction: -1 | 1) => {
  const next = items.slice();
  const target = index + direction;
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};
