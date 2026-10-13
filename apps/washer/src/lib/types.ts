export type BookingStatus = 'pending' | 'accepted' | 'en_route' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';

export interface User {
  id: string;
  role: 'customer' | 'washer' | 'admin';
  name: string;
  phone: string;
  email: string | null;
  loyalty_points: number;
  referral_code: string;
}

export interface Vehicle { id: string; make: string; model: string; color: string; plate: string }

export interface Package {
  id: string;
  code: string;
  name: string;
  description: string;
  price_cents: number;
  duration_min: number;
  is_addon: boolean;
}

export interface Booking {
  id: string;
  status: BookingStatus;
  scheduled_at: string;
  recurrence: 'none' | 'weekly' | 'monthly';
  lat: number;
  lng: number;
  address: string;
  subtotal_cents: number;
  discount_cents: number;
  tip_cents: number;
  total_cents: number;
  payment_method: 'card' | 'cash';
  payment_status: string;
  handover_otp?: string;
  package: { id: string; name: string; duration_min: number };
  addons: { id: string; name: string }[];
  vehicle: Omit<Vehicle, 'id'>;
  customer: { id: string; name: string; phone: string };
  washer: { id: string; name: string; phone: string; lat: number | null; lng: number | null; rating: number | null } | null;
  review: { rating: number; comment: string } | null;
}
