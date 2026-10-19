import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserRole } from '../types';

interface AuthContextType {
  currentUser: UserProfile;
  setRole: (role: UserRole) => void;
  canViewFinancials: boolean; // false for data_entry
  canManageSettings: boolean; // true only for admin
  canManageBerths: boolean; // true only for admin
  canManageAccounting: boolean; // true for admin and accountant
}

export const USERS: Record<UserRole, UserProfile> = {
  admin: {
    id: 'u-admin',
    name: 'المدير العام (أدمن)',
    email: 'admin@almina-system.com',
    role: 'admin',
  },
  accountant: {
    id: 'u-acc',
    name: 'المحاسب المالي',
    email: 'accounts@almina-system.com',
    role: 'accountant',
  },
  data_entry: {
    id: 'u-entry',
    name: 'مدخل بيانات (تشغيل فقط)',
    email: 'entry@almina-system.com',
    role: 'data_entry',
  },
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentRole, setCurrentRole] = useState<UserRole>(() => {
    const saved = localStorage.getItem('pls_user_role') as UserRole;
    return saved && USERS[saved] ? saved : 'admin';
  });

  useEffect(() => {
    localStorage.setItem('pls_user_role', currentRole);
  }, [currentRole]);

  const currentUser = USERS[currentRole];

  // RBAC permissions
  // "واحد يدخل البيانات فقط لا يسمح له برأيه الحساب اجموع"
  const canViewFinancials = currentRole === 'admin' || currentRole === 'accountant';
  const canManageSettings = currentRole === 'admin';
  const canManageBerths = currentRole === 'admin';
  const canManageAccounting = currentRole === 'admin' || currentRole === 'accountant';

  const setRole = (role: UserRole) => {
    setCurrentRole(role);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        setRole,
        canViewFinancials,
        canManageSettings,
        canManageBerths,
        canManageAccounting,
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
