export type UserRole = 'admin' | 'accountant' | 'data_entry';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
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

  // Financial fields (accessible only to Admin & Accountant)
  cashier_invoice: number; // قيمة فاتورة كاشير
  system_commission: number; // عمولة المنظومة (default 200 or dynamic)
  nafez_commission: number; // عمولة نافذ (إن وجدت)
  total_amount: number; // الإجمالي = فاتورة كاشير + عمولة المنظومة + عمولة نافذ
  
  payment_status: 'unpaid' | 'paid' | 'partial';
  paid_amount: number;
  remaining_amount: number;
  
  notes?: string;
  created_at: string;
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
  created_at: string;
}

export interface SystemSettings {
  default_system_commission: number; // e.g. 200
  default_nafez_commission: number; // e.g. 0
  default_truck_axles: number; // 20
  default_truck_weight: number; // 7.5
  default_trailer_axles: number; // 30
  default_trailer_weight: number; // 11.5
  supabase_url: string;
  supabase_anon_key: string;
}
