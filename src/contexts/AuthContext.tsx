import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ManagedUser, RolePermissions, UserRole } from '../types';
import { getStoredSettings } from '../lib/storage';
import { getSupabaseClient } from '../lib/supabase';

interface AuthContextType {
  currentUser: ManagedUser;
  users: ManagedUser[];
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
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
      const customers = JSON.parse(localStorage.getItem('pls_customers') || '[]') as Array<{ id?: string }>;
      localStorage.setItem('pls_customers', JSON.stringify(customers.filter((customer) => customer.id !== '__SYSTEM_USERS_CONFIG__')));
      const backups = JSON.parse(localStorage.getItem('pls_safety_backups_v1') || '[]') as Array<{ customers?: Array<{ id?: string }> }>;
      localStorage.setItem('pls_safety_backups_v1', JSON.stringify(backups.map((backup) => ({
        ...backup,
        customers: (backup.customers || []).filter((customer) => customer.id !== '__SYSTEM_USERS_CONFIG__'),
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
        void supabase.auth.signOut();
        return;
      }
      const profile = fromProfile(data as Record<string, unknown>);
      if (!profile.is_active) {
        setCurrentUser(anonymousUser);
        setIsAuthenticated(false);
        setIsLoading(false);
        void supabase.auth.signOut();
        return;
      }
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

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      // Defer Supabase queries until after the auth callback releases its internal lock.
      window.setTimeout(() => { void acceptSession(session); }, 0);
    });
    void supabase.auth.getSession().then(({ data }) => acceptSession(data.session));

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  const login = async (email: string, password: string) => {
    if (!supabase) return { success: false, message: 'إعداد الاتصال الآمن غير مكتمل. تواصل مع مدير النظام.' };
    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    if (error || !data.session) return { success: false, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة، أو لم يتم تأكيد الحساب.' };
    const { data: profile, error: profileError } = await supabase.from('app_user_profiles').select('is_active').eq('user_id', data.user.id).maybeSingle();
    if (profileError || !profile) {
      await supabase.auth.signOut();
      return { success: false, message: 'حسابك غير مهيأ في النظام. تواصل مع المدير العام.' };
    }
    if (!profile.is_active) {
      await supabase.auth.signOut();
      return { success: false, message: 'هذا الحساب معطل. تواصل مع المدير العام.' };
    }
    return { success: true };
  };

  const logout = () => { if (supabase) void supabase.auth.signOut(); };
  const setCurrentUserId = (_id: string) => { /* User identity now comes from the verified Supabase session. */ };

  const verifyCurrentPassword = async (password: string) => {
    if (!supabase || !currentUser.email) return false;
    const { error } = await supabase.auth.signInWithPassword({ email: currentUser.email, password });
    if (!error) await supabase.auth.refreshSession();
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
    currentUser, users, isAuthenticated, isLoading, login, logout, setCurrentUserId, verifyCurrentPassword,
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
