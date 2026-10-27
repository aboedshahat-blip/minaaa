import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ManagedUser, RolePermissions, UserRole } from '../types';
import { getStoredSettings } from '../lib/storage';
import { getSupabaseClient } from '../lib/supabase';

interface AuthContextType {
  currentUser: ManagedUser;
  users: ManagedUser[];
  isAuthenticated: boolean;
  isLoading: boolean;
  isPasswordRecovery: boolean;
  sessionNotice: string;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  requestPasswordRecovery: (email: string) => Promise<{ success: boolean; message?: string }>;
  completePasswordRecovery: (password: string) => Promise<{ success: boolean; message?: string }>;
  finishPasswordRecovery: () => void;
  logout: () => void;
  setCurrentUserId: (id: string) => void;
  verifyCurrentPassword: (password: string) => Promise<boolean>;
  updateUserPermissions: (userId: string, permissions: RolePermissions) => Promise<void>;
  updateUserStatus: (userId: string, isActive: boolean) => Promise<void>;
  updateUserPassword: (userId: string, newPassword: string) => Promise<void>;
  addNewUser: (user: Omit<ManagedUser, 'id' | 'created_at'> & { password: string }) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  canViewFinancials: boolean;
  canViewSystemRevenue: boolean;
  canAddMovements: boolean;
  canEditMovements: boolean;
  canDeleteMovements: boolean;
  canUploadSheets: boolean;
  canExportExcel: boolean;
  canManageCustomers: boolean;
  canDeleteCustomers: boolean;
  canManagePayments: boolean;
  canManageBerths: boolean;
  canEditCommissions: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const emptyPermissions: RolePermissions = {
  can_view_financials: false, can_view_system_revenue: false,
  can_add_movements: false, can_edit_movements: false, can_delete_movements: false,
  can_upload_sheets: false, can_export_excel: false,
  can_manage_customers: false, can_delete_customers: false,
  can_manage_payments: false, can_manage_berths: false, can_edit_commissions: false,
};
const anonymousUser: ManagedUser = {
  id: '', email: '', username: '', name: '', role: 'data_entry', is_active: false,
  created_at: '', permissions: emptyPermissions,
};

const fromProfile = (row: Record<string, unknown>): ManagedUser => ({
  id: String(row.user_id || ''),
  email: String(row.email || ''),
  username: String(row.username || row.email || ''),
  name: String(row.display_name || row.name || ''),
  role: (row.role || 'data_entry') as UserRole,
  is_active: row.is_active !== false,
  created_at: String(row.created_at || ''),
  permissions: { ...emptyPermissions, ...((row.permissions || {}) as Partial<RolePermissions>) },
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<ManagedUser>(anonymousUser);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [sessionNotice, setSessionNotice] = useState('');

  const supabase = useMemo(() => {
    const settings = getStoredSettings();
    return getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
  }, []);

  const refreshUsers = async (adminClient = supabase) => {
    if (!adminClient) return;
    const { data, error } = await adminClient.from('app_user_profiles').select('*').order('created_at', { ascending: true });
    if (error) throw new Error(`تعذر تحميل حسابات المستخدمين: ${error.message}`);
    setUsers((data || []).map((row) => fromProfile(row as Record<string, unknown>)));
  };

  useEffect(() => {
    // Remove the legacy client-side credentials after switching to Supabase Auth.
    localStorage.removeItem('pls_users');
    localStorage.removeItem('pls_is_authenticated');
    localStorage.removeItem('pls_active_user_id');
    try {
      const systemCustomerIds = new Set(['__SYSTEM_USERS_CONFIG__', '__SYSTEM_HANDOFF_RESET__']);
      const customers = JSON.parse(localStorage.getItem('pls_customers') || '[]') as Array<{ id?: string }>;
      localStorage.setItem('pls_customers', JSON.stringify(customers.filter((customer) => !systemCustomerIds.has(customer.id || ''))));
      const backups = JSON.parse(localStorage.getItem('pls_safety_backups_v1') || '[]') as Array<{ customers?: Array<{ id?: string }> }>;
      localStorage.setItem('pls_safety_backups_v1', JSON.stringify(backups.map((backup) => ({
        ...backup,
        customers: (backup.customers || []).filter((customer) => !systemCustomerIds.has(customer.id || '')),
      }))));
    } catch { /* Keep normal startup available if an old local backup is malformed. */ }
  }, []);

  useEffect(() => {
    if (!supabase) { setIsLoading(false); return; }
    let active = true;
    let revision = 0;

    const acceptSession = async (session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']) => {
      const currentRevision = ++revision;
      if (!session?.user) {
        if (!active || currentRevision !== revision) return;
        setCurrentUser(anonymousUser);
        setUsers([]);
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }
      const { data, error } = await supabase.from('app_user_profiles').select('*').eq('user_id', session.user.id).maybeSingle();
      if (!active || currentRevision !== revision) return;
      if (error || !data) {
        console.error('Could not load the authenticated user profile:', error);
        setCurrentUser(anonymousUser);
        setIsAuthenticated(false);
        setIsLoading(false);
        void supabase.auth.signOut({ scope: 'local' });
        return;
      }
      const profile = fromProfile(data as Record<string, unknown>);
      if (!profile.is_active) {
        setCurrentUser(anonymousUser);
        setIsAuthenticated(false);
        setIsLoading(false);
        void supabase.auth.signOut({ scope: 'local' });
        return;
      }
      const { data: sessionClaimed, error: sessionClaimError } = await supabase.rpc('claim_app_user_session');
      if (!active || currentRevision !== revision) return;
      if (sessionClaimError || sessionClaimed !== true) {
        setCurrentUser(anonymousUser);
        setUsers([]);
        setIsAuthenticated(false);
        setIsLoading(false);
        setSessionNotice(sessionClaimError
          ? 'تعذر التحقق من جلسة الدخول. حدّث الصفحة أو تواصل مع مدير النظام.'
          : 'هذا الحساب مفتوح بالفعل على جهاز آخر. سجّل الخروج من الجهاز الآخر ثم حاول مرة أخرى.');
        void supabase.auth.signOut({ scope: 'local' });
        return;
      }
      setSessionNotice('');
      setCurrentUser(profile);
      setIsAuthenticated(true);
      setIsLoading(false);
      if (profile.role === 'admin') {
        setUsers([profile]);
        try { await refreshUsers(supabase); }
        catch (loadError) { console.error(loadError); }
      } else {
        setUsers([profile]);
      }
    };

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setIsPasswordRecovery(false);
      // Defer Supabase queries until after the auth callback releases its internal lock.
      window.setTimeout(() => { void acceptSession(session); }, 0);
    });
    void supabase.auth.getSession().then(({ data }) => acceptSession(data.session));

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !isAuthenticated) return;
    let checking = false;
    let failedHeartbeats = 0;
    const heartbeat = window.setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        const { data, error } = await supabase.rpc('heartbeat_app_user_session');
        if (error) {
          failedHeartbeats += 1;
          if (failedHeartbeats < 3) return;
        } else if (data === true) {
          failedHeartbeats = 0;
          return;
        }
        if (error || data !== true) {
          setSessionNotice('انتهت جلسة هذا الجهاز أو فُتح الحساب على جهاز آخر. سجّل الدخول من جديد.');
          await supabase.auth.signOut({ scope: 'local' });
        }
      } finally {
        checking = false;
      }
    }, 60_000);
    return () => window.clearInterval(heartbeat);
  }, [supabase, isAuthenticated]);

  const login = async (username: string, password: string) => {
    if (!supabase) return { success: false, message: 'إعداد الاتصال الآمن غير مكتمل. تواصل مع مدير النظام.' };
    const cleanUsername = username.trim().normalize('NFKC').toLowerCase();
    let session: { access_token: string; refresh_token: string } | null = null;
    if (cleanUsername.includes('@')) {
      // Keep existing email sign-in available until the username edge endpoint is confirmed live.
      const { data, error } = await supabase.auth.signInWithPassword({ email: cleanUsername, password });
      if (!error && data.session) session = data.session;
    } else {
      const { data, error } = await supabase.functions.invoke('username-login', {
        body: { username: cleanUsername, password },
      });
      if (!error && data?.session?.access_token && data?.session?.refresh_token) session = data.session;
      else console.error('Secure username login failed:', error);
    }
    if (!session) return { success: false, message: 'اسم المستخدم أو البريد الإلكتروني أو كلمة المرور غير صحيحة، أو الحساب غير مفعّل.' };
    const { data: sessionData, error: sessionError } = await supabase.auth.setSession(session);
    if (sessionError || !sessionData.session) return { success: false, message: 'تعذر إنشاء جلسة آمنة. حاول مرة أخرى.' };
    const { data: profile, error: profileError } = await supabase.from('app_user_profiles').select('is_active').eq('user_id', sessionData.session.user.id).maybeSingle();
    if (profileError || !profile) {
      await supabase.auth.signOut({ scope: 'local' });
      return { success: false, message: 'حسابك غير مهيأ في النظام. تواصل مع المدير العام.' };
    }
    if (!profile.is_active) {
      await supabase.auth.signOut({ scope: 'local' });
      return { success: false, message: 'هذا الحساب معطل. تواصل مع المدير العام.' };
    }
    const { data: sessionClaimed, error: sessionClaimError } = await supabase.rpc('claim_app_user_session');
    if (sessionClaimError || sessionClaimed !== true) {
      await supabase.auth.signOut({ scope: 'local' });
      return {
        success: false,
        message: sessionClaimError
          ? 'تعذر التحقق من جلسة الدخول. حدّث الصفحة أو تواصل مع مدير النظام.'
          : 'هذا الحساب مفتوح بالفعل على جهاز آخر. سجّل الخروج من الجهاز الآخر ثم حاول مرة أخرى.',
      };
    }
    setSessionNotice('');
    return { success: true };
  };

  const requestPasswordRecovery = async (email: string) => {
    if (!supabase) return { success: false, message: 'إعداد الاتصال الآمن غير مكتمل.' };
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes('@')) return { success: false, message: 'اكتب البريد الإلكتروني للحساب أولاً.' };
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
    if (error) return { success: false, message: error.message || 'تعذر إرسال رابط استعادة كلمة المرور.' };
    return { success: true };
  };

  const completePasswordRecovery = async (password: string) => {
    if (!supabase) return { success: false, message: 'إعداد الاتصال الآمن غير مكتمل.' };
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
      return { success: false, message: 'رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.' };
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { success: false, message: error.message || 'تعذر حفظ كلمة المرور الجديدة.' };
    return { success: true };
  };

  const finishPasswordRecovery = () => setIsPasswordRecovery(false);

  const logout = () => {
    if (!supabase) return;
    void (async () => {
      await supabase.rpc('release_app_user_session');
      await supabase.auth.signOut({ scope: 'local' });
    })();
  };
  const setCurrentUserId = (_id: string) => { /* User identity now comes from the verified Supabase session. */ };

  const verifyCurrentPassword = async (password: string) => {
    if (!supabase || !currentUser.email) return false;
    // Validate on an isolated, non-persistent client so password checks do not rotate
    // the active app session and accidentally release or replace its single-session lock.
    const settings = getStoredSettings();
    const verifier = createClient(
      settings.supabase_url || import.meta.env.VITE_SUPABASE_URL || 'https://jfhmarmaebrzdnsvkqzv.supabase.co',
      settings.supabase_anon_key || import.meta.env.VITE_SUPABASE_ANON_KEY || '',
      {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      },
    );
    const { error } = await verifier.auth.signInWithPassword({ email: currentUser.email, password });
    if (!error) await verifier.auth.signOut({ scope: 'local' });
    return !error;
  };

  const invokeUserAdmin = async (action: string, fields: Record<string, unknown>) => {
    if (!supabase || currentUser.role !== 'admin') throw new Error('إدارة المستخدمين متاحة للمدير العام فقط.');
    const { data, error } = await supabase.functions.invoke('manage-app-user', { body: { action, ...fields } });
    if (error) throw new Error(error.message || 'تعذر تنفيذ إدارة المستخدم.');
    if (data?.error) throw new Error(String(data.error));
    await refreshUsers(supabase);
  };

  const updateUserPermissions = (userId: string, permissions: RolePermissions) => invokeUserAdmin('update_permissions', { user_id: userId, permissions });
  const updateUserStatus = (userId: string, isActive: boolean) => invokeUserAdmin('update_status', { user_id: userId, is_active: isActive });
  const updateUserPassword = (userId: string, newPassword: string) => invokeUserAdmin('update_password', { user_id: userId, password: newPassword });
  const addNewUser = (user: Omit<ManagedUser, 'id' | 'created_at'> & { password: string }) => invokeUserAdmin('create', {
    email: user.email?.trim().toLowerCase(), username: user.username.trim(), display_name: user.name.trim(),
    role: user.role, permissions: user.permissions, password: user.password,
  });
  const deleteUser = (userId: string) => invokeUserAdmin('delete', { user_id: userId });

  const isAdmin = isAuthenticated && currentUser.role === 'admin';
  const perms = isAdmin ? { ...emptyPermissions, ...currentUser.permissions } : currentUser.permissions;
  return <AuthContext.Provider value={{
    currentUser, users, isAuthenticated, isLoading, isPasswordRecovery, sessionNotice, login,
    requestPasswordRecovery, completePasswordRecovery, finishPasswordRecovery,
    logout, setCurrentUserId, verifyCurrentPassword,
    updateUserPermissions, updateUserStatus, updateUserPassword, addNewUser, deleteUser,
    canViewFinancials: isAdmin || perms.can_view_financials,
    canViewSystemRevenue: isAdmin || perms.can_view_system_revenue,
    canAddMovements: isAdmin || perms.can_add_movements,
    canEditMovements: isAdmin || perms.can_edit_movements,
    canDeleteMovements: isAdmin || perms.can_delete_movements,
    canUploadSheets: isAdmin || perms.can_upload_sheets,
    canExportExcel: isAdmin || perms.can_export_excel,
    canManageCustomers: isAdmin || perms.can_manage_customers,
    canDeleteCustomers: isAdmin || perms.can_delete_customers,
    canManagePayments: isAdmin || perms.can_manage_payments,
    canManageBerths: isAdmin || perms.can_manage_berths,
    canEditCommissions: isAdmin || perms.can_edit_commissions,
    isAdmin,
  }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
