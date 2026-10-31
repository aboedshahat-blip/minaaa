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

/** Return a conservative, human-confirmed suggestion for a likely PDF OCR typo. */
export const findCloseCustomerName = (name: string, customers: Customer[]) => {
  const source = normalizeCustomerName(name).replace(/\s/g, '');
  if (source.length < 7) return undefined;

  const distance = (left: string, right: string) => {
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i += 1) {
      const current = [i];
      for (let j = 1; j <= right.length; j += 1) {
        current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
      }
      previous = current;
    }
    return previous[right.length];
  };

  const candidates = customers
    .map((customer) => ({ customer, score: distance(source, normalizeCustomerName(customer.name).replace(/\s/g, '')) }))
    // Exact spelling may itself be a previously imported OCR mistake. Offer
    // only one-character alternatives so the operator can select the right
    // registered identity without silently merging accounts.
    .filter(({ score }) => score === 1)
    .sort((a, b) => a.score - b.score);
  if (!candidates.length || (candidates[1] && candidates[0].score === candidates[1].score)) return undefined;
  return candidates[0].customer;
};

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
