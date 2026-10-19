import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export const getSupabaseClient = (url?: string, anonKey?: string): SupabaseClient | null => {
  const envUrl = url || import.meta.env.VITE_SUPABASE_URL || 'https://jfhmarmaebrzdnsvkqzv.supabase.co';
  const envKey = anonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  if (!envKey) {
    return null;
  }

  if (!supabaseInstance) {
    try {
      supabaseInstance = createClient(envUrl, envKey);
    } catch (e) {
      console.warn('Failed to initialize Supabase client:', e);
      return null;
    }
  }

  return supabaseInstance;
};
