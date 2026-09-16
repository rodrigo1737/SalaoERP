# Notificações push da agenda

O navegador registra uma assinatura por aparelho. O profissional escolhe em **Configurações → Notificações** se deseja receber o aviso 5, 10, 15, 20, 25 ou 30 minutos antes do atendimento.

O aviso contém nome do cliente, horário local do aparelho e procedimento. Em agendamentos com múltiplos profissionais, cada profissional recebe apenas os procedimentos atribuídos a ele.

O profissional também pode ativar o **Resumo da agenda do dia**, escolher os dias da semana e o horário de envio. O push apresenta, em ordem, o horário e o nome de cada cliente atribuído ao profissional. Quando não houver atendimento, o sistema envia essa informação. O fuso horário é capturado do aparelho no momento em que a preferência é salva.

## Configuração de produção

### Aviso de novo agendamento

Em Configurações → Notificações, o profissional pode ativar “Receber aviso de novo agendamento”. Essa preferência começa desativada e é independente dos lembretes e do resumo diário. O aparelho deve estar autorizado para push.

As inserções em `appointments` e `appointment_services` acionam a Edge Function após a confirmação da transação, usando o segredo já armazenado no Vault. O aviso mostra cliente, data, horário e procedimentos atribuídos ao profissional. O cron existente também recupera falhas transitórias durante cinco minutos após a criação. As entregas usam uma tabela própria e até três tentativas, sem consumir o lembrete antecipado. Alterações de agendamentos antigos não geram esse aviso.

Para disponibilizar a opção, aplicar a migração `20260915183014_add_new_appointment_push.sql`, publicar a função `send-appointment-reminders` e atualizar o frontend e o service worker. A versão local atual também depende da migração do resumo diário.

### Chaves e cron

1. Gere um único par de chaves VAPID para a aplicação. A chave privada nunca deve ser colocada no frontend ou no Git.
2. Configure a chave pública no build do frontend como `VITE_VAPID_PUBLIC_KEY`.
3. Configure estes secrets na Edge Function `send-appointment-reminders`:
   - `VAPID_PUBLIC_KEY`: chave pública VAPID;
   - `VAPID_PRIVATE_KEY`: chave privada VAPID;
   - `VAPID_SUBJECT`: contato no formato `mailto:suporte@dominio.com` ou uma URL HTTPS;
   - `REMINDER_CRON_SECRET`: valor aleatório longo usado somente entre o banco e a Edge Function.
4. No Supabase Vault, salve:
   - `project_url`: URL HTTPS do projeto Supabase;
   - `appointment_reminder_cron_secret`: exatamente o mesmo valor de `REMINDER_CRON_SECRET`.
5. Aplique a migração e publique a Edge Function. O job `send-appointment-reminders-every-minute` é criado pela migração e começa a enviar assim que os secrets existirem.

## Regras de segurança e entrega

- As assinaturas só podem ser vistas e alteradas pelo próprio usuário e pelo backend com `service_role`.
- O logout revoga a assinatura do aparelho para impedir avisos do usuário anterior em um celular compartilhado.
- O log de entrega não armazena nome do cliente nem procedimento.
- Alertas individuais são idempotentes por agendamento, aparelho e horário de início. Resumos são idempotentes por usuário, aparelho e data local. Ambos fazem até três tentativas.
- Endpoints expirados (`404` ou `410`) são revogados automaticamente.
- Somente agendamentos com status `scheduled` ou `confirmed` são enviados.
- O resumo considera tanto o profissional principal de agendamentos simples quanto a atribuição por procedimento em agendamentos com vários profissionais.
- Para manter o payload compatível com os serviços de Web Push, o aviso mostra até 12 clientes e informa quantos atendimentos adicionais existem; a agenda completa permanece acessível ao tocar na notificação.
- Web Push depende da rede, navegador e sistema operacional; o disparo é agendado no minuto escolhido, mas a exibição pode sofrer atraso externo.
