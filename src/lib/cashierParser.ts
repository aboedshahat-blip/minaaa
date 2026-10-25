import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';
import { pdfjsLib } from './pdfjs';
import { Movement } from '../types';

export interface CashierInvoiceEntry {
  receipt_no: string;          // مسلسل الفاتورة (e.g. 0047-01-1/01-261021)
  raw_vehicle_str: string;     // e.g. د س ى - 2312 - أحمر / د ن ر - 3597 - أحمر
  truck_no: string;            // e.g. د س ى 2312
  truck_digits: string;        // 2312
  truck_letters: string;       // د س ى
  trailer_no: string;          // e.g. د ن ر 3597
  trailer_digits: string;      // 3597
  trailer_letters: string;     // د ن ر
  booking_category: string;    // e.g. وارد حاويات / تعتيق حاوية فارغة
  amount: number;              // e.g. 24.25
}

export interface CashierMatchResult {
  movementId: string;
  movementSeq: number;
  truckNo: string;
  driverName: string;
  containerNo: string;
  oldCashierInvoice: number;
  newCashierInvoice: number;
  cashierReceiptNo: string;
  bookingCategory: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
}

export interface CashierMovementCandidate {
  movementId: string;
  movementSeq: number;
  customerName: string;
  driverName: string;
  truckNo: string;
  trailerNo: string;
  containerNo: string;
  movementDate: string;
  exactPair: boolean;
  isCurrentOwner: boolean;
}

export interface CashierEntryCandidateSet {
  entry: CashierInvoiceEntry;
  candidates: CashierMovementCandidate[];
  currentMovementId: string;
  suggestedMovementId: string;
}

/**
 * Normalizes Arabic text by unifying hamzas, taa marbuta, and removing extra symbols.
 */
export const normalizeArabic = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[-_.,/\\()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const normalizeNumerals = (text: string): string => text.replace(/[٠-٩۰-۹]/g, (digit) => {
  const index = '٠١٢٣٤٥٦٧٨٩'.indexOf(digit);
  return String(index >= 0 ? index : '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit));
});

const getReceiptDate = (receiptNo: string): number | null => {
  const match = receiptNo.match(/(\d{2})(\d{2})(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const time = Date.UTC(2000 + Number(year), Number(month) - 1, Number(day));
  const date = new Date(time);
  return date.getUTCFullYear() === 2000 + Number(year) &&
    date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day)
    ? time
    : null;
};

const getMovementDate = (movementDate: string): number | null => {
  const match = movementDate?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  const time = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const date = new Date(time);
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day)
    ? time
    : null;
};

/**
 * Extracts clean 3-4 digits for Egyptian vehicle license plates.
 */
export const extractPlateDigits = (text: string): string => {
  if (!text) return '';
  const westernDigits = normalizeNumerals(text);
  // Look for 3 or 4 digit plate numbers first
  const match = westernDigits.match(/\b\d{3,4}\b/);
  if (match) return match[0];
  return westernDigits.replace(/\D/g, '');
};

const extractAllPlateDigits = (text: string): string[] => {
  if (!text) return [];
  const westernDigits = normalizeNumerals(text);
  const delimitedPlates = Array.from(westernDigits.matchAll(/[-–—]\s*(\d{3,4})\s*[-–—]/g), (match) => match[1]);
  if (delimitedPlates.length > 0) return Array.from(new Set(delimitedPlates));
  return Array.from(new Set(westernDigits.match(/\b\d{3,4}\b/g) || []));
};

/**
 * Extracts clean digits from a string.
 */
export const extractDigits = (text: string): string => {
  return extractPlateDigits(text);
};

const normalizePlateSignature = (digits: string, letters: string): string => {
  const normalizedDigits = normalizeNumerals(digits).replace(/\D/g, '');
  const normalizedLetters = normalizeArabic(extractPlateLetters(letters)).replace(/[^ء-ي]/g, '');
  return normalizedDigits && normalizedLetters ? `${normalizedLetters}:${normalizedDigits}` : '';
};

const samePlateSet = (left: string[], right: string[]): boolean => {
  if (left.length === 0 || left.length !== right.length) return false;
  const unmatched = [...right];
  return left.every((plate) => {
    const index = unmatched.findIndex((candidate) => candidate === plate);
    if (index < 0) return false;
    unmatched.splice(index, 1);
    return true;
  });
};

/**
 * Extracts clean Arabic letters from a string, ignoring colors and common words.
 */
export const extractPlateLetters = (text: string): string => {
  if (!text) return '';
  // Remove known common words like colors
  const clean = text
    .normalize('NFKC')
    .replace(/أحمر|احمر|ازرق|أزرق|ابيض|أبيض|اصفر|أصفر|اخضر|أخضر|شاحنة|شاحنه|مقطورة|مقطوره|فارغة|فارغه|نقدي/g, '')
    .replace(/[^ء-ي]/g, '');
  return clean;
};

const extractLettersNearPlateDigits = (text: string, digits: string): string => {
  if (!digits) return '';
  const normalized = normalizeNumerals(text.normalize('NFKC'));
  const digitIndex = normalized.indexOf(digits);
  if (digitIndex < 0) return '';
  const before = extractPlateLetters(normalized.slice(Math.max(0, digitIndex - 24), digitIndex));
  const after = extractPlateLetters(normalized.slice(digitIndex + digits.length, digitIndex + digits.length + 24));
  const beforeLetters = before.slice(-3);
  const afterLetters = after.slice(0, 3);
  if (beforeLetters.length < 3) return afterLetters;
  if (afterLetters.length < 3) return beforeLetters;
  // PDF text extraction may emit RTL letters on either side of the digits.
  // Use the closest three-letter run rather than Arabic text elsewhere in the row.
  const beforeDistance = digitIndex - normalized.lastIndexOf(beforeLetters, digitIndex);
  const afterDistance = normalized.indexOf(afterLetters, digitIndex + digits.length) - (digitIndex + digits.length);
  return beforeDistance <= afterDistance ? beforeLetters : afterLetters;
};

/**
 * Parses vehicle string formatted like:
 * "د س ى - 2312 - أحمر / د ن ر - 3597 - أحمر"
 * or "ط و س 7919 / ص ه س 7625"
 */
export const parseVehicleString = (
  vehicleStr: string,
  pdfRtlPlateOrder = false,
): {
  truck_no: string;
  truck_digits: string;
  truck_letters: string;
  trailer_no: string;
  trailer_digits: string;
  trailer_letters: string;
} => {
  if (!vehicleStr) {
    return {
      truck_no: '',
      truck_digits: '',
      truck_letters: '',
      trailer_no: '',
      trailer_digits: '',
      trailer_letters: '',
    };
  }

  // Split truck and trailer by '/' or 'مقطورة'
  const parts = vehicleStr.split(/[/]/);
  const truckPart = parts[0] || '';
  const trailerPart = parts[1] || '';

  const plateDigits = extractAllPlateDigits(vehicleStr);
  // Cashier PDF tables emit the trailer plate before the truck plate in their
  // text order, while the app expects truck first. Keep each nearby letter run
  // attached to its own digits instead of reversing or cross-pairing them.
  const truck_digits = pdfRtlPlateOrder
    ? plateDigits[1] || extractDigits(truckPart)
    : plateDigits[0] || extractDigits(truckPart);
  const trailer_digits = pdfRtlPlateOrder
    ? plateDigits[0] || extractDigits(trailerPart)
    : plateDigits[1] || extractDigits(trailerPart);
  const rawFirstPlateLetters = extractLettersNearPlateDigits(vehicleStr, plateDigits[0] || truck_digits);
  const rawSecondPlateLetters = extractLettersNearPlateDigits(vehicleStr, plateDigits[1] || trailer_digits);
  const truck_letters = pdfRtlPlateOrder
    ? rawFirstPlateLetters || extractPlateLetters(truckPart)
    : rawFirstPlateLetters || extractPlateLetters(truckPart);
  const truck_no = `${truck_letters.split('').join(' ')} ${truck_digits}`.trim();

  const trailer_letters = pdfRtlPlateOrder
    ? rawSecondPlateLetters || extractPlateLetters(trailerPart)
    : rawSecondPlateLetters || extractPlateLetters(trailerPart);
  const trailer_no = `${trailer_letters.split('').join(' ')} ${trailer_digits}`.trim();

  return {
    truck_no: truck_no || truckPart.trim(),
    truck_digits,
    truck_letters,
    trailer_no: trailer_no || trailerPart.trim(),
    trailer_digits,
    trailer_letters,
  };
};

/**
 * Extract Cashier Entries from raw text lines.
 */
export const parseCashierTextLines = (lines: string[], pdfRtlPlateOrder = false): CashierInvoiceEntry[] => {
  const entries: CashierInvoiceEntry[] = [];

  // Regex pattern for RSCT receipt number like: 0047-01-1/01-261021 or 0103-03-1/01-261021
  const receiptRegex = /\b\d{4}-\d{2}-\d+[\/\-][\d\-]+\b/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(receiptRegex);

    if (match) {
      const receipt_no = match[0];

      // Cashier PDFs often put the receipt, plate pair, and amount on separate lines.
      // Keep collecting until the next receipt so we don't associate a plate with its neighbor.
      let end = i + 1;
      while (end < lines.length && !receiptRegex.test(lines[end])) end++;
      const context = lines.slice(i, end).join(' ');

      // Look for amount: a number with decimals or standalone currency amount
      const amountMatches = context.match(/(?:\d{1,5}(?:\.\d{1,2})|[٠-٩۰-۹]{1,5}(?:\.[٠-٩۰-۹]{1,2}))/g);
      let amount = 0;
      if (amountMatches && amountMatches.length > 0) {
        // Exclude parts that look like dates or sequence numbers
        const validAmounts = amountMatches
          .map((amount) => Number(normalizeNumerals(amount)))
          .filter((n) => n > 0 && n < 100000 && !receipt_no.includes(String(n)));
        if (validAmounts.length > 0) {
          amount = validAmounts[validAmounts.length - 1]; // amount is typically at the end of the line
        }
      }

      // Look for booking category
      let booking_category = 'وارد حاويات';
      if (context.includes('تعتيق')) booking_category = 'تعتيق حاوية فارغة';
      else if (context.includes('صادر')) booking_category = 'صادر حاويات';
      else if (context.includes('وارد')) booking_category = 'وارد حاويات';
      else if (context.includes('استلام')) booking_category = 'استلام حاوية فارغة';

      // Remove receipt number from context so its internal slash and digits do not pollute plate numbers
      const vehicleStr = context.replace(receipt_no, ' ');

      const parsedVeh = parseVehicleString(vehicleStr, pdfRtlPlateOrder);

      if (parsedVeh.truck_digits || parsedVeh.truck_letters) {
        entries.push({
          receipt_no,
          raw_vehicle_str: vehicleStr,
          ...parsedVeh,
          booking_category,
          amount,
        });
      }
    }
  }

  return entries;
};

/**
 * Parses PDF document for Cashier Invoice report.
 */
export const parseCashierPdf = async (file: File): Promise<CashierInvoiceEntry[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  }).promise;

  const allLines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Group items by Y coordinate to reconstruct table lines
    const lineBuckets: { y: number; items: { x: number; str: string }[] }[] = [];

    content.items.forEach((item: any) => {
      const str = (item.str || '').normalize('NFKC').trim();
      if (!str) return;
      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);

      let bucket = lineBuckets.find((b) => Math.abs(b.y - y) <= 7);
      if (!bucket) {
        bucket = { y, items: [] };
        lineBuckets.push(bucket);
      }
      bucket.items.push({ x, str });
    });

    lineBuckets.sort((a, b) => b.y - a.y);

    lineBuckets.forEach((bucket) => {
      bucket.items.sort((a, b) => a.x - b.x);
      const line = bucket.items.map((i) => i.str).join(' ');
      allLines.push(line);
    });
  }

  return parseCashierTextLines(allLines, true);
};

/**
 * Parses Excel file of Cashier Invoice report.
 */
export const parseCashierExcel = async (file: File): Promise<CashierInvoiceEntry[]> => {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  const allLines: string[] = rows.map((r) => r.join(' '));
  return parseCashierTextLines(allLines);
};

/**
 * Main dispatcher to parse any uploaded cashier invoice file (PDF, Excel, Word).
 */
export const parseUploadedCashierReport = async (file: File): Promise<CashierInvoiceEntry[]> => {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) {
    return parseCashierPdf(file);
  } else if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
    return parseCashierExcel(file);
  } else if (name.endsWith('.docx') || name.endsWith('.doc')) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const lines = result.value.split('\n');
    return parseCashierTextLines(lines);
  }
  throw new Error('صيغة الملف غير مدعومة. يرجى رفع ملف PDF أو Excel أو Word.');
};

const getMovementReceiptNumbers = (movement: Movement): string[] =>
  (movement.cashier_receipt_no || '').split(/[,،\n]+/).map((receipt) => receipt.trim()).filter(Boolean);

const MAX_CASHIER_MATCH_DAYS = 4;

/** Returns every plausible booking row so repeated vehicles can be confirmed by customer. */
export const getCashierEntryCandidates = (
  entries: CashierInvoiceEntry[],
  movements: Movement[],
): CashierEntryCandidateSet[] => {
  const candidateSets = entries.map((entry) => {
  const entryPlateCount = [entry.truck_digits, entry.trailer_digits].filter(Boolean).length;
  const entryPlates = Array.from(new Set([
    normalizePlateSignature(entry.truck_digits, entry.truck_letters),
    normalizePlateSignature(entry.trailer_digits, entry.trailer_letters),
  ].filter(Boolean)));
  const receiptDate = getReceiptDate(entry.receipt_no);
  const currentOwners = movements.filter((movement) => getMovementReceiptNumbers(movement).includes(entry.receipt_no));
  const candidateMap = new Map<string, CashierMovementCandidate>();

  movements.forEach((movement) => {
    const movementPlates = Array.from(new Set([
      normalizePlateSignature(extractDigits(movement.truck_no || ''), movement.truck_no || ''),
      normalizePlateSignature(extractDigits(movement.trailer_no || ''), movement.trailer_no || ''),
    ].filter(Boolean)));
    const exactPair = entryPlateCount === 2
      && entryPlates.length === 2
      && samePlateSet(entryPlates, movementPlates);
    // An automatic or selectable match requires both full plate signatures:
    // Arabic letters and digits for truck and trailer. Number-only or partial
    // plate matches are deliberately excluded to protect customer accounts.
    if (!exactPair) return;

    const movementDate = getMovementDate(movement.movement_date || '');
    const dayDistance = receiptDate != null && movementDate != null
      ? Math.round(Math.abs(receiptDate - movementDate) / 86_400_000)
      : null;
    if (dayDistance != null && dayDistance > MAX_CASHIER_MATCH_DAYS) return;

    const candidate: CashierMovementCandidate = {
      movementId: movement.id,
      movementSeq: movement.seq,
      customerName: movement.customer_name || 'عميل غير محدد',
      driverName: movement.driver_name || '',
      truckNo: movement.truck_no || '',
      trailerNo: movement.trailer_no || '',
      containerNo: movement.container_no || '',
      movementDate: movement.movement_date || '',
      exactPair,
      isCurrentOwner: currentOwners.some((owner) => owner.id === movement.id),
    };
    candidateMap.set(movement.id, candidate);
  });

  // Keep an existing link visible even when old movement data is outside the
  // date window, so the user can move a receipt away from an incorrect client.
  currentOwners.forEach((movement) => {
    if (candidateMap.has(movement.id)) return;
    candidateMap.set(movement.id, {
      movementId: movement.id,
      movementSeq: movement.seq,
      customerName: movement.customer_name || 'عميل غير محدد',
      driverName: movement.driver_name || '',
      truckNo: movement.truck_no || '',
      trailerNo: movement.trailer_no || '',
      containerNo: movement.container_no || '',
      movementDate: movement.movement_date || '',
      exactPair: false,
      isCurrentOwner: true,
    });
  });

  const candidates = Array.from(candidateMap.values()).sort((a, b) => {
    if (a.isCurrentOwner !== b.isCurrentOwner) return a.isCurrentOwner ? -1 : 1;
    if (a.exactPair !== b.exactPair) return a.exactPair ? -1 : 1;
    const aMovement = movements.find((movement) => movement.id === a.movementId);
    const bMovement = movements.find((movement) => movement.id === b.movementId);
    const aBatch = Date.parse(aMovement?.import_batch_at || '') || 0;
    const bBatch = Date.parse(bMovement?.import_batch_at || '') || 0;
    return bBatch - aBatch || b.movementSeq - a.movementSeq;
  });
  const currentMovementId = currentOwners.length === 1 ? currentOwners[0].id : '';
  return { entry, candidates, currentMovementId, suggestedMovementId: currentMovementId };
  });

  // A single candidate per receipt is not enough to safely auto-link: several
  // receipts may point to the same vehicle movement, especially when plates
  // repeat across clients or the cashier report has split/duplicate lines.
  const entriesPerMovement = new Map<string, number>();
  candidateSets.forEach(({ candidates, currentMovementId }) => {
    if (currentMovementId) return;
    candidates.forEach(({ movementId }) => {
      entriesPerMovement.set(movementId, (entriesPerMovement.get(movementId) || 0) + 1);
    });
  });

  return candidateSets.map((candidateSet) => {
    if (candidateSet.suggestedMovementId || candidateSet.candidates.length !== 1) return candidateSet;
    const onlyCandidate = candidateSet.candidates[0];
    return (entriesPerMovement.get(onlyCandidate.movementId) || 0) === 1
      ? { ...candidateSet, suggestedMovementId: onlyCandidate.movementId }
      : candidateSet;
  });
};

/** Applies only explicit receipt-to-movement selections; an empty choice stays unmatched. */
export const applyCashierMatches = (
  entries: CashierInvoiceEntry[],
  movements: Movement[],
  selectedMovementByReceipt: Record<string, string>,
  defaultSystemCommission: number = 200,
): {
  matchedMovements: Movement[];
  matchResults: CashierMatchResult[];
  unmatchedEntries: CashierInvoiceEntry[];
} => {
  const updatedMovements = [...movements];
  const uniqueAssignedEntries = new Map<string, { entry: CashierInvoiceEntry; movementId: string }>();
  entries.forEach((entry) => {
    const movementId = selectedMovementByReceipt[entry.receipt_no];
    if (movementId && movements.some((movement) => movement.id === movementId) && !uniqueAssignedEntries.has(entry.receipt_no)) {
      uniqueAssignedEntries.set(entry.receipt_no, { entry, movementId });
    }
  });

  const updateMovement = (movementIndex: number, cashierInvoice: number, receipts: string[], bookingCategory?: string) => {
    const movement = updatedMovements[movementIndex];
    const oldCashier = Number(movement.cashier_invoice) || 0;
    const systemCommission = Number(movement.system_commission ?? defaultSystemCommission);
    const nafezCommission = Number(movement.nafez_commission ?? 0);
    const customerPaid = movement.customer_paid_amount !== undefined
      ? Math.max(0, Number(movement.customer_paid_amount) || 0)
      : Math.max(0, (Number(movement.paid_amount) || 0) - oldCashier);
    const total = cashierInvoice + systemCommission + nafezCommission;
    const remaining = Math.max(0, total - customerPaid);
    updatedMovements[movementIndex] = {
      ...movement,
      cashier_receipt_no: Array.from(new Set(receipts)).join(', '),
      cashier_invoice: cashierInvoice,
      paid_amount: customerPaid,
      customer_paid_amount: customerPaid,
      system_commission: systemCommission,
      nafez_commission: nafezCommission,
      booking_category: bookingCategory || movement.booking_category,
      total_amount: total,
      remaining_amount: remaining,
      payment_status: customerPaid >= total && total > 0 ? 'paid' : customerPaid > 0 ? 'partial' : 'unpaid',
    };
  };

  // Remove receipts from their previous owner first. This makes re-uploading a
  // report a simple way to correct a receipt linked to the wrong customer.
  uniqueAssignedEntries.forEach(({ entry, movementId }) => {
    updatedMovements.forEach((movement, movementIndex) => {
      const receipts = getMovementReceiptNumbers(movement);
      if (!receipts.includes(entry.receipt_no) || movement.id === movementId) return;
      const cashierInvoice = Math.max(0, (Number(movement.cashier_invoice) || 0) - Math.max(0, Number(entry.amount) || 0));
      updateMovement(
        movementIndex,
        cashierInvoice,
        receipts.filter((receipt) => receipt !== entry.receipt_no),
      );
    });
  });

  const entriesByMovement = new Map<string, CashierInvoiceEntry[]>();
  uniqueAssignedEntries.forEach(({ entry, movementId }) => {
    const movementIndex = updatedMovements.findIndex((movement) => movement.id === movementId);
    if (movementIndex === -1) return;
    const movement = updatedMovements[movementIndex];
    const receipts = getMovementReceiptNumbers(movement);
    if (!receipts.includes(entry.receipt_no)) {
      updateMovement(
        movementIndex,
        (Number(movement.cashier_invoice) || 0) + Math.max(0, Number(entry.amount) || 0),
        [...receipts, entry.receipt_no],
        entry.booking_category,
      );
    }
    entriesByMovement.set(movementId, [...(entriesByMovement.get(movementId) || []), entry]);
  });

  const matchResults: CashierMatchResult[] = [];
  entriesByMovement.forEach((movementEntries, movementId) => {
    const movementIndex = updatedMovements.findIndex((movement) => movement.id === movementId);
    const movement = updatedMovements[movementIndex];
    const original = movements.find((row) => row.id === movementId) || movement;
    matchResults.push({
      movementId,
      movementSeq: movement.seq,
      truckNo: movement.truck_no,
      driverName: movement.driver_name || movement.customer_name,
      containerNo: movement.container_no,
      oldCashierInvoice: Number(original.cashier_invoice) || 0,
      newCashierInvoice: Number(movement.cashier_invoice) || 0,
      cashierReceiptNo: movementEntries.map((entry) => entry.receipt_no).join(', '),
      bookingCategory: movement.booking_category || '',
      totalAmount: Number(movement.total_amount) || 0,
      paidAmount: Number(movement.paid_amount) || 0,
      remainingAmount: Number(movement.remaining_amount) || 0,
    });
  });

  const unmatchedEntries = entries.filter((entry) => !uniqueAssignedEntries.has(entry.receipt_no));
  return { matchedMovements: updatedMovements, matchResults, unmatchedEntries };
};
