import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Truck,
  FileSpreadsheet,
  Users,
  Wallet,
  BarChart3,
  Anchor,
  Settings,
} from 'lucide-react';

export type TabType =
  | 'movements'
  | 'sheet_import'
  | 'customers'
  | 'accounts'
  | 'reports'
  | 'berths'
  | 'settings'
  | 'admin_control';

interface NavigationTabsProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  movementCount: number;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({
  activeTab,
  onSelectTab,
  movementCount,
}) => {
  const { canViewFinancials, canEditCommissions, canManageBerths, isAdmin } = useAuth();

  const tabs: {
    id: TabType;
    label: string;
    icon: React.ReactNode;
    badge?: number | string;
    visible: boolean;
  }[] = [
    {
      id: 'movements',
      label: 'كشف الحركات (الاسطمبة)',
      icon: <Truck className="w-4 h-4" />,
      badge: movementCount,
      visible: true,
    },
    {
      id: 'sheet_import',
      label: 'رفع وتصفية شيت',
      icon: <FileSpreadsheet className="w-4 h-4" />,
      visible: true,
    },
    {
      id: 'customers',
      label: 'تكويد العملاء والعربيات',
      icon: <Users className="w-4 h-4" />,
      visible: true,
    },
    {
      id: 'accounts',
      label: 'الحسابات والديون والعمولات',
      icon: <Wallet className="w-4 h-4" />,
      visible: canViewFinancials, // Hidden for data_entry
    },
    {
      id: 'reports',
      label: 'التقارير والإحصائيات',
      icon: <BarChart3 className="w-4 h-4" />,
      visible: canViewFinancials, // Hidden for data_entry
    },
    {
      id: 'berths',
      label: 'أرصفة الميناء',
      icon: <Anchor className="w-4 h-4" />,
      visible: canManageBerths,
    },
    {
      id: 'settings',
      label: 'إعدادات العمولات',
      icon: <Settings className="w-4 h-4" />,
      visible: canEditCommissions || isAdmin,
    },
    {
      id: 'admin_control',
      label: 'لوحة تحكم الأدمن والصلاحيات',
      icon: <span className="text-rose-500 font-bold">🛡️</span>,
      visible: isAdmin,
    },
  ];

  return (
    <nav className="bg-white border-b border-slate-200 no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-1 space-x-reverse overflow-x-auto overscroll-x-contain py-2 px-1 [scrollbar-width:thin]">
          {tabs
            .filter((t) => t.visible)
            .map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onSelectTab(tab.id)}
                  className={`flex min-h-11 items-center gap-2 px-3 sm:px-3.5 py-2.5 rounded-lg text-xs md:text-sm font-semibold transition-all whitespace-nowrap snap-start ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span className={isActive ? 'text-blue-600' : 'text-slate-500'}>
                    {tab.icon}
                  </span>
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
        </div>
      </div>
    </nav>
  );
};
