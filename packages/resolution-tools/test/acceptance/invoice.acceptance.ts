import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

const InvoiceSchema = z
  .object({
    amount: z.number(),
    id: z.string(),
    status: z.enum(['paid', 'unpaid']),
  })
  .strict();
const InvoiceRowsSchema = z.array(InvoiceSchema);

type ExportInvoices = (status: 'paid' | 'unpaid' | null) => unknown;
type CalculateInvoiceTotal = (input: { discount: number; subtotal: number; taxRate: number }) => unknown;

function isExportInvoices(value: unknown): value is ExportInvoices {
  return typeof value === 'function';
}

function isCalculateInvoiceTotal(value: unknown): value is CalculateInvoiceTotal {
  return typeof value === 'function';
}

const [worktreePath, scenario] = process.argv.slice(2);
if (!worktreePath || (scenario !== 'export' && scenario !== 'tax')) {
  throw new Error('Usage: invoice.acceptance.ts <worktree-path> <export|tax>');
}
const modelPath = pathToFileURL(`${worktreePath}/packages/resolveforge-demo/src/invoice-model.ts`).href;
const model: unknown = await import(modelPath);
if (typeof model !== 'object' || model === null) {
  throw new Error('The invoice model did not load as a module object.');
}

if (scenario === 'export') {
  const exportInvoices = Reflect.get(model, 'exportInvoices');
  if (!isExportInvoices(exportInvoices)) {
    throw new Error('The invoice model does not export a callable exportInvoices function.');
  }
  const rows = InvoiceRowsSchema.parse(exportInvoices('unpaid'));
  assert.deepEqual(
    rows.map(invoice => invoice.id),
    ['inv_001', 'inv_003'],
    'CSV export must respect the unpaid filter.',
  );
} else {
  const calculateInvoiceTotal = Reflect.get(model, 'calculateInvoiceTotal');
  if (!isCalculateInvoiceTotal(calculateInvoiceTotal)) {
    throw new Error('The invoice model does not export a callable calculateInvoiceTotal function.');
  }
  const total = z.number().parse(calculateInvoiceTotal({ discount: 10, subtotal: 100, taxRate: 0.1 }));
  assert.equal(total, 99, 'Discount must be applied before tax.');
}
