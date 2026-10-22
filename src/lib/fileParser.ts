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
 * Standard 12-column Template Headers
 */
export const STANDARD_HEADERS = [
  'مسار الحاوية',
  'وصف الحاوية',
  'رقم الحاوية',
  'رقم الاقرار',
  'اسم السائق',
  'محاور المقطورة',
  'وزن المقطورة من واقع الرخصة',
  'رقم المقطورة',
  'محاور الشاحنة',
  'وزن الشاحنة من واقع الرخصة',
  'رقم الشاحنة',
  'م',
];

/**
 * Extracts structured movements from PDF documents (Page-by-Page with anchor awareness)
 */
export const parsePdfDocument = async (file: File): Promise<ParsedDocumentResult> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const allMovements: Partial<Movement>[] = [];

  // Iterate strictly page by page so Y coordinates never conflict across pages
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Group items on this single page by vertical Y proximity (within 7px)
    const lineBuckets: { y: number; items: { x: number; str: string; dir?: string }[] }[] = [];

    content.items.forEach((item: any) => {
      const str = (item.str || '').trim();
      if (!str) return;
      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);

      let bucket = lineBuckets.find((b) => Math.abs(b.y - y) <= 7);
      if (!bucket) {
        bucket = { y, items: [] };
        lineBuckets.push(bucket);
      }
      bucket.items.push({ x, str, dir: item.dir });
    });

    // Sort lines top to bottom on this page
    lineBuckets.sort((a, b) => b.y - a.y);

    lineBuckets.forEach((bucket) => {
      // Sort items on the line left to right (by X)
      bucket.items.sort((a, b) => a.x - b.x);
      const rowTokens = bucket.items.map((i) => i.str);
      const lineText = rowTokens.join(' ');

      // Filter out table headers, titles, and metadata
      if (
        lineText.includes('مسار') ||
        lineText.includes('الحاويه') ||
        lineText.includes('الحاوية') ||
        lineText.includes('الرخصة') ||
        lineText.includes('محاور') ||
        lineText.includes('واقع') ||
        lineText.includes('كشف') ||
        lineText.includes('صفحة')
      ) {
        return;
      }

      // Check for ISO container code: 4 letters + 6-7 digits
      const containerIdx = rowTokens.findIndex((t) =>
        /^[A-Z]{3,4}\s*[UJZ]?\s*\d{6,7}$/i.test(t)
      );

      let container_no = '';
      let declaration_no = '';
      let afterDec: string[] = [];
      let afterDecItems: typeof bucket.items = [];

      if (containerIdx !== -1) {
        container_no = rowTokens[containerIdx].replace(/\s+/g, '').toUpperCase();
        if (rowTokens[containerIdx + 1] && /^\d{5,7}$/.test(rowTokens[containerIdx + 1])) {
          declaration_no = rowTokens[containerIdx + 1];
        }
        afterDec = rowTokens.slice(containerIdx + 2);
        afterDecItems = bucket.items.slice(containerIdx + 2);
      } else {
        // Line without container code - check for declaration number (5-7 digits)
        const decIdx = rowTokens.findIndex((t, idx) => idx > 0 && /^\d{5,7}$/.test(t));
        if (decIdx !== -1) {
          declaration_no = rowTokens[decIdx];
          afterDec = rowTokens.slice(decIdx + 1);
          afterDecItems = bucket.items.slice(decIdx + 1);
        } else {
          // Check if line contains truck weight (7.5 or 7,5) and trailer weight (11 or 11.5)
          const hasWeights = rowTokens.some((t) => t === '7.5' || t === '7,5');
          if (hasWeights) {
            afterDec = rowTokens.slice(1);
            afterDecItems = bucket.items.slice(1);
          } else {
            return; // Not a data row
          }
        }
      }

      const container_path = rowTokens[0] === 'وارد' || rowTokens[0] === 'صادر' ? rowTokens[0] : 'وارد';
      const container_desc = container_path;

      // Dynamic weights and axles
      let truck_axles = 20;
      let truck_weight = 7.5;
      let trailer_axles = 30;
      let trailer_weight = 11.5;

      // Find trailer axles index ('30' or '20')
      const axleIdx = afterDec.findIndex((t) => t === '30' || t === '20');
      let driver_name = '';
      if (axleIdx > 0) {
        const driverItems = afterDecItems.slice(0, axleIdx);
        // PDF.js reports Arabic runs as visual fragments. Reorder only the
        // fragments inside the driver cell into right-to-left reading order.
        driver_name = driverItems.length > 1 && driverItems.every((item) => item.dir === 'rtl')
          ? [...driverItems].sort((a, b) => b.x - a.x).map((item) => item.str).join(' ')
          : afterDec.slice(0, axleIdx).join(' ');
        trailer_axles = Number(afterDec[axleIdx]) || 30;
      }

      // Trailer weight index ('11.5', '11,5', or '11')
      const elevenIdx = afterDec.findIndex(
        (t, idx) => (t === '11.5' || t === '11,5' || t === '11') && idx >= axleIdx
      );
      if (elevenIdx !== -1) {
        trailer_weight = Number(afterDec[elevenIdx].replace(',', '.')) || 11.5;
      }

      // Trailer plate is between elevenIdx and truck_axles ('20')
      const truckAxleIdx = afterDec.findIndex(
        (t, idx) => (t === '20' || t === '30') && idx > elevenIdx
      );
      let trailer_no = '';
      if (elevenIdx !== -1 && truckAxleIdx !== -1 && truckAxleIdx > elevenIdx + 1) {
        trailer_no = afterDec.slice(elevenIdx + 1, truckAxleIdx).join(' ');
      }

      // Truck weight ('7.5' or '7,5')
      const sevenIdx = afterDec.findIndex(
        (t, idx) => (t === '7.5' || t === '7,5') && idx >= truckAxleIdx
      );
      if (sevenIdx !== -1) {
        truck_weight = Number(afterDec[sevenIdx].replace(',', '.')) || 7.5;
      }

      // Tokens after '7.5' are the truck plate number and letters
      let truck_no = '';
      if (sevenIdx !== -1 && sevenIdx < afterDec.length - 1) {
        const truckTokens = afterDec
          .slice(sevenIdx + 1)
          .filter((t) => !/^\d{1,2}$/.test(t)); // Filter out sequence number
        truck_no = truckTokens.join(' ');
      }

      allMovements.push({
        seq: allMovements.length + 1,
        container_path,
        container_desc,
        container_no,
        declaration_no,
        driver_name,
        trailer_axles,
        trailer_weight,
        trailer_no,
        truck_axles,
        truck_weight,
        truck_no,
        cashier_invoice: 0,
      });
    });
  }

  return {
    rows: allMovements,
    headers: STANDARD_HEADERS,
    rawRowCount: allMovements.length,
    fileType: 'pdf',
  };
};

/**
 * Universal Matrix Processor for Word tables and Excel sheets
 */
export const matrixToMovements = (matrix: string[][]): {
  rows: Partial<Movement>[];
  headers: string[];
  rawRowCount: number;
} => {
  if (!matrix || matrix.length === 0) {
    return { rows: [], headers: STANDARD_HEADERS, rawRowCount: 0 };
  }

  // When a sheet has headers, use its driver-name column as the source of
  // truth instead of guessing the name from other text in the row.
  const headerRowIndex = matrix.findIndex((row) =>
    row.some((cell) => String(cell || '').replace(/[\s\u0640]/g, '').includes('السائق'))
  );
  const driverNameColumnIndex = headerRowIndex >= 0
    ? matrix[headerRowIndex].findIndex((cell) => String(cell || '').replace(/[\s\u0640]/g, '').includes('السائق'))
    : -1;

  // Filter out header and empty rows
  const cleanRows = matrix.filter((row, rowIndex) => {
    if (rowIndex === headerRowIndex) return false;
    const text = row.join(' ');
    const headerWords = ['مسار', 'الحاوية', 'المقطورة', 'الشاحنة', 'السائق', 'الرخصة', 'واقع', 'محاور', 'وزن', 'رقم'];
    let hits = 0;
    headerWords.forEach((kw) => { if (text.includes(kw)) hits++; });
    if (hits >= 2) return false;
    const nonEmpty = row.filter((c) => c && c.trim() && c.trim() !== '-');
    return nonEmpty.length >= 2;
  });

  const parsedMovements: Partial<Movement>[] = cleanRows.map((tokens, idx) => {
    let container_no = '';
    let declaration_no = '';
    let driver_name = '';
    let truck_no = '';
    let trailer_no = '';
    let container_path = 'وارد';
    let container_desc = 'وارد';
    let truck_weight = 7.5;
    let truck_axles = 20;
    let trailer_weight = 11.5;
    let trailer_axles = 30;

    const plateLetters: string[] = [];
    const plateNumbers: string[] = [];

    tokens.forEach((tok, columnIndex) => {
      const s = String(tok || '').trim();
      if (!s || s === '-' || s === '—') return;

      if (columnIndex === driverNameColumnIndex) {
        driver_name = s;
        return;
      }

      // Container code
      const cMatch = s.match(/[A-Z]{3,4}\s*[UJZ]?\s*\d{6,7}/i);
      if (cMatch && !container_no) {
        container_no = cMatch[0].replace(/\s+/g, '').toUpperCase();
        return;
      }

      // Declaration code
      const dMatch = s.match(/\b(5\d{5}|4\d{5}|6\d{5}|5\d{4}|52\d{3}|51\d{3})\b/);
      if (dMatch && !declaration_no) {
        declaration_no = dMatch[0];
        return;
      }

      // Driver name
      if (!/\d/.test(s) && !['وارد', 'صادر', 'ترانزيت', 'الشاحنة', 'المقطورة'].includes(s)) {
        const words = s.split(/\s+/).filter(Boolean);
        if (words.length >= 2 && !driver_name) {
          driver_name = s;
          return;
        }
      }

      // Plate letters
      if (/^[أ-ي\s]{2,8}$/.test(s) && !['وارد', 'صادر', 'ترانزيت', 'الرخصة', 'واقع', 'وزن', 'من'].includes(s)) {
        plateLetters.push(s);
        return;
      }

      // Plate numbers
      if (/^\d{3,4}$/.test(s)) {
        plateNumbers.push(s);
        return;
      }

      if (['وارد', 'صادر', 'ترانزيت'].includes(s)) {
        container_path = s;
        container_desc = s;
      }
    });

    if (plateNumbers.length > 0 && plateLetters.length > 0) {
      truck_no = `${plateNumbers[0]} ${plateLetters[0]}`;
      if (plateNumbers.length > 1) {
        trailer_no = plateNumbers[1] + (plateLetters[1] ? ` ${plateLetters[1]}` : '');
      }
    } else if (plateNumbers.length > 0) {
      truck_no = plateNumbers[0];
      if (plateNumbers.length > 1) trailer_no = plateNumbers[1];
    } else if (plateLetters.length > 0) {
      truck_no = plateLetters[0];
    }

    return {
      seq: idx + 1,
      container_path,
      container_desc,
      container_no,
      declaration_no,
      driver_name,
      trailer_axles,
      trailer_weight,
      trailer_no,
      truck_axles,
      truck_weight,
      truck_no,
      cashier_invoice: 0,
    };
  });

  return {
    rows: parsedMovements.filter((m) => m.container_no || m.truck_no),
    headers: STANDARD_HEADERS,
    rawRowCount: cleanRows.length,
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
  }

  throw new Error('لم يتم العثور على جدول حركات صالح في مستند الوورد');
};

/**
 * Parses Excel files (.xlsx, .xls, .csv)
 */
export const parseExcelDocument = async (file: File): Promise<ParsedDocumentResult> => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

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
 * Universal Document Parser
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
    try {
      return await parseExcelDocument(file);
    } catch {
      throw new Error(`صيغة الملف غير مدعومة (.${ext}). يرجى رفع ملف Excel أو Word أو PDF.`);
    }
  }
};
