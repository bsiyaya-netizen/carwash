export type BookingStatus = 'pending' | 'accepted' | 'en_route' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';

export interface User {
  id: string;
  role: 'customer' | 'washer' | 'admin';
  name: string;
  phone: string | null;
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
  membership_discount_cents: number;
  discount_cents: number;
  points_discount_cents: number;
  tip_cents: number;
  total_cents: number;
  payment_method: 'card' | 'cash' | 'membership';
  payment_status: string;
  handover_otp?: string;
  package: { id: string; name: string; duration_min: number };
  addons: { id: string; name: string }[];
  vehicle: Omit<Vehicle, 'id'>;
  customer: { id: string; name: string; phone: string | null };
  hub: { id: string; name: string; address: string; phone: string } | null;
  washer: { id: string; name: string; phone: string | null; lat: number | null; lng: number | null; rating: number | null } | null;
  review: { rating: number; comment: string } | null;
}

export interface Hub { id: string; name: string; address: string; lat: number; lng: number; hours: string; phone: string; distance_km: number | null }

export interface Plan {
  id: string; code: string; name: string; description: string; price_cents: number;
  washes_per_period: number; covered_package_codes: string[]; addon_discount_percent: number;
}

export interface Membership {
  id: string; plan_name: string; status: string; remaining: number; washes_per_period: number;
  current_period_end: string; cancel_at_period_end: boolean;
}

export interface Quote {
  subtotalCents: number; membershipDiscountCents: number; membershipWashesLeft: number | null;
  discountCents: number; pointsRedeemed: number; pointsDiscountCents: number; totalCents: number; durationMin: number;
}
