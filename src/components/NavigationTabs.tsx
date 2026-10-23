import React from 'react';
import { useAuth } from '../contexts/AuthContext';

export type TabType =
  | 'movements'
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
    badge?: number | string;
    visible: boolean;
  }[] = [
    {
      id: 'movements',
      label: 'الحركات وكشوف التشغيل',
      badge: movementCount,
      visible: true,
    },
    {
      id: 'customers',
      label: 'العملاء والمركبات',
      visible: true,
    },
    {
      id: 'accounts',
      label: 'الحسابات والتحصيل',
      visible: canViewFinancials, // Hidden for data_entry
    },
    {
      id: 'reports',
      label: 'التقارير والإحصاءات',
      visible: canViewFinancials, // Hidden for data_entry
    },
    {
      id: 'berths',
      label: 'إدارة الأرصفة',
      visible: canManageBerths,
    },
    {
      id: 'settings',
      label: 'الإعدادات المالية',
      visible: canEditCommissions || isAdmin,
    },
    {
      id: 'admin_control',
      label: 'إدارة النظام والصلاحيات',
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
