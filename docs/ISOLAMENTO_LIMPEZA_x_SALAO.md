# Análise de Isolamento — Módulo Limpeza × Salão

**Data:** 2026-05-18
**Responsável:** Multi Soluction (Rodrigo Salomão)
**Escopo:** Verificar se o módulo de gestão de limpeza compartilha código/UI/dados com o módulo de salão, e se há risco de vazamento entre clientes B2B (tenants distintos).

---

## TL;DR

**Vazamento entre clientes (tenants) diferentes: NÃO ocorre.**
Multi-tenancy é correto. As 14 tabelas `cleaning_*` têm `tenant_id NOT NULL REFERENCES tenants(id)` e RLS com `can_view_cleaning(tenant_id)` / `can_manage_cleaning(tenant_id)`. As funções RLS são `SECURITY DEFINER` com `SET search_path = public` e exigem papel/permissão no mesmo `_tenant_id`. Um usuário do tenant A não consegue ler/escrever em registros do tenant B.

**Mistura no MESMO tenant: parcialmente intencional, parcialmente dívida técnica.**
- `package_type = 'cleaning_control'` → frontend bloqueia páginas de salão e força `CleaningModule`. ✓
- `package_type = 'business_erp'` → habilita TANTO salão QUANTO limpeza no mesmo tenant. Comportamento por design.
- `DataContext` carrega salão (clients/professionals/services/products/appointments/cash_sessions/transactions/commissions) para QUALQUER tenant, inclusive `cleaning_control`. Não vaza para outro tenant (filtra por `tenant_id`), mas carrega dados que o tenant de limpeza não precisa.

**Pontos de atenção** estão listados na seção 6.

---

## 1. Modelo de Segmentação

O projeto opera com duas representações **redundantes** do segmento do tenant:

| Mecanismo | Onde vive | Quem usa | Status |
| --- | --- | --- | --- |
| `tenants.package_type` (texto) | Tabela `tenants` | Frontend (helpers em `src/lib/tenantSegments.ts`) e funções `has_cleaning_package`/`has_aesthetic_package` no banco | **Em uso** |
| `tenant_segments` (tabela) | Criada pela migration `20260516120000_add_cleaning_control_module.sql` | Backfill popula a tabela com base em `package_type`, mas **nenhum componente do frontend a consulta** | **Implementação morta** |

**Implicação:** existe uma tabela `tenant_segments` desenhada para um modelo multi-segmento por tenant (um tenant poderia ter `salon` + `cleaning_control` ativos simultaneamente, por exemplo), mas a lógica real ainda decide por `package_type`. Em curto prazo isso não quebra nada — em longo prazo, ou a tabela `tenant_segments` deve ser adotada pelo frontend, ou ser removida para não criar confusão.

---

## 2. Tabelas do Módulo de Limpeza (próprias)

Criadas na migration `20260516120000_add_cleaning_control_module.sql` — 14 tabelas:

```
cleaning_properties
cleaning_appointments
cleaning_teams
cleaning_team_members
cleaning_service_settings
cleaning_financial_entries
cleaning_commission_payables
cleaning_commission_rules
cleaning_appointment_checklist
cleaning_appointment_photos
cleaning_checklist_templates
cleaning_checklist_items
cleaning_staff_visibility
tenant_segments
```

**Auditoria de isolamento:**

| Critério | Status |
| --- | --- |
| `tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE` em todas as tabelas | ✅ |
| `ENABLE ROW LEVEL SECURITY` em todas | ✅ (14 ocorrências na migration) |
| `CREATE POLICY` USING `can_view_cleaning(tenant_id)` para SELECT | ✅ (31 policies) |
| `WITH CHECK can_manage_cleaning(tenant_id)` para INSERT/UPDATE/DELETE | ✅ |
| Funções `SECURITY DEFINER` com `SET search_path = public` | ✅ (10 funções, todas com `search_path` setado) |

**Definição de `can_view_cleaning(_tenant_id)`** — extraído da migration:

```sql
SELECT public.has_cleaning_package(_tenant_id)
  AND (
    public.is_super_admin(auth.jwt() ->> 'email')
    OR public.has_role(auth.uid(), 'admin', _tenant_id)
    OR public.has_permission(auth.uid(), 'view_schedule', _tenant_id)
    OR public.has_permission(auth.uid(), 'edit_schedule', _tenant_id)
  );
```

**Tradução:** para ler uma linha de `cleaning_*` com `tenant_id = X`, o usuário precisa simultaneamente (a) que o tenant X tenha o pacote de limpeza e (b) ser super-admin OU ser admin/profissional **autorizado no MESMO tenant X**. **Não há caminho** para ler dados de outro tenant.

---

## 3. Tabelas Compartilhadas usadas pelo CleaningModule

`CleaningModule.tsx` acessa também 3 tabelas compartilhadas com o salão:

| Tabela | Uso no CleaningModule | Coluna `tenant_id`? | Filtra por tenant_id no frontend? |
| --- | --- | --- | --- |
| `clients` | Lista pelo `useData()` + `insert` para "Cliente avulso" | ✅ | ✅ (`DataContext.fetchClients` faz `.eq('tenant_id', tenantId)`) |
| `professionals` | Lista pelo `useData()` + `update` para flag `works_cleaning` | ✅ | ✅ |
| `transactions` | Insere lançamentos financeiros via helper interno | ✅ | ✅ (insert sempre carrega `tenant_id: tenantId`) |

**Verificação direta no código do `CleaningModule.tsx`:**

```ts
// linha 684 — insere cliente avulso com tenant_id explícito
.from('clients').insert({ tenant_id: tenantId, name: 'Cliente avulso' })

// linha 617 — atualiza profissional filtrando por tenant_id
.from('professionals').update({ works_cleaning: enabled })
  .eq('id', professionalId).eq('tenant_id', tenantId)

// linha 370 — insere transação com tenant_id explícito
.from('transactions').insert({ ...transaction, tenant_id: tenantId })
```

**Isolamento operacional: OK** para os caminhos auditados. Cada operação carrega `tenant_id` corretamente.

---

## 4. Roteamento e UI — `Index.tsx`

`src/pages/Index.tsx` é o ponto onde o segmento muda a experiência:

```ts
const CLEANING_BLOCKED_PAGES = ['agenda', 'services', 'products', 'suppliers',
                                'purchase', 'stock-movements', 'commissions', 'cashier'];

const isCleaningTenant = isCleaningControlTenant(currentTenant);

// 1) Bloqueia 8 páginas para cleaning_control
if (isCleaningTenant && CLEANING_BLOCKED_PAGES.includes(targetPage)) return false;

// 2) Redireciona qualquer tentativa para CleaningModule
if (isCleaningTenant && CLEANING_BLOCKED_PAGES.includes(currentPage)) return <CleaningModule />;

// 3) Página /agenda vira /cleaning para cleaning_control
case 'agenda': return isCleaningTenant ? <CleaningModule /> : <Schedule />;

// 4) Default page do cleaning_control é 'cleaning'
if (isCleaningTenant && canAccessPage('cleaning')) return 'cleaning';
```

**Conclusão:** um tenant `cleaning_control` **não consegue navegar para telas de salão** via UI. O isolamento de UX está coerente.

**Tenants `business_erp`** mantêm acesso a TUDO (salão + limpeza). Isso é intencional — um salão grande pode usar o módulo de limpeza para sua própria operação de zeladoria.

---

## 5. Booking público (`/b/:slug`)

`src/pages/booking/*` (auto-agendamento do cliente final) usa apenas tabelas de salão:

```
appointments, professionals, service_professionals, services,
tenant_settings, tenants, client-photos (storage)
```

**Não toca em tabelas `cleaning_*`.** O booking público é exclusivo de tenants de salão hoje. Se no futuro houver auto-agendamento para limpeza, será uma rota nova — sem risco de mistura atual.

---

## 6. Pontos de Atenção

### 🔴 Alto

1. **RLS das tabelas compartilhadas não está versionada no Git.**
   As migrations no repositório criam RLS apenas para os módulos novos (cleaning, aesthetic, storage, client_accounts). As policies de `clients`, `professionals`, `transactions`, `appointments`, `services`, `products`, `commissions`, `cash_sessions`, `stock_movements` **existem em produção** (caso contrário o aplicativo não funcionaria com `anon key`), mas foram criadas fora do Git — provavelmente via Dashboard Supabase ou em migration inicial não-versionada.
   **Risco:** se alguém clonar o repo e rodar `supabase db push` num projeto novo, terá um banco com tabelas core **sem RLS** — dados expostos via anon key. Também impossibilita auditoria das policies em PR.
   **Ação sugerida:** dumpar as policies atuais (`supabase db dump --schema-only` ou via SQL) e versionar como `migrations/00000000000000_baseline_rls.sql`.

### 🟠 Médio

2. **`DataContext` carrega salão inteiro para tenants `cleaning_control`.**
   Em `Index.tsx`, `DataProvider`/`StableDataProvider`/`StockProvider` são montados para todo tenant autenticado. Dentro deles, `loadAllData()` dispara 8 fetches paralelos (clients, professionals, services, products, appointments, cash, transactions, commissions). Para um tenant `cleaning_control`, **services/products/appointments/cash_sessions são lixo** carregado em memória.
   **Não vaza para outro tenant**, mas:
   - Custo de rede e memória no cliente.
   - Risco de UI confusa se algum componente acidentalmente consumir `appointments` (não `cleaning_appointments`) para um tenant `cleaning_control` — daria a impressão de "vazamento" entre módulos no mesmo tenant.
   **Ação sugerida:** condicionar os fetches dentro do `DataContext` ao `package_type`. Ou (idealmente) migrar para React Query com `enabled: !isCleaningTenant` por entidade.

3. **`tenant_segments` parcialmente implementada.**
   Tabela criada e populada pelo backfill, mas frontend ainda decide por `package_type` (string). Caminho mais robusto seria consultar `tenant_segments` (booleano por segmento) — porém o esforço só vale a pena se a expectativa for **multi-segmento por tenant** no futuro. Senão, remover a tabela.
   **Decisão necessária:** roadmap multi-segmento sim/não?

### 🟡 Baixo

4. **Helper `tenantSegments.ts` normaliza variações (`cleaning`, `limpeza`, `controle_limpeza`).**
   O helper aceita 4 strings diferentes como sinônimos de cleaning. Isso é defensivo (caso o banco tenha valores antigos), mas se a coluna `package_type` for canônica em `'cleaning_control'`, a tolerância vira ruído. Validar via SQL: `SELECT DISTINCT package_type FROM tenants;` — se só houver os valores oficiais, simplificar o helper.

5. **`CleaningModule.tsx` chama `useData()` (DataContext de salão).**
   Faz isso porque precisa de `clients` e `professionals`. Funciona, mas acopla o módulo de limpeza ao DataContext de salão. Se o item 2 acima for resolvido (DataContext condicional), o CleaningModule precisa de uma fonte alternativa para essas duas listas — sugestão: hooks dedicados `useClients()` / `useProfessionals()` (com React Query) chamando direto o Supabase.

---

## 7. Resposta direta às suas preocupações

> **"Verifique se a parte de gestão de limpeza está misturando com salão de beleza"**

- **Backend / banco:** as 14 tabelas `cleaning_*` são totalmente segregadas, com `tenant_id` obrigatório e RLS própria. As únicas tabelas compartilhadas são `clients`, `professionals` e `transactions` — e o uso é correto (filtros por `tenant_id` em todas as operações auditadas).
- **Frontend / UI:** para tenants `cleaning_control`, o `Index.tsx` bloqueia 8 páginas de salão e força o CleaningModule como padrão. Para tenants `business_erp`, salão e limpeza coexistem por design.
- **Dívida real:** o `DataContext` carrega dados de salão (services/products/appointments/etc) mesmo para tenants puro-limpeza. Isso é overhead e fonte potencial de confusão visual, não vazamento.

> **"Temos que ter certeza que não vai atrapalhar ou compartilhar dados entre os clientes B2B"**

- **Entre clientes (tenants) diferentes:** isolamento garantido por `tenant_id` + RLS. Verificado nas funções `can_view_cleaning` / `can_manage_cleaning` da migration `20260516120000`.
- **Risco residual:** as tabelas core (clients/professionals/transactions etc.) têm RLS em produção mas não no Git. Esse é o ponto cego que recomendo fechar imediatamente — não porque haja vazamento hoje, mas porque a próxima migration que mexer nelas pode quebrar a isolation sem que o time perceba.

---

## 8. Recomendações priorizadas

| # | Ação | Prazo | Esforço |
| --- | --- | --- | --- |
| 1 | Exportar as RLS atuais das tabelas core e versionar como `migrations/00000000000000_baseline_rls.sql` | Esta semana | 2 h |
| 2 | Condicionar fetches do `DataContext` ao `package_type` (skip salão se `cleaning_control`) | 1-2 semanas | 2-3 h |
| 3 | Decidir destino do `tenant_segments`: usar no frontend OU dropar a tabela | 1 mês | 30 min (decisão) + 2-4 h (execução) |
| 4 | Auditoria SQL: `SELECT DISTINCT package_type FROM tenants;` para limpar o helper `tenantSegments.ts` | 5 min | — |
| 5 | Adicionar teste e2e: usuário de tenant A não consegue listar `cleaning_appointments` de tenant B | Quando houver setup de teste | — |

---

**Diagnóstico final:** o isolamento entre clientes B2B está **estruturalmente correto**. As dívidas existentes são de eficiência (DataContext) e governança (RLS fora do Git), não de segurança ativa. Os pontos 1 e 2 da tabela acima fecham o gap principal.
