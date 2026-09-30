/** 행동의 실제 화면 위치로부터 직각 경로를 만든다. */
export function orthogonalPath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): string {
  if (Math.abs(fromY - toY) < 1) return `M ${fromX} ${fromY} H ${toX}`
  const turnX = (fromX + toX) / 2
  return `M ${fromX} ${fromY} H ${turnX} V ${toY} H ${toX}`
}
