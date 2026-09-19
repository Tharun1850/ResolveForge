import assert from 'node:assert/strict';
import test from 'node:test';

import { filterInvoices, invoices, toCsv } from '../src/invoice-model.js';

test('filters invoices by status', () => {
  const unpaid = filterInvoices('unpaid');
  assert.deepEqual(
    unpaid.map(invoice => invoice.id),
    ['inv_001', 'inv_003'],
  );
});

test('serializes invoice rows as CSV', () => {
  assert.equal(toCsv([invoices[0]]), 'id,status,amount\ninv_001,unpaid,120');
});
