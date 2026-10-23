import { Movement, PaymentReceipt } from '../types';

export interface AdvanceAllocationResult {
  movements: Movement[];
  payments: PaymentReceipt[];
  changedMovementIds: string[];
  changedPaymentIds: string[];
}

/**
 * Kept for compatibility with older stored advance receipts. New payments are
 * recorded only after cashier linkage and are never auto-applied as advances.
 */
export const applyUnallocatedCustomerAdvances = (
  movements: Movement[],
  payments: PaymentReceipt[],
): AdvanceAllocationResult => {
  return {
    movements,
    payments,
    changedMovementIds: [],
    changedPaymentIds: [],
  };
};
