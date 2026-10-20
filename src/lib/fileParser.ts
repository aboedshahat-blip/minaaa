import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import { Movement } from '../types';

// Configure pdfjs worker for Vite
if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  } catch (e) {
    // Fallback CDN if worker bundling fails in certain environments
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }
}

export interface ParsedDocumentResult {
  rows: Partial<Movement>[];
  headers: string[];
  rawRowCount: number;
  fileType: 'excel' | 'word' | 'pdf';
}

/**
 * Intelligent field matcher for Arabic synonyms
 */
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

/**
 * Converts a 2D array of string cells (from Word/PDF/CSV) into Movement objects
 */
export const matrixToMovements = (matrix: string[][]): {
  rows: Partial<Movement>[];
  headers: string[];
  rawRowCount: number;
} => {
  if (!matrix || matrix.length === 0) {
    return { rows: [], headers: [], rawRowCount: 0 };
  }

  // Filter out rows that are entirely empty
  const nonEmptyRows = matrix.filter((r) => r.some((c) => c && c.trim().length > 0));
  if (nonEmptyRows.length === 0) {
    return { rows: [], headers: [], rawRowCount: 0 };
  }

  // Check if first row contains column headers
  const firstRow = nonEmptyRows[0];
  const headerKeywords = ['شاحن', 'مقطور', 'حاوي', 'اقرار', 'سائق', 'كاشير', 'مسار', 'وزن', 'محاور', 'truck', 'driver', 'trailer'];
  const isHeaderRow = firstRow.some((cell) =>
    headerKeywords.some((kw) => cell.toLowerCase().includes(kw))
  );

  let headers: string[] = [];
  let dataRows: string[][] = [];

  if (isHeaderRow) {
    headers = firstRow.map((c, i) => c.trim() || `عمود ${i + 1}`);
    dataRows = nonEmptyRows.slice(1);
  } else {
    // Check if first row has 12 columns with standard template structure
    headers = [
      'مسار الحاوية',
      'وصف الحاوية',
      'رقم الحاوية',
      'رقم الاقرار',
      'اسم السائق',
      'محاور المقطورة',
      'وزن المقطورة',
      'رقم المقطورة',
      'محاور الشاحنة',
      'وزن الشاحنة',
      'رقم الشاحنة',
      'م',
    ];
    dataRows = nonEmptyRows;
  }

  // Map data rows to Movement objects
  const parsedMovements: Partial<Movement>[] = dataRows.map((rowArr, rowIndex) => {
    // If we have recognized header mapping:
    if (isHeaderRow) {
      const rowObj: Record<string, any> = {};
      headers.forEach((h, i) => {
        rowObj[h] = rowArr[i] || '';
      });

      const truck_no = String(findField(rowObj, ['رقم الشاحنة', 'الشاحنة', 'السيارة', 'truck', 'car_no']) || '').trim();
      const trailer_no = String(findField(rowObj, ['رقم المقطورة', 'المقطورة', 'trailer']) || '').trim();
      const driver_name = String(findField(rowObj, ['اسم السائق', 'السائق', 'driver']) || '').trim();
      const declaration_no = String(findField(rowObj, ['رقم الاقرار', 'الاقرار', 'declaration', 'dec']) || '').trim();
      const container_no = String(findField(rowObj, ['رقم الحاوية', 'الحاوية', 'container']) || '').trim();
      const container_desc = String(findField(rowObj, ['وصف الحاوية', 'الوصف', 'desc', 'description']) || '').trim();
      const container_path = String(findField(rowObj, ['مسار الحاوية', 'مسار', 'path', 'gate', 'بوابة']) || '').trim();
      const cashier_invoice = Number(findField(rowObj, ['فاتورة كاشير', 'كاشير', 'فاتورة', 'cashier', 'invoice']) || 0);

      const truck_weight = Number(findField(rowObj, ['وزن الشاحنة', 'وزن السيارة']) || 7.5);
      const truck_axles = Number(findField(rowObj, ['محاور الشاحنة', 'محاور السيارة']) || 20);
      const trailer_weight = Number(findField(rowObj, ['وزن المقطورة']) || 11.5);
      const trailer_axles = Number(findField(rowObj, ['محاور المقطورة']) || 30);
      const seq = Number(findField(rowObj, ['م', 'مسلسل', 'seq', 'no', 'id']) || (rowIndex + 1));

      return {
        seq: isNaN(seq) ? rowIndex + 1 : seq,
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
    }

    // Positional mapping for 10-12 columns (Official Port Template)
    // Check if col 11 is sequence (RTL: مسار الحاوية in 0, seq in 11)
    // Or col 0 is sequence (LTR: seq in 0, truck in 1)
    const isCol11Seq = !isNaN(Number(rowArr[11])) && Number(rowArr[11]) > 0;
    const isCol0Seq = !isNaN(Number(rowArr[0])) && Number(rowArr[0]) > 0 && isNaN(Number(rowArr[11]));

    if (isCol11Seq || rowArr.length >= 10) {
      // RTL Standard Template:
      // 0: مسار الحاوية, 1: وصف الحاوية, 2: رقم الحاوية, 3: رقم الاقرار, 4: اسم السائق,
      // 5: محاور المقطورة, 6: وزن المقطورة, 7: رقم المقطورة, 8: محاور الشاحنة,
      // 9: وزن الشاحنة, 10: رقم الشاحنة, 11: م
      const container_path = (rowArr[0] || '').trim();
      const container_desc = (rowArr[1] || '').trim();
      const container_no = (rowArr[2] || '').trim();
      const declaration_no = (rowArr[3] || '').trim();
      const driver_name = (rowArr[4] || '').trim();
      const trailer_axles = Number(rowArr[5]) || 30;
      const trailer_weight = Number(rowArr[6]) || 11.5;
      const trailer_no = (rowArr[7] || '').trim();
      const truck_axles = Number(rowArr[8]) || 20;
      const truck_weight = Number(rowArr[9]) || 7.5;
      const truck_no = (rowArr[10] || '').trim();
      const seq = Number(rowArr[11]) || (rowIndex + 1);

      return {
        seq,
        truck_no,
        truck_weight,
        truck_axles,
        trailer_no,
        trailer_weight,
        trailer_axles,
        driver_name,
        declaration_no,
        container_no,
        container_desc,
        container_path,
        cashier_invoice: 0,
      };
    } else if (isCol0Seq) {
      // LTR Template:
      // 0: م, 1: رقم الشاحنة, 2: وزن الشاحنة, 3: محاور الشاحنة, 4: رقم المقطورة,
      // 5: وزن المقطورة, 6: محاور المقطورة, 7: اسم السائق, 8: رقم الاقرار,
      // 9: رقم الحاوية, 10: وصف الحاوية, 11: مسار الحاوية
      const seq = Number(rowArr[0]) || (rowIndex + 1);
      const truck_no = (rowArr[1] || '').trim();
      const truck_weight = Number(rowArr[2]) || 7.5;
      const truck_axles = Number(rowArr[3]) || 20;
      const trailer_no = (rowArr[4] || '').trim();
      const trailer_weight = Number(rowArr[5]) || 11.5;
      const trailer_axles = Number(rowArr[6]) || 30;
      const driver_name = (rowArr[7] || '').trim();
      const declaration_no = (rowArr[8] || '').trim();
      const container_no = (rowArr[9] || '').trim();
      const container_desc = (rowArr[10] || '').trim();
      const container_path = (rowArr[11] || '').trim();

      return {
        seq,
        truck_no,
        truck_weight,
        truck_axles,
        trailer_no,
        trailer_weight,
        trailer_axles,
        driver_name,
        declaration_no,
        container_no,
        container_desc,
        container_path,
        cashier_invoice: 0,
      };
    }

    // Generic fallback mapping
    return {
      seq: rowIndex + 1,
      truck_no: rowArr[0] || '',
      trailer_no: rowArr[1] || '',
      driver_name: rowArr[2] || '',
      container_no: rowArr[3] || '',
      declaration_no: rowArr[4] || '',
      truck_weight: 7.5,
      truck_axles: 20,
      trailer_weight: 11.5,
      trailer_axles: 30,
      cashier_invoice: 0,
    };
  });

  // Filter out rows that are completely empty
  const cleanedRows = parsedMovements.filter(
    (r) => r.truck_no || r.container_no || r.driver_name || r.declaration_no || (r.seq && r.seq > 0)
  );

  return {
    rows: cleanedRows.length > 0 ? cleanedRows : parsedMovements,
    headers,
    rawRowCount: dataRows.length,
  };
};

/**
 * Extracts data from Word document (.docx) using mammoth
 */
export const parseWordDocument = async (file: File): Promise<ParsedDocumentResult> => {
  const arrayBuffer = await file.arrayBuffer();
  const conversionResult = await mammoth.convertToHtml({ arrayBuffer });
  const html = conversionResult.value;

  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const table = doc.querySelector('table');

    if (table) {
      const matrix: string[][] = [];
      const trElements = table.querySelectorAll('tr');

      trElements.forEach((tr) => {
        const rowCells: string[] = [];
        const tdElements = tr.querySelectorAll('td, th');
        tdElements.forEach((td) => {
          rowCells.push((td.textContent || '').trim());
        });
        if (rowCells.some((c) => c.length > 0)) {
          matrix.push(rowCells);
        }
      });

      const { rows, headers, rawRowCount } = matrixToMovements(matrix);
      return {
        rows,
        headers,
        rawRowCount,
        fileType: 'word',
      };
    }

    // Fallback: parse paragraphs if no HTML table exists
    const pElements = doc.querySelectorAll('p');
    const matrix: string[][] = [];
    pElements.forEach((p) => {
      const text = (p.textContent || '').trim();
      if (text) {
        // Check for tab or comma separated values
        const cells = text.includes('\t')
          ? text.split('\t').map((c) => c.trim())
          : text.includes(',')
          ? text.split(',').map((c) => c.trim())
          : text.split(/\s{2,}/).map((c) => c.trim());
        matrix.push(cells);
      }
    });

    const { rows, headers, rawRowCount } = matrixToMovements(matrix);
    return {
      rows,
      headers,
      rawRowCount,
      fileType: 'word',
    };
  }

  throw new Error('DOMParser غير مدعوم في هذه البيئة');
};

/**
 * Extracts tabular data from PDF using pdfjs-dist
 */
export const parsePdfDocument = async (file: File): Promise<ParsedDocumentResult> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const allLines: { y: number; x: number; text: string }[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    content.items.forEach((item: any) => {
      if ('str' in item && item.str.trim().length > 0) {
        allLines.push({
          y: Math.round(item.transform[5]), // Vertical coordinate
          x: Math.round(item.transform[4]), // Horizontal coordinate
          text: item.str.trim(),
        });
      }
    });
  }

  // Group items by vertical proximity (lines with y within 5px)
  const groupedByY: { y: number; items: { x: number; text: string }[] }[] = [];

  // Sort descending by Y (PDF coordinates usually have (0,0) at bottom-left)
  allLines.sort((a, b) => b.y - a.y);

  allLines.forEach((item) => {
    const existingGroup = groupedByY.find((g) => Math.abs(g.y - item.y) <= 6);
    if (existingGroup) {
      existingGroup.items.push({ x: item.x, text: item.text });
    } else {
      groupedByY.push({ y: item.y, items: [{ x: item.x, text: item.text }] });
    }
  });

  // Construct matrix from lines
  const matrix: string[][] = groupedByY.map((group) => {
    // Sort items left-to-right (ascending x)
    group.items.sort((a, b) => a.x - b.x);
    return group.items.map((i) => i.text);
  });

  const { rows, headers, rawRowCount } = matrixToMovements(matrix);
  return {
    rows,
    headers,
    rawRowCount,
    fileType: 'pdf',
  };
};

/**
 * Parses Excel files (.xlsx, .xls, .csv)
 */
export const parseExcelDocument = async (file: File): Promise<ParsedDocumentResult> => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Convert sheet to 2D array of string cells to handle irregular or standard templates identically
  const matrix = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, defval: '' });
  const { rows, headers, rawRowCount } = matrixToMovements(matrix as string[][]);

  return {
    rows,
    headers,
    rawRowCount,
    fileType: 'excel',
  };
};

/**
 * Universal Document Parser:
 * Automatically identifies file extension and parses Excel, Word, or PDF into standard 12-column template movements!
 */
export const parseAnyDocument = async (file: File): Promise<ParsedDocumentResult> => {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    return parseExcelDocument(file);
  } else if (['docx', 'doc'].includes(ext)) {
    return parseWordDocument(file);
  } else if (['pdf'].includes(ext)) {
    return parsePdfDocument(file);
  } else {
    // Attempt Excel reader as fallback
    try {
      return await parseExcelDocument(file);
    } catch {
      throw new Error(`صيغة الملف غير مدعومة (.${ext}). يرجى رفع ملف Excel أو Word أو PDF.`);
    }
  }
};
