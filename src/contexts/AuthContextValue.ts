import { createContext } from 'react';
import { ManagedUser, RolePermissions, UserRole } from '../types';

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
  updateUserRole: (userId: string, role: UserRole) => Promise<void>;
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

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
