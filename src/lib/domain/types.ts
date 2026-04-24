export type EntrySource = "web_manual" | "excel_import" | "mobile_submission";

export type ReportStatus = "draft" | "submitted" | "reviewed" | "approved" | "archived";

export type FuelProductCode = "DIESEL" | "SPECIAL" | "UNLEADED" | string;

export interface Station {
  id: string;
  code: string;
  name: string;
  officialReportHeader: string | null;
  isActive: boolean;
}

export interface FuelProduct {
  id: string;
  code: FuelProductCode;
  name: string;
  isActive: boolean;
}

export interface MeterReadingInput {
  pumpId?: string;
  pumpLabel: string;
  productCode: FuelProductCode;
  beforeReading: number;
  afterReading: number;
  calibrationLiters?: number;
}

export interface CreditReceiptInput {
  productCode: FuelProductCode;
  companyName: string;
  receiptNumber?: string;
  liters: number;
  amount?: number;
  externalCustomerId?: string | null;
  externalReference?: string | null;
  attachmentPath?: string | null;
}

export interface ExpenseInput {
  description: string;
  amount: number;
  category?: string | null;
}

export interface CashCountInput {
  denomination: number;
  quantity: number;
  lineAmount?: number;
}

export interface LubricantSaleInput {
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface ProductPriceInput {
  productCode: FuelProductCode;
  price: number;
}

export interface ShiftReportInput {
  stationId?: string;
  reportDate: string;
  dutyName: string;
  shiftTimeLabel: string;
  source: EntrySource;
  prices: ProductPriceInput[];
  meterReadings: MeterReadingInput[];
  creditReceipts: CreditReceiptInput[];
  expenses: ExpenseInput[];
  cashCounts: CashCountInput[];
  coinsAmount?: number;
  lubricantSales: LubricantSaleInput[];
  editReason?: string;
}

export interface ProductCalculation {
  productCode: FuelProductCode;
  grossLiters: number;
  creditLiters: number;
  calibrationLiters: number;
  netCashLiters: number;
  price: number;
  fuelCashAmount: number;
  creditAmount: number;
}

export interface ShiftCalculationResult {
  products: ProductCalculation[];
  totalGrossLiters: number;
  totalCreditLiters: number;
  totalCalibrationLiters: number;
  totalNetCashLiters: number;
  totalFuelCashSales: number;
  totalCreditAmount: number;
  totalLubricantSales: number;
  totalExpenses: number;
  totalCashCount: number;
  expectedCashBeforeExpenses: number;
  workbookStyleDiscrepancy: number;
  operationalNetRemittance: number;
}
