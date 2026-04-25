import { formatCurrency } from "@/lib/utils";

export type DiscrepancyTone = "positive" | "negative" | "neutral";

export function getDiscrepancyStatus(value: number | string | null | undefined): { tone: DiscrepancyTone; label: string } {
  const amount = Number(value ?? 0);

  if (amount > 0) {
    return { tone: "positive", label: "Cash overage" };
  }

  if (amount < 0) {
    return { tone: "negative", label: "Cash shortage" };
  }

  return { tone: "neutral", label: "Balanced" };
}

export function getDiscrepancyLabel(value: number | string | null | undefined) {
  return getDiscrepancyStatus(value).label;
}

export function formatSignedCurrency(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0);
  const absolute = Math.abs(Number.isFinite(amount) ? amount : 0);
  const formatted = formatCurrency(absolute);

  if (amount > 0) return `+${formatted}`;
  if (amount < 0) return `-${formatted}`;
  return formatted;
}
