import { supabase } from '@/integrations/supabase/client';

export interface PublicBookingTenant {
  tenant_id: string;
  tenant_name: string;
  booking_slug: string;
  package_type: string | null;
  logo_url: string | null;
  primary_color: string | null;
  working_hours_start: number | null;
  working_hours_end: number | null;
}

export interface PublicBookingProfessional {
  professional_id: string;
  professional_name: string;
  nickname: string | null;
  photo_url: string | null;
}

export interface PublicBookingService {
  service_id: string;
  service_name: string;
  description: string | null;
  category: string | null;
  duration_minutes: number;
  break_time_minutes: number | null;
  default_price: number;
  price_type: string;
}

export interface PublicBookingServiceProfessional {
  service_id: string;
  professional_id: string;
  duration_minutes: number | null;
}

export async function fetchPublicBookingTenant(slug: string) {
  const { data, error } = await supabase.rpc('get_public_booking_tenant', { _slug: slug });
  return {
    data: (data?.[0] ?? null) as PublicBookingTenant | null,
    error,
  };
}

export async function fetchPublicBookingProfessionals(slug: string) {
  const { data, error } = await supabase.rpc('get_public_booking_professionals', { _slug: slug });
  return {
    data: (data ?? []) as PublicBookingProfessional[],
    error,
  };
}

export async function fetchPublicBookingServices(slug: string) {
  const { data, error } = await supabase.rpc('get_public_booking_services', { _slug: slug });
  return {
    data: (data ?? []) as PublicBookingService[],
    error,
  };
}

export async function fetchPublicBookingServiceProfessionals(slug: string) {
  const { data, error } = await supabase.rpc('get_public_booking_service_professionals', { _slug: slug });
  return {
    data: (data ?? []) as PublicBookingServiceProfessional[],
    error,
  };
}
