export function clamp(value: number, low: number, high: number): number {
  if (low > high) throw new RangeError("low above high");
  if (value < low) return low;
  if (value > high) return high;
  return value;
}
