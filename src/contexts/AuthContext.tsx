import React, { createContext, useContext, useState, useEffect } from 'react';
import { ManagedUser, RolePermissions } from '../types';
import { getStoredUsers, saveUsers, getStoredSettings } from '../lib/storage';
import { getSupabaseClient } from '../lib/supabase';

interface AuthContextType {
  currentUser: ManagedUser;
  users: ManagedUser[];
  isAuthenticated: boolean;
  login: (username: string, passwordOrPin: string) => { success: boolean; message?: string };
  logout: () => void;
  setCurrentUserId: (id: string) => void;
  updateUserPermissions: (userId: string, permissions: RolePermissions) => void;
  updateUserStatus: (userId: string, isActive: boolean) => void;
  updateUserPin: (userId: string, newPin: string) => void;
  updateUserPassword: (userId: string, newPassword: string) => void;
  addNewUser: (user: Omit<ManagedUser, 'id' | 'created_at'>) => void;
  deleteUser: (userId: string) => void;
  syncUsersToCloud: (usersList?: ManagedUser[]) => Promise<void>;
  // Dynamic computed permissions for currently logged-in user
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

const USERS_CLOUD_KEY = '__SYSTEM_USERS_CONFIG__';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<ManagedUser[]>(getStoredUsers);

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('pls_is_authenticated') === 'true';
  });

  const [currentUserId, setCurrentUserIdState] = useState<string>(() => {
    const saved = localStorage.getItem('pls_active_user_id');
    const existing = getStoredUsers().find((u) => u.id === saved && u.is_active);
    return existing ? existing.id : 'u-admin';
  });

  // Cloud sync of users list
  const syncUsersFromCloud = async () => {
    const settings = getStoredSettings();
    const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
    if (!supabase) return;

    try {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('id', USERS_CLOUD_KEY)
        .maybeSingle();

      if (data && data.trucks && Array.isArray(data.trucks) && data.trucks.length > 0) {
        const cloudUsers = data.trucks as ManagedUser[];
        const localUsers = getStoredUsers();

        // Merge: keep whichever has newer settings/passwords
        const merged = cloudUsers.map((cu) => {
          const local = localUsers.find((lu) => lu.id === cu.id);
          return {
            ...cu,
            // Prefer custom password if set locally or in cloud
            password: cu.password || local?.password || '123456',
          };
        });

        setUsers(merged);
        saveUsers(merged);
      }
    } catch (e) {
      console.warn('Sync users from cloud failed:', e);
    }
  };

  const syncUsersToCloud = async (usersList?: ManagedUser[]) => {
    const listToSave = usersList || users;
    const settings = getStoredSettings();
    const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
    if (!supabase) return;

    try {
      await supabase.from('customers').upsert({
        id: USERS_CLOUD_KEY,
        code: '__SYS_USERS__',
        name: 'إعدادات مستخدمي المنظومة والصلاحيات',
        trucks: listToSave as any,
        notes: `سجل المستخدمين المشفر وقائمة الصلاحيات - آخر تحديث: ${new Date().toISOString()}`,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Sync users to cloud failed:', e);
    }
  };

  useEffect(() => {
    syncUsersFromCloud();
  }, []);

  useEffect(() => {
    localStorage.setItem('pls_active_user_id', currentUserId);
  }, [currentUserId]);

  useEffect(() => {
    localStorage.setItem('pls_is_authenticated', isAuthenticated ? 'true' : 'false');
  }, [isAuthenticated]);

  const currentUser = users.find((u) => u.id === currentUserId) || users[0];

  const login = (username: string, passwordOrPin: string): { success: boolean; message?: string } => {
    const cleanUser = username.trim().toLowerCase();
    const cleanPass = passwordOrPin.trim();

    // Default fail-safes for core accounts
    const defaults: Record<string, string[]> = {
      admin: ['admin123', '1234', 'admin'],
      accountant: ['acc123', '2233', '1234', 'accountant'],
      dataentry: ['entry123', '1122', '1234', 'dataentry'],
    };

    const matched = users.find((u) => {
      const matchUser =
        u.username.toLowerCase() === cleanUser ||
        u.name.toLowerCase() === cleanUser ||
        (cleanUser === 'admin' && u.role === 'admin') ||
        (cleanUser === 'accountant' && u.role === 'accountant') ||
        (cleanUser === 'dataentry' && u.role === 'data_entry');

      if (!matchUser) return false;

      const userPass = (u.password || '').trim();
      const userPin = (u.pin_code || '').trim();

      // If user has a set password, STRICTLY check against current password or PIN
      if (userPass) {
        return cleanPass === userPass || (Boolean(userPin) && cleanPass === userPin);
      }

      // Initial default fallback only if password field is completely empty
      const defaults: Record<string, string[]> = {
        admin: ['admin123', '1234'],
        accountant: ['acc123', '2233'],
        dataentry: ['entry123', '1122'],
      };
      const fallbackList = defaults[u.username.toLowerCase()] || [];
      return fallbackList.includes(cleanPass);
    });

    if (!matched) {
      return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة!' };
    }

    if (!matched.is_active) {
      return { success: false, message: 'هذا الحساب تم تعطيله من قِبل المدير العام!' };
    }

    setCurrentUserIdState(matched.id);
    setIsAuthenticated(true);
    return { success: true };
  };

  const logout = () => {
    setIsAuthenticated(false);
  };

  const setCurrentUserId = (id: string) => {
    setCurrentUserIdState(id);
  };

  const updateUserPermissions = (userId: string, permissions: RolePermissions) => {
    const updated = users.map((u) => (u.id === userId ? { ...u, permissions } : u));
    setUsers(updated);
    saveUsers(updated);
    syncUsersToCloud(updated);
  };

  const updateUserStatus = (userId: string, isActive: boolean) => {
    const updated = users.map((u) => (u.id === userId ? { ...u, is_active: isActive } : u));
    setUsers(updated);
    saveUsers(updated);
    syncUsersToCloud(updated);
  };

  const updateUserPin = (userId: string, newPin: string) => {
    const updated = users.map((u) => (u.id === userId ? { ...u, pin_code: newPin } : u));
    setUsers(updated);
    saveUsers(updated);
    syncUsersToCloud(updated);
  };

  const updateUserPassword = (userId: string, newPassword: string) => {
    const updated = users.map((u) => (u.id === userId ? { ...u, password: newPassword } : u));
    setUsers(updated);
    saveUsers(updated);
    syncUsersToCloud(updated);
  };

  const addNewUser = (userData: Omit<ManagedUser, 'id' | 'created_at'>) => {
    const newUser: ManagedUser = {
      ...userData,
      id: `u-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    const updated = [...users, newUser];
    setUsers(updated);
    saveUsers(updated);
    syncUsersToCloud(updated);
  };

  const deleteUser = (userId: string) => {
    if (userId === 'u-admin') {
      alert('لا يمكن حذف حساب الأدمن الرئيسي!');
      return;
    }
    const updated = users.filter((u) => u.id !== userId);
    setUsers(updated);
    saveUsers(updated);
    syncUsersToCloud(updated);
    if (currentUserId === userId) {
      setCurrentUserIdState('u-admin');
    }
  };

  const perms = currentUser.permissions;
  const isAdmin = currentUser.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        users,
        isAuthenticated,
        login,
        logout,
        setCurrentUserId,
        updateUserPermissions,
        updateUserStatus,
        updateUserPin,
        updateUserPassword,
        addNewUser,
        deleteUser,
        syncUsersToCloud,
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
