import React, { createContext, useContext, useState, useEffect } from 'react';
import { ManagedUser, RolePermissions, UserRole } from '../types';
import { getStoredUsers, saveUsers, getStoredSettings } from '../lib/storage';

interface AuthContextType {
  currentUser: ManagedUser;
  users: ManagedUser[];
  setCurrentUserId: (id: string) => void;
  updateUserPermissions: (userId: string, permissions: RolePermissions) => void;
  updateUserStatus: (userId: string, isActive: boolean) => void;
  updateUserPin: (userId: string, newPin: string) => void;
  addNewUser: (user: Omit<ManagedUser, 'id' | 'created_at'>) => void;
  deleteUser: (userId: string) => void;
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<ManagedUser[]>(getStoredUsers);
  const [currentUserId, setCurrentUserIdState] = useState<string>(() => {
    const saved = localStorage.getItem('pls_active_user_id');
    const existing = getStoredUsers().find((u) => u.id === saved && u.is_active);
    return existing ? existing.id : 'u-admin';
  });

  useEffect(() => {
    localStorage.setItem('pls_active_user_id', currentUserId);
  }, [currentUserId]);

  const currentUser = users.find((u) => u.id === currentUserId) || users[0];

  const setCurrentUserId = (id: string) => {
    setCurrentUserIdState(id);
  };

  const updateUserPermissions = (userId: string, permissions: RolePermissions) => {
    const updated = users.map((u) => (u.id === userId ? { ...u, permissions } : u));
    setUsers(updated);
    saveUsers(updated);
  };

  const updateUserStatus = (userId: string, isActive: boolean) => {
    const updated = users.map((u) => (u.id === userId ? { ...u, is_active: isActive } : u));
    setUsers(updated);
    saveUsers(updated);
  };

  const updateUserPin = (userId: string, newPin: string) => {
    const updated = users.map((u) => (u.id === userId ? { ...u, pin_code: newPin } : u));
    setUsers(updated);
    saveUsers(updated);
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
  };

  const deleteUser = (userId: string) => {
    if (userId === 'u-admin') {
      alert('لا يمكن حذف حساب الأدمن الرئيسي!');
      return;
    }
    const updated = users.filter((u) => u.id !== userId);
    setUsers(updated);
    saveUsers(updated);
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
        setCurrentUserId,
        updateUserPermissions,
        updateUserStatus,
        updateUserPin,
        addNewUser,
        deleteUser,
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
