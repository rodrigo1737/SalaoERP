-- Alívio imediato para o timeout (erro 57014) na leitura de agendamentos.
--
-- A busca de agendamentos (e demais listagens paginadas) carrega todo o
-- histórico do tenant com paginação por OFFSET. Em bases grandes, as páginas
-- de OFFSET alto ultrapassavam o statement_timeout padrão do PostgREST (8s),
-- a query era cancelada (57014 → HTTP 500), a lista voltava vazia e o
-- fechamento de comanda passava a falhar com "Falha ao fechar comanda"
-- (o completeAppointment não encontrava o agendamento no estado local).
--
-- Este ajuste apenas dá mais folga de tempo para as leituras; a correção
-- estrutural (paginação por cursor/keyset no frontend) elimina a causa raiz.
-- Não altera nenhuma regra de negócio, RLS de permissão, caixa ou comissão.
ALTER ROLE authenticated SET statement_timeout = '30s';
ALTER ROLE anon SET statement_timeout = '30s';

-- Recarrega a configuração do PostgREST para aplicar sem reiniciar o projeto.
NOTIFY pgrst, 'reload config';
