import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  User, 
  Calendar, 
  FileText, 
  CreditCard,
  Phone,
  Mail,
  Cake,
  StickyNote,
  Search,
  ArrowDown,
  ArrowUp,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useData } from '@/context/DataContext';

interface ClientHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | null;
  clientName: string;
}

interface ClientData {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}

interface AppointmentItem {
  id: string;
  start_time: string;
  status: string;
  total_value: number | null;
  notes: string | null;
  service: { name: string } | null;
  professional: { nickname: string; name: string } | null;
}

interface TransactionItem {
  id: string;
  created_at: string;
  amount: number;
  type: string;
  category: string;
  description: string | null;
  payment_method: string | null;
}

const statusLabels: Record<string, { label: string; color: string }> = {
  pre_scheduled: { label: 'Pré-Agendado', color: 'bg-orange-500' },
  scheduled: { label: 'Agendado', color: 'bg-blue-500' },
  confirmed: { label: 'Confirmado', color: 'bg-green-500' },
  in_progress: { label: 'Em Atendimento', color: 'bg-yellow-500' },
  completed: { label: 'Pago', color: 'bg-red-700' },
  cancelled: { label: 'Cancelado', color: 'bg-gray-400' },
};

export function ClientHistoryDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
}: ClientHistoryDialogProps) {
  const { toast } = useToast();
  const { updateClient } = useData();
  
  const [activeTab, setActiveTab] = useState('cadastro');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Client data
  const [client, setClient] = useState<ClientData | null>(null);
  const [editedClient, setEditedClient] = useState<Partial<ClientData>>({});
  
  // Appointments
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  
  // Transactions (Comandas)
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  
  // Credits
  const [creditBalance, setCreditBalance] = useState(0);

  useEffect(() => {
    if (open && clientId) {
      fetchAllData();
    }
  }, [open, clientId]);

  useEffect(() => {
    if (client) {
      setEditedClient({
        name: client.name,
        phone: client.phone,
        email: client.email,
        birth_date: client.birth_date,
        notes: client.notes,
      });
    }
  }, [client]);

  const fetchAllData = async () => {
    if (!clientId) return;
    
    setLoading(true);
    try {
      // Fetch client data
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .maybeSingle();

      if (clientError) throw clientError;
      setClient(clientData);

      // Fetch appointments
      const { data: appointmentsData, error: appointmentsError } = await supabase
        .from('appointments')
        .select(`
          id,
          start_time,
          status,
          total_value,
          notes,
          service:services(name),
          professional:professionals(nickname, name)
        `)
        .eq('client_id', clientId)
        .order('start_time', { ascending: false })
        .limit(100);

      if (appointmentsError) throw appointmentsError;
      setAppointments(appointmentsData || []);

      // Calculate credit balance from notes (simplified - in production you'd have a dedicated table)
      // For now, we'll just show 0
      setCreditBalance(0);

    } catch (error) {
      console.error('Error fetching client data:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os dados do cliente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!clientId || !editedClient) return;
    
    setSaving(true);
    try {
      await updateClient(clientId, editedClient);
      toast({
        title: 'Sucesso',
        description: 'Dados do cliente atualizados.',
      });
      fetchAllData();
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar os dados.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // Filter appointments by search term
  const filteredAppointments = appointments.filter(apt => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      apt.service?.name?.toLowerCase().includes(term) ||
      apt.professional?.nickname?.toLowerCase().includes(term) ||
      apt.notes?.toLowerCase().includes(term)
    );
  });

  // Get completed appointments as "comandas"
  const comandas = appointments.filter(apt => apt.status === 'completed');
  const filteredComandas = comandas.filter(apt => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      apt.service?.name?.toLowerCase().includes(term) ||
      apt.professional?.name?.toLowerCase().includes(term)
    );
  });

  // Stats
  const totalSpent = comandas.reduce((sum, apt) => sum + (apt.total_value || 0), 0);
  const completedCount = comandas.length;

  if (!clientId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
          {/* Tab Header */}
          <div className="border-b bg-muted/30">
            <TabsList className="h-auto p-0 bg-transparent rounded-none w-full justify-start overflow-x-auto">
              <TabsTrigger 
                value="cadastro" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm"
              >
                <User className="w-4 h-4 mr-1.5" />
                Cadastro
              </TabsTrigger>
              <TabsTrigger 
                value="agendamentos"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm"
              >
                <Calendar className="w-4 h-4 mr-1.5" />
                Agendamentos
              </TabsTrigger>
              <TabsTrigger 
                value="comandas"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm"
              >
                <FileText className="w-4 h-4 mr-1.5" />
                Comandas
              </TabsTrigger>
              <TabsTrigger 
                value="creditos"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm"
              >
                <CreditCard className="w-4 h-4 mr-1.5" />
                Créditos
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Loading State */}
          {loading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-20 w-20 rounded-full mx-auto" />
              <Skeleton className="h-8 w-48 mx-auto" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              {/* Cadastro Tab */}
              <TabsContent value="cadastro" className="flex-1 overflow-auto p-6 mt-0">
                <div className="flex flex-col md:flex-row gap-6">
                  {/* Photo */}
                  <div className="flex flex-col items-center gap-2">
                    <Avatar className="w-32 h-32 border-4 border-border">
                      <AvatarImage src={client?.photo_url || undefined} alt={client?.name} />
                      <AvatarFallback className="bg-muted text-4xl">
                        {client?.name?.charAt(0) || '?'}
                      </AvatarFallback>
                    </Avatar>
                  </div>

                  {/* Form */}
                  <div className="flex-1 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <Label htmlFor="name">Nome</Label>
                        <Input
                          id="name"
                          value={editedClient.name || ''}
                          onChange={(e) => setEditedClient({ ...editedClient, name: e.target.value })}
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="phone" className="flex items-center gap-1">
                          <Phone className="w-3 h-3" /> Celular
                        </Label>
                        <Input
                          id="phone"
                          value={editedClient.phone || ''}
                          onChange={(e) => setEditedClient({ ...editedClient, phone: e.target.value })}
                          placeholder="(11) 99999-9999"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="birth_date" className="flex items-center gap-1">
                          <Cake className="w-3 h-3" /> Data de Aniversário
                        </Label>
                        <Input
                          id="birth_date"
                          type="date"
                          value={editedClient.birth_date || ''}
                          onChange={(e) => setEditedClient({ ...editedClient, birth_date: e.target.value })}
                        />
                      </div>
                      
                      <div className="md:col-span-2">
                        <Label htmlFor="email" className="flex items-center gap-1">
                          <Mail className="w-3 h-3" /> E-mail
                        </Label>
                        <Input
                          id="email"
                          type="email"
                          value={editedClient.email || ''}
                          onChange={(e) => setEditedClient({ ...editedClient, email: e.target.value })}
                        />
                      </div>
                      
                      <div className="md:col-span-2">
                        <Label htmlFor="notes" className="flex items-center gap-1">
                          <StickyNote className="w-3 h-3" /> Observações
                        </Label>
                        <Textarea
                          id="notes"
                          value={editedClient.notes || ''}
                          onChange={(e) => setEditedClient({ ...editedClient, notes: e.target.value })}
                          rows={3}
                        />
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex gap-4 pt-4 border-t">
                      <div className="flex-1 bg-muted/50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-primary">{completedCount}</p>
                        <p className="text-xs text-muted-foreground">Atendimentos</p>
                      </div>
                      <div className="flex-1 bg-muted/50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-success">
                          R$ {totalSpent.toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground">Total Gasto</p>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Agendamentos Tab */}
              <TabsContent value="agendamentos" className="flex-1 overflow-auto p-6 mt-0">
                {/* Search */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                {/* Table */}
                <div className="border rounded-lg overflow-hidden">
                  {filteredAppointments.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>Nenhum agendamento encontrado</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data/Hora</TableHead>
                          <TableHead>Serviço</TableHead>
                          <TableHead>Profissional</TableHead>
                          <TableHead>Obs</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAppointments.map((item) => {
                          const statusInfo = statusLabels[item.status] || { label: item.status, color: 'bg-gray-400' };
                          return (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium whitespace-nowrap">
                                <div>{format(new Date(item.start_time), "dd/MM/yyyy", { locale: ptBR })}</div>
                                <div className="text-muted-foreground text-sm">
                                  {format(new Date(item.start_time), "HH:mm")}
                                </div>
                              </TableCell>
                              <TableCell>{item.service?.name || '-'}</TableCell>
                              <TableCell>{item.professional?.nickname || '-'}</TableCell>
                              <TableCell className="max-w-[150px] truncate">
                                {item.notes || '-'}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge className={`${statusInfo.color} text-white text-xs`}>
                                  {statusInfo.label}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </TabsContent>

              {/* Comandas Tab */}
              <TabsContent value="comandas" className="flex-1 overflow-auto p-6 mt-0">
                {/* Info Banner */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
                  <p>Abaixo estão listados os itens das comandas finalizadas pelo cliente.</p>
                </div>

                {/* Search */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                {/* Table */}
                <div className="border rounded-lg overflow-hidden">
                  {filteredComandas.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>Nenhuma comanda encontrada</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead>Profissional</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredComandas.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              {format(new Date(item.start_time), "dd/MM/yyyy", { locale: ptBR })}
                            </TableCell>
                            <TableCell>{item.service?.name || '-'}</TableCell>
                            <TableCell>{item.professional?.name || item.professional?.nickname || '-'}</TableCell>
                            <TableCell className="text-right font-medium">
                              R$ {(item.total_value || 0).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>

                {/* Total */}
                {filteredComandas.length > 0 && (
                  <div className="mt-4 flex justify-end">
                    <div className="bg-muted/50 rounded-lg px-4 py-2">
                      <span className="text-sm text-muted-foreground mr-2">Total:</span>
                      <span className="text-lg font-bold text-primary">
                        R$ {filteredComandas.reduce((sum, c) => sum + (c.total_value || 0), 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Créditos Tab */}
              <TabsContent value="creditos" className="flex-1 overflow-auto p-6 mt-0">
                {/* Info Banner */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
                  <p>Abaixo estão listados os créditos e dívidas do cliente.</p>
                </div>

                {/* Credit Balance and Actions */}
                <div className="flex flex-wrap items-center gap-4 mb-6">
                  <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-3">
                    <span className="text-green-700 font-medium">Crédito Disponível</span>
                    <div className="flex items-center bg-white border rounded px-3 py-1">
                      <span className="text-sm text-muted-foreground mr-1">R$</span>
                      <span className="font-bold text-lg">{creditBalance.toFixed(2)}</span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button variant="default" className="bg-blue-600 hover:bg-blue-700">
                      <ArrowDown className="w-4 h-4 mr-1" />
                      Adicionar Dívida
                    </Button>
                    <Button variant="default" className="bg-teal-500 hover:bg-teal-600">
                      <ArrowUp className="w-4 h-4 mr-1" />
                      Adicionar Crédito
                    </Button>
                  </div>
                </div>

                {/* Empty State */}
                <div className="border rounded-lg p-8 text-center bg-amber-50/50">
                  <CreditCard className="w-12 h-12 mx-auto mb-2 opacity-50 text-amber-600" />
                  <p className="text-amber-700">Nenhum histórico de movimentação para este cliente.</p>
                </div>
              </TabsContent>
            </>
          )}

          {/* Footer */}
          <div className="border-t bg-muted/30 p-4 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {client && (
                <>
                  <p>Data de cadastro: {format(new Date(client.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                  <p>Última modificação: {format(new Date(client.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              {activeTab === 'cadastro' && (
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </Button>
              )}
            </div>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
