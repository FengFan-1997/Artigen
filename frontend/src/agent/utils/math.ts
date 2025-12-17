export const lerp = (start: number, end: number, factor: number): number => {
  return start + (end - start) * factor;
};

export const getRandomPosition = (
  containerWidth: number,
  containerHeight: number,
  elementSize: number
): { x: number; y: number } => {
  const maxX = containerWidth - elementSize;
  const maxY = containerHeight - elementSize;

  return {
    x: Math.max(0, Math.random() * maxX),
    y: Math.max(0, Math.random() * maxY)
  };
};
