import { Customer, Berth, Movement, SystemSettings } from '../types';

export const initialSettings: SystemSettings = {
  default_system_commission: 200,
  default_inbound_commission: 200,
  default_outbound_commission: 200,
  default_empty_commission: 200,
  default_nafez_commission: 50,
  default_truck_axles: 20,
  default_truck_weight: 7.5,
  default_trailer_axles: 30,
  default_trailer_weight: 11.5,
  supabase_url: 'https://jfhmarmaebrzdnsvkqzv.supabase.co',
  supabase_anon_key: 'sb_publishable_8PP8MB6X56rGXiSzKFlP4g_n9MM-8gm',
  admin_pin: '1234',
};

// User accounts and passwords are managed by Supabase Auth, never hard-coded here.

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
