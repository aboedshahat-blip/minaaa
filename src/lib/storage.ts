import { Berth, Customer, Movement, PaymentReceipt, SystemSettings, ManagedUser } from '../types';
import { initialBerths, initialCustomers, initialMovements, initialSettings, initialUsers } from './mockData';
import { getSupabaseClient } from './supabase';

const KEYS = {
  MOVEMENTS: 'pls_movements',
  CUSTOMERS: 'pls_customers',
  BERTHS: 'pls_berths',
  PAYMENTS: 'pls_payments',
  SETTINGS: 'pls_settings',
  USERS: 'pls_users',
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
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error(e);
  }
  localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(initialCustomers));
  return initialCustomers;
};

export const saveCustomers = (customers: Customer[]) => {
  localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(customers));
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
      movements: (movementsRes.data || []) as Movement[],
      customers: (customersRes.data || []).filter((customer) => customer.id !== '__SYSTEM_USERS_CONFIG__') as Customer[],
      berths: (berthsRes.data || []) as Berth[],
      payments: (paymentsRes.data || []) as PaymentReceipt[],
    };
  } catch (err) {
    console.warn('Supabase fetch failed:', err);
    throw err;
  }
};

export const syncMovementToSupabase = async (movement: Movement) => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');
  try {
    const { error } = await supabase.from('movements').upsert(movement);
    if (error) throw error;
  } catch (e) {
    console.error('Failed to sync movement to Supabase:', e);
    throw e;
  }
};

export const syncCustomerToSupabase = async (customer: Customer) => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');
  try {
    const { error } = await supabase.from('customers').upsert(customer);
    if (error) throw error;
  } catch (e) {
    console.error('Failed to sync customer to Supabase:', e);
    throw e;
  }
};

export const syncBerthToSupabase = async (berth: Berth) => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');
  try {
    const { error } = await supabase.from('berths').upsert(berth);
    if (error) throw error;
  } catch (e) {
    console.error('Failed to sync berth to Supabase:', e);
    throw e;
  }
};

export const syncPaymentToSupabase = async (payment: PaymentReceipt) => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');
  try {
    const { error } = await supabase.from('payments').upsert(payment);
    if (error) throw error;
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
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');

  const results = await Promise.all([
    data.movements.length ? supabase.from('movements').upsert(data.movements) : Promise.resolve({ error: null }),
    data.customers.length ? supabase.from('customers').upsert(data.customers) : Promise.resolve({ error: null }),
    data.berths.length ? supabase.from('berths').upsert(data.berths) : Promise.resolve({ error: null }),
    data.payments.length ? supabase.from('payments').upsert(data.payments) : Promise.resolve({ error: null }),
  ]);
  const failedWrite = results.find((result) => result.error);
  if (failedWrite?.error) throw new Error(`تعذرت استعادة البيانات إلى Supabase: ${failedWrite.error.message}`);
};

export const deleteMovementFromSupabase = async (id: string) => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');
  try {
    const { error } = await supabase.from('movements').delete().eq('id', id);
    if (error) throw error;
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
  } catch (e) {
    console.error('Failed to clear all movements from Supabase:', e);
    throw e;
  }
};

export const deleteCustomerFromSupabase = async (id: string) => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');
  try {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) throw error;
  } catch (e) {
    console.error('Failed to delete customer from Supabase:', e);
    throw e;
  }
};

export const deleteBerthFromSupabase = async (id: string) => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ. راجع رابط المشروع والمفتاح العام في الإعدادات.');
  try {
    const { error } = await supabase.from('berths').delete().eq('id', id);
    if (error) throw error;
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
      if (localCustomers.length > 0) await supabase.from('customers').upsert(localCustomers);
      if (localMovements.length > 0) await supabase.from('movements').upsert(localMovements);
    }

    return { success: true, message: 'تم الاتصال بقاعدة بيانات Supabase ومزامنة البيانات بنجاح تام!' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'خطأ أثناء الاتصال' };
  }
};
