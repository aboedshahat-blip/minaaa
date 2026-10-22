import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;
let supabaseConfigKey: string | null = null;

export const getSupabaseClient = (url?: string, anonKey?: string): SupabaseClient | null => {
  const envUrl = url || import.meta.env.VITE_SUPABASE_URL || 'https://jfhmarmaebrzdnsvkqzv.supabase.co';
  const envKey = anonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  if (!envKey) {
    supabaseInstance = null;
    supabaseConfigKey = null;
    return null;
  }

  const configKey = `${envUrl}\n${envKey}`;
  if (!supabaseInstance || supabaseConfigKey !== configKey) {
    try {
      supabaseInstance = createClient(envUrl, envKey);
      supabaseConfigKey = configKey;
    } catch (e) {
      console.warn('Failed to initialize Supabase client:', e);
      return null;
    }
  }

  return supabaseInstance;
};
