import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, X, Palette, Building2, Image as ImageIcon, Link2, Copy, ExternalLink, Globe } from 'lucide-react';

interface TenantSettingsLocal {
  id?: string;
  tenant_id: string;
  salon_name: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
}

const defaultSettings: Omit<TenantSettingsLocal, 'tenant_id'> = {
  salon_name: null,
  logo_url: null,
  primary_color: '#1e40af',
  secondary_color: '#3b82f6',
  accent_color: '#60a5fa',
};

const colorPresets = [
  { name: 'Azul Clássico', primary: '#1e40af', secondary: '#3b82f6', accent: '#60a5fa' },
  { name: 'Rosa Elegante', primary: '#be185d', secondary: '#ec4899', accent: '#f9a8d4' },
  { name: 'Verde Natureza', primary: '#166534', secondary: '#22c55e', accent: '#86efac' },
  { name: 'Roxo Moderno', primary: '#6b21a8', secondary: '#a855f7', accent: '#d8b4fe' },
  { name: 'Laranja Vibrante', primary: '#c2410c', secondary: '#f97316', accent: '#fdba74' },
  { name: 'Cinza Sofisticado', primary: '#374151', secondary: '#6b7280', accent: '#9ca3af' },
];

export function TenantCustomization() {
  const { tenantId, userRole, isSuperAdmin } = useAuth();
  const { refetch: refetchGlobalSettings } = useTenantSettings();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [settings, setSettings] = useState<TenantSettingsLocal | null>(null);
  const [bookingSlug, setBookingSlug] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canEdit = userRole === 'admin' || isSuperAdmin;

  useEffect(() => {
    if (tenantId) {
      fetchSettings();
    }
  }, [tenantId]);

  const fetchSettings = async () => {
    if (!tenantId) return;
    
    try {
      // Fetch tenant settings
      const { data, error } = await supabase
        .from('tenant_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings(data as TenantSettingsLocal);
      } else {
        // Create default settings
        setSettings({
          tenant_id: tenantId,
          ...defaultSettings,
        });
      }

      // Fetch booking slug from tenant
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('booking_slug')
        .eq('id', tenantId)
        .single();
      
      if (tenantData?.booking_slug) {
        setBookingSlug(tenantData.booking_slug);
      }
    } catch (error) {
      console.error('Error fetching tenant settings:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings || !tenantId) return;

    setSaving(true);
    try {
      if (settings.id) {
        // Update existing
        const { error } = await supabase
          .from('tenant_settings')
          .update({
            salon_name: settings.salon_name,
            logo_url: settings.logo_url,
            primary_color: settings.primary_color,
            secondary_color: settings.secondary_color,
            accent_color: settings.accent_color,
          })
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('tenant_settings')
          .insert({
            tenant_id: tenantId,
            salon_name: settings.salon_name,
            logo_url: settings.logo_url,
            primary_color: settings.primary_color,
            secondary_color: settings.secondary_color,
            accent_color: settings.accent_color,
          })
          .select()
          .single();

        if (error) throw error;
        setSettings(data as TenantSettingsLocal);
      }

      // Apply colors immediately
      applyColors(settings.primary_color, settings.secondary_color, settings.accent_color);
      
      // Refetch global settings to update sidebar
      await refetchGlobalSettings();
      
      toast.success('Configurações salvas com sucesso!');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const applyColors = (primary: string, secondary: string, accent: string) => {
    const root = document.documentElement;
    root.style.setProperty('--primary', hexToHsl(primary));
    root.style.setProperty('--primary-glow', hexToHsl(secondary));
    root.style.setProperty('--accent', hexToHsl(accent));
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !tenantId) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem válida');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 2MB');
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${tenantId}/logo.${fileExt}`;

      // Delete old logo if exists
      if (settings?.logo_url) {
        const oldPath = settings.logo_url.split('/').slice(-2).join('/');
        await supabase.storage.from('salon-logos').remove([oldPath]);
      }

      // Upload new logo
      const { error: uploadError } = await supabase.storage
        .from('salon-logos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('salon-logos')
        .getPublicUrl(fileName);

      setSettings(prev => prev ? { ...prev, logo_url: urlData.publicUrl } : null);
      toast.success('Logo enviado com sucesso!');
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error('Erro ao enviar logo');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!settings?.logo_url || !tenantId) return;

    try {
      const oldPath = settings.logo_url.split('/').slice(-2).join('/');
      await supabase.storage.from('salon-logos').remove([oldPath]);
      setSettings(prev => prev ? { ...prev, logo_url: null } : null);
      toast.success('Logo removido');
    } catch (error) {
      console.error('Error removing logo:', error);
      toast.error('Erro ao remover logo');
    }
  };

  const handlePresetClick = (preset: typeof colorPresets[0]) => {
    setSettings(prev => prev ? {
      ...prev,
      primary_color: preset.primary,
      secondary_color: preset.secondary,
      accent_color: preset.accent,
    } : null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!canEdit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Personalização
          </CardTitle>
          <CardDescription>
            Apenas administradores podem acessar esta seção.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Logo Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            Logo do Salão
          </CardTitle>
          <CardDescription>
            Faça upload do logo do seu salão. Recomendado: imagem quadrada, PNG ou JPG, máximo 2MB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-6">
            <div className="relative w-24 h-24 rounded-xl border-2 border-dashed border-muted-foreground/25 flex items-center justify-center bg-muted/50 overflow-hidden">
              {settings?.logo_url ? (
                <>
                  <img 
                    src={settings.logo_url} 
                    alt="Logo do salão" 
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={handleRemoveLogo}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md hover:bg-destructive/90"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
              )}
            </div>

            <div className="flex-1">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*"
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                {uploading ? 'Enviando...' : 'Escolher arquivo'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Salon Name */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Nome do Salão
          </CardTitle>
          <CardDescription>
            O nome que será exibido na plataforma.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-md">
            <Label htmlFor="salon-name">Nome</Label>
            <Input
              id="salon-name"
              value={settings?.salon_name || ''}
              onChange={(e) => setSettings(prev => prev ? { ...prev, salon_name: e.target.value } : null)}
              placeholder="Ex: Salão Beleza & Arte"
            />
          </div>
        </CardContent>
      </Card>

      {/* Online Booking Link */}
      {bookingSlug && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              Agendamento Online
            </CardTitle>
            <CardDescription>
              Compartilhe este link com seus clientes para que eles possam agendar horários online.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={`${window.location.origin}/b/${bookingSlug}`}
                readOnly
                className="font-mono text-sm bg-background"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/b/${bookingSlug}`);
                    toast.success('Link copiado!');
                  }}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar
                </Button>
                <Button
                  variant="outline"
                  asChild
                >
                  <a href={`/b/${bookingSlug}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Abrir
                  </a>
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              💡 Dica: Adicione este link ao seu Instagram, WhatsApp Business ou cartão de visitas.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Color Palette */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Paleta de Cores
          </CardTitle>
          <CardDescription>
            Personalize as cores da plataforma para combinar com a identidade visual do seu salão.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Presets */}
          <div>
            <Label className="mb-3 block">Temas pré-definidos</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {colorPresets.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => handlePresetClick(preset)}
                  className="group p-3 rounded-xl border border-border hover:border-primary transition-colors"
                >
                  <div className="flex gap-1 mb-2">
                    <div 
                      className="w-6 h-6 rounded-full" 
                      style={{ backgroundColor: preset.primary }}
                    />
                    <div 
                      className="w-6 h-6 rounded-full" 
                      style={{ backgroundColor: preset.secondary }}
                    />
                    <div 
                      className="w-6 h-6 rounded-full" 
                      style={{ backgroundColor: preset.accent }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                    {preset.name}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Colors */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="primary-color">Cor Principal</Label>
              <div className="flex gap-2 mt-1">
                <input
                  type="color"
                  id="primary-color"
                  value={settings?.primary_color || '#1e40af'}
                  onChange={(e) => setSettings(prev => prev ? { ...prev, primary_color: e.target.value } : null)}
                  className="w-12 h-10 rounded border border-border cursor-pointer"
                />
                <Input
                  value={settings?.primary_color || '#1e40af'}
                  onChange={(e) => setSettings(prev => prev ? { ...prev, primary_color: e.target.value } : null)}
                  className="flex-1 font-mono text-sm"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="secondary-color">Cor Secundária</Label>
              <div className="flex gap-2 mt-1">
                <input
                  type="color"
                  id="secondary-color"
                  value={settings?.secondary_color || '#3b82f6'}
                  onChange={(e) => setSettings(prev => prev ? { ...prev, secondary_color: e.target.value } : null)}
                  className="w-12 h-10 rounded border border-border cursor-pointer"
                />
                <Input
                  value={settings?.secondary_color || '#3b82f6'}
                  onChange={(e) => setSettings(prev => prev ? { ...prev, secondary_color: e.target.value } : null)}
                  className="flex-1 font-mono text-sm"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="accent-color">Cor de Destaque</Label>
              <div className="flex gap-2 mt-1">
                <input
                  type="color"
                  id="accent-color"
                  value={settings?.accent_color || '#60a5fa'}
                  onChange={(e) => setSettings(prev => prev ? { ...prev, accent_color: e.target.value } : null)}
                  className="w-12 h-10 rounded border border-border cursor-pointer"
                />
                <Input
                  value={settings?.accent_color || '#60a5fa'}
                  onChange={(e) => setSettings(prev => prev ? { ...prev, accent_color: e.target.value } : null)}
                  className="flex-1 font-mono text-sm"
                />
              </div>
            </div>
          </div>

          {/* Preview */}
          <div>
            <Label className="mb-3 block">Pré-visualização</Label>
            <div 
              className="p-4 rounded-xl border border-border"
              style={{ 
                background: `linear-gradient(135deg, ${settings?.primary_color}15 0%, ${settings?.secondary_color}10 100%)` 
              }}
            >
              <div className="flex items-center gap-4 mb-4">
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                  style={{ 
                    background: `linear-gradient(135deg, ${settings?.primary_color} 0%, ${settings?.secondary_color} 100%)` 
                  }}
                >
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold" style={{ color: settings?.primary_color }}>
                    {settings?.salon_name || 'Nome do Salão'}
                  </p>
                  <p className="text-sm text-muted-foreground">Gestão de Salão</p>
                </div>
              </div>
              
              <div className="flex gap-2">
                <button 
                  className="px-4 py-2 rounded-lg text-white text-sm font-medium"
                  style={{ backgroundColor: settings?.primary_color }}
                >
                  Botão Primário
                </button>
                <button 
                  className="px-4 py-2 rounded-lg text-white text-sm font-medium"
                  style={{ backgroundColor: settings?.secondary_color }}
                >
                  Botão Secundário
                </button>
                <button 
                  className="px-4 py-2 rounded-lg text-sm font-medium border"
                  style={{ 
                    borderColor: settings?.accent_color,
                    color: settings?.accent_color 
                  }}
                >
                  Destaque
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Salvando...
            </>
          ) : (
            'Salvar Configurações'
          )}
        </Button>
      </div>
    </div>
  );
}
