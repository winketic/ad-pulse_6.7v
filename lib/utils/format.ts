export function formatQuantity(num: number): string {
  if (num === 0) return "0";
  return parseFloat(num.toFixed(2)).toString();
}

export function formatCompact(num: number): string {
  const abs = Math.abs(num);
  if (abs >= 1_000_000) return (num / 1_000_000).toFixed(1) + "М";
  if (abs >= 1_000) return (num / 1_000).toFixed(1) + "К";
  return parseFloat(num.toFixed(2)).toString();
}
