import type { Movement } from '../types';

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
export const exportTemplateToExcel = async (movements: Movement[], fileName = 'كشف_حركات_الشاحنات.xlsx') => {
  const XLSX = await import('xlsx');
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
export const downloadEmptyTemplate = async (rowCount = 50) => {
  const XLSX = await import('xlsx');
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
 * Smart Document Parser:
 * Supports Excel (.xlsx, .xls, .csv), Word (.docx, .doc), and PDF (.pdf).
 * Reads the uploaded document, detects structure, and maps columns to our 12-column template!
 */
export const parseUploadedSheet = async (file: File): Promise<{
  rows: Partial<Movement>[];
  headers: string[];
  rawRowCount: number;
  fileType?: string;
  needsDriverReview?: boolean;
}> => {
  const { parseAnyDocument } = await import('./fileParser');
  return parseAnyDocument(file);
};
