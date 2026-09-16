import { buildPushPayload } from "web-push";
import { getAdminClient } from "../_shared/admin.ts";
import { jsonResponse } from "../_shared/cors.ts";

type AdminClient = ReturnType<typeof getAdminClient>;
type AppointmentRow = { id: string; tenant_id: string; client_id: string | null; professional_id: string | null; service_id: string | null; start_time: string };
type DeliveryRow = { id: string; status: "processing" | "sent" | "failed"; attempts: number; attempted_at: string };
type PushSubscriptionRow = { id: string; tenant_id: string; user_id: string; endpoint: string; p256dh: string; auth_key: string };
type VapidConfig = { subject: string; publicKey: string; privateKey: string };
type ZonedDateTime = { date: string; isoWeekday: number; minuteOfDay: number; year: number; month: number; day: number };

const MAX_ATTEMPTS = 3;
const STALE_PROCESSING_MS = 2 * 60 * 1000;
const DAILY_SUMMARY_WINDOW_MINUTES = 5;
const MAX_SUMMARY_ITEMS = 12;
const unique = <T>(values: Array<T | null | undefined>) => [...new Set(values.filter(Boolean) as T[])];

const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const sanitizeError = (error: unknown) => {
  const candidate = error as { statusCode?: number; message?: string };
  return {
    code: candidate?.statusCode ? String(candidate.statusCode) : "push_error",
    message: String(candidate?.message || "Push delivery failed").slice(0, 500),
    statusCode: candidate?.statusCode ?? 0,
  };
};

const getZonedDateTime = (date: Date, requestedTimezone: string): ZonedDateTime => {
  let timezone = requestedTimezone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(date);
  } catch {
    timezone = "America/Sao_Paulo";
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const jsWeekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    isoWeekday: jsWeekday === 0 ? 7 : jsWeekday,
    minuteOfDay: Number(values.hour) * 60 + Number(values.minute),
    year,
    month,
    day,
  };
};

const parseTimeToMinutes = (value: string) => {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};

const formatAppointmentTime = (value: string, requestedTimezone: string) => {
  let timezone = requestedTimezone;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: timezone }).format(new Date(value));
  } catch {
    timezone = "America/Sao_Paulo";
  }
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
};

const sendPush = async (subscription: PushSubscriptionRow, message: Record<string, unknown>, vapid: VapidConfig, ttl: number) => {
  const pushRequest = await buildPushPayload(
    { data: JSON.stringify(message), options: { ttl } },
    {
      endpoint: subscription.endpoint,
      expirationTime: null,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
    },
    vapid,
  );
  const pushResponse = await fetch(subscription.endpoint, pushRequest);
  if (!pushResponse.ok) {
    throw Object.assign(new Error(`Push service returned ${pushResponse.status}`), { statusCode: pushResponse.status });
  }
};

const revokeExpiredSubscription = async (supabaseAdmin: AdminClient, subscriptionId: string, statusCode: number) => {
  if (statusCode !== 404 && statusCode !== 410) return;
  await supabaseAdmin.from("push_subscriptions").update({
    revoked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", subscriptionId);
};

const processAppointmentReminders = async (supabaseAdmin: AdminClient, now: Date, vapid: VapidConfig, newAppointmentId?: string) => {
  const isNew = Boolean(newAppointmentId);
  const deliveryTable = isNew ? "new_appointment_push_deliveries" : "appointment_reminder_deliveries";
  const horizon = new Date(now.getTime() + 31 * 60 * 1000);
  let appointmentQuery = supabaseAdmin
    .from("appointments")
    .select("id, tenant_id, client_id, professional_id, service_id, start_time")
    .in("status", ["scheduled", "confirmed"])
    .is("deleted_at", null)
    .gt("start_time", now.toISOString());
  appointmentQuery = isNew ? appointmentQuery.eq("id", newAppointmentId!) : appointmentQuery.lte("start_time", horizon.toISOString());
  const { data: appointmentsData, error: appointmentsError } = await appointmentQuery;
  if (appointmentsError) throw appointmentsError;
  const appointments = (appointmentsData ?? []) as AppointmentRow[];
  if (appointments.length === 0) return { considered: 0, sent: 0, failed: 0, skipped: 0 };

  const appointmentIds = appointments.map((row) => row.id);
  const { data: appointmentServices, error: appointmentServicesError } = await supabaseAdmin
    .from("appointment_services")
    .select("appointment_id, tenant_id, service_id, professional_id, position")
    .in("appointment_id", appointmentIds)
    .order("position", { ascending: true });
  if (appointmentServicesError) throw appointmentServicesError;
  const linesByAppointment = new Map<string, typeof appointmentServices>();
  for (const line of appointmentServices ?? []) {
    linesByAppointment.set(line.appointment_id, [...(linesByAppointment.get(line.appointment_id) ?? []), line]);
  }

  const assignments = appointments.flatMap((appointment) => {
    const lines = linesByAppointment.get(appointment.id) ?? [];
    if (lines.length === 0) {
      return appointment.professional_id
        ? [{ appointment, professionalId: appointment.professional_id, procedureIds: unique([appointment.service_id]) }]
        : [];
    }
    const proceduresByProfessional = new Map<string, string[]>();
    for (const line of lines) {
      if (line.tenant_id !== appointment.tenant_id) continue;
      proceduresByProfessional.set(line.professional_id, [...(proceduresByProfessional.get(line.professional_id) ?? []), line.service_id]);
    }
    return [...proceduresByProfessional.entries()].map(([professionalId, procedureIds]) => ({
      appointment,
      professionalId,
      procedureIds: unique(procedureIds),
    }));
  });
  if (assignments.length === 0) return { considered: appointments.length, assigned: 0, sent: 0, failed: 0, skipped: 0 };

  const professionalIds = unique(assignments.map((row) => row.professionalId));
  const { data: professionals, error: professionalsError } = await supabaseAdmin
    .from("professionals")
    .select("id, tenant_id, user_id")
    .in("id", professionalIds)
    .is("deleted_at", null)
    .eq("is_active", true);
  if (professionalsError) throw professionalsError;
  const professionalById = new Map((professionals ?? []).map((row) => [row.id, row]));
  const userIds = unique((professionals ?? []).map((row) => row.user_id));
  if (userIds.length === 0) return { considered: appointments.length, sent: 0, failed: 0, skipped: 0 };

  const [{ data: preferences, error: preferencesError }, { data: subscriptions, error: subscriptionsError }] = await Promise.all([
    supabaseAdmin.from("user_notification_preferences")
      .select("tenant_id, user_id, appointment_reminders_enabled, appointment_reminder_minutes")
      .in("user_id", userIds).eq(isNew ? "new_appointment_push_enabled" : "appointment_reminders_enabled", true),
    supabaseAdmin.from("push_subscriptions")
      .select("id, tenant_id, user_id, endpoint, p256dh, auth_key")
      .in("user_id", userIds).is("revoked_at", null),
  ]);
  if (preferencesError) throw preferencesError;
  if (subscriptionsError) throw subscriptionsError;
  const preferenceByTenantUser = new Map((preferences ?? []).map((row) => [`${row.tenant_id}:${row.user_id}`, row]));
  const subscriptionsByTenantUser = new Map<string, PushSubscriptionRow[]>();
  for (const subscription of (subscriptions ?? []) as PushSubscriptionRow[]) {
    const key = `${subscription.tenant_id}:${subscription.user_id}`;
    subscriptionsByTenantUser.set(key, [...(subscriptionsByTenantUser.get(key) ?? []), subscription]);
  }

  const dueAppointments = assignments.flatMap(({ appointment, professionalId, procedureIds }) => {
    const professional = professionalById.get(professionalId);
    if (!professional?.user_id || professional.tenant_id !== appointment.tenant_id) return [];
    const key = `${appointment.tenant_id}:${professional.user_id}`;
    const preference = preferenceByTenantUser.get(key);
    if (!preference) return [];
    const dueAt = new Date(appointment.start_time).getTime() - preference.appointment_reminder_minutes * 60 * 1000;
    if (!isNew && dueAt > now.getTime()) return [];
    return [{ appointment, userId: professional.user_id, key, reminderMinutes: preference.appointment_reminder_minutes, procedureIds }];
  });
  if (dueAppointments.length === 0) return { considered: appointments.length, due: 0, sent: 0, failed: 0, skipped: 0 };

  const clientIds = unique(dueAppointments.map(({ appointment }) => appointment.client_id));
  const { data: clients, error: clientsError } = clientIds.length
    ? await supabaseAdmin.from("clients").select("id, tenant_id, name").in("id", clientIds).is("deleted_at", null)
    : { data: [], error: null };
  if (clientsError) throw clientsError;
  const serviceIds = unique(dueAppointments.flatMap(({ procedureIds }) => procedureIds));
  const { data: services, error: servicesError } = serviceIds.length
    ? await supabaseAdmin.from("services").select("id, tenant_id, name").in("id", serviceIds).is("deleted_at", null)
    : { data: [], error: null };
  if (servicesError) throw servicesError;
  const clientById = new Map((clients ?? []).map((row) => [row.id, row]));
  const serviceById = new Map((services ?? []).map((row) => [row.id, row]));
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const { appointment, userId, key, reminderMinutes, procedureIds } of dueAppointments) {
    const client = appointment.client_id ? clientById.get(appointment.client_id) : null;
    const procedureNames = procedureIds.map((id) => serviceById.get(id))
      .filter((service) => service?.tenant_id === appointment.tenant_id).map((service) => service!.name);
    for (const subscription of subscriptionsByTenantUser.get(key) ?? []) {
      const match = { appointment_id: appointment.id, subscription_id: subscription.id, appointment_start_time: appointment.start_time };
      const { data: existingData, error: existingError } = await supabaseAdmin.from(deliveryTable)
        .select("id, status, attempts, attempted_at").match(match).maybeSingle();
      if (existingError) throw existingError;
      const existing = existingData as DeliveryRow | null;
      if (existing && (existing.status === "sent" || existing.attempts >= MAX_ATTEMPTS)) { skipped += 1; continue; }
      if (existing?.status === "processing" && now.getTime() - new Date(existing.attempted_at).getTime() < STALE_PROCESSING_MS) { skipped += 1; continue; }

      let deliveryId = existing?.id;
      if (existing) {
        const { data: claimed, error } = await supabaseAdmin.from(deliveryTable).update({
          status: "processing", attempts: existing.attempts + 1, attempted_at: now.toISOString(), updated_at: now.toISOString(),
          error_code: null, error_message: null,
        }).eq("id", existing.id).eq("attempts", existing.attempts).eq("attempted_at", existing.attempted_at).select("id").maybeSingle();
        if (error) throw error;
        if (!claimed) { skipped += 1; continue; }
      } else {
        const { data, error } = await supabaseAdmin.from(deliveryTable).insert({
          tenant_id: appointment.tenant_id, appointment_id: appointment.id, user_id: userId,
          subscription_id: subscription.id, appointment_start_time: appointment.start_time, reminder_minutes: reminderMinutes,
        }).select("id").single();
        if (error?.code === "23505") { skipped += 1; continue; }
        if (error) throw error;
        deliveryId = data.id;
      }
      try {
        await sendPush(subscription, {
          type: isNew ? "new_appointment" : "appointment_reminder", appointmentId: appointment.id,
          clientName: client?.tenant_id === appointment.tenant_id ? client.name : "Cliente não identificado",
          procedureName: procedureNames.join(", ") || "Procedimento não informado", startTime: appointment.start_time,
          reminderMinutes, url: "/app/agenda", tag: `${isNew ? "new" : "reminder"}-appointment-${appointment.id}-${appointment.start_time}`,
        }, vapid, 300);
        await supabaseAdmin.from(deliveryTable).update({
          status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", deliveryId);
        sent += 1;
      } catch (error) {
        const pushError = sanitizeError(error);
        await supabaseAdmin.from(deliveryTable).update({
          status: "failed", error_code: pushError.code, error_message: pushError.message, updated_at: new Date().toISOString(),
        }).eq("id", deliveryId);
        await revokeExpiredSubscription(supabaseAdmin, subscription.id, pushError.statusCode);
        failed += 1;
      }
    }
  }
  return { considered: appointments.length, due: dueAppointments.length, sent, failed, skipped };
};

const processDailySummaries = async (supabaseAdmin: AdminClient, now: Date, vapid: VapidConfig) => {
  const { data: preferences, error: preferencesError } = await supabaseAdmin.from("user_notification_preferences")
    .select("tenant_id, user_id, daily_summary_time, daily_summary_weekdays, notification_timezone")
    .eq("daily_summary_enabled", true);
  if (preferencesError) throw preferencesError;
  const duePreferences = (preferences ?? []).flatMap((preference) => {
    const zonedNow = getZonedDateTime(now, preference.notification_timezone);
    const minutesAfterScheduledTime = zonedNow.minuteOfDay - parseTimeToMinutes(preference.daily_summary_time);
    return preference.daily_summary_weekdays.includes(zonedNow.isoWeekday)
        && minutesAfterScheduledTime >= 0 && minutesAfterScheduledTime < DAILY_SUMMARY_WINDOW_MINUTES
      ? [{ ...preference, zonedNow }]
      : [];
  });
  if (duePreferences.length === 0) return { due: 0, sent: 0, failed: 0, skipped: 0 };

  const userIds = unique(duePreferences.map((preference) => preference.user_id));
  const [{ data: professionals, error: professionalsError }, { data: subscriptions, error: subscriptionsError }] = await Promise.all([
    supabaseAdmin.from("professionals").select("id, tenant_id, user_id").in("user_id", userIds)
      .is("deleted_at", null).eq("is_active", true),
    supabaseAdmin.from("push_subscriptions").select("id, tenant_id, user_id, endpoint, p256dh, auth_key")
      .in("user_id", userIds).is("revoked_at", null),
  ]);
  if (professionalsError) throw professionalsError;
  if (subscriptionsError) throw subscriptionsError;
  const professionalByTenantUser = new Map((professionals ?? []).map((row) => [`${row.tenant_id}:${row.user_id}`, row]));
  const subscriptionsByTenantUser = new Map<string, PushSubscriptionRow[]>();
  for (const subscription of (subscriptions ?? []) as PushSubscriptionRow[]) {
    const key = `${subscription.tenant_id}:${subscription.user_id}`;
    subscriptionsByTenantUser.set(key, [...(subscriptionsByTenantUser.get(key) ?? []), subscription]);
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const preference of duePreferences) {
    const key = `${preference.tenant_id}:${preference.user_id}`;
    const professional = professionalByTenantUser.get(key);
    if (!professional) { skipped += 1; continue; }
    const { year, month, day, date: summaryDate } = preference.zonedNow;
    const broadStart = new Date(Date.UTC(year, month - 1, day) - 14 * 60 * 60 * 1000);
    const broadEnd = new Date(Date.UTC(year, month - 1, day + 1) + 12 * 60 * 60 * 1000);
    const { data: appointmentsData, error: appointmentsError } = await supabaseAdmin.from("appointments")
      .select("id, tenant_id, client_id, professional_id, service_id, start_time")
      .eq("tenant_id", preference.tenant_id).in("status", ["scheduled", "confirmed"]).is("deleted_at", null)
      .gte("start_time", broadStart.toISOString()).lt("start_time", broadEnd.toISOString()).order("start_time", { ascending: true });
    if (appointmentsError) throw appointmentsError;
    const appointmentsForDate = ((appointmentsData ?? []) as AppointmentRow[]).filter(
      (appointment) => getZonedDateTime(new Date(appointment.start_time), preference.notification_timezone).date === summaryDate,
    );
    const appointmentIds = appointmentsForDate.map((appointment) => appointment.id);
    const { data: appointmentServices, error: appointmentServicesError } = appointmentIds.length
      ? await supabaseAdmin.from("appointment_services").select("appointment_id, tenant_id, professional_id").in("appointment_id", appointmentIds)
      : { data: [], error: null };
    if (appointmentServicesError) throw appointmentServicesError;
    const professionalIdsByAppointment = new Map<string, Set<string>>();
    for (const line of appointmentServices ?? []) {
      if (line.tenant_id !== preference.tenant_id) continue;
      const assigned = professionalIdsByAppointment.get(line.appointment_id) ?? new Set<string>();
      assigned.add(line.professional_id);
      professionalIdsByAppointment.set(line.appointment_id, assigned);
    }
    const assignedAppointments = appointmentsForDate.filter((appointment) => {
      const assigned = professionalIdsByAppointment.get(appointment.id);
      return assigned?.size ? assigned.has(professional.id) : appointment.professional_id === professional.id;
    });
    const clientIds = unique(assignedAppointments.map((appointment) => appointment.client_id));
    const { data: clients, error: clientsError } = clientIds.length
      ? await supabaseAdmin.from("clients").select("id, tenant_id, name").in("id", clientIds).is("deleted_at", null)
      : { data: [], error: null };
    if (clientsError) throw clientsError;
    const clientById = new Map((clients ?? []).map((client) => [client.id, client]));
    const items = assignedAppointments.map((appointment) => {
      const client = appointment.client_id ? clientById.get(appointment.client_id) : null;
      const clientName = client && client.tenant_id === preference.tenant_id
        ? client.name.trim().slice(0, 50)
        : "Cliente não identificado";
      return `${formatAppointmentTime(appointment.start_time, preference.notification_timezone)} ${clientName}`;
    });
    const visibleItems = items.slice(0, MAX_SUMMARY_ITEMS);
    const remainingCount = items.length - visibleItems.length;
    const title = items.length === 0 ? "Agenda de hoje • sem atendimentos"
      : `Agenda de hoje • ${items.length} atendimento${items.length === 1 ? "" : "s"}`;
    const body = items.length === 0 ? "Você não tem atendimentos agendados para hoje."
      : `${visibleItems.join(" • ")}${remainingCount > 0 ? ` • +${remainingCount} atendimento${remainingCount === 1 ? "" : "s"}` : ""}`;

    for (const subscription of subscriptionsByTenantUser.get(key) ?? []) {
      const match = { user_id: preference.user_id, subscription_id: subscription.id, summary_date: summaryDate };
      const { data: existingData, error: existingError } = await supabaseAdmin.from("daily_schedule_summary_deliveries")
        .select("id, status, attempts, attempted_at").match(match).maybeSingle();
      if (existingError) throw existingError;
      const existing = existingData as DeliveryRow | null;
      if (existing && (existing.status === "sent" || existing.attempts >= MAX_ATTEMPTS)) { skipped += 1; continue; }
      if (existing?.status === "processing" && now.getTime() - new Date(existing.attempted_at).getTime() < STALE_PROCESSING_MS) { skipped += 1; continue; }
      let deliveryId = existing?.id;
      if (existing) {
        const { error } = await supabaseAdmin.from("daily_schedule_summary_deliveries").update({
          status: "processing", attempts: existing.attempts + 1, attempted_at: now.toISOString(), updated_at: now.toISOString(),
          error_code: null, error_message: null,
        }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabaseAdmin.from("daily_schedule_summary_deliveries").insert({
          tenant_id: preference.tenant_id, user_id: preference.user_id, subscription_id: subscription.id, summary_date: summaryDate,
        }).select("id").single();
        if (error?.code === "23505") { skipped += 1; continue; }
        if (error) throw error;
        deliveryId = data.id;
      }
      try {
        await sendPush(subscription, {
          type: "daily_schedule_summary", title, body, summaryDate, appointmentCount: items.length,
          url: "/app/agenda", tag: `daily-schedule-${summaryDate}`,
        }, vapid, 3600);
        await supabaseAdmin.from("daily_schedule_summary_deliveries").update({
          status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", deliveryId);
        sent += 1;
      } catch (error) {
        const pushError = sanitizeError(error);
        await supabaseAdmin.from("daily_schedule_summary_deliveries").update({
          status: "failed", error_code: pushError.code, error_message: pushError.message, updated_at: new Date().toISOString(),
        }).eq("id", deliveryId);
        await revokeExpiredSubscription(supabaseAdmin, subscription.id, pushError.statusCode);
        failed += 1;
      }
    }
  }
  return { due: duePreferences.length, sent, failed, skipped };
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    if (req.headers.get("x-cron-secret") !== getRequiredEnv("REMINDER_CRON_SECRET")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const vapid = {
      subject: getRequiredEnv("VAPID_SUBJECT"),
      publicKey: getRequiredEnv("VAPID_PUBLIC_KEY"),
      privateKey: getRequiredEnv("VAPID_PRIVATE_KEY"),
    };
    const supabaseAdmin = getAdminClient();
    const now = new Date();
    const requestBody = await req.json().catch(() => ({}));
    if (requestBody.type === "new_appointment" && typeof requestBody.appointmentId === "string") {
      return jsonResponse(await processAppointmentReminders(supabaseAdmin, now, vapid, requestBody.appointmentId));
    }
    const appointmentReminders = await processAppointmentReminders(supabaseAdmin, now, vapid);
    // Recover transient failures of the immediate database-triggered dispatch.
    const { data: recentAppointments, error: recentError } = await supabaseAdmin.from("appointments")
      .select("id").gte("created_at", new Date(now.getTime() - 5 * 60 * 1000).toISOString())
      .gt("start_time", now.toISOString()).is("deleted_at", null).in("status", ["scheduled", "confirmed"]);
    if (recentError) throw recentError;
    for (const appointment of recentAppointments ?? []) {
      await processAppointmentReminders(supabaseAdmin, now, vapid, appointment.id);
    }
    const dailySummaries = await processDailySummaries(supabaseAdmin, now, vapid);
    console.log(JSON.stringify({ appointmentReminders, dailySummaries }));
    return jsonResponse({ appointmentReminders, dailySummaries });
  } catch (error) {
    console.error("Agenda push dispatch failed", error instanceof Error ? error.message : "Unknown error");
    return jsonResponse({ error: "Agenda push dispatch failed" }, 500);
  }
});
