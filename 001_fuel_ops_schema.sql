import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ShiftCalculationResult, ShiftReportInput } from "@/lib/domain/types";
import { calculateShiftReport } from "@/lib/domain/calculations";

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

  return rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
}

export async function buildShiftReportWorkbook(input: ShiftReportInput) {
  const calc = calculateShiftReport(input);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Shift Report");

  sheet.columns = [
    { header: "Metric", key: "metric", width: 32 },
    { header: "Value", key: "value", width: 20 }
  ];

  sheet.addRows([
    { metric: "Report Date", value: input.reportDate },
    { metric: "Duty", value: input.dutyName },
    { metric: "Shift", value: input.shiftTimeLabel },
    { metric: "Fuel Cash Sales", value: calc.totalFuelCashSales },
    { metric: "Lubricants", value: calc.totalLubricantSales },
    { metric: "Expenses", value: calc.totalExpenses },
    { metric: "Cash Count", value: calc.totalCashCount },
    { metric: "Discrepancy", value: calc.workbookStyleDiscrepancy }
  ]);

  const productSheet = workbook.addWorksheet("Product Summary");
  productSheet.columns = [
    { header: "Product", key: "productCode", width: 20 },
    { header: "Gross Liters", key: "grossLiters", width: 16 },
    { header: "Credit Liters", key: "creditLiters", width: 16 },
    { header: "Calibration", key: "calibrationLiters", width: 16 },
    { header: "Net Cash Liters", key: "netCashLiters", width: 18 },
    { header: "Price", key: "price", width: 14 },
    { header: "Amount", key: "fuelCashAmount", width: 16 }
  ];
  productSheet.addRows(calc.products);

  return workbook;
}

export function buildShiftReportPdf(input: ShiftReportInput, calc: ShiftCalculationResult = calculateShiftReport(input)) {
  const doc = new jsPDF();
  doc.text("Shift Report", 14, 18);
  doc.text(`${input.reportDate} / ${input.shiftTimeLabel} / ${input.dutyName}`, 14, 28);

  autoTable(doc, {
    startY: 38,
    head: [["Metric", "Amount"]],
    body: [
      ["Fuel Cash Sales", calc.totalFuelCashSales.toFixed(2)],
      ["Lubricants", calc.totalLubricantSales.toFixed(2)],
      ["Expenses", calc.totalExpenses.toFixed(2)],
      ["Cash Count", calc.totalCashCount.toFixed(2)],
      ["Discrepancy", calc.workbookStyleDiscrepancy.toFixed(2)]
    ]
  });

  autoTable(doc, {
    startY: 85,
    head: [["Product", "Gross L", "Credit L", "Calibration", "Net L", "Price", "Amount"]],
    body: calc.products.map((line) => [
      line.productCode,
      line.grossLiters.toFixed(3),
      line.creditLiters.toFixed(3),
      line.calibrationLiters.toFixed(3),
      line.netCashLiters.toFixed(3),
      line.price.toFixed(2),
      line.fuelCashAmount.toFixed(2)
    ])
  });

  return doc;
}
