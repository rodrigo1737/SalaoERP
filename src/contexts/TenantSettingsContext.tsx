import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface TenantSettings {
  id: string;
  tenant_id: string;
  salon_name: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  // ITEM 13: horários de funcionamento configuráveis (migration 002)
  working_hours_start: number;
  working_hours_end: number;
}

interface TenantSettingsContextType {
  settings: TenantSettings | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

const TenantSettingsContext = createContext<TenantSettingsContextType | undefined>(undefined);

export const useTenantSettings = () => {
  const context = useContext(TenantSettingsContext);
  if (!context) {
    // Return a default object if used outside provider (e.g., in auth pages)
    return { settings: null, loading: false, refetch: async () => {} };
  }
  return context;
};

const hexToHsl = (hex: string): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0 0% 0%';

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

const applyColors = (primary: string, secondary: string, accent: string) => {
  const root = document.documentElement;
  root.style.setProperty('--primary', hexToHsl(primary));
  root.style.setProperty('--primary-glow', hexToHsl(secondary));
  root.style.setProperty('--accent', hexToHsl(accent));
};

const normalizeSettings = (data: any): TenantSettings => ({
  ...data,
  primary_color: data.primary_color ?? '#1e40af',
  secondary_color: data.secondary_color ?? '#3b82f6',
  accent_color: data.accent_color ?? '#60a5fa',
  working_hours_start: data.working_hours_start ?? 8,
  working_hours_end: data.working_hours_end ?? 20,
});

export const TenantSettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { tenantId, user } = useAuth();
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    if (!tenantId) {
      setSettings(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('tenant_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const normalized = normalizeSettings(data);
        setSettings(normalized);
        applyColors(normalized.primary_color, normalized.secondary_color, normalized.accent_color);
      } else {
        setSettings(null);
      }
    } catch (error) {
      console.error('Error fetching tenant settings:', error);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (user && tenantId) {
      fetchSettings();
    } else {
      setSettings(null);
      setLoading(false);
    }
  }, [user, tenantId, fetchSettings]);

  const refetch = async () => {
    await fetchSettings();
  };

  return (
    <TenantSettingsContext.Provider value={{ settings, loading, refetch }}>
      {children}
    </TenantSettingsContext.Provider>
  );
};
