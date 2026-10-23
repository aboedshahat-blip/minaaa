import { Customer, Movement } from '../types';

/** Normalize common Arabic spelling differences before matching an imported driver/customer name. */
export const normalizeCustomerName = (name: string) => name
  .normalize('NFKC')
  .toLocaleLowerCase('ar-EG')
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .replace(/\s+/g, ' ');

export const summarizeImportedCustomers = (rows: Partial<Movement>[], customers: Customer[]) => {
  const existingNames = new Set(customers.map((customer) => normalizeCustomerName(customer.name)));
  const uniqueNames = new Map<string, string>();
  let rowsWithoutName = 0;

  for (const row of rows) {
    const name = (row.driver_name || '').trim();
    const normalized = normalizeCustomerName(name);
    if (!normalized) {
      rowsWithoutName += 1;
      continue;
    }
    if (!uniqueNames.has(normalized)) uniqueNames.set(normalized, name);
  }

  const existingCount = Array.from(uniqueNames.keys()).filter((name) => existingNames.has(name)).length;
  return {
    existingCount,
    newCount: uniqueNames.size - existingCount,
    rowsWithoutName,
  };
};
