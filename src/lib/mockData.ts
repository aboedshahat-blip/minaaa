import { Customer, Berth, Movement, SystemSettings, ManagedUser } from '../types';

export const initialSettings: SystemSettings = {
  default_system_commission: 200,
  default_nafez_commission: 50,
  default_truck_axles: 20,
  default_truck_weight: 7.5,
  default_trailer_axles: 30,
  default_trailer_weight: 11.5,
  supabase_url: 'https://jfhmarmaebrzdnsvkqzv.supabase.co',
  supabase_anon_key: 'sb_publishable_8PP8MB6X56rGXiSzKFlP4g_n9MM-8gm',
  admin_pin: '1234',
};

export const initialUsers: ManagedUser[] = [
  {
    id: 'u-admin',
    username: 'admin',
    password: 'admin123',
    name: 'المدير العام (أدمن المنظومة)',
    role: 'admin',
    pin_code: '1234',
    is_active: true,
    created_at: new Date().toISOString(),
    permissions: {
      can_view_financials: true,
      can_view_system_revenue: true,
      can_add_movements: true,
      can_edit_movements: true,
      can_delete_movements: true,
      can_upload_sheets: true,
      can_export_excel: true,
      can_manage_customers: true,
      can_delete_customers: true,
      can_manage_payments: true,
      can_manage_berths: true,
      can_edit_commissions: true,
    },
  },
  {
    id: 'u-accountant',
    username: 'accountant',
    password: 'acc123',
    name: 'المحاسب المالي',
    role: 'accountant',
    pin_code: '2233',
    is_active: true,
    created_at: new Date().toISOString(),
    permissions: {
      can_view_financials: true,
      can_view_system_revenue: false, // الأدمن يتحكم فيها
      can_add_movements: true,
      can_edit_movements: true,
      can_delete_movements: false,
      can_upload_sheets: true,
      can_export_excel: true,
      can_manage_customers: true,
      can_delete_customers: false,
      can_manage_payments: true,
      can_manage_berths: false,
      can_edit_commissions: false,
    },
  },
  {
    id: 'u-dataentry',
    username: 'dataentry',
    password: 'entry123',
    name: 'مدخل بيانات الشاحنات',
    role: 'data_entry',
    pin_code: '1122',
    is_active: true,
    created_at: new Date().toISOString(),
    permissions: {
      can_view_financials: false, // محجوب عنه الحسابات وفواتير الكاشير نهائياً
      can_view_system_revenue: false,
      can_add_movements: true,
      can_edit_movements: false,
      can_delete_movements: false,
      can_upload_sheets: true,
      can_export_excel: true,
      can_manage_customers: false,
      can_delete_customers: false,
      can_manage_payments: false,
      can_manage_berths: false,
      can_edit_commissions: false,
    },
  },
];

export const initialBerths: Berth[] = [
  {
    id: 'b-1',
    code: 'B-01',
    name: 'رصيف الحاويات 1',
    description: 'رصيف الشحن والتفريغ السريع',
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'b-2',
    code: 'B-02',
    name: 'رصيف البضائع العامة 2',
    description: 'رصيف الشاحنات والمقطورات الثقيلة',
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'b-3',
    code: 'B-03',
    name: 'رصيف الصادرات 3',
    description: 'رصيف التصدير والجمارك المباشر',
    is_active: true,
    created_at: new Date().toISOString(),
  },
];

export const initialCustomers: Customer[] = [];

// قاعدة بيانات الحركات فارغة — العميل هو الذي يبدأ الإدخال
export const initialMovements: Movement[] = [];
