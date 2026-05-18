# Auditoria Técnica e Roadmap de Melhorias — SalaoERP

**Data:** 2026-05-18
**Responsável:** Multi Soluction (Rodrigo Salomão)
**Repositório:** https://github.com/rodrigo1737/SalaoERP
**Branch base:** `main`

---

## 1. Stack e Visão Geral

| Camada | Tecnologia |
| --- | --- |
| Frontend | React 18.3, TypeScript 5.8, Vite 5.4 (SWC) |
| UI | Tailwind 3.4 + shadcn/ui (Radix) + lucide-react + framer-motion |
| Estado server | `@tanstack/react-query` 5.83 *(instalado, mas não utilizado)* |
| Estado cliente | React Context (3 contexts em `contexts/` + 3 em `context/`) |
| Forms / validação | react-hook-form 7.61 + zod 3.25 *(uso parcial)* |
| Backend / DB | Supabase (PostgreSQL + Auth + Storage + Edge Functions) |
| Roteamento | react-router-dom 6.30 (sem code-splitting / lazy) |

Tamanho do código-fonte TS/TSX: **28.596 linhas em 114 arquivos**. Schema Supabase: **10 migrations / 1.940 linhas SQL / 18 tabelas**, com 4 Edge Functions.

---

## 2. Diagnóstico — Por Severidade

### 🔴 Crítico

1. **`.env` versionado no Git, sem `.gitignore`**
   - Repositório sem `.gitignore`. O arquivo `.env` está rastreado (`git ls-files` confirma).
   - A chave atual é `VITE_SUPABASE_PUBLISHABLE_KEY` (anon/publishable), portanto **não há vazamento de service_role**. Ainda assim, versionar `.env` é antipadrão: rotação fica acoplada ao histórico Git e qualquer chave sensível futura entra automaticamente no commit.
   - **Sintomas colaterais:** PDF comercial (`NLT_Proposta_Prestacao_Servico_Multisoluction_2026_atualizada.pdf`) e script Pine (`btc_mtf_institutional_pro.pine`) estão untracked na pasta do projeto — risco real de commit acidental.

2. **React Query instalado mas com zero uso**
   - `QueryClientProvider` montado em `App.tsx`, mas `grep useQuery|useMutation src/` retorna 0.
   - Toda a busca de dados é feita em `useEffect` + chamada direta ao `supabase` (14 arquivos confirmados). Consequências: refetch manual, sem cache, sem invalidação coordenada, sem retry/staleness, prop-drilling de loading/error.

### 🟠 Alto

3. **Duplicação `src/context/` ↔ `src/contexts/`**
   - `context/`: `DataContext.tsx` (1.039 linhas), `StableDataContext.tsx`, `StockContext.tsx`.
   - `contexts/`: `AuthContext.tsx`, `ClientAuthContext.tsx`, `TenantSettingsContext.tsx`.
   - Inconsistência de naming + risco de divergência. `DataContext` com 1.039 linhas concentra estado de múltiplos domínios (god-context).

4. **God-components — arquivos acima de 700 linhas**

   | Arquivo | Linhas |
   | --- | --- |
   | `components/cleaning/CleaningModule.tsx` | 1.776 |
   | `components/tenants/TenantsList.tsx` | 1.152 |
   | `components/schedule/Schedule.tsx` | 1.077 |
   | `context/DataContext.tsx` | 1.039 |
   | `components/reports/Reports.tsx` | 993 |
   | `components/services/ServicesList.tsx` | 927 |
   | `components/professionals/ProfessionalsList.tsx` | 854 |
   | `components/aesthetics/AestheticsModule.tsx` | 841 |
   | `components/products/ProductsList.tsx` | 796 |
   | `components/cashier/Cashier.tsx` | 715 |
   | `components/schedule/AppointmentDetailDialog.tsx` | 704 |

   Indica módulos que misturam fetch, lógica de negócio, formulários e UI em um único componente.

5. **TypeScript em modo permissivo**
   - `tsconfig.app.json` com `strict: false`, `noImplicitAny: false`, `noUnusedLocals: false`, `noUnusedParameters: false`, `noFallthroughCasesInSwitch: false`.
   - 9 ocorrências de `: any` explícito (Admin.tsx concentra 7). Em ERP financeiro, tipagem frouxa é dívida que sangra.

6. **Sem code-splitting / lazy routes**
   - `App.tsx` faz `import` estático de todas as páginas (Admin, Auth, Index, BookingHome, ClientBooking, etc.).
   - Bundle inicial carrega o ERP inteiro mesmo para um cliente que só vai usar `/b/:slug/agendar`. Em página de auto-agendamento isso impacta TTI e conversão.

### 🟡 Médio

7. **Forms inconsistentes**
   - zod só é usado em `passwordValidation.ts`, `Auth.tsx`, `booking/ClientSignup.tsx`, `booking/ClientLogin.tsx`.
   - Nenhum uso de `zodResolver` em formulários internos do ERP (cadastros de cliente, serviço, profissional, agendamento). Validação distribuída no componente.

8. **377 ocorrências de `useState`**
   - Sintoma — não problema por si só — de estado local fragmentado que poderia ser server-state via React Query.

9. **TODOs pendentes coerentes (não-bugs, mas dívida)**
   - 6 TODOs todos relacionados a reativar disparo de e-mail de confirmação no booking público (commit `6f96cac` pausou explicitamente). Ponto a priorizar quando o fluxo de SMTP/Resend for definido.

10. **Coexistência de `Sonner` + `Toaster` (shadcn)**
    - Dois sistemas de toast montados em paralelo. Padronizar em um único.

### 🟢 Baixo / Observações positivas

- **Supabase bem estruturado:** todas as funções `SECURITY DEFINER` (28 totais) possuem `SET search_path` explícito → protegido contra search_path injection.
- **RLS ativada** nos módulos novos (clinic, cleaning, storage).
- **ErrorBoundary** envolvendo rotas autenticadas — bom.
- **ProtectedRoute** com checagem de role (`requiredRole="admin"`) — bom.
- Apenas **1 `console.log`** no código (excluindo `console.error`).
- Types do Supabase **gerados** (`integrations/supabase/types.ts`, 1.325 linhas) — tipagem forte na borda do DB.

---

## 3. Roadmap de Melhorias

Cada item é uma **branch + commit direto na `main`** (sua escolha em vez de PR). Vou trazer cada um para sua aprovação antes de executar.

### Fase 0 — Higiene (1 sessão, baixo risco)

| # | Ação | Esforço | Risco |
| --- | --- | --- | --- |
| 0.1 | Criar `.gitignore` (Node + Vite + IDE + macOS + `.env*`) | 5 min | Nulo |
| 0.2 | Remover `.env` do tracking (`git rm --cached`) + `.env.example` | 10 min | Nulo |
| 0.3 | Remover do working tree os arquivos alheios ao projeto (PDF comercial, .pine) — mover para fora da pasta | 5 min | Nulo |
| 0.4 | Padronizar toaster (escolher Sonner OU shadcn Toaster) | 15 min | Baixo |

### Fase 1 — Fundação técnica (1-2 sessões)

| # | Ação | Esforço | Risco |
| --- | --- | --- | --- |
| 1.1 | Unificar `src/context/` em `src/contexts/`; ajustar imports | 30 min | Médio (imports) |
| 1.2 | Habilitar `tsconfig.app.json` em strict mode incremental: `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`. Corrigir os 9 `: any`. | 2-3 h | Médio |
| 1.3 | Code-splitting via `React.lazy` + `Suspense` para rotas (`/admin`, `/b/:slug/*`) | 1 h | Baixo |

### Fase 2 — Camada de dados (2-3 sessões)

| # | Ação | Esforço | Risco |
| --- | --- | --- | --- |
| 2.1 | Criar `src/services/` com módulos de acesso ao Supabase por domínio (clients, professionals, services, appointments, cashier, stock, cleaning, aesthetics) — encapsulando todas as chamadas hoje espalhadas | 4-6 h | Médio |
| 2.2 | Migrar `useEffect + supabase` → `useQuery`/`useMutation` por módulo, começando pelos mais críticos (Schedule, Cashier, Dashboard) | 6-10 h | Alto (regressão) |
| 2.3 | Quebrar `DataContext.tsx` (1.039 linhas) — eliminar conforme cada domínio migra para React Query | Conforme 2.2 | Alto |

### Fase 3 — Refatoração dos god-components (sob demanda)

| # | Ação | Esforço | Risco |
| --- | --- | --- | --- |
| 3.1 | `CleaningModule.tsx` (1.776 l) → sub-componentes + hooks de domínio | 4-6 h | Médio |
| 3.2 | `Schedule.tsx` + `AppointmentDetailDialog.tsx` (1.781 l) → idem | 4-6 h | Alto (módulo crítico) |
| 3.3 | `Reports.tsx` (993 l) → extrair geração de cada relatório em arquivo próprio | 3-4 h | Baixo |

### Fase 4 — Validação e robustez (paralelo)

| # | Ação | Esforço | Risco |
| --- | --- | --- | --- |
| 4.1 | Padronizar todos formulários internos com `react-hook-form` + `zodResolver` | 4-6 h | Baixo |
| 4.2 | Tratativa central de erros do Supabase (já existe `lib/supabaseErrors.ts`, expandir para toda chamada) | 2 h | Baixo |
| 4.3 | Reativar fluxo de confirmação por e-mail no booking (resolver os 6 TODOs) | depende de Resend/SMTP | — |

### Fase 5 — Observabilidade (opcional)

| # | Ação | Esforço | Risco |
| --- | --- | --- | --- |
| 5.1 | Adicionar `@tanstack/react-query-devtools` em modo dev | 5 min | Nulo |
| 5.2 | Logger central (substituir os `console.error` por wrapper que enriquece com tenant/user) | 1 h | Nulo |
| 5.3 | Avaliar Sentry para produção | 2 h | — |

---

## 4. Próxima decisão

Preciso da sua aprovação para:

1. **Iniciar Fase 0** (higiene Git — itens 0.1 a 0.4)? Tudo é low-risk e cabe num único commit, mas **antes** preciso saber o que fazer com:
   - `NLT_Proposta_Prestacao_Servico_Multisoluction_2026_atualizada.pdf` — mover para fora da pasta? Manter local mas ignorar?
   - `btc_mtf_institutional_pro.pine` — idem.
   - As 16 modificações pendentes (Schedule, Dashboard, Sidebar, CleaningModule, etc.) — você quer que eu revise e commite ou prefere fazer commit/stash antes da auditoria mexer no repo?

2. **Confirmar a sequência das Fases 1–5** ou repriorizar conforme dor real do dia a dia.
