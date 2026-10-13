import type { BookingStatus } from './types';

export const money = (cents: number) =>
  `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'Finding a washer',
  accepted: 'Washer assigned',
  en_route: 'Washer on the way',
  arrived: 'Washer has arrived',
  in_progress: 'Washing',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const STATUS_STEPS: BookingStatus[] = ['pending', 'accepted', 'en_route', 'arrived', 'in_progress', 'completed'];
