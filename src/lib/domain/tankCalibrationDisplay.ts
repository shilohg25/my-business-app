import { litersFromDipstickCm, roundedLitersFromDipstickCm, type TankCalibrationProfile } from "@/lib/domain/tankCalibration";

export function buildTankCalibrationDisplay(profile: TankCalibrationProfile, readingCm: number, reorderThresholdLiters: number | null) {
  const decimalLiters = litersFromDipstickCm(profile, readingCm);
  const roundedLiters = roundedLitersFromDipstickCm(profile, readingCm);
  const capacityPercent = profile.calculatedFullLiters > 0 ? (decimalLiters / profile.calculatedFullLiters) * 100 : 0;
  const ullageLiters = Math.max(profile.calculatedFullLiters - decimalLiters, 0);
  const needsReorder = reorderThresholdLiters != null ? decimalLiters <= reorderThresholdLiters : false;
  return { decimalLiters, roundedLiters, capacityPercent, ullageLiters, needsReorder };
}
