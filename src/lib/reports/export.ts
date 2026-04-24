import type { ShiftCalculationResult, ShiftReportInput } from "@/lib/domain/types";
import { calculateShiftReport } from "@/lib/domain/calculations";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function shiftReportToCsv(input: ShiftReportInput) {
  const calc = calculateShiftReport(input);
  const rows = [
    ["Report Date", input.reportDate],
    ["Duty", input.dutyName],
    ["Shift", input.shiftTimeLabel],
    ["Total Fuel Cash Sales", calc.totalFuelCashSales],
    ["Total Lubricants", calc.totalLubricantSales],
    ["Total Expenses", calc.totalExpenses],
    ["Cash Count", calc.totalCashCount],
    ["Discrepancy", calc.workbookStyleDiscrepancy],
    [],
    ["Product", "Gross Liters", "Credit Liters", "Calibration", "Net Cash Liters", "Price", "Amount"],
    ...calc.products.map((line) => [
      line.productCode,
      line.grossLiters,
      line.creditLiters,
      line.calibrationLiters,
      line.netCashLiters,
      line.price,
      line.fuelCashAmount
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function buildShiftReportExcelRows(input: ShiftReportInput) {
  const calc = calculateShiftReport(input);
  return {
    summary: [
      { metric: "Report Date", value: input.reportDate },
      { metric: "Duty", value: input.dutyName },
      { metric: "Shift", value: input.shiftTimeLabel },
      { metric: "Fuel Cash Sales", value: calc.totalFuelCashSales },
      { metric: "Lubricants", value: calc.totalLubricantSales },
      { metric: "Expenses", value: calc.totalExpenses },
      { metric: "Cash Count", value: calc.totalCashCount },
      { metric: "Discrepancy", value: calc.workbookStyleDiscrepancy }
    ],
    products: calc.products
  };
}

export function buildPrintableShiftReport(input: ShiftReportInput, calc: ShiftCalculationResult = calculateShiftReport(input)) {
  const productRows = calc.products
    .map(
      (line) => `
        <tr>
          <td>${line.productCode}</td>
          <td>${line.grossLiters.toFixed(3)}</td>
          <td>${line.creditLiters.toFixed(3)}</td>
          <td>${line.calibrationLiters.toFixed(3)}</td>
          <td>${line.netCashLiters.toFixed(3)}</td>
          <td>${line.price.toFixed(2)}</td>
          <td>${line.fuelCashAmount.toFixed(2)}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Shift Report</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111827; }
    table { border-collapse: collapse; width: 100%; margin-top: 16px; }
    th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
    th { background: #f3f4f6; }
  </style>
</head>
<body>
  <h1>Shift Report</h1>
  <p>${input.reportDate} / ${input.shiftTimeLabel} / ${input.dutyName}</p>
  <table>
    <tbody>
      <tr><th>Fuel Cash Sales</th><td>${calc.totalFuelCashSales.toFixed(2)}</td></tr>
      <tr><th>Lubricants</th><td>${calc.totalLubricantSales.toFixed(2)}</td></tr>
      <tr><th>Expenses</th><td>${calc.totalExpenses.toFixed(2)}</td></tr>
      <tr><th>Cash Count</th><td>${calc.totalCashCount.toFixed(2)}</td></tr>
      <tr><th>Discrepancy</th><td>${calc.workbookStyleDiscrepancy.toFixed(2)}</td></tr>
    </tbody>
  </table>
  <table>
    <thead><tr><th>Product</th><th>Gross L</th><th>Credit L</th><th>Calibration</th><th>Net L</th><th>Price</th><th>Amount</th></tr></thead>
    <tbody>${productRows}</tbody>
  </table>
</body>
</html>`;
}
