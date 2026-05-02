export type TankFormulaType = "horizontal_cylinder" | "manual_table";

export type ManualCalibrationRow = { readingCm: number; liters: number };

export type TankCalibrationProfile = {
  id: string;
  profileKey: string;
  name: string;
  formulaType: TankFormulaType;
  diameterCm: number | null;
  radiusCm: number | null;
  lengthCm: number | null;
  maxDipstickCm: number;
  nominalLabel: string;
  calculatedFullLiters: number;
  roundedFullLiters: number;
  isVerified: boolean;
  isOwnerOnly: boolean;
  manualTableRows?: ManualCalibrationRow[];
};

const EPSILON = 1e-9;

function clampForTrig(value: number) {
  if (value < -1 && value > -1 - 1e-12) return -1;
  if (value > 1 && value < 1 + 1e-12) return 1;
  return value;
}

export function validateDipstickReading(profile: TankCalibrationProfile, readingCm: number) {
  if (!Number.isFinite(readingCm)) throw new Error("Dipstick reading must be a finite number.");
  if (readingCm < 0) throw new Error("Dipstick reading cannot be negative.");
  if (readingCm > profile.maxDipstickCm) throw new Error("Dipstick reading exceeds the profile max CMS range.");
}

function validateManualTableRows(rows: ManualCalibrationRow[]) {
  if (rows.length < 2) throw new Error("Manual calibration table must contain at least two rows.");
  for (let i = 1; i < rows.length; i += 1) {
    if (!(rows[i].readingCm > rows[i - 1].readingCm)) throw new Error("Manual calibration readings must be strictly increasing.");
    if (!(rows[i].liters > rows[i - 1].liters)) throw new Error("Manual calibration liters must be strictly increasing.");
  }
}

function litersForHorizontalCylinder(profile: TankCalibrationProfile, readingCm: number) {
  const R = profile.radiusCm;
  const L = profile.lengthCm;
  if (!R || !L) throw new Error("Horizontal cylinder profile dimensions are incomplete.");
  const h = readingCm;
  const ratio = clampForTrig((R - h) / R);
  const sqrtTerm = Math.max(0, 2 * R * h - h * h);
  return (L / 1000) * ((R ** 2) * Math.acos(ratio) - (R - h) * Math.sqrt(sqrtTerm));
}

function litersForManualTable(profile: TankCalibrationProfile, readingCm: number) {
  const rows = profile.manualTableRows ?? [];
  validateManualTableRows(rows);
  const min = rows[0].readingCm;
  const max = rows[rows.length - 1].readingCm;
  if (readingCm < min || readingCm > max) throw new Error("Dipstick reading is outside the manual calibration table range.");
  const exact = rows.find((row) => Math.abs(row.readingCm - readingCm) <= EPSILON);
  if (exact) return exact.liters;
  const upperIndex = rows.findIndex((row) => row.readingCm > readingCm);
  const lower = rows[upperIndex - 1];
  const upper = rows[upperIndex];
  const slope = (upper.liters - lower.liters) / (upper.readingCm - lower.readingCm);
  return lower.liters + slope * (readingCm - lower.readingCm);
}

export function litersFromDipstickCm(profile: TankCalibrationProfile, readingCm: number): number {
  validateDipstickReading(profile, readingCm);
  if (profile.formulaType === "horizontal_cylinder") return litersForHorizontalCylinder(profile, readingCm);
  return litersForManualTable(profile, readingCm);
}

export function roundedLitersFromDipstickCm(profile: TankCalibrationProfile, readingCm: number): number {
  return Math.round(litersFromDipstickCm(profile, readingCm));
}

export function dipstickCmFromLiters(profile: TankCalibrationProfile, liters: number): number {
  if (!Number.isFinite(liters) || liters < 0) throw new Error("Liters value must be a finite non-negative number.");
  if (liters > profile.calculatedFullLiters + EPSILON) throw new Error("Liters value exceeds profile capacity.");
  let low = 0;
  let high = profile.maxDipstickCm;
  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    const midLiters = litersFromDipstickCm(profile, mid);
    if (Math.abs(midLiters - liters) < 1e-7) return mid;
    if (midLiters < liters) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export function generateCalibrationRows(profile: TankCalibrationProfile, startCm = 0, endCm = profile.maxDipstickCm) {
  if (startCm < 0 || endCm > profile.maxDipstickCm || startCm > endCm) throw new Error("Invalid calibration row range.");
  const rows: Array<{ readingCm: number; liters: number }> = [];
  for (let cm = startCm; cm <= endCm; cm += 1) rows.push({ readingCm: cm, liters: Math.round(litersFromDipstickCm(profile, cm)) });
  return rows;
}

export function calculateTankReconciliation(input: {
  profile: TankCalibrationProfile;
  openingReadingCm: number;
  closingReadingCm: number;
  deliveryLiters: number;
  pumpMeterSalesLiters: number;
  toleranceLiters: number;
}) {
  const openingLiters = litersFromDipstickCm(input.profile, input.openingReadingCm);
  const closingLiters = litersFromDipstickCm(input.profile, input.closingReadingCm);
  const expectedClosingLiters = openingLiters + input.deliveryLiters - input.pumpMeterSalesLiters;
  const varianceLiters = closingLiters - expectedClosingLiters;
  const status = varianceLiters < -input.toleranceLiters ? "short" : varianceLiters > input.toleranceLiters ? "surplus" : "balanced";
  return { openingLiters, closingLiters, expectedClosingLiters, varianceLiters, status };
}

export const VERIFIED_TANK_PROFILES: TankCalibrationProfile[] = [
  { id: "ugt_16kl_202x488", profileKey: "ugt_16kl_202x488", name: "16KL nominal / 4000 USG horizontal UGT — 202 cm diameter × 488 cm length", formulaType: "horizontal_cylinder", diameterCm: 202, radiusCm: 101, lengthCm: 488, maxDipstickCm: 202, nominalLabel: "16KL / 4000 USG", calculatedFullLiters: 15639.1246897235, roundedFullLiters: 15639, isVerified: true, isOwnerOnly: true },
  { id: "ugt_12kl_split_half_203x183", profileKey: "ugt_12kl_split_half_203x183", name: "12KL split tank half-compartment — 203 cm diameter × 183 cm length", formulaType: "horizontal_cylinder", diameterCm: 203, radiusCm: 101.5, lengthCm: 183, maxDipstickCm: 203, nominalLabel: "6KL compartment inside 12KL split tank", calculatedFullLiters: 5922.8815435265, roundedFullLiters: 5923, isVerified: true, isOwnerOnly: true },
  { id: "ugt_12kl_single_203x366", profileKey: "ugt_12kl_single_203x366", name: "12KL single horizontal UGT — 203 cm diameter × 366 cm length", formulaType: "horizontal_cylinder", diameterCm: 203, radiusCm: 101.5, lengthCm: 366, maxDipstickCm: 203, nominalLabel: "12KL single tank", calculatedFullLiters: 11845.7630870530, roundedFullLiters: 11846, isVerified: true, isOwnerOnly: true }
];
