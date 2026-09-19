import { createServer } from 'node:http';

import { calculateInvoiceTotal, exportInvoices, filterInvoices, toCsv, type InvoiceStatus } from './invoice-model.js';

function parseStatus(value: string | null): InvoiceStatus | null {
  if (value === 'paid' || value === 'unpaid') {
    return value;
  }
  return null;
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1:4174');
  if (url.pathname === '/api/invoices') {
    const body = JSON.stringify(filterInvoices(parseStatus(url.searchParams.get('status'))));
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(body);
    return;
  }
  if (url.pathname === '/api/export') {
    response.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' });
    response.end(toCsv(exportInvoices(parseStatus(url.searchParams.get('status')))));
    return;
  }
  if (url.pathname === '/api/quote') {
    const total = calculateInvoiceTotal({ discount: 10, subtotal: 100, taxRate: 0.1 });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ total }));
    return;
  }
  response.writeHead(404, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ error: 'Not found.' }));
});

server.listen(4174, '127.0.0.1', () => {
  process.stdout.write('ResolveForge demo API listening on http://127.0.0.1:4174\n');
});
