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
    if (raw) return JSON.parse(raw);
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
  if (!supabase) return null;

  try {
    const [movementsRes, customersRes, berthsRes, paymentsRes] = await Promise.all([
      supabase.from('movements').select('*').order('seq', { ascending: false }),
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.from('berths').select('*').order('code', { ascending: true }),
      supabase.from('payments').select('*').order('date', { ascending: false }),
    ]);

    return {
      movements: movementsRes.data && movementsRes.data.length > 0 ? (movementsRes.data as Movement[]) : null,
      customers: customersRes.data && customersRes.data.length > 0 ? (customersRes.data as Customer[]) : null,
      berths: berthsRes.data && berthsRes.data.length > 0 ? (berthsRes.data as Berth[]) : null,
      payments: paymentsRes.data ? (paymentsRes.data as PaymentReceipt[]) : null,
    };
  } catch (err) {
    console.warn('Supabase fetch failed:', err);
    return null;
  }
};

export const syncMovementToSupabase = async (movement: Movement) => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) return;
  try {
    await supabase.from('movements').upsert(movement);
  } catch (e) {
    console.error('Failed to sync movement to Supabase:', e);
  }
};

export const syncCustomerToSupabase = async (customer: Customer) => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) return;
  try {
    await supabase.from('customers').upsert(customer);
  } catch (e) {
    console.error('Failed to sync customer to Supabase:', e);
  }
};

export const syncBerthToSupabase = async (berth: Berth) => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) return;
  try {
    await supabase.from('berths').upsert(berth);
  } catch (e) {
    console.error('Failed to sync berth to Supabase:', e);
  }
};

export const syncPaymentToSupabase = async (payment: PaymentReceipt) => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) return;
  try {
    await supabase.from('payments').upsert(payment);
  } catch (e) {
    console.error('Failed to sync payment to Supabase:', e);
  }
};

export const deleteMovementFromSupabase = async (id: string) => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) return;
  try {
    await supabase.from('movements').delete().eq('id', id);
  } catch (e) {
    console.error('Failed to delete movement from Supabase:', e);
  }
};

export const deleteCustomerFromSupabase = async (id: string) => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) return;
  try {
    await supabase.from('customers').delete().eq('id', id);
  } catch (e) {
    console.error('Failed to delete customer from Supabase:', e);
  }
};

export const deleteBerthFromSupabase = async (id: string) => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) return;
  try {
    await supabase.from('berths').delete().eq('id', id);
  } catch (e) {
    console.error('Failed to delete berth from Supabase:', e);
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
