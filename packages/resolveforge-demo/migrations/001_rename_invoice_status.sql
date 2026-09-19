ALTER TABLE invoices DROP COLUMN status;
ALTER TABLE invoices ADD COLUMN payment_status TEXT NOT NULL;
