import { Movement, PaymentReceipt } from '../types';

export interface AdvanceAllocationResult {
  movements: Movement[];
  payments: PaymentReceipt[];
  changedMovementIds: string[];
  changedPaymentIds: string[];
}

const cents = (value: unknown) => Math.max(0, Math.round((Number(value) || 0) * 100));

/** Apply customer advances only to movements whose cashier invoice has been linked. */
export const applyUnallocatedCustomerAdvances = (
  movements: Movement[],
  payments: PaymentReceipt[],
): AdvanceAllocationResult => {
  const updatedMovements = [...movements];
  const updatedPayments = payments.map((payment) => ({ ...payment }));
  const changedMovementIds = new Set<string>();
  const changedPaymentIds = new Set<string>();
  const advanceReceipts = updatedPayments
    .filter((payment) => cents(payment.unallocated_amount) > 0)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));

  for (const payment of advanceReceipts) {
    let availableAdvance = cents(payment.unallocated_amount);
    const candidateIndexes = updatedMovements
      .map((movement, index) => ({ movement, index }))
      .filter(({ movement }) =>
        Boolean(movement.cashier_receipt_no) &&
        (movement.customer_id === payment.customer_id || movement.customer_name === payment.customer_name)
      )
      .sort((a, b) => (a.movement.movement_date || '').localeCompare(b.movement.movement_date || '') || (a.movement.seq || 0) - (b.movement.seq || 0));

    const allocatedMovementIds: string[] = [];
    for (const { movement, index } of candidateIndexes) {
      if (availableAdvance <= 0) break;
      const cashierAmount = cents(movement.cashier_invoice);
      const customerPaid = movement.customer_paid_amount !== undefined
        ? cents(movement.customer_paid_amount)
        : Math.max(0, cents(movement.paid_amount) - cashierAmount);
      const total = cents(movement.total_amount);
      const outstanding = Math.max(0, total - cashierAmount - customerPaid);
      if (!outstanding) continue;

      const allocation = Math.min(availableAdvance, outstanding);
      availableAdvance -= allocation;
      const newCustomerPaid = customerPaid + allocation;
      const paid = cashierAmount + newCustomerPaid;
      const remaining = Math.max(0, total - paid);
      updatedMovements[index] = {
        ...movement,
        customer_paid_amount: newCustomerPaid / 100,
        paid_amount: paid / 100,
        remaining_amount: remaining / 100,
        payment_status: remaining === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
      };
      changedMovementIds.add(movement.id);
      allocatedMovementIds.push(movement.id);
    }

    const allocatedAmount = cents(payment.unallocated_amount) - availableAdvance;
    if (allocatedAmount > 0) {
      payment.unallocated_amount = availableAdvance / 100;
      payment.movement_ids = Array.from(new Set([...(payment.movement_ids || []), ...allocatedMovementIds]));
      changedPaymentIds.add(payment.id);
    }
  }

  return {
    movements: updatedMovements,
    payments: updatedPayments,
    changedMovementIds: Array.from(changedMovementIds),
    changedPaymentIds: Array.from(changedPaymentIds),
  };
};
