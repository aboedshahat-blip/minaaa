export type UserRole = 'admin' | 'accountant' | 'data_entry';

export interface RolePermissions {
  can_view_financials: boolean;       // رؤية فواتير الكاشير ومجاميع التكاليف
  can_view_system_revenue: boolean;   // رؤية حساب أرباح وعمولات المنظومة
  can_add_movements: boolean;         // تسجيل حركات جديدة
  can_edit_movements: boolean;        // تعديل حركات سابقة
  can_delete_movements: boolean;      // حذف حركات
  can_upload_sheets: boolean;         // رفع وتصفية شيتات إكسيل
  can_export_excel: boolean;          // تصدير كشوفات الإكسيل
  can_manage_customers: boolean;      // إضافة وتعديل العملاء وعربياتهم
  can_delete_customers: boolean;      // حذف العملاء
  can_manage_payments: boolean;       // تسجيل سندات القبض والتحصيل
  can_manage_berths: boolean;         // إضافة وتعديل أرصفة الميناء
  can_edit_commissions: boolean;      // تعديل عمولات المنظومة ونافذ
}

export interface ManagedUser {
  id: string;
  email?: string;
  username: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  permissions: RolePermissions;
  created_at: string;
}

export interface CustomerTruck {
  truck_no: string;
  trailer_no?: string;
  driver_name?: string;
}

export interface Customer {
  id: string;
  code: string; // e.g. C-101
  name: string; // اسم العميل / الشركة
  phone: string;
  email?: string;
  trucks: CustomerTruck[];
  created_at: string;
  notes?: string;
  /** Default per-movement fees for this customer; snapshot onto each new movement. */
  system_commission?: number;
  nafez_commission?: number;
}

export interface Berth {
  id: string;
  code: string; // e.g. B-01
  name: string; // اسم الرصيف (مثل: رصيف 1، رصيف الحاويات الرئيسي)
  description?: string;
  is_active: boolean;
  created_at: string;
}

export interface Movement {
  id: string;
  seq: number; // مسلسل
  movement_date: string; // YYYY-MM-DD
  berth_id?: string;
  berth_name: string; // الرصيف
  customer_id?: string;
  customer_code?: string;
  customer_name: string; // العميل
  
  // Exact template columns (Arabic names matching table)
  truck_no: string; // رقم الشاحنة
  truck_weight: number; // وزن الشاحنة من واقع الرخصة (default 7.5)
  truck_axles: number; // محاور الشاحنة (default 20)
  trailer_no: string; // رقم المقطورة
  trailer_weight: number; // وزن المقطورة من واقع الرخصة (default 11.5)
  trailer_axles: number; // محاور المقطورة (default 30)
  driver_name: string; // اسم السائق
  declaration_no: string; // رقم الاقرار
  container_no: string; // رقم الحاوية
  container_desc: string; // وصف الحاوية
  container_path: string; // مسار الحاوية

  // Financial fields
  cashier_invoice: number; // قيمة فاتورة كاشير
  cashier_receipt_no?: string; // مسلسل فاتورة الكاشير (e.g. 0047-01-1/01-261021)
  booking_category?: string; // تصنيف الحجز (تعتيق حاوية فارغة / وارد حاويات / صادر)
  system_commission: number; // عمولة المنظومة (default 200 or dynamic)
  nafez_commission: number; // عمولة نافذ (إن وجدت)
  discount?: number; // قيمة الخصم الممنوح للعميل على هذه الحركة
  total_amount: number; // الإجمالي = فاتورة كاشير + عمولة المنظومة + عمولة نافذ - الخصم
  
  payment_status: 'unpaid' | 'paid' | 'partial';
  paid_amount: number;
  remaining_amount: number;
  customer_paid_amount?: number;
  
  notes?: string;
  created_at: string;
  /** Upload batch metadata is stored inside notes for compatibility with existing cloud schema. */
  import_batch_id?: string;
  import_batch_name?: string;
  import_batch_at?: string;
}

export interface PaymentReceipt {
  id: string;
  receipt_no: string;
  date: string;
  customer_id: string;
  customer_name: string;
  amount: number;
  payment_method: 'cash' | 'bank_transfer' | 'check' | 'other';
  notes?: string;
  movement_ids?: string[]; // Movements settled by this payment
  payment_type?: 'collection' | 'advance';
  unallocated_amount?: number;
  created_at: string;
}

export interface OfficeExpense {
  id: string;
  expense_date: string;
  amount: number;
  category: string;
  payee?: string;
  payment_method: PaymentReceipt['payment_method'];
  description?: string;
  receipt_path?: string;
  receipt_name?: string;
  created_at: string;
  created_by: string;
  created_by_name: string;
}

export interface SystemSettings {
  default_system_commission: number; // e.g. 200
  default_inbound_commission?: number;
  default_outbound_commission?: number;
  default_empty_commission?: number;
  default_nafez_commission: number; // e.g. 0
  default_truck_axles: number; // 20
  default_truck_weight: number; // 7.5
  default_trailer_axles: number; // 30
  default_trailer_weight: number; // 11.5
  supabase_url: string;
  supabase_anon_key: string;
  admin_pin: string; // رمز حماية لوحة تحكم الأدمن
}
