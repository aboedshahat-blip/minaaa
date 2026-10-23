import { Berth, Customer, Movement, PaymentReceipt, SystemSettings, ManagedUser } from '../types';
import { initialBerths, initialCustomers, initialMovements, initialSettings, initialUsers } from './mockData';
import { getSupabaseClient } from './supabase';
import { normalizeCustomerName } from './customerName';

const KEYS = {
  MOVEMENTS: 'pls_movements',
  CUSTOMERS: 'pls_customers',
  BERTHS: 'pls_berths',
  PAYMENTS: 'pls_payments',
  SETTINGS: 'pls_settings',
  USERS: 'pls_users',
  PENDING_SYNC: 'pls_pending_sync_v1',
  DATA_RESET_AT: 'pls_data_reset_at',
  SAFETY_BACKUPS: 'pls_safety_backups_v1',
};

export interface OperationalSafetyBackup {
  id: string;
  label: string;
  created_at: string;
  movements: Movement[];
  customers: Customer[];
  berths: Berth[];
  payments: PaymentReceipt[];
}

export const getSafetyBackups = (): OperationalSafetyBackup[] => {
  try {
    const raw = localStorage.getItem(KEYS.SAFETY_BACKUPS);
    return raw ? JSON.parse(raw) as OperationalSafetyBackup[] : [];
  } catch {
    return [];
  }
};

export const saveSafetyBackup = (data: Omit<OperationalSafetyBackup, 'id' | 'created_at'>) => {
  const backup: OperationalSafetyBackup = { ...data, id: crypto.randomUUID(), created_at: new Date().toISOString() };
  const backups = [backup, ...getSafetyBackups()].slice(0, 10);
  localStorage.setItem(KEYS.SAFETY_BACKUPS, JSON.stringify(backups));
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
    ['customers', backup.customers.map(customerForCloud)],
    ['berths', backup.berths.map((row) => ({ ...row }))],
    ['movements', backup.movements.map(movementForCloud)],
    ['payments', backup.payments.map(paymentForCloud)],
  ];
  for (const [table, rows] of writes) {
    if (!rows.length) continue;
    const { error } = await supabase.from(table).upsert(rows as never);
    if (error) throw new Error(`تعذرت استعادة ${table}: ${error.message}`);
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
  savePendingSync(pending);
  localStorage.setItem(KEYS.DATA_RESET_AT, resetAt);
  saveMovements(backup.movements);
  saveCustomers(backup.customers);
  saveBerths(backup.berths);
  savePayments(backup.payments);
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
  const { import_batch_id, import_batch_name, import_batch_at, customer_paid_amount, ...cloudRow } = movement;
  if (!import_batch_id && customer_paid_amount === undefined) return cloudRow;
  return {
    ...cloudRow,
    notes: `${cloudRow.notes || ''}\n[[VIB_IMPORT_BATCH:${JSON.stringify({ id: import_batch_id, name: import_batch_name, at: import_batch_at, customerPaid: customer_paid_amount })}]]`.trim(),
  };
};

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

type SyncTable = 'movements' | 'customers' | 'berths' | 'payments';
type PendingSync = {
  upserts: Partial<Record<SyncTable, Record<string, unknown>>>;
  deletes: Partial<Record<SyncTable, string[]>>;
};

const getPendingSync = (): PendingSync => {
  try {
    const raw = localStorage.getItem(KEYS.PENDING_SYNC);
    return raw ? JSON.parse(raw) as PendingSync : { upserts: {}, deletes: {} };
  } catch {
    return { upserts: {}, deletes: {} };
  }
};

const savePendingSync = (pending: PendingSync) => {
  localStorage.setItem(KEYS.PENDING_SYNC, JSON.stringify(pending));
};

const setPendingUpsert = <T extends { id: string }>(table: SyncTable, row: T) => {
  const pending = getPendingSync();
  pending.upserts[table] = { ...pending.upserts[table], [row.id]: row };
  pending.deletes[table] = (pending.deletes[table] || []).filter((id) => id !== row.id);
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
  const pending = getPendingSync();
  for (const table of ['movements', 'customers', 'payments'] as const) {
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
  const deleteAll = async (table: 'payments' | 'movements') => {
    const { error } = await supabase.from(table).delete().not('id', 'is', null);
    if (error) throw new Error(`تعذر مسح بيانات ${table}: ${error.message}`);
  };

  // Remove dependent records first, then customers while retaining system users.
  await deleteAll('payments');
  await deleteAll('movements');
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

  return resetAt;
};

export const flushPendingSync = async () => {
  const pending = getPendingSync();
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');

  // Upsert referenced records before dependent rows so foreign keys remain valid.
  for (const table of ['customers', 'berths', 'movements', 'payments'] as const) {
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
      clearPendingUpsert(table, (row as { id: string }).id);
    }
  }

  // Remove dependent rows before referenced records.
  for (const table of ['movements', 'payments', 'berths', 'customers'] as const) {
    for (const id of pending.deletes[table] || []) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw new Error(`تعذر حذف سجل من ${table}: ${error.message}`);
      const latest = getPendingSync();
      latest.deletes[table] = (latest.deletes[table] || []).filter((pendingId) => pendingId !== id);
      savePendingSync(latest);
    }
  }
};

/** Queue an imported batch atomically before syncing its customer foreign keys. */
export const syncImportedBatchToSupabase = async (customers: Customer[], movements: Movement[]) => {
  customers.forEach((customer) => {
    const cloudCustomer = customerForCloud(customer);
    setPendingUpsert('customers', cloudCustomer as unknown as Customer);
  });
  movements.forEach((movement) => setPendingUpsert('movements', movement));

  // flushPendingSync writes customers before movements and retains every failed
  // row in the local retry queue, so a transient error cannot strand the batch.
  await flushPendingSync();
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

export const getStoredUsers = (): ManagedUser[] => {
  try {
    const raw = localStorage.getItem(KEYS.USERS);
    if (raw) {
      const parsed: ManagedUser[] = JSON.parse(raw);
      return parsed.map((u) => {
        const init = initialUsers.find((iu) => iu.id === u.id || iu.username === u.username);
        return {
          ...u,
          password: (u.password && u.password.trim().length > 0) ? u.password : (init ? init.password : u.pin_code || '123456'),
        };
      });
    }
  } catch (e) {
    console.error(e);
  }
  localStorage.setItem(KEYS.USERS, JSON.stringify(initialUsers));
  return initialUsers;
};

export const saveUsers = (users: ManagedUser[]) => {
  localStorage.setItem(KEYS.USERS, JSON.stringify(users));
};

export const getStoredBerths = (): Berth[] => {
  try {
    const raw = localStorage.getItem(KEYS.BERTHS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error(e);
  }
  localStorage.setItem(KEYS.BERTHS, JSON.stringify(initialBerths));
  return initialBerths;
};

export const saveBerths = (berths: Berth[]) => {
  localStorage.setItem(KEYS.BERTHS, JSON.stringify(berths));
};

export const getStoredCustomers = (): Customer[] => {
  try {
    const raw = localStorage.getItem(KEYS.CUSTOMERS);
    if (raw) return (JSON.parse(raw) as Customer[]).map(customerForApp);
  } catch (e) {
    console.error(e);
  }
  localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(initialCustomers));
  return initialCustomers;
};

export const saveCustomers = (customers: Customer[]) => {
  localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(customers.map(customerForApp)));
};

export const getStoredMovements = (): Movement[] => {
  try {
    const raw = localStorage.getItem(KEYS.MOVEMENTS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error(e);
  }
  localStorage.setItem(KEYS.MOVEMENTS, JSON.stringify(initialMovements));
  return initialMovements;
};

export const saveMovements = (movements: Movement[]) => {
  localStorage.setItem(KEYS.MOVEMENTS, JSON.stringify(movements));
};

export const getStoredPayments = (): PaymentReceipt[] => {
  try {
    const raw = localStorage.getItem(KEYS.PAYMENTS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error(e);
  }
  return [];
};

export const savePayments = (payments: PaymentReceipt[]) => {
  localStorage.setItem(KEYS.PAYMENTS, JSON.stringify(payments));
};

// ---------------- LIVE SUPABASE SYNC ENGINE ----------------

export const fetchAllFromSupabase = async () => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');

  try {
    const [movementsRes, customersRes, berthsRes, paymentsRes] = await Promise.all([
      supabase.from('movements').select('*').order('seq', { ascending: false }),
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.from('berths').select('*').order('code', { ascending: true }),
      supabase.from('payments').select('*').order('date', { ascending: false }),
    ]);

    const failedQuery = [movementsRes, customersRes, berthsRes, paymentsRes].find((result) => result.error);
    if (failedQuery?.error) {
      throw new Error(`تعذرت قراءة البيانات من Supabase: ${failedQuery.error.message}`);
    }

    return {
      movements: ((movementsRes.data || []) as Movement[]).map(movementForApp),
      customers: (customersRes.data || [])
        .filter((customer) => !['__SYSTEM_USERS_CONFIG__', '__SYSTEM_HANDOFF_RESET__'].includes(customer.id))
        .map((customer) => customerForApp(customer as Customer)),
      berths: (berthsRes.data || []) as Berth[],
      payments: ((paymentsRes.data || []) as PaymentReceipt[]).map(paymentForApp),
      dataResetAt: (customersRes.data || []).find((customer) => customer.id === '__SYSTEM_HANDOFF_RESET__')?.created_at as string | undefined,
    };
  } catch (err) {
    console.warn('Supabase fetch failed:', err);
    throw err;
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

  const name = (movement.customer_name || movement.driver_name || '').trim();
  const normalizedName = normalizeCustomerName(name);
  if (!normalizedName || ['عميل عام', 'غير محدد'].includes(normalizedName)) {
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

export const restoreLocalDataToSupabase = async (data: {
  movements: Movement[];
  customers: Customer[];
  berths: Berth[];
  payments: PaymentReceipt[];
}) => {
  data.movements.forEach((row) => setPendingUpsert('movements', row));
  data.customers.forEach((row) => setPendingUpsert('customers', customerForCloud(row) as unknown as Customer));
  data.berths.forEach((row) => setPendingUpsert('berths', row));
  data.payments.forEach((row) => setPendingUpsert('payments', row));
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');

  // Restore parent rows before rows that reference them through foreign keys.
  const orderedWrites = [
    ['customers', data.customers.map(customerForCloud)],
    ['berths', data.berths],
    ['movements', data.movements.map(movementForCloud)],
    ['payments', data.payments.map(paymentForCloud)],
  ] as const;
  for (const [table, rows] of orderedWrites) {
    if (!rows.length) continue;
    const { error } = await supabase.from(table).upsert(rows as never);
    if (error) throw new Error(`تعذرت استعادة البيانات إلى Supabase: ${error.message}`);
  }
  for (const row of data.movements) clearPendingUpsert('movements', row.id);
  for (const row of data.customers) clearPendingUpsert('customers', row.id);
  for (const row of data.berths) clearPendingUpsert('berths', row.id);
  for (const row of data.payments) clearPendingUpsert('payments', row.id);
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
    const { count } = await supabase.from('movements').select('*', { count: 'exact', head: true });
    if (count === 0) {
      const localMovements = getStoredMovements();
      const localCustomers = getStoredCustomers();
      const localBerths = getStoredBerths();

      if (localBerths.length > 0) await supabase.from('berths').upsert(localBerths);
      if (localCustomers.length > 0) await supabase.from('customers').upsert(localCustomers.map(customerForCloud));
      if (localMovements.length > 0) await supabase.from('movements').upsert(localMovements.map(movementForCloud));
    }

    return { success: true, message: 'تم الاتصال بقاعدة بيانات Supabase ومزامنة البيانات بنجاح تام!' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'خطأ أثناء الاتصال' };
  }
};
