self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  if (payload.type === 'daily_schedule_summary') {
    event.waitUntil(
      self.registration.showNotification(payload.title || 'Resumo da agenda de hoje', {
        body: payload.body || 'Abra a agenda para consultar os atendimentos de hoje.',
        icon: '/app-icon.svg',
        badge: '/app-icon.svg',
        tag: payload.tag || `daily-schedule-${payload.summaryDate || 'today'}`,
        renotify: false,
        data: { url: payload.url || '/app/agenda' },
      }),
    );
    return;
  }

  const startTime = payload.startTime ? new Date(payload.startTime) : null;
  const formattedTime = startTime && !Number.isNaN(startTime.getTime())
    ? startTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : 'horário não informado';
  const clientName = payload.clientName || 'Cliente não identificado';
  const procedureName = payload.procedureName || 'Procedimento não informado';
  const reminderMinutes = Number(payload.reminderMinutes) || 10;

  event.waitUntil(
    self.registration.showNotification(payload.type === 'new_appointment' ? 'Novo agendamento' : `Agenda em ${reminderMinutes} minutos`, {
      body: `${clientName} • ${payload.type === 'new_appointment' && startTime ? startTime.toLocaleDateString('pt-BR') + ' às ' : ''}${formattedTime} • ${procedureName}`,
      icon: '/app-icon.svg',
      badge: '/app-icon.svg',
      tag: payload.tag || `appointment-${payload.appointmentId || 'reminder'}`,
      renotify: false,
      data: {
        url: payload.url || '/app/agenda',
      },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/app/agenda', self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existingWindow = windows.find((client) => client.url.startsWith(self.location.origin));

    if (existingWindow) {
      await existingWindow.navigate(targetUrl);
      return existingWindow.focus();
    }

    return self.clients.openWindow(targetUrl);
  })());
});
