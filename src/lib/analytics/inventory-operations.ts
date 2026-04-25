export function calculateLubricantTransfer(warehouseOnHand: number, transferQty: number, stationOnHand: number) {
  if (transferQty <= 0) {
    throw new Error("Transfer quantity must be greater than zero");
  }
  if (warehouseOnHand - transferQty < 0) {
    throw new Error("Transfer would make warehouse inventory negative");
  }

  return {
    warehouseAfter: warehouseOnHand - transferQty,
    stationAfter: stationOnHand + transferQty
  };
}

export function calculateFuelTankVariance(input: {
  openingLiters: number;
  receivedLiters: number;
  meterLitersOut: number;
  actualEndingLiters: number;
}) {
  const expectedEndingLiters = input.openingLiters + input.receivedLiters - input.meterLitersOut;
  const varianceLiters = input.actualEndingLiters - expectedEndingLiters;

  return {
    expectedEndingLiters,
    varianceLiters
  };
}
