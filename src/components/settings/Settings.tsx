import { useAuth } from '@/contexts/AuthContext';
import { TenantCustomization } from './TenantCustomization';
import { ProfileSettings } from './ProfileSettings';
import { ClientImportSettings } from './ClientImportSettings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileSpreadsheet, Palette, User, Bell, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { toast } from 'sonner';

export function Settings() {
  const { userRole, isSuperAdmin, tenantId } = useAuth();
  const { settings, refetch } = useTenantSettings();
  const isAdmin = userRole === 'admin' || isSuperAdmin;

  // ITEM 13: estado local dos horários
  const [workStart, setWorkStart] = useState<number>(settings?.working_hours_start ?? 8);
  const [workEnd,   setWorkEnd]   = useState<number>(settings?.working_hours_end   ?? 20);
  const [savingHours, setSavingHours] = useState(false);

  useEffect(() => {
    setWorkStart(settings?.working_hours_start ?? 8);
    setWorkEnd(settings?.working_hours_end ?? 20);
  }, [settings?.working_hours_start, settings?.working_hours_end]);

  const handleSaveHours = async () => {
    if (workStart >= workEnd) { toast.error('Horário de início deve ser anterior ao de encerramento.'); return; }
    if (!tenantId) return;
    setSavingHours(true);
    try {
      const { error } = await supabase
        .from('tenant_settings')
        .upsert({ tenant_id: tenantId, working_hours_start: workStart, working_hours_end: workEnd }, { onConflict: 'tenant_id' });
      if (error) throw error;
      await refetch();
      toast.success('Horários salvos!');
    } catch {
      toast.error('Erro ao salvar horários.');
    } finally {
      setSavingHours(false);
    }
  };

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground mt-1">Gerencie as configurações do sistema</p>
      </div>

      <Tabs defaultValue={isAdmin ? 'customization' : 'profile'} className="w-full">
        <TabsList className="mb-6">
          {isAdmin && (
            <TabsTrigger value="customization" className="flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Personalização
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="hours" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Horários
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="client-import" className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" />
              Importar clientes
            </TabsTrigger>
          )}
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="w-4 h-4" />
            Meu Perfil
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Notificações
          </TabsTrigger>
        </TabsList>

        {isAdmin && (
          <TabsContent value="customization">
            <TenantCustomization />
          </TabsContent>
        )}

        {/* ITEM 13: aba de horários de funcionamento */}
        {isAdmin && (
          <TabsContent value="hours">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Horário de Funcionamento
                </CardTitle>
                <CardDescription>
                  Define o intervalo de horas exibido na agenda
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="workStart">Abertura (hora)</Label>
                    <Input
                      id="workStart"
                      type="number"
                      min={0}
                      max={23}
                      value={workStart}
                      onChange={e => setWorkStart(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="workEnd">Fechamento (hora)</Label>
                    <Input
                      id="workEnd"
                      type="number"
                      min={1}
                      max={24}
                      value={workEnd}
                      onChange={e => setWorkEnd(Number(e.target.value))}
                    />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Exemplo: abertura 8, fechamento 20 → agenda das 8:00 às 19:30
                </p>
                <Button onClick={handleSaveHours} disabled={savingHours}>
                  {savingHours ? 'Salvando...' : 'Salvar horários'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="client-import">
            <ClientImportSettings />
          </TabsContent>
        )}

        {/* ITEM 17: perfil implementado */}
        <TabsContent value="profile">
          <ProfileSettings />
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notificações
              </CardTitle>
              <CardDescription>Configure suas preferências de notificação</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Em breve: Configurações de notificação por email e push.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
