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

// Common Arabic names in logistics manifests
const COMMON_ARABIC_NAMES = [
  'احمد', 'أحمد', 'محمد', 'محمود', 'علي', 'حسن', 'حسين', 'سعيد',
  'حمد', 'عبد', 'الحسيب', 'ابراهيم', 'إبراهيم', 'مصطفى', 'عمر',
  'خالد', 'طارق', 'ياسر', 'شريف', 'رمضان', 'عادل', 'سامح', 'سيد',
  'صلاح', 'عاطف', 'فتحي', 'مجدي', 'جمال', 'اشرف', 'أشرف', 'كمال'
];

// Header & noise keywords that indicate a table title / header row
const HEADER_KEYWORDS = [
  'مسار', 'الحاوية', 'الحاويه', 'المقطورة', 'المقطوره', 'الشاحنة', 'الشاحنه',
  'السائق', 'الرخصة', 'الرخصه', 'واقع', 'محاور', 'وزن', 'رقم', 'وصف',
  'إقرار', 'اقرار', 'كشف', 'بيان', 'جمارك', 'صفحة', 'مسلسل', 'ملاحظات'
];

/**
 * Checks if a row is a header row, table title, or page break divider
 */
export const isHeaderOrTitleRow = (cells: string[]): boolean => {
  const rowText = cells.join(' ');
  let keywordHits = 0;
  HEADER_KEYWORDS.forEach((kw) => {
    if (rowText.includes(kw)) keywordHits++;
  });

  // If row contains 2 or more header keywords, it is definitely a header row
  if (keywordHits >= 2) return true;

  // Check if mostly noise or dashes
  const validCells = cells.filter((c) => {
    const s = c.trim();
    return s.length > 0 && s !== '-' && s !== '—' && s !== '_' && s !== '.';
  });
  if (validCells.length < 2) return true;

  return false;
};

/**
 * Extracts ISO 6346 container number (e.g., CRXU9281484, TGBU4839349, GCXU5633149)
 */
export const extractContainerNumber = (text: string): string | null => {
  const m = text.match(/\b([A-Z]{3,4}\s*[UJZ]?\s*\d{6,7})\b/i);
  if (m) {
    return m[1].replace(/\s+/g, '').toUpperCase();
  }
  return null;
};

/**
 * Extracts Customs Declaration number (usually 5 to 7 digits, e.g. 510552, 527133, 52226)
 */
export const extractDeclarationNumber = (text: string): string | null => {
  const m = text.match(/\b(5\d{5}|4\d{5}|6\d{5}|5\d{4}|52\d{3}|51\d{3}|50\d{3})\b/);
  if (m) return m[1];

  const generic = text.match(/\b(\d{5,7})\b/);
  if (generic) return generic[1];

  return null;
};

/**
 * Extracts driver name (multi-word Arabic name)
 */
export const extractDriverName = (text: string): string | null => {
  const s = text.trim();
  if (/\d/.test(s) || /[a-zA-Z]/.test(s)) return null;
  if (['وارد', 'صادر', 'ترانزيت', 'فارغ', 'مشحون', 'رصيف', 'بوابة'].includes(s)) return null;

  const words = s.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const hasKnownName = words.some((w) =>
      COMMON_ARABIC_NAMES.some((cn) => w.includes(cn))
    );
    if (hasKnownName || words.length >= 3) {
      return words.join(' ');
    }
  }
  return null;
};

/**
 * Parses a collection of raw text tokens from a row into a Movement object
 */
export const extractMovementFromTokens = (
  tokens: string[],
  seq: number
): Partial<Movement> => {
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
  let cashier_invoice = 0;

  const plateLetters: string[] = [];
  const plateNumbers: string[] = [];
  const unclassifiedTokens: string[] = [];

  tokens.forEach((tok) => {
    const s = String(tok || '').trim();
    if (!s || s === '-' || s === '—' || s === '.') return;

    // 1. Container
    const cCode = extractContainerNumber(s);
    if (cCode && !container_no) {
      container_no = cCode;
      return;
    }

    // 2. Declaration
    const dCode = extractDeclarationNumber(s);
    if (dCode && !declaration_no) {
      declaration_no = dCode;
      return;
    }

    // 3. Driver
    const dName = extractDriverName(s);
    if (dName && !driver_name) {
      driver_name = dName;
      return;
    }

    // 4. Path / Desc
    if (['وارد', 'صادر', 'ترانزيت'].includes(s)) {
      container_path = s;
      container_desc = s;
      return;
    }

    // 5. Plate letters
    if (
      /^[أ-ي\s]{2,8}$/.test(s) &&
      !['وارد', 'صادر', 'ترانزيت', 'الشاحنة', 'المقطورة', 'الرخصة', 'من', 'واقع', 'وزن'].includes(s)
    ) {
      plateLetters.push(s);
      return;
    }

    // 6. Plate numbers
    if (/^\d{3,4}$/.test(s)) {
      plateNumbers.push(s);
      return;
    }

    // 7. Weights and Axles
    if (s === '7.5' || s === '7,5') truck_weight = 7.5;
    else if (s === '11.5' || s === '11,5') trailer_weight = 11.5;
    else if (s === '20') truck_axles = 20;
    else if (s === '30') trailer_axles = 30;
    else {
      unclassifiedTokens.push(s);
    }
  });

  if (plateNumbers.length > 0 && plateLetters.length > 0) {
    truck_no = `${plateNumbers[0]} ${plateLetters[0]}`;
    if (plateNumbers.length > 1) {
      trailer_no = plateNumbers[1] + (plateLetters[1] ? ` ${plateLetters[1]}` : '');
    }
  } else if (plateNumbers.length > 0) {
    truck_no = plateNumbers[0];
    if (plateNumbers.length > 1) {
      trailer_no = plateNumbers[1];
    }
  } else if (plateLetters.length > 0) {
    truck_no = plateLetters[0];
  }

  if (!truck_no && unclassifiedTokens.length > 0) {
    const candidate = unclassifiedTokens.find((t) => /\d/.test(t) && t.length >= 3);
    if (candidate) truck_no = candidate;
  }

  return {
    seq,
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
    cashier_invoice,
  };
};

/**
 * Universal Intelligent Matrix to Movements Processor:
 * Applies entity recognition, filters headers, and merges multi-line split rows!
 */
export const matrixToMovements = (matrix: string[][]): {
  rows: Partial<Movement>[];
  headers: string[];
  rawRowCount: number;
} => {
  if (!matrix || matrix.length === 0) {
    return { rows: [], headers: [], rawRowCount: 0 };
  }

  // 1. Filter out all header, title, and page break rows
  const cleanRows = matrix.filter((row) => !isHeaderOrTitleRow(row));

  if (cleanRows.length === 0) {
    return { rows: [], headers: [], rawRowCount: 0 };
  }

  // 2. Parse each row individually with semantic entity recognition
  const initialMovements = cleanRows.map((r, i) => extractMovementFromTokens(r, i + 1));

  // 3. Smart Multi-line Stitching:
  const consolidatedMovements: Partial<Movement>[] = [];

  for (let i = 0; i < initialMovements.length; i++) {
    const cur = initialMovements[i];
    const nxt = initialMovements[i + 1];

    const curNeedsTruck = !cur.truck_no || cur.truck_no.length < 2;
    const nxtHasTruck = Boolean(nxt && nxt.truck_no && nxt.truck_no.length >= 2);
    const nxtNeedsContainer = Boolean(nxt && !nxt.container_no);

    if (nxt && curNeedsTruck && nxtHasTruck && nxtNeedsContainer) {
      consolidatedMovements.push({
        container_path: cur.container_path || nxt.container_path || 'وارد',
        container_desc: cur.container_desc || nxt.container_desc || 'وارد',
        container_no: cur.container_no || nxt.container_no || '',
        declaration_no: cur.declaration_no || nxt.declaration_no || '',
        driver_name: cur.driver_name || nxt.driver_name || '',
        truck_no: nxt.truck_no || cur.truck_no || '',
        trailer_no: cur.trailer_no || nxt.trailer_no || '',
        truck_weight: cur.truck_weight || 7.5,
        truck_axles: cur.truck_axles || 20,
        trailer_weight: cur.trailer_weight || 11.5,
        trailer_axles: cur.trailer_axles || 30,
        cashier_invoice: cur.cashier_invoice || nxt.cashier_invoice || 0,
      });
      i++; // Skip merged next row
    } else {
      consolidatedMovements.push(cur);
    }
  }

  // 4. Final filter: Keep rows that have at least a container, truck, driver, or declaration
  const validMovements = consolidatedMovements.filter(
    (m) => m.container_no || m.truck_no || m.driver_name || m.declaration_no
  );

  // 5. Re-sequence consecutively (1, 2, 3...)
  const finalMovements = validMovements.map((m, idx) => ({
    ...m,
    seq: idx + 1,
  }));

  const standardHeaders = [
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

  return {
    rows: finalMovements,
    headers: standardHeaders,
    rawRowCount: matrix.length,
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
          y: Math.round(item.transform[5]),
          x: Math.round(item.transform[4]),
          text: item.str.trim(),
        });
      }
    });
  }

  // Group items by vertical proximity (lines with y within 6px)
  const groupedByY: { y: number; items: { x: number; text: string }[] }[] = [];

  // Sort descending by Y (top of page to bottom)
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
    try {
      return await parseExcelDocument(file);
    } catch {
      throw new Error(`صيغة الملف غير مدعومة (.${ext}). يرجى رفع ملف Excel أو Word أو PDF.`);
    }
  }
};
