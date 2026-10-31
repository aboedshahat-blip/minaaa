import type { Movement, SystemSettings } from '../types';

export type MovementService = 'inbound' | 'outbound' | 'empty';

const normalizeServiceText = (value: string) => value
  .normalize('NFKC')
  .replace(/[\u064B-\u065F\u0670ـ]/g, '')
  .replace(/[أإآ]/g, 'ا')
  .replace(/\s+/g, ' ')
  .trim();

export const getMovementService = (
  bookingCategory?: string | null,
  containerPath?: string | null,
): MovementService | null => {
  // The booking path is the source of truth when it clearly names a service.
  const path = normalizeServiceText(containerPath || '');
  const category = normalizeServiceText(bookingCategory || '');
  const classify = (text: string): MovementService | null => {
    if (/فارغ|تعتيق|استلام/.test(text)) return 'empty';
    if (/صادر/.test(text)) return 'outbound';
    if (/وارد/.test(text)) return 'inbound';
    return null;
  };
  return classify(path) || classify(category);
};

/**
 * A cashier service may be checked against the booking path, container
 * description, or both. Empty metadata is unknown, while conflicting populated
 * fields must never be treated as a safe match.
 */
export const matchesMovementService = (
  service: MovementService | null,
  containerPath?: string | null,
  containerDescription?: string | null,
): boolean => {
  if (!service) return false;
  const pathService = getMovementService(undefined, containerPath);
  const descriptionService = getMovementService(undefined, containerDescription);
  const knownServices = [pathService, descriptionService].filter(
    (value): value is MovementService => value !== null,
  );
  return knownServices.length > 0 && knownServices.every((value) => value === service);
};

export const getMovementServiceLabel = (service: MovementService | null): string => {
  if (service === 'inbound') return 'وارد حاويات';
  if (service === 'outbound') return 'صادر حاويات';
  if (service === 'empty') return 'تعتيق حاوية فارغة';
  return '';
};

export const getServiceCommission = (
  settings: SystemSettings,
  service: MovementService | null,
): number => {
  if (service === 'inbound') return settings.default_inbound_commission ?? settings.default_system_commission ?? 200;
  if (service === 'outbound') return settings.default_outbound_commission ?? settings.default_system_commission ?? 200;
  if (service === 'empty') return settings.default_empty_commission ?? settings.default_system_commission ?? 200;
  return settings.default_system_commission ?? 200;
};

export const getMovementServiceForRow = (movement: Pick<Movement, 'booking_category' | 'container_path'>) =>
  getMovementService(movement.booking_category, movement.container_path);
