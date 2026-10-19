import { Berth, Customer, Movement, PaymentReceipt, SystemSettings } from '../types';
import { initialBerths, initialCustomers, initialMovements, initialSettings } from './mockData';
import { getSupabaseClient } from './supabase';

const KEYS = {
  MOVEMENTS: 'pls_movements',
  CUSTOMERS: 'pls_customers',
  BERTHS: 'pls_berths',
  PAYMENTS: 'pls_payments',
  SETTINGS: 'pls_settings',
};

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

// Sync with Supabase if configured
export const syncWithSupabase = async () => {
  const settings = getStoredSettings();
  const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  if (!supabase) return { success: false, message: 'مفتاح Supabase غير مهيأ' };

  try {
    const movements = getStoredMovements();
    const customers = getStoredCustomers();
    const berths = getStoredBerths();

    // Check connection
    const { error: testErr } = await supabase.from('berths').select('count', { count: 'exact', head: true });
    if (testErr) {
      return { success: false, message: testErr.message };
    }

    return { success: true, message: 'تم الاتصال بقاعدة بيانات Supabase بنجاح' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'خطأ أثناء الاتصال' };
  }
};
