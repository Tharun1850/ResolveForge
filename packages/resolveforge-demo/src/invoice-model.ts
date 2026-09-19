export const InvoiceStatus = ['paid', 'unpaid'] as const;
export type InvoiceStatus = (typeof InvoiceStatus)[number];

export interface Invoice {
  amount: number;
  id: string;
  status: InvoiceStatus;
}

export const invoices: Invoice[] = [
  { id: 'inv_001', status: 'unpaid', amount: 120 },
  { id: 'inv_002', status: 'paid', amount: 75 },
  { id: 'inv_003', status: 'unpaid', amount: 310 },
  { id: 'inv_004', status: 'paid', amount: 43 },
];

export function filterInvoices(status: InvoiceStatus | null): Invoice[] {
  return status ? invoices.filter(invoice => invoice.status === status) : invoices;
}

export function exportInvoices(status: InvoiceStatus | null): Invoice[] {
  return status ? invoices.filter(invoice => invoice.status === status) : invoices;
}

export function displayedInvoices(visibleInvoices: Invoice[]): Invoice[] {
  return visibleInvoices;
}

export function calculateInvoiceTotal(input: { discount: number; subtotal: number; taxRate: number }): number {
  const { discount, subtotal, taxRate } = input;
  // Seeded defect. The discount must be applied before tax.
  return subtotal * (1 + taxRate) - discount;
}

export function toCsv(rows: Invoice[]): string {
  const header = 'id,status,amount';
  const body = rows.map(invoice => `${invoice.id},${invoice.status},${String(invoice.amount)}`);
  return [header, ...body].join('\n');
}
