import { useMemo, useState } from 'react';

import { filterInvoices, invoices, type InvoiceStatus } from './invoice-model.js';
import { recordRender } from './render-telemetry.js';

function InvoiceRow({ amount, id, status }: { amount: number; id: string; status: InvoiceStatus }): React.JSX.Element {
  recordRender('InvoiceRow');
  return (
    <tr>
      <td>{id}</td>
      <td>{status}</td>
      <td>{amount}</td>
    </tr>
  );
}

export function InvoiceApp(): React.JSX.Element {
  const [status, setStatus] = useState<InvoiceStatus | null>(null);
  const visibleInvoices = useMemo(() => filterInvoices(status), [status]);
  const rows = invoices.map(invoice => <InvoiceRow key={invoice.id} {...invoice} />);

  async function exportCsv(): Promise<void> {
    const query = status ? `?status=${status}` : '';
    const response = await fetch(`/api/export${query}`);
    const csv = await response.text();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'invoices.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main>
      <h1>Invoices</h1>
      <label htmlFor="status-filter">Status</label>
      <select
        data-testid="status-filter"
        id="status-filter"
        onChange={event => {
          const value = event.target.value;
          setStatus(value === '' ? null : value === 'paid' ? 'paid' : 'unpaid');
        }}
        value={status ?? ''}
      >
        <option value="">All</option>
        <option value="paid">Paid</option>
        <option value="unpaid">Unpaid</option>
      </select>
      <button data-testid="export-button" onClick={() => void exportCsv()} type="button">
        Export CSV
      </button>
      <p>{visibleInvoices.length} invoices shown</p>
      <table>
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Status</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </main>
  );
}
