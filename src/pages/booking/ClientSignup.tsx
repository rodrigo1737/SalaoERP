import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useOutletContext, Link } from 'react-router-dom';
import { useClientAuth } from '@/contexts/ClientAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, CalendarIcon, User, Phone, Mail, Heart, Camera, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { z } from 'zod';
import { strongPasswordSchema, getPasswordRequirementsMessage } from '@/lib/passwordValidation';

interface TenantInfo {
  id: string;
  name: string;
}

interface Professional {
  id: string;
  name: string;
  nickname: string;
  photo_url?: string;
}

interface Service {
  id: string;
  name: string;
  category?: string;
}

const signupSchema = z.object({
  name: z.string().trim().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  email: z.string().trim().email('Email inválido'),
  phone: z.string().trim().min(10, 'Telefone deve ter no mínimo 10 dígitos'),
  password: strongPasswordSchema,
  confirmPassword: z.string(),
  termsAccepted: z.boolean().refine(val => val === true, 'Você deve aceitar os termos'),
}).refine(data => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
});

const ClientSignup: React.FC = () => {
  const navigate = useNavigate();
  const { tenant } = useOutletContext<{ tenant: TenantInfo }>();
  const { user, signUp, loading: authLoading } = useClientAuth();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    birthDate: null as Date | null,
    preferredProfessionalId: '',
    preferredServiceIds: [] as string[],
    termsAccepted: false,
    photoUrl: null as string | null,
  });

  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user && !authLoading) {
      navigate('../agendar');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    const fetchData = async () => {
      // Fetch professionals
      const { data: profData } = await supabase
        .from('professionals')
        .select('id, name, nickname, photo_url')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .eq('has_schedule', true)
        .order('name');

      if (profData) {
        setProfessionals(profData);
      }

      // Fetch services available for online booking
      const { data: servData } = await supabase
        .from('services')
        .select('id, name, category')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .eq('allow_online_booking', true)
        .order('name');

      if (servData) {
        setServices(servData);
      }
    };

    fetchData();
  }, [tenant.id]);

  const handlePhotoSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 2MB');
      return;
    }

    setIsUploadingPhoto(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${tenant.id}/clients/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('client-photos')
        .upload(filePath, file, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('client-photos')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, photoUrl: publicUrl }));
      toast.success('Foto enviada!');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erro ao enviar foto');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = signupSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach(err => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);

    const { error } = await signUp(
      formData.email,
      formData.password,
      formData.name,
      formData.phone,
      formData.birthDate ? format(formData.birthDate, 'yyyy-MM-dd') : null,
      tenant.id,
      formData.preferredProfessionalId || undefined,
      formData.preferredServiceIds.length > 0 ? formData.preferredServiceIds : undefined,
      formData.photoUrl
    );

    setIsSubmitting(false);

    if (error) {
      toast.error('Erro ao criar conta', {
        description: error.message === 'User already registered'
          ? 'Este email já está cadastrado. Faça login.'
          : error.message,
      });
    } else {
      toast.success('Conta criada com sucesso!', {
        description: 'Você já pode agendar seus horários.',
      });
      navigate('../agendar');
    }
  };

  const toggleServicePreference = (serviceId: string) => {
    setFormData(prev => ({
      ...prev,
      preferredServiceIds: prev.preferredServiceIds.includes(serviceId)
        ? prev.preferredServiceIds.filter(id => id !== serviceId)
        : [...prev.preferredServiceIds, serviceId],
    }));
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Criar Conta</CardTitle>
          <CardDescription>
            Cadastre-se para agendar seus horários em {tenant.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Photo Upload */}
            <div className="flex flex-col items-center gap-3 pb-2">
              <div className="relative">
                <Avatar className="w-24 h-24 border-2 border-border">
                  <AvatarImage src={formData.photoUrl || undefined} alt={formData.name} />
                  <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                    {formData.name ? formData.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : <Camera className="h-8 w-8" />}
                  </AvatarFallback>
                </Avatar>
                {isUploadingPhoto && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-full">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoSelect}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingPhoto}
              >
                <Upload className="w-4 h-4 mr-1" />
                {formData.photoUrl ? 'Trocar Foto' : 'Adicionar Foto'}
              </Button>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Nome Completo *
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="Seu nome completo"
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="phone" className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Telefone/WhatsApp *
              </Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                placeholder="(00) 00000-0000"
              />
              {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                E-mail *
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="seu@email.com"
              />
              {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
            </div>

            {/* Birth Date */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                Data de Nascimento
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !formData.birthDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.birthDate
                      ? format(formData.birthDate, 'dd/MM/yyyy', { locale: ptBR })
                      : 'Selecione a data'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.birthDate || undefined}
                    onSelect={date => setFormData({ ...formData, birthDate: date || null })}
                    disabled={date => date > new Date() || date < new Date('1900-01-01')}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">Senha *</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                placeholder={getPasswordRequirementsMessage()}
              />
              <p className="text-xs text-muted-foreground">{getPasswordRequirementsMessage()}</p>
              {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Senha *</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                placeholder="Repita a senha"
              />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">{errors.confirmPassword}</p>
              )}
            </div>

            {/* Preferred Professional */}
            {professionals.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Heart className="h-4 w-4" />
                  Profissional Preferido (opcional)
                </Label>
                <Select
                  value={formData.preferredProfessionalId}
                  onValueChange={value =>
                    setFormData({ ...formData, preferredProfessionalId: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha um profissional" />
                  </SelectTrigger>
                  <SelectContent>
                    {professionals.map(prof => (
                      <SelectItem key={prof.id} value={prof.id}>
                        {prof.nickname || prof.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Preferred Services */}
            {services.length > 0 && (
              <div className="space-y-2">
                <Label>Serviços de Interesse (opcional)</Label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border rounded-md">
                  {services.map(service => (
                    <label
                      key={service.id}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Checkbox
                        checked={formData.preferredServiceIds.includes(service.id)}
                        onCheckedChange={() => toggleServicePreference(service.id)}
                      />
                      <span className="truncate">{service.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Terms */}
            <div className="space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.termsAccepted}
                  onCheckedChange={(checked: boolean) =>
                    setFormData({ ...formData, termsAccepted: checked })
                  }
                  className="mt-1"
                />
                <span className="text-sm text-muted-foreground">
                  Li e aceito os{' '}
                  <Link to="../termos" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                    Termos de Uso
                  </Link>{' '}
                  e a{' '}
                  <Link to="../privacidade" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                    Política de Privacidade
                  </Link>
                </span>
              </label>
              {errors.termsAccepted && (
                <p className="text-sm text-destructive">{errors.termsAccepted}</p>
              )}
            </div>

            {/* Submit */}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando conta...
                </>
              ) : (
                'Criar Conta'
              )}
            </Button>

            {/* Login Link */}
            <p className="text-center text-sm text-muted-foreground">
              Já tem uma conta?{' '}
              <Link to="../login" className="text-primary hover:underline font-medium">
                Faça login
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClientSignup;
