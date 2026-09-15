# Notificações push da agenda

O navegador registra uma assinatura por aparelho. O profissional escolhe em **Configurações → Notificações** se deseja receber o aviso 5, 10, 15, 20, 25 ou 30 minutos antes do atendimento.

O aviso contém nome do cliente, horário local do aparelho e procedimento. Em agendamentos com múltiplos profissionais, cada profissional recebe apenas os procedimentos atribuídos a ele.

## Configuração de produção

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
- Entregas são idempotentes por agendamento, aparelho e horário de início, com até três tentativas.
- Endpoints expirados (`404` ou `410`) são revogados automaticamente.
- Somente agendamentos com status `scheduled` ou `confirmed` são enviados.
- Web Push depende da rede, navegador e sistema operacional; o disparo é agendado no minuto escolhido, mas a exibição pode sofrer atraso externo.
