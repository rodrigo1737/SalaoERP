# Projeto: Segmento de Controle de Limpeza

## Objetivo

Adicionar ao SalaoERP um novo segmento operacional para empresas que fazem limpeza em apartamentos, casas, salas comerciais ou imoveis de temporada. O segmento deve permitir controlar clientes, unidades atendidas, agendas de limpeza, profissionais/equipes, valores cobrados, repasses de comissao, fluxo de caixa e indicadores operacionais.

O recurso deve seguir o mesmo conceito multiempresa/multitenant ja existente no sistema: cada conta B2B enxerga apenas seus proprios dados, usuarios, profissionais, clientes, agendas, financeiro e configuracoes.

## Premissas Principais

1. O segmento de limpeza deve ser ativado no cadastro B2B, assim como os pacotes/segmentos ja usados para salao e estetica.
2. Uma empresa pode ter somente limpeza ou combinar limpeza com outros segmentos, se o plano contratado permitir.
3. O menu e as telas devem ser exibidos conforme o segmento/pacote liberado para o tenant.
4. A agenda deve considerar profissionais individuais ou equipes de limpeza.
5. O servico agendado deve permitir duracao, valor cobrado, custo/repasses e status operacional.
6. O financeiro deve separar valor recebido do cliente, valor repassado ao profissional/equipe, taxas, despesas e lucro bruto.
7. O sistema deve manter rastreabilidade: quem criou, alterou, cancelou, concluiu e recebeu cada limpeza.
8. Todos os dados devem respeitar isolamento por tenant via `tenant_id` e politicas RLS no Supabase.
9. O segmento deve manter o conceito de ERP integrado: cadastro, agenda, execucao, financeiro, comissoes, relatorios e permissoes devem compartilhar a mesma base de dados e os mesmos vinculos operacionais.
10. Nenhuma informacao financeira sensivel, como comissao, lucro, despesas ou dados de acesso do imovel, deve aparecer para funcionarios sem permissao explicita.

## Conceito ERP Integrado

O modulo de limpeza nao deve funcionar como uma agenda isolada. Ele deve nascer integrado aos demais cadastros e processos do sistema, mantendo uma linha unica de rastreabilidade:

1. **Tenant B2B** libera o segmento, plano, limites, permissoes e recursos contratados.
2. **Cliente** representa o contratante ou responsavel financeiro.
3. **Imovel/unidade** representa o local fisico do atendimento.
4. **Servico** define duracao, valor, checklist, necessidade de fotos e regra de repasse.
5. **Profissional/equipe** define capacidade, agenda, cor, especialidade e regra padrao de comissao.
6. **Agendamento** une cliente, imovel, servico, profissional/equipe, horario, recorrencia, valores e status.
7. **Execucao** registra inicio, conclusao, checklist, fotos, observacoes e ocorrencias.
8. **Financeiro** registra cobranca, recebimento, despesas, repasse e resultado.
9. **Relatorios** consolidam dados operacionais e financeiros sem duplicar informacao.

Principio de integracao:

- Toda movimentacao deve nascer ou se vincular a um agendamento.
- O agendamento deve ser a origem operacional do financeiro e das comissoes.
- Alteracoes relevantes devem gerar historico/auditoria.
- Cadastros compartilhados, como clientes, profissionais e servicos, devem continuar reaproveitaveis por segmento quando fizer sentido.
- Segmentos diferentes podem compartilhar o mesmo cliente, mas cada processo deve manter seu contexto: salao, estetica ou limpeza.

## Publico Alvo

Empresas que fazem:

- Limpeza residencial recorrente.
- Limpeza pos-obra.
- Limpeza pre ou pos-locacao.
- Limpeza de Airbnb/imoveis de temporada.
- Limpeza comercial.
- Limpeza pesada ou especializada.
- Organizacao e diaristas terceirizadas.

## Modulos Necessarios

### 1. Cadastro B2B / Pacotes

Adicionar uma opcao de segmento/pacote:

- `limpeza`
- Nome comercial sugerido: **Controle de Limpeza**

Campos sugeridos no cadastro B2B:

- Segmentos habilitados: salao, estetica, limpeza.
- Plano contratado.
- Limite de usuarios.
- Limite de profissionais/equipes.
- Permite financeiro avancado.
- Permite controle de comissao.
- Permite checklist/fotos da limpeza.

Impacto esperado:

- Exibir menu de limpeza apenas para tenants com o segmento habilitado.
- Permitir precificacao diferenciada por segmento.

### 2. Clientes e Imoveis

Hoje o sistema ja possui cadastro de clientes. Para limpeza, o cliente pode ter um ou mais locais de atendimento.

Criar ou adaptar entidade de **imoveis/unidades**:

- Cliente responsavel.
- Tipo: apartamento, casa, sala comercial, Airbnb, outro.
- Nome/apelido do local.
- Endereco completo.
- Complemento, bloco, torre, unidade.
- Instrucoes de acesso.
- Senha de portaria/cofre, se necessario, com tratamento sensivel.
- Observacoes internas.
- Preferencias do cliente.
- Periodicidade padrao.
- Tempo estimado padrao.
- Valor padrao.

Regras:

- Um cliente pode ter varios imoveis.
- Um agendamento de limpeza deve estar vinculado a um cliente e, preferencialmente, a um imovel.
- Dados sensiveis de acesso devem ter permissao restrita.

### 3. Profissionais e Equipes

A rotina atual de profissionais pode ser reaproveitada, mas precisa de campos especificos para limpeza.

Campos sugeridos:

- Tem agenda: sim/nao.
- Atua em limpeza: sim/nao.
- Tipo: profissional individual ou equipe.
- Especialidades: residencial, comercial, pos-obra, Airbnb, pesada.
- Cor na agenda.
- Valor fixo por diaria.
- Percentual de comissao.
- Valor por hora.
- Chave Pix/dados de repasse.
- Status: ativo/inativo.

Para equipes:

- Nome da equipe.
- Responsavel.
- Membros vinculados.
- Capacidade diaria.
- Regioes atendidas.

Decisao de escopo:

- O sistema deve atender os dois modelos: profissional individual e equipe.
- Profissionais externos devem ter login proprio, com acesso restrito a agenda, execucao, checklist, fotos e observacoes dos seus proprios atendimentos.

### 4. Servicos de Limpeza

Criar categoria de servicos propria para limpeza, reaproveitando a base de servicos quando possivel.

Exemplos:

- Limpeza residencial padrao.
- Limpeza pesada.
- Limpeza pos-obra.
- Limpeza pre-check-in.
- Limpeza pos-check-out.
- Passadoria.
- Organizacao.
- Organizer.
- Limpeza de vidros.
- Limpeza comercial.

Campos sugeridos:

- Nome do servico.
- Categoria.
- Duracao estimada.
- Valor de venda.
- Custo estimado.
- Percentual ou valor fixo de repasse.
- Necessita checklist.
- Necessita fotos antes/depois.
- Ativo/inativo.

### 5. Agenda de Limpeza

A agenda deve ser o coracao do modulo.

Funcionalidades:

- Visualizacao por dia, semana e mes.
- Filtro por profissional/equipe.
- Filtro por status.
- Filtro por cliente/imovel.
- Agendamento recorrente.
- Bloqueio de horario.
- Reagendamento.
- Cancelamento com motivo.
- Conclusao do servico.
- Registro de observacoes.
- Registro de valor cobrado e repasse.
- Opcao de agendamento online pelo cliente final.
- Opcao de recorrencia no momento do agendamento.
- Indicacao opcional de uso/controle de produtos por agendamento.

Campos do agendamento:

- Tenant.
- Cliente.
- Imovel/unidade.
- Endereco completo do atendimento, herdado do imovel/unidade e editavel no agendamento quando necessario.
- Instrucoes de acesso ao local.
- Profissional ou equipe.
- Servico.
- Data e horario.
- Duracao.
- Valor cobrado.
- Valor de repasse.
- Forma de pagamento.
- Status financeiro.
- Status operacional.
- Observacoes internas.
- Observacoes para a equipe.
- Usa controle de produtos: sim/nao.
- Recorrencia: nenhuma, semanal, quinzenal, mensal ou personalizada.

Status operacionais sugeridos:

- Agendado.
- Confirmado.
- Em deslocamento.
- Em andamento.
- Concluido.
- Cancelado.
- Nao compareceu.

Status financeiros sugeridos:

- Pendente.
- Parcial.
- Pago.
- Repassado.
- Cancelado.

### 6. Checklist de Limpeza

Para dar controle operacional, o sistema deve permitir checklists por tipo de servico.

Exemplo de checklist:

- Banheiros.
- Cozinha.
- Quartos.
- Sala.
- Varanda.
- Troca de roupa de cama.
- Retirada de lixo.
- Reposicao de itens.
- Fotos antes.
- Fotos depois.
- Observacoes finais.

Regras:

- Checklist pode ser padrao por servico.
- Checklist pode ser editado por agendamento.
- Itens podem ser obrigatorios ou opcionais.
- Conclusao da limpeza pode exigir checklist completo.
- Checklist e fotos devem ser obrigatorios para concluir uma limpeza, salvo configuracao especifica do tenant ou excecao autorizada no agendamento.

### 7. Fotos e Evidencias

Adicionar armazenamento de fotos para comprovar execucao.

Tipos:

- Antes da limpeza.
- Depois da limpeza.
- Problemas encontrados.
- Itens danificados.
- Comprovante de acesso/entrega.

Premissas tecnicas:

- Usar Supabase Storage.
- Separar arquivos por tenant.
- Restringir acesso via RLS/politicas de storage.
- Registrar metadados da foto: agendamento, usuario, data, tipo e observacao.

### 8. Financeiro e Repasses

O modulo precisa controlar receita, comissao e fluxo de caixa.

Receitas:

- Valor cobrado do cliente.
- Forma de pagamento.
- Data de vencimento.
- Data de recebimento.
- Status.

Repasses:

- Valor fixo.
- Percentual sobre o servico.
- Percentual por profissional.
- Repasse por equipe.
- Escolha entre valor fixo, percentual ou combinacao dos dois.
- Data prevista.
- Data paga.
- Status do repasse.

Despesas:

- Produtos de limpeza.
- Transporte.
- Estacionamento.
- Taxas.
- Outros custos.

Indicadores:

- Receita bruta.
- Total repassado.
- Despesas.
- Lucro bruto.
- Ticket medio.
- Limpezas realizadas.
- Limpezas canceladas.
- Profissionais/equipes mais produtivos.

Decisao de escopo:

- O pagamento sera registrado manualmente no sistema.
- Integracoes com meios de pagamento ficam fora do MVP.

### 9. Fluxo Operacional Sugerido

1. Admin cria o tenant B2B com segmento limpeza habilitado.
2. Admin cadastra clientes.
3. Admin cadastra imoveis/unidades dos clientes.
4. Admin cadastra profissionais/equipes.
5. Admin cadastra servicos e regras de repasse.
6. Usuario interno ou cliente final cria agendamento de limpeza.
7. Sistema permite definir recorrencia no agendamento, quando aplicavel.
8. Sistema calcula valor cobrado e valor previsto de repasse.
9. Sistema permite marcar se havera controle de produtos naquele atendimento.
10. Equipe executa limpeza e preenche checklist/fotos.
11. Admin conclui ou valida o servico.
12. Financeiro registra recebimento manualmente.
13. Sistema gera repasse do profissional/equipe.
14. Admin acompanha dashboard e fluxo de caixa.

## Modelo de Dados Sugerido

Tabelas novas ou adaptadas:

- `tenant_segments`
- `cleaning_properties`
- `cleaning_teams`
- `cleaning_team_members`
- `cleaning_service_settings`
- `cleaning_appointments`
- `cleaning_checklist_templates`
- `cleaning_checklist_items`
- `cleaning_appointment_checklist`
- `cleaning_appointment_photos`
- `cleaning_financial_entries`
- `cleaning_commission_rules`
- `cleaning_commission_payables`

Reaproveitamentos provaveis:

- `tenants`
- `profiles`
- `clients`
- `professionals`
- `services`
- `appointments`, se a estrutura atual permitir generalizar por segmento.
- `cash_flow` ou tabelas financeiras existentes, se ja houver base adequada.

Decisao tecnica importante:

- Se a agenda atual for bem generica, ampliar `appointments` com campos de segmento.
- Se a agenda atual estiver muito presa ao salao, criar uma agenda de limpeza propria e depois consolidar visualmente no futuro.

## Amarracoes Entre Processos e Tabelas

Para manter o conceito de ERP, os principais vinculos devem ser obrigatorios ou fortemente recomendados:

### Cadastro B2B

- `tenants` define a empresa.
- `tenant_segments` define se limpeza esta habilitado.
- Configuracoes do tenant definem se usa checklist, fotos, comissao, financeiro avancado, agenda online e controle de produtos.

### Cliente e Local de Atendimento

- `clients` guarda o cliente/responsavel.
- `cleaning_properties` guarda o imovel/unidade e deve ter `client_id` e `tenant_id`.
- Um agendamento deve sempre ter `client_id`.
- Um agendamento de limpeza deve preferencialmente ter `property_id`; se nao tiver, deve exigir endereco manual.

### Servicos

- `services` ou `cleaning_service_settings` guarda o servico.
- O servico deve carregar valor padrao, duracao padrao, regra de checklist/fotos e regra padrao de repasse.
- O agendamento pode copiar esses valores no momento da criacao para preservar historico, mesmo que o servico mude depois.

### Profissionais e Equipes

- `professionals` guarda dados do profissional.
- `cleaning_teams` guarda equipes.
- `cleaning_team_members` vincula profissionais a equipes.
- O agendamento deve aceitar `professional_id` ou `team_id`.
- Regras de permissao devem garantir que profissional externo veja apenas agenda e execucao vinculadas a ele ou a sua equipe.

### Agenda, Execucao e Evidencias

- `cleaning_appointments` deve ser a tabela central do processo.
- `cleaning_appointment_checklist` deve estar vinculado ao agendamento.
- `cleaning_appointment_photos` deve estar vinculado ao agendamento, ao tenant e ao usuario que enviou a foto.
- Concluir uma limpeza deve validar checklist/fotos conforme configuracao.

### Financeiro e Comissao

- `cleaning_financial_entries` deve nascer do agendamento ou ser vinculado a ele.
- `cleaning_commission_rules` define a regra de calculo.
- `cleaning_commission_payables` registra o valor a repassar para profissional/equipe.
- O sistema deve distinguir valor cobrado, valor recebido, despesas, comissao prevista, comissao aprovada, comissao paga e lucro bruto.
- Comissao deve poder ficar oculta para o profissional externo, conforme permissao do perfil.

## Telas Sugeridas

### Menu Limpeza

Submenus:

- Agenda de Limpeza.
- Clientes e Imoveis.
- Profissionais/Equipes.
- Servicos de Limpeza.
- Checklists.
- Financeiro.
- Relatorios.
- Configuracoes.

### Agenda de Limpeza

Recursos:

- Calendario lateral.
- Colunas por profissional/equipe.
- Busca por cliente, imovel ou servico.
- Ajuste de colunas.
- Filtros por status.
- Criacao rapida de cliente/imovel/servico.
- Cards com status visual.

### Cadastro de Imovel

Campos:

- Cliente.
- Tipo do imovel.
- Endereco.
- Dados de acesso.
- Observacoes.
- Valor padrao.
- Tempo padrao.
- Periodicidade.

### Tela de Execucao

Para equipe/profissional:

- Dados do agendamento.
- Endereco.
- Instrucoes.
- Checklist.
- Upload de fotos.
- Botao iniciar.
- Botao finalizar.
- Observacoes.

### Financeiro de Limpeza

Visoes:

- A receber.
- Recebido.
- Repasses pendentes.
- Repasses pagos.
- Despesas.
- Resultado por periodo.

## Permissoes

Perfis sugeridos:

- Administrador B2B.
- Gestor operacional.
- Financeiro.
- Profissional/equipe.
- Visualizador.

Regras gerais:

- Profissional/equipe ve apenas sua agenda e execucoes.
- Financeiro ve valores, recebimentos e repasses.
- Gestor ve agenda, clientes, imoveis e checklists.
- Admin ve tudo.

O controle deve ser configuravel por tenant e por perfil, evitando que todos os funcionarios tenham a mesma visao. Cada perfil deve ter permissoes independentes de visualizar, criar, editar, excluir, concluir, cancelar e aprovar.

### Matriz de Permissoes Recomendada

| Recurso | Admin B2B | Gestor operacional | Financeiro | Profissional/equipe | Visualizador |
| --- | --- | --- | --- | --- | --- |
| Dashboard operacional | Sim | Sim | Opcional | Nao | Sim |
| Agenda completa | Sim | Sim | Opcional | Nao | Sim |
| Propria agenda | Sim | Sim | Opcional | Sim | Nao |
| Criar agendamento | Sim | Sim | Opcional | Opcional | Nao |
| Reagendar/cancelar | Sim | Sim | Opcional | Opcional, apenas proprios | Nao |
| Clientes | Sim | Sim | Opcional | Limitado | Somente leitura |
| Imoveis/unidades | Sim | Sim | Opcional | Limitado ao atendimento | Somente leitura |
| Dados sensiveis de acesso | Sim | Sim | Nao | Somente quando vinculado ao atendimento | Nao |
| Servicos e valores de venda | Sim | Sim | Sim | Opcional | Somente leitura |
| Checklist | Sim | Sim | Nao | Sim, apenas execucao propria | Somente leitura |
| Fotos/evidencias | Sim | Sim | Nao | Sim, apenas execucao propria | Somente leitura |
| Recebimentos | Sim | Opcional | Sim | Nao | Nao |
| Despesas | Sim | Opcional | Sim | Nao | Nao |
| Repasses/comissoes | Sim | Opcional | Sim | Opcional | Nao |
| Lucro/margem | Sim | Nao por padrao | Sim | Nao | Nao |
| Relatorios financeiros | Sim | Opcional | Sim | Nao | Nao |
| Configuracoes | Sim | Nao | Nao | Nao | Nao |

### Visibilidade de Comissoes

O sistema deve permitir escolher se o profissional/equipe pode visualizar comissoes.

Opcoes por perfil ou funcionario:

- **Nao visualiza comissao:** ve apenas agenda, cliente, endereco, checklist, fotos e observacoes autorizadas.
- **Visualiza comissao prevista:** ve o valor estimado do proprio repasse antes da aprovacao.
- **Visualiza comissao aprovada:** ve somente o valor aprovado pelo gestor/financeiro.
- **Visualiza comissao paga:** ve historico de repasses pagos.
- **Visualiza extrato proprio:** ve comissoes proprias por periodo, sem dados de outros profissionais.

Campos que nunca devem aparecer para profissional externo sem permissao especifica:

- Valor total recebido pela empresa.
- Lucro bruto.
- Margem.
- Despesas internas.
- Comissao de outros profissionais.
- Relatorio financeiro consolidado.
- Dados bancarios/Pix de outros profissionais.

### Itens Configuraveis Para Visualizacao do Funcionario

No cadastro do perfil ou funcionario, o admin deve poder marcar quais itens ficam visiveis:

- Ver telefone do cliente.
- Ver endereco completo.
- Ver instrucoes de acesso.
- Ver observacoes internas.
- Ver somente observacoes da execucao.
- Ver valor cobrado do cliente.
- Ver propria comissao.
- Ver status financeiro do atendimento.
- Ver checklist.
- Enviar fotos.
- Excluir fotos enviadas.
- Iniciar atendimento.
- Finalizar atendimento.
- Solicitar reagendamento.
- Cancelar atendimento proprio.
- Ver agenda de outros profissionais da mesma equipe.
- Ver historico de atendimentos do cliente.
- Ver produtos previstos para uso no atendimento.
- Informar produtos utilizados.

Padrao recomendado para profissional externo:

- Pode ver propria agenda, endereco, instrucoes necessarias, checklist, fotos, observacoes da execucao e status operacional.
- Nao ve financeiro, lucro, despesas, valor total recebido nem comissoes de terceiros.
- Comissao propria deve ser opcional por configuracao do tenant.

## Riscos e Cuidados

1. Nao misturar dados de segmentos sem controle de permissao.
2. Nao expor dados sensiveis de acesso ao imovel para usuarios sem necessidade.
3. Evitar duplicar clientes se a mesma base puder atender varios segmentos.
4. Garantir que relatorios financeiros separem receita, repasse e lucro.
5. Garantir que fotos sejam privadas por tenant.
6. Evitar adaptar a agenda de salao de forma que quebre os fluxos atuais.
7. Permitir evoluir para aplicativo mobile ou PWA para equipe externa.

## Fases de Implementacao

### Fase 1 - Base Comercial e Cadastros

- Adicionar segmento/pacote limpeza no cadastro B2B.
- Criar menu condicionado ao segmento.
- Criar cadastro de imoveis.
- Adaptar profissionais para atuar em limpeza/equipe.
- Criar servicos de limpeza.

### Fase 2 - Agenda Operacional

- Criar agenda de limpeza.
- Vincular cliente, imovel, profissional/equipe e servico.
- Criar status operacionais.
- Criar recorrencia basica configurada no agendamento.
- Calcular valor cobrado e repasse previsto.
- Criar agendamento online para cliente final.

### Fase 3 - Checklist e Fotos

- Criar templates de checklist.
- Vincular checklist ao servico/agendamento.
- Criar upload de fotos antes/depois.
- Criar tela de execucao.
- Criar acesso restrito para profissional/equipe externa preencher execucao.

### Fase 4 - Financeiro

- Registrar contas a receber por limpeza.
- Registrar repasses.
- Registrar despesas.
- Criar relatorios financeiros.
- Criar resumo de caixa.

### Fase 5 - Indicadores e Refinamentos

- Dashboard de limpeza.
- Produtividade por equipe.
- Faturamento por cliente/imovel.
- Taxa de cancelamento.
- Ranking de servicos.
- Alertas de pendencias.

## MVP Recomendado

Para validar rapido sem comprometer o sistema atual:

1. Liberar segmento limpeza no B2B.
2. Criar cadastro de imoveis por cliente.
3. Criar flag "atua em limpeza" nos profissionais.
4. Criar servicos de limpeza com valor e repasse.
5. Criar suporte a profissional individual e equipe.
6. Criar agenda de limpeza com status simples.
7. Criar recorrencia opcional no agendamento.
8. Criar checklist e fotos obrigatorios na conclusao.
9. Criar login restrito para profissional/equipe externa.
10. Criar agendamento online para cliente final.
11. Criar resumo financeiro basico: cobrado, repasse, lucro.

Deixar para segunda etapa:

- Equipes complexas.
- App/PWA para profissional.
- Relatorios detalhados.
- Integracao com pagamento online.
- Controle de estoque completo.

## Decisoes de Escopo Confirmadas

1. A limpeza sera feita por profissional individual e tambem por equipes.
2. O repasse deve aceitar percentual, valor fixo ou combinacao dos dois.
3. O cliente final podera agendar online.
4. Checklist e fotos devem fazer parte do fluxo de conclusao da limpeza.
5. Controle de produtos deve ser opcional em cada agendamento, pois depende do acordo com o cliente.
6. O pagamento sera registrado manualmente.
7. A recorrencia deve ser uma opcao no momento do agendamento.
8. Profissionais externos devem ter login proprio.
