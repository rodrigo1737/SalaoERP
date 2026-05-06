import { useEffect, useMemo, useState } from 'react';
import { Activity, Camera, ClipboardList, ImagePlus, Plus, Search, UserRound } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/context/DataContext';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

type AnamnesisRecord = {
  id: string;
  title: string;
  answers: Record<string, string | boolean>;
  notes: string | null;
  created_at: string;
};

type EvolutionRecord = {
  id: string;
  procedure_name: string;
  notes: string | null;
  measurements: Record<string, string>;
  created_at: string;
};

type PhotoRecord = {
  id: string;
  category: string;
  body_region: string | null;
  storage_path: string;
  notes: string | null;
  taken_at: string | null;
  created_at: string;
  signedUrl?: string;
};

type TermRecord = {
  id: string;
  title: string;
  content: string;
  signature_name: string | null;
  accepted_at: string | null;
  created_at: string;
};

const AESTHETIC_PHOTOS_BUCKET = 'aesthetic-client-photos';

const yesNo = (value: boolean | string | undefined) => {
  if (value === true || value === 'true') return 'Sim';
  if (value === false || value === 'false') return 'Não';
  return '-';
};

const formatDateTime = (value: string) => new Date(value).toLocaleString('pt-BR');

const fromAestheticTable = (table: string) => supabase.from(table as any);

export function AestheticsModule() {
  const { tenantId, currentTenant, canModify } = useAuth();
  const { clients, professionals } = useData();
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [savingAnamnesis, setSavingAnamnesis] = useState(false);
  const [savingEvolution, setSavingEvolution] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [savingTerm, setSavingTerm] = useState(false);
  const [anamneses, setAnamneses] = useState<AnamnesisRecord[]>([]);
  const [evolutions, setEvolutions] = useState<EvolutionRecord[]>([]);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [terms, setTerms] = useState<TermRecord[]>([]);

  const [anamnesisForm, setAnamnesisForm] = useState({
    title: 'Anamnese estética',
    allergies: false,
    medications: false,
    pregnant: false,
    diabetes: false,
    hypertension: false,
    recentProcedures: false,
    consent: false,
    objective: '',
    contraindications: '',
    notes: '',
  });

  const [evolutionForm, setEvolutionForm] = useState({
    professional_id: '',
    procedure_name: '',
    notes: '',
    weight: '',
    abdomen: '',
    waist: '',
    hip: '',
  });

  const [photoForm, setPhotoForm] = useState({
    category: 'avaliacao',
    body_region: '',
    taken_at: new Date().toISOString().slice(0, 10),
    notes: '',
    file: null as File | null,
  });
  const [termForm, setTermForm] = useState({
    title: 'Termo de consentimento',
    content: 'Declaro que recebi as orientações sobre o procedimento, contraindicações, cuidados e autorizo o registro das informações no prontuário estético.',
    signature_name: '',
    accepted: false,
  });

  const hasPackage = currentTenant?.package_type === 'aesthetic_clinic';
  const selectedClient = clients.find((client) => client.id === selectedClientId);

  const filteredClients = useMemo(() => {
    const query = clientSearch.toLowerCase().trim();
    return clients
      .filter((client) => {
        if (!query) return true;
        return client.name.toLowerCase().includes(query) || client.phone?.includes(query);
      })
      .slice(0, 100);
  }, [clients, clientSearch]);

  const fetchRecords = async () => {
    if (!tenantId || !selectedClientId || !hasPackage) return;

    setLoadingRecords(true);
    try {
      const [anamnesisResult, evolutionResult, photoResult, termResult] = await Promise.all([
        fromAestheticTable('aesthetic_anamneses')
          .select('id, title, answers, notes, created_at')
          .eq('tenant_id', tenantId)
          .eq('client_id', selectedClientId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        fromAestheticTable('aesthetic_evolutions')
          .select('id, procedure_name, notes, measurements, created_at')
          .eq('tenant_id', tenantId)
          .eq('client_id', selectedClientId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        fromAestheticTable('aesthetic_photos')
          .select('id, category, body_region, storage_path, notes, taken_at, created_at')
          .eq('tenant_id', tenantId)
          .eq('client_id', selectedClientId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        fromAestheticTable('aesthetic_terms')
          .select('id, title, content, signature_name, accepted_at, created_at')
          .eq('tenant_id', tenantId)
          .eq('client_id', selectedClientId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
      ]);

      if (anamnesisResult.error) throw anamnesisResult.error;
      if (evolutionResult.error) throw evolutionResult.error;
      if (photoResult.error) throw photoResult.error;
      if (termResult.error) throw termResult.error;

      const photoRows = (photoResult.data ?? []) as unknown as PhotoRecord[];
      const signedPhotos = await Promise.all(
        photoRows.map(async (photo) => {
          const { data } = await supabase.storage
            .from(AESTHETIC_PHOTOS_BUCKET)
            .createSignedUrl(photo.storage_path, 60 * 30);
          return { ...photo, signedUrl: data?.signedUrl };
        }),
      );

      setAnamneses((anamnesisResult.data ?? []) as unknown as AnamnesisRecord[]);
      setEvolutions((evolutionResult.data ?? []) as unknown as EvolutionRecord[]);
      setPhotos(signedPhotos);
      setTerms((termResult.data ?? []) as unknown as TermRecord[]);
    } catch (error) {
      console.error('Erro ao carregar prontuário estético:', error);
      toast.error('Erro ao carregar prontuário estético.');
    } finally {
      setLoadingRecords(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [tenantId, selectedClientId, hasPackage]);

  const handleSaveAnamnesis = async () => {
    if (!tenantId || !selectedClientId) return;
    if (!canModify()) {
      toast.error('Este cliente não permite alterações no momento.');
      return;
    }

    setSavingAnamnesis(true);
    try {
      const answers = {
        allergies: anamnesisForm.allergies,
        medications: anamnesisForm.medications,
        pregnant: anamnesisForm.pregnant,
        diabetes: anamnesisForm.diabetes,
        hypertension: anamnesisForm.hypertension,
        recentProcedures: anamnesisForm.recentProcedures,
        consent: anamnesisForm.consent,
        objective: anamnesisForm.objective,
        contraindications: anamnesisForm.contraindications,
      };

      const { error } = await fromAestheticTable('aesthetic_anamneses').insert({
        tenant_id: tenantId,
        client_id: selectedClientId,
        title: anamnesisForm.title || 'Anamnese estética',
        answers,
        notes: anamnesisForm.notes || null,
      });

      if (error) throw error;

      setAnamnesisForm({
        title: 'Anamnese estética',
        allergies: false,
        medications: false,
        pregnant: false,
        diabetes: false,
        hypertension: false,
        recentProcedures: false,
        consent: false,
        objective: '',
        contraindications: '',
        notes: '',
      });
      toast.success('Anamnese salva.');
      fetchRecords();
    } catch (error) {
      console.error('Erro ao salvar anamnese:', error);
      toast.error('Erro ao salvar anamnese.');
    } finally {
      setSavingAnamnesis(false);
    }
  };

  const handleSaveEvolution = async () => {
    if (!tenantId || !selectedClientId || !evolutionForm.procedure_name.trim()) return;
    if (!canModify()) {
      toast.error('Este cliente não permite alterações no momento.');
      return;
    }

    setSavingEvolution(true);
    try {
      const { error } = await fromAestheticTable('aesthetic_evolutions').insert({
        tenant_id: tenantId,
        client_id: selectedClientId,
        professional_id: evolutionForm.professional_id || null,
        procedure_name: evolutionForm.procedure_name.trim(),
        notes: evolutionForm.notes || null,
        measurements: {
          weight: evolutionForm.weight,
          abdomen: evolutionForm.abdomen,
          waist: evolutionForm.waist,
          hip: evolutionForm.hip,
        },
      });

      if (error) throw error;

      setEvolutionForm({
        professional_id: '',
        procedure_name: '',
        notes: '',
        weight: '',
        abdomen: '',
        waist: '',
        hip: '',
      });
      toast.success('Evolução salva.');
      fetchRecords();
    } catch (error) {
      console.error('Erro ao salvar evolução:', error);
      toast.error('Erro ao salvar evolução.');
    } finally {
      setSavingEvolution(false);
    }
  };

  const handleSavePhoto = async () => {
    if (!tenantId || !selectedClientId || !photoForm.file) return;
    if (!canModify()) {
      toast.error('Este cliente não permite alterações no momento.');
      return;
    }

    setSavingPhoto(true);
    try {
      const extension = photoForm.file.name.split('.').pop() || 'jpg';
      const storagePath = `${tenantId}/${selectedClientId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from(AESTHETIC_PHOTOS_BUCKET)
        .upload(storagePath, photoForm.file, { upsert: false });

      if (uploadError) throw uploadError;

      const { error } = await fromAestheticTable('aesthetic_photos').insert({
        tenant_id: tenantId,
        client_id: selectedClientId,
        category: photoForm.category,
        body_region: photoForm.body_region || null,
        storage_path: storagePath,
        notes: photoForm.notes || null,
        taken_at: photoForm.taken_at || null,
      });

      if (error) throw error;

      setPhotoForm({
        category: 'avaliacao',
        body_region: '',
        taken_at: new Date().toISOString().slice(0, 10),
        notes: '',
        file: null,
      });
      toast.success('Foto salva no prontuário.');
      fetchRecords();
    } catch (error) {
      console.error('Erro ao salvar foto:', error);
      toast.error('Erro ao salvar foto.');
    } finally {
      setSavingPhoto(false);
    }
  };

  const handleSaveTerm = async () => {
    if (!tenantId || !selectedClientId || !termForm.title.trim() || !termForm.content.trim()) return;
    if (!canModify()) {
      toast.error('Este cliente não permite alterações no momento.');
      return;
    }

    setSavingTerm(true);
    try {
      const { error } = await fromAestheticTable('aesthetic_terms').insert({
        tenant_id: tenantId,
        client_id: selectedClientId,
        title: termForm.title.trim(),
        content: termForm.content.trim(),
        signature_name: termForm.signature_name || null,
        accepted_at: termForm.accepted ? new Date().toISOString() : null,
      });

      if (error) throw error;

      setTermForm({
        title: 'Termo de consentimento',
        content: 'Declaro que recebi as orientações sobre o procedimento, contraindicações, cuidados e autorizo o registro das informações no prontuário estético.',
        signature_name: '',
        accepted: false,
      });
      toast.success('Termo salvo.');
      fetchRecords();
    } catch (error) {
      console.error('Erro ao salvar termo:', error);
      toast.error('Erro ao salvar termo.');
    } finally {
      setSavingTerm(false);
    }
  };

  if (!hasPackage) {
    return (
      <div className="p-6 lg:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Módulo de Estética</CardTitle>
            <CardDescription>
              Este módulo fica disponível para clientes no pacote Estética e Emagrecimento.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-3xl lg:text-4xl font-display font-bold text-foreground">Estética</h1>
        <p className="text-muted-foreground mt-1">
          Prontuário, anamnese, evolução e fotos clínicas
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRound className="h-5 w-5" />
            Cliente do Prontuário
          </CardTitle>
          <CardDescription>Busque e selecione o cliente para visualizar ou registrar informações.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_320px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar cliente por nome ou telefone..."
              value={clientSearch}
              onChange={(event) => setClientSearch(event.target.value)}
            />
          </div>
          <Select value={selectedClientId} onValueChange={setSelectedClientId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecionar cliente" />
            </SelectTrigger>
            <SelectContent>
              {filteredClients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {!selectedClient ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Selecione um cliente para abrir o prontuário estético.
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="anamnesis" className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">{selectedClient.name}</h2>
              <p className="text-sm text-muted-foreground">{selectedClient.phone || selectedClient.email || 'Sem contato'}</p>
            </div>
            <TabsList>
              <TabsTrigger value="anamnesis">Anamnese</TabsTrigger>
              <TabsTrigger value="evolution">Evolução</TabsTrigger>
              <TabsTrigger value="photos">Fotos</TabsTrigger>
              <TabsTrigger value="terms">Termos</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="anamnesis" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" />
                  Nova Anamnese
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Título</Label>
                    <Input
                      value={anamnesisForm.title}
                      onChange={(event) => setAnamnesisForm({ ...anamnesisForm, title: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Objetivo do tratamento</Label>
                    <Input
                      value={anamnesisForm.objective}
                      onChange={(event) => setAnamnesisForm({ ...anamnesisForm, objective: event.target.value })}
                      placeholder="Emagrecimento, facial, corporal..."
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    ['allergies', 'Possui alergias?'],
                    ['medications', 'Usa medicação contínua?'],
                    ['pregnant', 'Gestante/lactante?'],
                    ['diabetes', 'Diabetes?'],
                    ['hypertension', 'Hipertensão?'],
                    ['recentProcedures', 'Procedimento recente?'],
                    ['consent', 'Consentiu o registro?'],
                  ].map(([field, label]) => (
                    <label key={field} className="flex items-center gap-2 rounded-md border p-3 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(anamnesisForm[field as keyof typeof anamnesisForm])}
                        onChange={(event) => setAnamnesisForm({ ...anamnesisForm, [field]: event.target.checked })}
                      />
                      {label}
                    </label>
                  ))}
                </div>

                <div className="space-y-2">
                  <Label>Contraindicações e observações clínicas</Label>
                  <Textarea
                    value={anamnesisForm.contraindications}
                    onChange={(event) => setAnamnesisForm({ ...anamnesisForm, contraindications: event.target.value })}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Observações gerais</Label>
                  <Textarea
                    value={anamnesisForm.notes}
                    onChange={(event) => setAnamnesisForm({ ...anamnesisForm, notes: event.target.value })}
                    rows={3}
                  />
                </div>
                <Button onClick={handleSaveAnamnesis} disabled={savingAnamnesis || !canModify()}>
                  <Plus className="mr-2 h-4 w-4" />
                  {savingAnamnesis ? 'Salvando...' : 'Salvar anamnese'}
                </Button>
              </CardContent>
            </Card>

            {anamneses.map((record) => (
              <Card key={record.id}>
                <CardHeader>
                  <CardTitle className="text-base">{record.title}</CardTitle>
                  <CardDescription>{formatDateTime(record.created_at)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid gap-2 md:grid-cols-4">
                    <Badge variant="outline">Alergia: {yesNo(record.answers.allergies)}</Badge>
                    <Badge variant="outline">Medicação: {yesNo(record.answers.medications)}</Badge>
                    <Badge variant="outline">Diabetes: {yesNo(record.answers.diabetes)}</Badge>
                    <Badge variant="outline">Consentimento: {yesNo(record.answers.consent)}</Badge>
                  </div>
                  {record.answers.objective && <p><strong>Objetivo:</strong> {record.answers.objective}</p>}
                  {record.answers.contraindications && <p><strong>Contraindicações:</strong> {record.answers.contraindications}</p>}
                  {record.notes && <p><strong>Observações:</strong> {record.notes}</p>}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="evolution" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Nova Evolução
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Procedimento *</Label>
                    <Input
                      value={evolutionForm.procedure_name}
                      onChange={(event) => setEvolutionForm({ ...evolutionForm, procedure_name: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Profissional</Label>
                    <Select
                      value={evolutionForm.professional_id || 'none'}
                      onValueChange={(value) => setEvolutionForm({ ...evolutionForm, professional_id: value === 'none' ? '' : value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Não informado</SelectItem>
                        {professionals.map((professional) => (
                          <SelectItem key={professional.id} value={professional.id}>
                            {professional.nickname}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                  <Input placeholder="Peso" value={evolutionForm.weight} onChange={(event) => setEvolutionForm({ ...evolutionForm, weight: event.target.value })} />
                  <Input placeholder="Abdômen" value={evolutionForm.abdomen} onChange={(event) => setEvolutionForm({ ...evolutionForm, abdomen: event.target.value })} />
                  <Input placeholder="Cintura" value={evolutionForm.waist} onChange={(event) => setEvolutionForm({ ...evolutionForm, waist: event.target.value })} />
                  <Input placeholder="Quadril" value={evolutionForm.hip} onChange={(event) => setEvolutionForm({ ...evolutionForm, hip: event.target.value })} />
                </div>
                <Textarea
                  placeholder="Registro da sessão, parâmetros, reação do cliente e orientações..."
                  value={evolutionForm.notes}
                  onChange={(event) => setEvolutionForm({ ...evolutionForm, notes: event.target.value })}
                  rows={4}
                />
                <Button onClick={handleSaveEvolution} disabled={savingEvolution || !evolutionForm.procedure_name || !canModify()}>
                  <Plus className="mr-2 h-4 w-4" />
                  {savingEvolution ? 'Salvando...' : 'Salvar evolução'}
                </Button>
              </CardContent>
            </Card>

            {evolutions.map((record) => (
              <Card key={record.id}>
                <CardHeader>
                  <CardTitle className="text-base">{record.procedure_name}</CardTitle>
                  <CardDescription>{formatDateTime(record.created_at)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(record.measurements || {}).filter(([, value]) => value).map(([key, value]) => (
                      <Badge key={key} variant="outline">{key}: {value}</Badge>
                    ))}
                  </div>
                  {record.notes && <p>{record.notes}</p>}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="photos" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImagePlus className="h-5 w-5" />
                  Nova Foto Clínica
                </CardTitle>
                <CardDescription>As fotos ficam em bucket privado e são exibidas com link temporário.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-4">
                  <Select value={photoForm.category} onValueChange={(value) => setPhotoForm({ ...photoForm, category: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="avaliacao">Avaliação</SelectItem>
                      <SelectItem value="antes">Antes</SelectItem>
                      <SelectItem value="durante">Durante</SelectItem>
                      <SelectItem value="depois">Depois</SelectItem>
                      <SelectItem value="documento">Documento</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Região corporal"
                    value={photoForm.body_region}
                    onChange={(event) => setPhotoForm({ ...photoForm, body_region: event.target.value })}
                  />
                  <Input
                    type="date"
                    value={photoForm.taken_at}
                    onChange={(event) => setPhotoForm({ ...photoForm, taken_at: event.target.value })}
                  />
                  <Input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => setPhotoForm({ ...photoForm, file: event.target.files?.[0] ?? null })}
                  />
                </div>
                <Textarea
                  placeholder="Observações da foto..."
                  value={photoForm.notes}
                  onChange={(event) => setPhotoForm({ ...photoForm, notes: event.target.value })}
                  rows={2}
                />
                <Button onClick={handleSavePhoto} disabled={savingPhoto || !photoForm.file || !canModify()}>
                  <Camera className="mr-2 h-4 w-4" />
                  {savingPhoto ? 'Enviando...' : 'Salvar foto'}
                </Button>
              </CardContent>
            </Card>

            {loadingRecords ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">Carregando...</CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                {photos.map((photo) => (
                  <Card key={photo.id} className="overflow-hidden">
                    {photo.signedUrl ? (
                      <img src={photo.signedUrl} alt={photo.category} className="aspect-[4/3] w-full object-cover" />
                    ) : (
                      <div className="flex aspect-[4/3] items-center justify-center bg-muted text-muted-foreground">
                        Foto indisponível
                      </div>
                    )}
                    <CardContent className="space-y-1 p-4 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <Badge>{photo.category}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {photo.taken_at ? new Date(photo.taken_at).toLocaleDateString('pt-BR') : formatDateTime(photo.created_at)}
                        </span>
                      </div>
                      {photo.body_region && <p><strong>Região:</strong> {photo.body_region}</p>}
                      {photo.notes && <p className="text-muted-foreground">{photo.notes}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="terms" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" />
                  Novo Termo
                </CardTitle>
                <CardDescription>Registro simples de consentimento e ciência do cliente.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Título</Label>
                    <Input
                      value={termForm.title}
                      onChange={(event) => setTermForm({ ...termForm, title: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome para assinatura/aceite</Label>
                    <Input
                      value={termForm.signature_name}
                      onChange={(event) => setTermForm({ ...termForm, signature_name: event.target.value })}
                      placeholder={selectedClient.name}
                    />
                  </div>
                </div>
                <Textarea
                  value={termForm.content}
                  onChange={(event) => setTermForm({ ...termForm, content: event.target.value })}
                  rows={5}
                />
                <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={termForm.accepted}
                    onChange={(event) => setTermForm({ ...termForm, accepted: event.target.checked })}
                  />
                  Cliente aceitou/ciente neste atendimento
                </label>
                <Button onClick={handleSaveTerm} disabled={savingTerm || !termForm.title || !termForm.content || !canModify()}>
                  <Plus className="mr-2 h-4 w-4" />
                  {savingTerm ? 'Salvando...' : 'Salvar termo'}
                </Button>
              </CardContent>
            </Card>

            {terms.map((term) => (
              <Card key={term.id}>
                <CardHeader>
                  <CardTitle className="text-base">{term.title}</CardTitle>
                  <CardDescription>{formatDateTime(term.created_at)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="whitespace-pre-wrap">{term.content}</p>
                  <div className="flex flex-wrap gap-2">
                    {term.signature_name && <Badge variant="outline">Assinatura: {term.signature_name}</Badge>}
                    <Badge variant={term.accepted_at ? 'success' : 'secondary'}>
                      {term.accepted_at ? `Aceito em ${formatDateTime(term.accepted_at)}` : 'Sem aceite registrado'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
