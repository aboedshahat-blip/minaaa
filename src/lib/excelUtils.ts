import * as XLSX from 'xlsx';
import { Movement } from '../types';

// The exact 12 columns from the user's sheet template
export const TEMPLATE_COLUMNS = [
  { key: 'container_path', label: 'مسار الحاوية' },
  { key: 'container_desc', label: 'وصف الحاوية' },
  { key: 'container_no', label: 'رقم الحاوية' },
  { key: 'declaration_no', label: 'رقم الاقرار' },
  { key: 'driver_name', label: 'اسم السائق' },
  { key: 'trailer_axles', label: 'محاور المقطورة' },
  { key: 'trailer_weight', label: 'وزن المقطورة من واقع الرخصة' },
  { key: 'trailer_no', label: 'رقم المقطورة' },
  { key: 'truck_axles', label: 'محاور الشاحنة' },
  { key: 'truck_weight', label: 'وزن الشاحنة من واقع الرخصة' },
  { key: 'truck_no', label: 'رقم الشاحنة' },
  { key: 'seq', label: 'م' },
];

/**
 * Exports movements to Excel matching the exact format requested by the user
 */
export const exportTemplateToExcel = (movements: Movement[], fileName = 'كشف_حركات_الشاحنات.xlsx') => {
  // Construct data rows in the exact column order
  const rows = movements.map((m, index) => ({
    'مسار الحاوية': m.container_path || '',
    'وصف الحاوية': m.container_desc || '',
    'رقم الحاوية': m.container_no || '',
    'رقم الاقرار': m.declaration_no || '',
    'اسم السائق': m.driver_name || '',
    'محاور المقطورة': m.trailer_axles ?? 30,
    'وزن المقطورة من واقع الرخصة': m.trailer_weight ?? 11.5,
    'رقم المقطورة': m.trailer_no || '',
    'محاور الشاحنة': m.truck_axles ?? 20,
    'وزن الشاحنة من واقع الرخصة': m.truck_weight ?? 7.5,
    'رقم الشاحنة': m.truck_no || '',
    'م': m.seq ?? (index + 1),
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set column widths for clean presentation
  worksheet['!cols'] = [
    { wch: 25 }, // مسار الحاوية
    { wch: 28 }, // وصف الحاوية
    { wch: 18 }, // رقم الحاوية
    { wch: 16 }, // رقم الاقرار
    { wch: 22 }, // اسم السائق
    { wch: 14 }, // محاور المقطورة
    { wch: 20 }, // وزن المقطورة
    { wch: 16 }, // رقم المقطورة
    { wch: 14 }, // محاور الشاحنة
    { wch: 20 }, // وزن الشاحنة
    { wch: 16 }, // رقم الشاحنة
    { wch: 6 },  // م
  ];

  // Set right-to-left view
  if (!worksheet['!views']) worksheet['!views'] = [];
  worksheet['!views'].push({ rightToLeft: true });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'اسطمبة الحركات');

  XLSX.writeFile(workbook, fileName);
};

/**
 * Generates an empty official template with defaults (like the 100 rows in the user's prompt)
 */
export const downloadEmptyTemplate = (rowCount = 50) => {
  const rows = [];
  for (let i = 1; i <= rowCount; i++) {
    rows.push({
      'مسار الحاوية': '',
      'وصف الحاوية': '',
      'رقم الحاوية': '',
      'رقم الاقرار': '',
      'اسم السائق': '',
      'محاور المقطورة': 30,
      'وزن المقطورة من واقع الرخصة': 11.5,
      'رقم المقطورة': '',
      'محاور الشاحنة': 20,
      'وزن الشاحنة من واقع الرخصة': 7.5,
      'رقم الشاحنة': '',
      'م': i,
    });
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 25 },
    { wch: 25 },
    { wch: 18 },
    { wch: 16 },
    { wch: 22 },
    { wch: 14 },
    { wch: 20 },
    { wch: 16 },
    { wch: 14 },
    { wch: 20 },
    { wch: 16 },
    { wch: 6 },
  ];
  if (!worksheet['!views']) worksheet['!views'] = [];
  worksheet['!views'].push({ rightToLeft: true });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'اسطمبة الحركات الفارغة');
  XLSX.writeFile(workbook, 'اسطمبة_حركات_الشاحنات_فارغة.xlsx');
};

/**
 * Smart Sheet Parser:
 * Reads an uploaded file (.xlsx, .xls, .csv), detects sheet structure,
 * filters header rows, and maps arbitrary columns to our target template!
 */
export const parseUploadedSheet = async (file: File): Promise<{
  rows: Partial<Movement>[];
  headers: string[];
  rawRowCount: number;
}> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
        if (!jsonRows || jsonRows.length === 0) {
          resolve({ rows: [], headers: [], rawRowCount: 0 });
          return;
        }

        const headers = Object.keys(jsonRows[0] || {});

        // Helper to find matching column header by synonyms
        const findField = (row: Record<string, any>, keywords: string[]): any => {
          const keys = Object.keys(row);
          for (const key of keys) {
            const cleanKey = key.trim().toLowerCase();
            if (keywords.some((k) => cleanKey.includes(k.toLowerCase()))) {
              return row[key];
            }
          }
          return undefined;
        };

        const parsed: Partial<Movement>[] = jsonRows.map((row, index) => {
          const truck_no = String(
            findField(row, ['رقم الشاحنة', 'الشاحنة', 'رقم السيارة', 'truck', 'car_no']) || ''
          ).trim();

          const trailer_no = String(
            findField(row, ['رقم المقطورة', 'المقطورة', 'trailer']) || ''
          ).trim();

          const driver_name = String(
            findField(row, ['اسم السائق', 'السائق', 'driver']) || ''
          ).trim();

          const declaration_no = String(
            findField(row, ['رقم الاقرار', 'الاقرار', 'declaration', 'dec']) || ''
          ).trim();

          const container_no = String(
            findField(row, ['رقم الحاوية', 'الحاوية', 'container']) || ''
          ).trim();

          const container_desc = String(
            findField(row, ['وصف الحاوية', 'الوصف', 'desc', 'description']) || ''
          ).trim();

          const container_path = String(
            findField(row, ['مسار الحاوية', 'مسار', 'path', 'gate', 'بوابة']) || ''
          ).trim();

          const cashier_invoice = Number(
            findField(row, ['فاتورة كاشير', 'كاشير', 'فاتورة', 'cashier', 'invoice']) || 0
          );

          const truck_weight = Number(
            findField(row, ['وزن الشاحنة', 'وزن السيارة']) || 7.5
          );

          const truck_axles = Number(
            findField(row, ['محاور الشاحنة', 'محاور السيارة']) || 20
          );

          const trailer_weight = Number(
            findField(row, ['وزن المقطورة']) || 11.5
          );

          const trailer_axles = Number(
            findField(row, ['محاور المقطورة']) || 30
          );

          const seq = Number(
            findField(row, ['م', 'مسلسل', 'seq', 'no', 'id']) || (index + 1)
          );

          return {
            seq,
            truck_no,
            truck_weight: isNaN(truck_weight) ? 7.5 : truck_weight,
            truck_axles: isNaN(truck_axles) ? 20 : truck_axles,
            trailer_no,
            trailer_weight: isNaN(trailer_weight) ? 11.5 : trailer_weight,
            trailer_axles: isNaN(trailer_axles) ? 30 : trailer_axles,
            driver_name,
            declaration_no,
            container_no,
            container_desc,
            container_path,
            cashier_invoice: isNaN(cashier_invoice) ? 0 : cashier_invoice,
          };
        });

        // Filter out completely empty rows
        const cleanedRows = parsed.filter(
          (r) => r.truck_no || r.container_no || r.driver_name || r.declaration_no
        );

        resolve({
          rows: cleanedRows.length > 0 ? cleanedRows : parsed,
          headers,
          rawRowCount: jsonRows.length,
        });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};
