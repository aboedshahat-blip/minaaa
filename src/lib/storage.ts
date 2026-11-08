import { ActivityLog, Berth, Customer, Movement, OfficeExpense, PaymentReceipt, SystemSettings } from '../types';
import { initialBerths, initialCustomers, initialMovements, initialSettings } from './mockData';
import { getSupabaseClient } from './supabase';
import { normalizeCustomerName } from './customerName';

const KEYS = {
  MOVEMENTS: 'pls_movements',
  CUSTOMERS: 'pls_customers',
  BERTHS: 'pls_berths',
  PAYMENTS: 'pls_payments',
  OFFICE_EXPENSES: 'pls_office_expenses',
  SETTINGS: 'pls_settings',
  PENDING_SYNC: 'pls_pending_sync_v1',
  DATA_RESET_AT: 'pls_data_reset_at',
  SAFETY_BACKUPS: 'pls_safety_backups_v1',
};

const SYSTEM_CUSTOMER_IDS = new Set(['__SYSTEM_USERS_CONFIG__', '__SYSTEM_HANDOFF_RESET__']);
const isSystemCustomer = (customer: Pick<Customer, 'id'>) => SYSTEM_CUSTOMER_IDS.has(customer.id);

const LARGE_LOCAL_DATA_KEYS = [
  KEYS.MOVEMENTS,
  KEYS.CUSTOMERS,
  KEYS.BERTHS,
  KEYS.PAYMENTS,
  KEYS.OFFICE_EXPENSES,
  KEYS.PENDING_SYNC,
  KEYS.SAFETY_BACKUPS,
] as const;
const LOCAL_DB_NAME = 'vib-operational-data';
const LOCAL_DB_VERSION = 1;
let localDatabase: IDBDatabase | null = null;
let localDatabaseReady = false;
const localDataCache = new Map<string, unknown>();

const readLegacyLocalData = (key: string) => {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? undefined : JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
};

const openLocalDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains('datasets')) database.createObjectStore('datasets', { keyPath: 'key' });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('تعذر فتح التخزين المحلي الموسع.'));
  request.onblocked = () => reject(new Error('أغلق نوافذ البرنامج الأخرى لإكمال تجهيز التخزين المحلي.'));
});

const readLocalDatabaseValue = (database: IDBDatabase, key: string) => new Promise<unknown>((resolve, reject) => {
  const request = database.transaction('datasets', 'readonly').objectStore('datasets').get(key);
  request.onsuccess = () => resolve((request.result as { value?: unknown } | undefined)?.value);
  request.onerror = () => reject(request.error || new Error('تعذر قراءة البيانات المحلية.'));
});

const writeLocalDatabaseValue = (key: string, value: unknown) => {
  if (!localDatabase) return Promise.reject(new Error('التخزين المحلي الموسع غير جاهز.'));
  return new Promise<void>((resolve, reject) => {
    const transaction = localDatabase!.transaction('datasets', 'readwrite');
    transaction.objectStore('datasets').put({ key, value, saved_at: new Date().toISOString() });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('تعذر حفظ البيانات محليًا.'));
    transaction.onabort = () => reject(transaction.error || new Error('أُلغي حفظ البيانات محليًا.'));
  });
};

/** Move large operational snapshots out of localStorage before the app renders. */
export const initializeLargeLocalDataStore = async () => {
  if (localDatabaseReady) return true;
  if (typeof indexedDB === 'undefined') {
    for (const key of LARGE_LOCAL_DATA_KEYS) {
      const value = readLegacyLocalData(key);
      if (value !== undefined) localDataCache.set(key, value);
    }
    localDatabaseReady = true;
    return false;
  }

  try {
    localDatabase = await openLocalDatabase();
    localDatabase.onversionchange = () => localDatabase?.close();
    for (const key of LARGE_LOCAL_DATA_KEYS) {
      let value = await readLocalDatabaseValue(localDatabase, key);
      if (value === undefined) {
        value = readLegacyLocalData(key);
        if (value !== undefined) {
          await writeLocalDatabaseValue(key, value);
          try { localStorage.removeItem(key); } catch { /* the IndexedDB copy is authoritative */ }
        }
      }
      if (value !== undefined) localDataCache.set(key, value);
    }
    localDatabaseReady = true;
    return true;
  } catch (error) {
    console.warn('Using browser storage fallback for operational data:', error);
    localDatabase?.close();
    localDatabase = null;
    for (const key of LARGE_LOCAL_DATA_KEYS) {
      const value = readLegacyLocalData(key);
      if (value !== undefined) localDataCache.set(key, value);
    }
    localDatabaseReady = true;
    return false;
  }
};

const getLargeLocalData = <T,>(key: string): T | undefined => {
  if (localDataCache.has(key)) return localDataCache.get(key) as T;
  return readLegacyLocalData(key) as T | undefined;
};

const saveLargeLocalData = (key: string, value: unknown) => {
  localDataCache.set(key, value);
  if (localDatabaseReady && localDatabase) {
    void writeLocalDatabaseValue(key, value).catch((error) => {
      console.error('تعذر حفظ نسخة البيانات المحلية في التخزين الموسع:', error);
    });
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('تعذر حفظ البيانات في تخزين المتصفح:', error);
  }
};

export interface OperationalSafetyBackup {
  id: string;
  label: string;
  created_at: string;
  movements: Movement[];
  customers: Customer[];
  berths: Berth[];
  payments: PaymentReceipt[];
  expenses?: OfficeExpense[];
}

export const getSafetyBackups = (): OperationalSafetyBackup[] => {
  return getLargeLocalData<OperationalSafetyBackup[]>(KEYS.SAFETY_BACKUPS) || [];
};

export const saveSafetyBackup = (data: Omit<OperationalSafetyBackup, 'id' | 'created_at'>) => {
  const backup: OperationalSafetyBackup = { ...data, id: crypto.randomUUID(), created_at: new Date().toISOString() };
  const backups = [backup, ...getSafetyBackups()].slice(0, 10);
  saveLargeLocalData(KEYS.SAFETY_BACKUPS, backups);
  return backup;
};

export const restoreSafetyBackupToSupabase = async (backup: OperationalSafetyBackup) => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');

  const deleteAll = async (table: 'payments' | 'movements' | 'berths') => {
    const { error } = await supabase.from(table).delete().not('id', 'is', null);
    if (error) throw new Error(`تعذر تجهيز استعادة ${table}: ${error.message}`);
  };
  await deleteAll('payments');
  await deleteAll('movements');
  await deleteAll('berths');
  const { error: customerDeleteError } = await supabase.from('customers').delete()
    .not('id', 'in', '("__SYSTEM_USERS_CONFIG__","__SYSTEM_HANDOFF_RESET__")');
  if (customerDeleteError) throw new Error(`تعذر تجهيز استعادة العملاء: ${customerDeleteError.message}`);

  const resetAt = new Date().toISOString();
  const writes: Array<[string, Record<string, unknown>[]]> = [
    ['customers', backup.customers.filter((customer) => !isSystemCustomer(customer)).map(customerForCloud)],
    ['berths', backup.berths.map((row) => ({ ...row }))],
  ];
  for (const [table, rows] of writes) {
    if (!rows.length) continue;
    const { error } = await supabase.from(table).upsert(rows as never);
    if (error) throw new Error(`تعذرت استعادة ${table}: ${error.message}`);
  }
  await upsertMovementsWithCustomerRepair(supabase, backup.movements);
  if (backup.payments.length) {
    const { error } = await supabase.from('payments').upsert(backup.payments.map(paymentForCloud) as never);
    if (error) throw new Error(`تعذرت استعادة payments: ${error.message}`);
  }
  if (backup.expenses !== undefined) {
    const { error: expenseDeleteError } = await supabase.from('office_expenses').delete().not('id', 'is', null);
    if (expenseDeleteError && !['42P01', 'PGRST205'].includes(expenseDeleteError.code || '')) {
      throw new Error(`تعذر تجهيز استعادة مصروفات المكتب: ${expenseDeleteError.message}`);
    }
    if (backup.expenses.length) {
      const { error } = await supabase.from('office_expenses').upsert(backup.expenses);
      if (error) throw new Error(`تعذرت استعادة مصروفات المكتب: ${error.message}`);
    }
  }

  const { error: markerError } = await supabase.from('customers').upsert({
    id: '__SYSTEM_HANDOFF_RESET__', code: '__SYS_RESET__', name: 'علامة مزامنة بيانات التشغيل',
    trucks: [], notes: 'إشارة مزامنة لإعادة تحميل البيانات التشغيلية على الأجهزة المرتبطة.', created_at: resetAt,
  });
  if (markerError) throw new Error(`تمت استعادة البيانات، لكن تعذر تحديث علامة مزامنة الأجهزة: ${markerError.message}`);

  const pending = getPendingSync();
  for (const table of ['movements', 'customers', 'berths', 'payments'] as const) {
    pending.upserts[table] = {};
    pending.deletes[table] = [];
  }
  if (backup.expenses !== undefined) {
    pending.upserts.office_expenses = {};
    pending.deletes.office_expenses = [];
  }
  savePendingSync(pending);
  localStorage.setItem(KEYS.DATA_RESET_AT, resetAt);
  saveMovements(backup.movements);
  saveCustomers(backup.customers);
  saveBerths(backup.berths);
  savePayments(backup.payments);
  saveOfficeExpenses(backup.expenses ?? getStoredOfficeExpenses());
};

const CUSTOMER_FEE_MARKER = /\n?\[\[VIB_CUSTOMER_FEES:(\{.*?\})\]\]/;
const MOVEMENT_BATCH_MARKER = /\n?\[\[VIB_IMPORT_BATCH:(\{.*?\})\]\]/;
const PAYMENT_META_MARKER = /\n?\[\[VIB_PAYMENT_META:(\{.*?\})\]\]/;

const movementForApp = (row: Movement): Movement => {
  const notes = row.notes || '';
  const marker = notes.match(MOVEMENT_BATCH_MARKER);
  let batch: { id?: string; name?: string; at?: string; customerPaid?: number } = {};
  if (marker?.[1]) {
    try { batch = JSON.parse(marker[1]); } catch { /* keep the row usable if metadata is malformed */ }
  }
  return {
    ...row,
    notes: notes.replace(MOVEMENT_BATCH_MARKER, '').trim(),
    import_batch_id: row.import_batch_id ?? batch.id,
    import_batch_name: row.import_batch_name ?? batch.name,
    import_batch_at: row.import_batch_at ?? batch.at,
    customer_paid_amount: row.customer_paid_amount ?? batch.customerPaid,
  };
};

const movementForCloud = (row: Movement): Record<string, unknown> => {
  const movement = movementForApp(row);
  const {
    import_batch_id, import_batch_name, import_batch_at, customer_paid_amount,
    cashier_invoice: _cashier_invoice, cashier_receipt_no: _cashier_receipt_no,
    system_commission: _system_commission, nafez_commission: _nafez_commission, discount: _discount,
    cashier_receipt_details: _cashier_receipt_details,
    total_amount: _total_amount, payment_status: _payment_status,
    paid_amount: _paid_amount, remaining_amount: _remaining_amount,
    ...cloudRow
  } = movement;
  if (!import_batch_id && customer_paid_amount === undefined) return cloudRow;
  return {
    ...cloudRow,
    notes: `${cloudRow.notes || ''}\n[[VIB_IMPORT_BATCH:${JSON.stringify({ id: import_batch_id, name: import_batch_name, at: import_batch_at, customerPaid: customer_paid_amount })}]]`.trim(),
  };
};

const movementFinancialsForCloud = (row: Movement) => ({
  movement_id: row.id,
  cashier_invoice: Number(row.cashier_invoice) || 0,
  cashier_receipt_no: row.cashier_receipt_no || null,
  system_commission: Number(row.system_commission) || 0,
  nafez_commission: Number(row.nafez_commission) || 0,
  discount: Number(row.discount) || 0,
  total_amount: Number(row.total_amount) || 0,
  payment_status: row.payment_status || 'unpaid',
  paid_amount: Number(row.paid_amount) || 0,
  remaining_amount: Number(row.remaining_amount) || 0,
  customer_paid_amount: Number(row.customer_paid_amount) || 0,
  cashier_receipt_details: row.cashier_receipt_details || [],
});

const canViewCloudFinancials = async (supabase: NonNullable<ReturnType<typeof getSupabaseClient>>) => {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return false;
  const { data, error } = await supabase.from('app_user_profiles').select('role, permissions, is_active')
    .eq('user_id', authData.user.id).maybeSingle();
  if (error) throw new Error(`تعذر التحقق من صلاحية الحسابات: ${error.message}`);
  if (!data?.is_active) return false;
  const permissions = (data.permissions || {}) as Record<string, boolean>;
  return data.role === 'admin' || permissions.can_view_financials === true;
};

const upsertMovementFinancials = async (
  supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
  movements: Movement[],
) => {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return;
  const { data, error: profileError } = await supabase.from('app_user_profiles').select('role, permissions, is_active')
    .eq('user_id', authData.user.id).maybeSingle();
  if (profileError) throw new Error(`تعذر التحقق من صلاحية تحديث الحسابات: ${profileError.message}`);
  if (!data?.is_active) throw new Error('الحساب غير مفعل. تعذر تحديث الحسابات.');
  const permissions = (data.permissions || {}) as Record<string, boolean>;
  const allowed = data.role === 'admin' || permissions.can_manage_payments === true
    || permissions.can_edit_commissions === true;
  if (!allowed) return;
  const { error } = await supabase.from('movement_financials').upsert(movements.map(movementFinancialsForCloud) as never);
  if (error) throw new Error(`تعذر مزامنة الحسابات المالية للحركات: ${error.message}`);
};

const movementWithFinancials = (row: Movement, financials?: Record<string, unknown>): Movement => ({
  ...movementForApp(row),
  cashier_invoice: Number(financials?.cashier_invoice) || 0,
  cashier_receipt_no: String(financials?.cashier_receipt_no || ''),
  cashier_receipt_details: Array.isArray(financials?.cashier_receipt_details)
    ? financials.cashier_receipt_details as Movement['cashier_receipt_details']
    : [],
  system_commission: Number(financials?.system_commission) || 0,
  nafez_commission: Number(financials?.nafez_commission) || 0,
  discount: Number(financials?.discount) || 0,
  total_amount: Number(financials?.total_amount) || 0,
  payment_status: (financials?.payment_status as Movement['payment_status']) || 'unpaid',
  paid_amount: Number(financials?.paid_amount) || 0,
  remaining_amount: Number(financials?.remaining_amount) || 0,
  customer_paid_amount: Number(financials?.customer_paid_amount) || 0,
});

const paymentForApp = (row: PaymentReceipt): PaymentReceipt => {
  const notes = row.notes || '';
  const marker = notes.match(PAYMENT_META_MARKER);
  let meta: { type?: PaymentReceipt['payment_type']; unallocated?: number } = {};
  if (marker?.[1]) {
    try { meta = JSON.parse(marker[1]); } catch { /* keep the receipt readable */ }
  }
  return {
    ...row,
    notes: notes.replace(PAYMENT_META_MARKER, '').trim(),
    payment_type: row.payment_type ?? meta.type ?? 'collection',
    unallocated_amount: row.unallocated_amount ?? meta.unallocated ?? 0,
  };
};

const paymentForCloud = (row: PaymentReceipt): Record<string, unknown> => {
  const payment = paymentForApp(row);
  const { payment_type, unallocated_amount, ...cloudRow } = payment;
  if (!payment_type && !unallocated_amount) return cloudRow;
  return {
    ...cloudRow,
    notes: `${cloudRow.notes || ''}\n[[VIB_PAYMENT_META:${JSON.stringify({ type: payment_type, unallocated: unallocated_amount || 0 })}]]`.trim(),
  };
};

// Preserve per-customer defaults in the existing notes column so this feature
// works with the deployed Supabase schema without requiring new columns.
const customerForApp = (row: Customer): Customer => {
  const notes = row.notes || '';
  const marker = notes.match(CUSTOMER_FEE_MARKER);
  let storedProfile: { system_commission?: number; nafez_commission?: number } = {};
  if (marker?.[1]) {
    try { storedProfile = JSON.parse(marker[1]); } catch { /* use any fields already on the row */ }
  }
  return {
    ...row,
    notes: notes.replace(CUSTOMER_FEE_MARKER, '').trim(),
    system_commission: row.system_commission ?? storedProfile.system_commission,
    nafez_commission: row.nafez_commission ?? storedProfile.nafez_commission,
  };
};

const customerForCloud = (row: Customer): Record<string, unknown> => {
  const customer = customerForApp(row);
  const { system_commission, nafez_commission, ...cloudRow } = customer;
  if (system_commission === undefined && nafez_commission === undefined) return cloudRow;
  const profile = JSON.stringify({ system_commission, nafez_commission });
  return { ...cloudRow, notes: `${cloudRow.notes || ''}\n[[VIB_CUSTOMER_FEES:${profile}]]`.trim() };
};

type SyncTable = 'movements' | 'customers' | 'berths' | 'payments' | 'office_expenses';
type PendingSync = {
  upserts: Partial<Record<SyncTable, Record<string, unknown>>>;
  deletes: Partial<Record<SyncTable, string[]>>;
};

const getPendingSync = (): PendingSync => {
  try {
    const pending = getLargeLocalData<PendingSync>(KEYS.PENDING_SYNC) || { upserts: {}, deletes: {} };
    pending.upserts ||= {};
    pending.deletes ||= {};
    const customerUpserts = pending.upserts.customers || {};
    let removedLegacyCustomer = false;
    for (const id of SYSTEM_CUSTOMER_IDS) {
      if (customerUpserts[id]) {
        delete customerUpserts[id];
        removedLegacyCustomer = true;
      }
    }
    const customerDeletes = pending.deletes.customers || [];
    const safeCustomerDeletes = customerDeletes.filter((id) => !SYSTEM_CUSTOMER_IDS.has(id));
    if (safeCustomerDeletes.length !== customerDeletes.length) removedLegacyCustomer = true;
    pending.upserts.customers = customerUpserts;
    pending.deletes.customers = safeCustomerDeletes;
    if (removedLegacyCustomer) saveLargeLocalData(KEYS.PENDING_SYNC, pending);
    return pending;
  } catch {
    return { upserts: {}, deletes: {} };
  }
};

const savePendingSync = (pending: PendingSync) => {
  saveLargeLocalData(KEYS.PENDING_SYNC, pending);
};

const setPendingUpsert = <T extends { id: string }>(table: SyncTable, row: T) => {
  const pending = getPendingSync();
  pending.upserts[table] = { ...pending.upserts[table], [row.id]: row };
  pending.deletes[table] = (pending.deletes[table] || []).filter((id) => id !== row.id);
  savePendingSync(pending);
};

const setPendingUpserts = <T extends { id: string }>(table: SyncTable, rows: T[]) => {
  if (rows.length === 0) return;
  const pending = getPendingSync();
  const upserts = { ...pending.upserts[table] };
  const deletes = new Set(pending.deletes[table] || []);
  for (const row of rows) {
    upserts[row.id] = row;
    deletes.delete(row.id);
  }
  pending.upserts[table] = upserts;
  pending.deletes[table] = Array.from(deletes);
  savePendingSync(pending);
};

const clearPendingUpsert = (table: SyncTable, id: string) => {
  const pending = getPendingSync();
  const rows = { ...pending.upserts[table] };
  delete rows[id];
  pending.upserts[table] = rows;
  savePendingSync(pending);
};

const setPendingDelete = (table: SyncTable, id: string) => {
  const pending = getPendingSync();
  const rows = { ...pending.upserts[table] };
  delete rows[id];
  pending.upserts[table] = rows;
  pending.deletes[table] = [...new Set([...(pending.deletes[table] || []), id])];
  savePendingSync(pending);
};

export const getPendingSyncForTable = <T extends { id: string }>(table: SyncTable) => {
  const pending = getPendingSync();
  return {
    upserts: Object.values(pending.upserts[table] || {}) as T[],
    deletes: pending.deletes[table] || [],
  };
};

export const clearOperationalLocalData = (resetAt: string) => {
  saveMovements([]);
  saveCustomers([]);
  savePayments([]);
  saveOfficeExpenses([]);
  const pending = getPendingSync();
  for (const table of ['movements', 'customers', 'payments', 'office_expenses'] as const) {
    pending.upserts[table] = {};
    pending.deletes[table] = [];
  }
  savePendingSync(pending);
  localStorage.setItem(KEYS.DATA_RESET_AT, resetAt);
};

export const getLocalDataResetAt = () => localStorage.getItem(KEYS.DATA_RESET_AT);

export const clearOperationalDataFromSupabase = async () => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');

  const resetAt = new Date().toISOString();
  const deleteAll = async (table: 'payments' | 'movement_financials' | 'movements' | 'office_expenses') => {
    const result = table === 'movement_financials'
      ? await supabase.from(table).delete().not('movement_id', 'is', null)
      : await supabase.from(table).delete().not('id', 'is', null);
    const { error } = result;
    if (error && ['movement_financials', 'office_expenses'].includes(table) && ['42P01', 'PGRST205'].includes(error.code || '')) return;
    if (error) throw new Error(`تعذر مسح بيانات ${table}: ${error.message}`);
  };

  // Remove receipt objects before deleting their rows, so a storage failure does
  // not silently leave expense records without their original attachments.
  const { data: expenses, error: expensesError } = await supabase.from('office_expenses').select('receipt_path');
  if (expensesError && !['42P01', 'PGRST205'].includes(expensesError.code || '')) {
    throw new Error(`تعذر قراءة مرفقات المصروفات قبل التصفير: ${expensesError.message}`);
  }
  const receiptPaths = Array.from(new Set((expenses || []).map((row) => row.receipt_path).filter((path): path is string => Boolean(path))));
  for (let index = 0; index < receiptPaths.length; index += 100) {
    const { error } = await supabase.storage.from('office-expense-receipts').remove(receiptPaths.slice(index, index + 100));
    if (error) throw new Error(`تعذر حذف مرفقات المصروفات؛ لم يكتمل تصفير البيانات: ${error.message}`);
  }

  // Remove dependent records first, then customers while retaining system users.
  await deleteAll('payments');
  await deleteAll('movement_financials');
  await deleteAll('movements');
  await deleteAll('office_expenses');
  const { error: customersError } = await supabase
    .from('customers')
    .delete()
    .not('id', 'in', '("__SYSTEM_USERS_CONFIG__","__SYSTEM_HANDOFF_RESET__")');
  if (customersError) throw new Error(`تعذر مسح بيانات العملاء: ${customersError.message}`);

  const { error: markerError } = await supabase.from('customers').upsert({
    id: '__SYSTEM_HANDOFF_RESET__',
    code: '__SYS_RESET__',
    name: 'علامة تصفير بيانات التشغيل',
    trucks: [],
    notes: 'إشارة مزامنة لمسح البيانات التشغيلية من الأجهزة المرتبطة.',
    created_at: resetAt,
  });
  if (markerError) throw new Error(`تم مسح بعض البيانات، لكن تعذر تسجيل علامة المزامنة: ${markerError.message}`);

  const pending = getPendingSync();
  for (const table of ['movements', 'customers', 'payments', 'office_expenses'] as const) {
    pending.upserts[table] = {};
    pending.deletes[table] = [];
  }
  savePendingSync(pending);

  return resetAt;
};

export const flushPendingSync = async () => {
  const pending = getPendingSync();
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');

  // Upsert referenced records before dependent rows so foreign keys remain valid.
  for (const table of ['customers', 'berths', 'movements', 'payments', 'office_expenses'] as const) {
    for (const row of Object.values(pending.upserts[table] || {})) {
      const movement = table === 'movements'
        ? await ensureMovementCustomer(row as Movement, supabase)
        : undefined;
      if (movement) setPendingUpsert('movements', movement);
      const cloudRow = table === 'customers'
        ? customerForCloud(row as Customer)
        : table === 'movements' ? movementForCloud(movement || row as Movement)
        : table === 'payments' ? paymentForCloud(row as PaymentReceipt) : row;
      const { error } = await supabase.from(table).upsert(cloudRow as Record<string, unknown>);
      if (error) throw new Error(`تعذرت مزامنة ${table}: ${error.message}`);
      if (table === 'movements' && movement) await upsertMovementFinancials(supabase, [movement]);
      clearPendingUpsert(table, (row as { id: string }).id);
    }
  }

  // Remove dependent rows before referenced records.
  for (const table of ['movements', 'payments', 'office_expenses', 'berths', 'customers'] as const) {
    for (const id of pending.deletes[table] || []) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw new Error(`تعذر حذف سجل من ${table}: ${error.message}`);
      const latest = getPendingSync();
      latest.deletes[table] = (latest.deletes[table] || []).filter((pendingId) => pendingId !== id);
      savePendingSync(latest);
    }
  }
};

/** Queue and sync an imported batch in bulk, without waiting on unrelated backlog. */
export const syncImportedBatchToSupabase = async (customers: Customer[], movements: Movement[]) => {
  const cloudCustomers = customers.map(customerForCloud);
  setPendingUpserts('customers', cloudCustomers as unknown as Customer[]);
  setPendingUpserts('movements', movements);

  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');

  // This call receives the local customer records referenced by the batch.
  // Persist them first to satisfy movements.customer_id foreign keys.
  if (cloudCustomers.length) {
    const { error } = await supabase.from('customers').upsert(cloudCustomers as never);
    if (error) throw new Error(`تعذرت مزامنة العملاء: ${error.message}`);
  }

  const importedCustomerIds = new Set(customers.map((customer) => customer.id));
  const resolvedMovements: Movement[] = [];
  for (const movement of movements) {
    const resolved = movement.customer_id && !importedCustomerIds.has(movement.customer_id)
      ? await ensureMovementCustomer(movement, supabase)
      : movement;
    if (resolved !== movement) setPendingUpsert('movements', resolved);
    resolvedMovements.push(resolved);
  }

  if (resolvedMovements.length) {
    const { error } = await supabase.from('movements').upsert(resolvedMovements.map(movementForCloud) as never);
    if (error) throw new Error(`تعذرت مزامنة الحركات: ${error.message}`);
    await upsertMovementFinancials(supabase, resolvedMovements);
  }

  customers.forEach((customer) => clearPendingUpsert('customers', customer.id));
  resolvedMovements.forEach((movement) => clearPendingUpsert('movements', movement.id));
};

// ---------------- LOCAL STORAGE FALLBACK ----------------

export const getStoredSettings = (): SystemSettings => {
  try {
    const raw = localStorage.getItem(KEYS.SETTINGS);
    if (raw) return { ...initialSettings, ...JSON.parse(raw) };
  } catch (e) {
    console.error(e);
  }
  return initialSettings;
};

export const saveSettings = (settings: SystemSettings) => {
  localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
};

export const getStoredBerths = (): Berth[] => {
  const stored = getLargeLocalData<Berth[]>(KEYS.BERTHS);
  if (stored) return stored;
  saveLargeLocalData(KEYS.BERTHS, initialBerths);
  return initialBerths;
};

export const saveBerths = (berths: Berth[]) => {
  saveLargeLocalData(KEYS.BERTHS, berths);
};

export const getStoredCustomers = (): Customer[] => {
  const stored = getLargeLocalData<Customer[]>(KEYS.CUSTOMERS);
  if (stored) return stored.filter((customer) => !isSystemCustomer(customer)).map(customerForApp);
  saveLargeLocalData(KEYS.CUSTOMERS, initialCustomers);
  return initialCustomers;
};

export const saveCustomers = (customers: Customer[]) => {
  saveLargeLocalData(KEYS.CUSTOMERS, customers.filter((customer) => !isSystemCustomer(customer)).map(customerForApp));
};

export const getStoredMovements = (): Movement[] => {
  const stored = getLargeLocalData<Movement[]>(KEYS.MOVEMENTS);
  if (stored) return stored;
  saveLargeLocalData(KEYS.MOVEMENTS, initialMovements);
  return initialMovements;
};

export const saveMovements = (movements: Movement[]) => {
  saveLargeLocalData(KEYS.MOVEMENTS, movements);
};

export const getStoredPayments = (): PaymentReceipt[] => {
  return getLargeLocalData<PaymentReceipt[]>(KEYS.PAYMENTS) || [];
};

export const savePayments = (payments: PaymentReceipt[]) => {
  saveLargeLocalData(KEYS.PAYMENTS, payments);
};

export const getStoredOfficeExpenses = (): OfficeExpense[] => {
  return getLargeLocalData<OfficeExpense[]>(KEYS.OFFICE_EXPENSES) || [];
};

export const saveOfficeExpenses = (expenses: OfficeExpense[]) => {
  saveLargeLocalData(KEYS.OFFICE_EXPENSES, expenses);
};

// ---------------- LIVE SUPABASE SYNC ENGINE ----------------

type PagedQueryResult<T> = {
  data: T[] | null;
  error: { message: string; code?: string } | null;
};

const fetchAllPages = async <T>(
  fetchPage: (from: number, to: number) => PromiseLike<PagedQueryResult<T>>,
): Promise<PagedQueryResult<T>> => {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return { data: rows, error: null };
};

export const fetchAllFromSupabase = async () => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');

  try {
    const canViewFinancials = await canViewCloudFinancials(supabase);
    const [movementsRes, customersRes, berthsRes, paymentsRes, expensesRes, financialsRes, commissionSettingsRes] = await Promise.all([
      fetchAllPages<Movement>((from, to) => supabase.from('movements').select('*')
        .order('seq', { ascending: true }).order('id', { ascending: true }).range(from, to)),
      fetchAllPages<Customer>((from, to) => supabase.from('customers').select('*')
        .order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to)),
      fetchAllPages<Berth>((from, to) => supabase.from('berths').select('*')
        .order('code', { ascending: true }).order('id', { ascending: true }).range(from, to)),
      fetchAllPages<PaymentReceipt>((from, to) => supabase.from('payments').select('*')
        .order('date', { ascending: false }).order('id', { ascending: false }).range(from, to)),
      fetchAllPages<OfficeExpense>((from, to) => supabase.from('office_expenses').select('*')
        .order('expense_date', { ascending: false }).order('id', { ascending: false }).range(from, to)),
      canViewFinancials
        ? fetchAllPages<Record<string, unknown>>((from, to) => supabase.from('movement_financials').select('*')
          .order('movement_id', { ascending: true }).range(from, to))
        : Promise.resolve({ data: [], error: null }),
      canViewFinancials ? supabase.from('system_settings').select('value').eq('key', 'commissions').maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);

    const expensesTableMissing = Boolean(expensesRes.error && ['42P01', 'PGRST205'].includes(expensesRes.error.code || ''));
    const failedQuery = [movementsRes, customersRes, berthsRes, ...(canViewFinancials ? [paymentsRes, financialsRes, commissionSettingsRes] : []), ...(expensesTableMissing ? [] : [expensesRes])].find((result) => result.error);
    if (failedQuery?.error) {
      throw new Error(`تعذرت قراءة البيانات من Supabase: ${failedQuery.error.message}`);
    }

    const financialByMovement = new Map(((financialsRes.data || []) as Record<string, unknown>[]).map((row) => [String(row.movement_id), row]));
    const cloudMovements = (movementsRes.data || []) as Movement[];
    const missingFinancialMovementIds = canViewFinancials
      ? cloudMovements.filter((row) => !financialByMovement.has(row.id)).map((row) => row.id)
      : [];
    return {
      movements: cloudMovements.slice().reverse().map((row) => movementWithFinancials(row, financialByMovement.get(row.id))),
      missingFinancialMovementIds,
      commissionSettings: canViewFinancials && commissionSettingsRes.data?.value
        ? commissionSettingsRes.data.value as Partial<SystemSettings> & { vib_configured_at?: string }
        : null,
      customers: (customersRes.data || [])
        .filter((customer) => !['__SYSTEM_USERS_CONFIG__', '__SYSTEM_HANDOFF_RESET__'].includes(customer.id))
        .map((customer) => customerForApp(customer as Customer)),
      berths: (berthsRes.data || []) as Berth[],
      payments: canViewFinancials ? ((paymentsRes.data || []) as PaymentReceipt[]).map(paymentForApp) : [],
      expenses: (expensesTableMissing ? [] : expensesRes.data || []) as OfficeExpense[],
      expensesTableMissing,
      dataResetAt: (customersRes.data || []).find((customer) => customer.id === '__SYSTEM_HANDOFF_RESET__')?.created_at as string | undefined,
    };
  } catch (err) {
    console.warn('Supabase fetch failed:', err);
    throw err;
  }
};

export const syncCommissionSettingsToSupabase = async (settingsToSave: SystemSettings) => {
  const currentSettings = getStoredSettings();
  const supabase = getSupabaseClient(currentSettings.supabase_url, currentSettings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');
  const value = {
    default_system_commission: settingsToSave.default_system_commission,
    default_inbound_commission: settingsToSave.default_inbound_commission,
    default_outbound_commission: settingsToSave.default_outbound_commission,
    default_empty_commission: settingsToSave.default_empty_commission,
    default_nafez_commission: settingsToSave.default_nafez_commission,
    default_truck_axles: settingsToSave.default_truck_axles,
    default_truck_weight: settingsToSave.default_truck_weight,
    default_trailer_axles: settingsToSave.default_trailer_axles,
    default_trailer_weight: settingsToSave.default_trailer_weight,
    vib_configured_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('system_settings').upsert({ key: 'commissions', value });
  if (error) throw new Error(`تعذر مزامنة إعدادات الحسابات: ${error.message}`);
};

/** Repair missing ledger rows in one bounded write instead of N concurrent requests. */
export const syncMovementFinancialsToSupabase = async (movements: Movement[]) => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');
  const batchSize = 250;
  for (let index = 0; index < movements.length; index += batchSize) {
    await upsertMovementFinancials(supabase, movements.slice(index, index + batchSize));
  }
};

export const syncMovementToSupabase = async (movement: Movement) => {
  setPendingUpsert('movements', movement);
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');
  try {
    const movementToSync = await ensureMovementCustomer(movement, supabase);
    setPendingUpsert('movements', movementToSync);
    const { error } = await supabase.from('movements').upsert(movementForCloud(movementToSync));
    if (error) throw error;
    await upsertMovementFinancials(supabase, [movementToSync]);
    clearPendingUpsert('movements', movement.id);
  } catch (e) {
    console.error('Failed to sync movement to Supabase:', e);
    throw e;
  }
};

const ensureMovementCustomer = async (movement: Movement, supabase: NonNullable<ReturnType<typeof getSupabaseClient>>) => {
  if (!movement.customer_id) return { ...movement, customer_id: null as unknown as string };

  const { data: byId, error: idLookupError } = await supabase
    .from('customers').select('id, code, name').eq('id', movement.customer_id).maybeSingle();
  if (idLookupError) throw new Error(`تعذر التحقق من عميل الحركة: ${idLookupError.message}`);
  if (byId) return movement;

  const name = [movement.customer_name, movement.driver_name]
    .map((value) => (value || '').trim())
    .find((value) => {
      const normalized = normalizeCustomerName(value);
      return normalized && !['عميل عام', 'غير محدد'].includes(normalized);
    }) || '';
  const normalizedName = normalizeCustomerName(name);
  if (!normalizedName) {
    return { ...movement, customer_id: null as unknown as string, customer_code: '' };
  }

  const { data: customers, error: customersError } = await supabase
    .from('customers').select('id, code, name');
  if (customersError) throw new Error(`تعذر البحث عن العميل المرتبط بالحركة: ${customersError.message}`);
  const matched = (customers || []).find((customer) => normalizeCustomerName(customer.name || '') === normalizedName);
  if (matched) {
    return {
      ...movement,
      customer_id: matched.id,
      customer_code: matched.code || movement.customer_code,
      customer_name: matched.name || name,
    };
  }

  // Repair older locally queued movements by creating the missing customer
  // with the same ID the movement already references.
  const customerId = movement.customer_id;
  const customerCode = `DRV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const { error: insertError } = await supabase.from('customers').upsert({
    id: customerId,
    code: customerCode,
    name,
    phone: '',
    trucks: [],
    notes: 'تم إنشاؤه تلقائياً لإصلاح ربط حركة محفوظة محلياً',
    created_at: new Date().toISOString(),
  });
  if (insertError) throw new Error(`تعذر إنشاء العميل المرتبط بالحركة: ${insertError.message}`);
  return { ...movement, customer_code: customerCode, customer_name: name };
};

const upsertMovementsWithCustomerRepair = async (
  supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
  movements: Movement[],
) => {
  if (!movements.length) return;
  const repaired: Movement[] = [];
  for (const movement of movements) {
    const resolved = await ensureMovementCustomer(movement, supabase);
    setPendingUpsert('movements', resolved);
    repaired.push(resolved);
  }
  const { error } = await supabase.from('movements').upsert(repaired.map(movementForCloud) as never);
  if (error) throw new Error(`تعذرت مزامنة movements: ${error.message}`);
  await upsertMovementFinancials(supabase, repaired);
  repaired.forEach((movement) => clearPendingUpsert('movements', movement.id));
};

export const syncCustomerToSupabase = async (customer: Customer) => {
  const cloudCustomer = customerForCloud(customer);
  setPendingUpsert('customers', cloudCustomer as unknown as Customer);
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');
  try {
    const { error } = await supabase.from('customers').upsert(cloudCustomer);
    if (error) throw error;
    clearPendingUpsert('customers', customer.id);
  } catch (e) {
    console.error('Failed to sync customer to Supabase:', e);
    throw e;
  }
};

export const syncBerthToSupabase = async (berth: Berth) => {
  setPendingUpsert('berths', berth);
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');
  try {
    const { error } = await supabase.from('berths').upsert(berth);
    if (error) throw error;
    clearPendingUpsert('berths', berth.id);
  } catch (e) {
    console.error('Failed to sync berth to Supabase:', e);
    throw e;
  }
};

export const syncPaymentToSupabase = async (payment: PaymentReceipt) => {
  setPendingUpsert('payments', payment);
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');
  try {
    const { error } = await supabase.from('payments').upsert(paymentForCloud(payment));
    if (error) throw error;
    clearPendingUpsert('payments', payment.id);
  } catch (e) {
    console.error('Failed to sync payment to Supabase:', e);
    throw e;
  }
};

export const syncOfficeExpenseToSupabase = async (expense: OfficeExpense) => {
  setPendingUpsert('office_expenses', expense);
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');
  const { error } = await supabase.from('office_expenses').upsert(expense);
  if (error) throw new Error(error.code === '42P01' || error.code === 'PGRST205'
    ? 'جهّز جدول مصروفات المكتب في قاعدة البيانات أولاً باستخدام ملف الإعداد المرفق.'
    : `تعذرت مزامنة مصروف المكتب: ${error.message}`);
  clearPendingUpsert('office_expenses', expense.id);
};

export const uploadOfficeExpenseReceipt = async (file: File, expenseId: string) => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ.');
  const extension = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const path = `${expenseId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('office-expense-receipts').upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw new Error(`تعذر رفع الإيصال. تأكد من إعداد مخزن مرفقات المصروفات: ${error.message}`);
  return path;
};

export const getOfficeExpenseReceiptUrl = async (path: string) => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ.');
  const { data, error } = await supabase.storage.from('office-expense-receipts').createSignedUrl(path, 300);
  if (error) throw new Error(`تعذر فتح الإيصال: ${error.message}`);
  return data.signedUrl;
};

export const deleteOfficeExpenseFromSupabase = async (expense: OfficeExpense) => {
  setPendingDelete('office_expenses', expense.id);
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ.');
  if (expense.receipt_path) {
    const { error } = await supabase.storage.from('office-expense-receipts').remove([expense.receipt_path]);
    if (error) console.warn('Could not remove office expense attachment:', error);
  }
  const { error } = await supabase.from('office_expenses').delete().eq('id', expense.id);
  if (error) throw new Error(`تعذر حذف مصروف المكتب: ${error.message}`);
  const pending = getPendingSync();
  pending.deletes.office_expenses = (pending.deletes.office_expenses || []).filter((id) => id !== expense.id);
  savePendingSync(pending);
};

export const restoreLocalDataToSupabase = async (data: {
  movements: Movement[];
  customers: Customer[];
  berths: Berth[];
  payments: PaymentReceipt[];
  expenses?: OfficeExpense[];
}) => {
  const customers = data.customers.filter((customer) => !isSystemCustomer(customer));
  setPendingUpserts('movements', data.movements);
  setPendingUpserts('customers', customers.map(customerForCloud) as unknown as Customer[]);
  setPendingUpserts('berths', data.berths);
  setPendingUpserts('payments', data.payments);
  setPendingUpserts('office_expenses', data.expenses || []);
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');

  // Restore parent rows before rows that reference them through foreign keys.
  const orderedWrites = [
    ['customers', customers.map(customerForCloud)],
    ['berths', data.berths],
  ] as const;
  for (const [table, rows] of orderedWrites) {
    if (!rows.length) continue;
    const { error } = await supabase.from(table).upsert(rows as never);
    if (error) throw new Error(`تعذرت استعادة البيانات إلى Supabase: ${error.message}`);
  }
  await upsertMovementsWithCustomerRepair(supabase, data.movements);
  if (data.payments.length) {
    const { error } = await supabase.from('payments').upsert(data.payments.map(paymentForCloud) as never);
    if (error) throw new Error(`تعذرت استعادة البيانات إلى Supabase: ${error.message}`);
  }
  for (const row of customers) clearPendingUpsert('customers', row.id);
  for (const row of data.berths) clearPendingUpsert('berths', row.id);
  for (const row of data.payments) clearPendingUpsert('payments', row.id);
  for (const row of data.expenses || []) clearPendingUpsert('office_expenses', row.id);
};

export const deleteMovementFromSupabase = async (id: string) => {
  setPendingDelete('movements', id);
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');
  try {
    const { error } = await supabase.from('movements').delete().eq('id', id);
    if (error) throw error;
    const pending = getPendingSync();
    pending.deletes.movements = (pending.deletes.movements || []).filter((pendingId) => pendingId !== id);
    savePendingSync(pending);
  } catch (e) {
    console.error('Failed to delete movement from Supabase:', e);
    throw e;
  }
};

export const deleteMovementsBatchFromSupabase = async (ids: string[]) => {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (!uniqueIds.length) return;
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');
  for (const id of uniqueIds) setPendingDelete('movements', id);
  for (let index = 0; index < uniqueIds.length; index += 100) {
    const group = uniqueIds.slice(index, index + 100);
    const { error } = await supabase.from('movements').delete().in('id', group);
    if (error) throw new Error(`تعذر إزالة بعض حركات الشيت المحدد: ${error.message}`);
    const pending = getPendingSync();
    pending.deletes.movements = (pending.deletes.movements || []).filter((id) => !group.includes(id));
    pending.upserts.movements ||= {};
    group.forEach((id) => { delete pending.upserts.movements![id]; });
    savePendingSync(pending);
  }
};

export const writeActivityLog = async (event: Pick<ActivityLog, 'action' | 'entity_type' | 'entity_id' | 'entity_name' | 'summary' | 'details'>) => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ.');
  const { error } = await supabase.from('activity_logs').insert(event as never);
  if (error) throw new Error(`تعذر تسجيل نشاط المستخدم: ${error.message}`);
};

export const fetchRecentActivityLogs = async (limit = 200): Promise<ActivityLog[]> => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ.');
  const { data, error } = await supabase.from('activity_logs').select('*')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(`تعذر تحميل سجل النشاط: ${error.message}`);
  return (data || []) as ActivityLog[];
};

export const clearAllMovementsFromSupabase = async () => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');
  try {
    // Delete all records where id is not empty
    const { error } = await supabase.from('movements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
    const pending = getPendingSync();
    pending.upserts.movements = {};
    pending.deletes.movements = [];
    savePendingSync(pending);
  } catch (e) {
    console.error('Failed to clear all movements from Supabase:', e);
    throw e;
  }
};

export const deleteCustomerFromSupabase = async (id: string) => {
  setPendingDelete('customers', id);
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');
  try {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) throw error;
    const pending = getPendingSync();
    pending.deletes.customers = (pending.deletes.customers || []).filter((pendingId) => pendingId !== id);
    savePendingSync(pending);
  } catch (e) {
    console.error('Failed to delete customer from Supabase:', e);
    throw e;
  }
};

export const deleteBerthFromSupabase = async (id: string) => {
  setPendingDelete('berths', id);
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');
  try {
    const { error } = await supabase.from('berths').delete().eq('id', id);
    if (error) throw error;
    const pending = getPendingSync();
    pending.deletes.berths = (pending.deletes.berths || []).filter((pendingId) => pendingId !== id);
    savePendingSync(pending);
  } catch (e) {
    console.error('Failed to delete berth from Supabase:', e);
    throw e;
  }
};

export const syncWithSupabase = async () => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) {
    return { success: false, message: 'مفتاح Supabase (Anon Key) غير مهيأ بعد' };
  }

  try {
    const { error: testErr } = await supabase.from('berths').select('count', { count: 'exact', head: true });
    if (testErr) {
      return { success: false, message: `فشل الاتصال: ${testErr.message}` };
    }

    // Seed initial data to Supabase if empty
    const { count, error: countError } = await supabase.from('movements').select('*', { count: 'exact', head: true });
    if (countError) throw new Error(`تعذر فحص بيانات الحركات: ${countError.message}`);
    if (count === 0) {
      const localMovements = getStoredMovements();
      const localCustomers = getStoredCustomers();
      const localBerths = getStoredBerths();

      if (localBerths.length > 0) {
        const { error } = await supabase.from('berths').upsert(localBerths);
        if (error) throw new Error(`تعذرت مزامنة الأرصفة: ${error.message}`);
      }
      if (localCustomers.length > 0) {
        const { error } = await supabase.from('customers').upsert(localCustomers.map(customerForCloud));
        if (error) throw new Error(`تعذرت مزامنة العملاء: ${error.message}`);
      }
      await upsertMovementsWithCustomerRepair(supabase, localMovements);
    }

    return { success: true, message: 'تم الاتصال بقاعدة بيانات Supabase ومزامنة البيانات بنجاح تام!' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'خطأ أثناء الاتصال' };
  }
};
