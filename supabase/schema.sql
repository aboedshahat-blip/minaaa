-- ====================================================================
-- منظومة إدارة النقل والميناء وحركات الشاحنات والحسابات
-- Port Logistics, Movements, Accounting & Billing System Schema
-- Supabase Project: jfhmarmaebrzdnsvkqzv
-- ====================================================================

-- 1. جدول أرصفة الميناء (Berths / Docks)
CREATE TABLE IF NOT EXISTS berths (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. جدول تكويد العملاء (Customers / Clients)
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  trucks JSONB DEFAULT '[]'::jsonb, -- أسطول السيارات التابع لكل عميل
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. جدول حركات الشاحنات والحاويات (Movements - مطابق لاسطمبة الشيت الرسمية)
CREATE TABLE IF NOT EXISTS movements (
  id TEXT PRIMARY KEY,
  seq BIGINT, -- مسلسل
  movement_date DATE NOT NULL,
  berth_id TEXT REFERENCES berths(id) ON DELETE SET NULL,
  berth_name TEXT,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_code TEXT,
  customer_name TEXT,

  -- بيانات الاسطمبة الرسمية
  truck_no TEXT NOT NULL,                  -- رقم الشاحنة
  truck_weight NUMERIC DEFAULT 7.5,        -- وزن الشاحنة من واقع الرخصة
  truck_axles NUMERIC DEFAULT 20,          -- محاور الشاحنة
  trailer_no TEXT,                         -- رقم المقطورة
  trailer_weight NUMERIC DEFAULT 11.5,     -- وزن المقطورة من واقع الرخصة
  trailer_axles NUMERIC DEFAULT 30,        -- محاور المقطورة
  driver_name TEXT,                        -- اسم السائق
  declaration_no TEXT,                     -- رقم الاقرار
  container_no TEXT,                       -- رقم الحاوية
  container_desc TEXT,                     -- وصف الحاوية
  container_path TEXT,                     -- مسار الحاوية

  -- الحسابات والعمولات
  cashier_invoice NUMERIC DEFAULT 0,       -- قيمة فاتورة كاشير
  cashier_receipt_no TEXT,                 -- مسلسل فاتورة الكاشير
  booking_category TEXT,                   -- تصنيف الحجز
  system_commission NUMERIC DEFAULT 200,   -- عمولة المنظومة (متغيرة، الافتراضي 200)
  nafez_commission NUMERIC DEFAULT 0,      -- عمولة نافذ (إن وجدت)
  discount NUMERIC DEFAULT 0,              -- الخصم الممنوح للعميل
  total_amount NUMERIC DEFAULT 200,        -- الإجمالي = كاشير + عمولة منظومة + نافذ
  
  -- المديونية والسداد
  payment_status TEXT DEFAULT 'unpaid',    -- 'paid', 'unpaid', 'partial'
  paid_amount NUMERIC DEFAULT 0,           -- المبلغ المدفوع
  remaining_amount NUMERIC DEFAULT 200,    -- المبلغ المتبقي على العميل
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. جدول سندات القبض والدفعات المالية (Payments / Receipts)
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  receipt_no TEXT NOT NULL UNIQUE,
  date DATE NOT NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  payment_method TEXT DEFAULT 'cash',      -- cash, bank_transfer, check
  notes TEXT,
  movement_ids JSONB DEFAULT '[]'::jsonb,  -- الحركات التي تم تسويتها وخصمها
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. جدول إعدادات النظام والعمولات (System Settings)
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- إدراج القيم الافتراضية
INSERT INTO system_settings (key, value) VALUES
('commissions', '{
  "default_system_commission": 200,
  "default_nafez_commission": 0,
  "default_truck_axles": 20,
  "default_truck_weight": 7.5,
  "default_trailer_axles": 30,
  "default_trailer_weight": 11.5
}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- بيانات أولية تجريبية للأرصفة
INSERT INTO berths (id, code, name, description, is_active) VALUES
('b-1', 'B-01', 'رصيف الحاويات 1', 'رصيف الشحن والتفريغ السريع', true),
('b-2', 'B-02', 'رصيف البضائع العامة 2', 'رصيف الشاحنات والمقطورات الثقيلة', true),
('b-3', 'B-03', 'رصيف الصادرات 3', 'رصيف التصدير والجمارك المباشر', true)
ON CONFLICT (id) DO NOTHING;

-- تفعيل Row Level Security (RLS)
ALTER TABLE berths ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- سياسات الوصول الافتراضية (قراءة وكتابة للمصادقين والمفتاح العام)
CREATE POLICY "Public Read Access Berths" ON berths FOR SELECT USING (true);
CREATE POLICY "Public Insert Access Berths" ON berths FOR ALL USING (true);

CREATE POLICY "Public Read Access Customers" ON customers FOR SELECT USING (true);
CREATE POLICY "Public Insert Access Customers" ON customers FOR ALL USING (true);

CREATE POLICY "Public Read Access Movements" ON movements FOR SELECT USING (true);
CREATE POLICY "Public Insert Access Movements" ON movements FOR ALL USING (true);

CREATE POLICY "Public Read Access Payments" ON payments FOR SELECT USING (true);
CREATE POLICY "Public Insert Access Payments" ON payments FOR ALL USING (true);
