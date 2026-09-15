import { buildPushPayload } from "web-push";
import { getAdminClient } from "../_shared/admin.ts";
import { jsonResponse } from "../_shared/cors.ts";

type AppointmentRow = {
  id: string;
  tenant_id: string;
  client_id: string | null;
  professional_id: string | null;
  service_id: string | null;
  start_time: string;
};

type DeliveryRow = {
  id: string;
  status: "processing" | "sent" | "failed";
  attempts: number;
  attempted_at: string;
};

const MAX_ATTEMPTS = 3;
const STALE_PROCESSING_MS = 2 * 60 * 1000;

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

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const cronSecret = getRequiredEnv("REMINDER_CRON_SECRET");
    if (req.headers.get("x-cron-secret") !== cronSecret) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const vapidSubject = getRequiredEnv("VAPID_SUBJECT");
    const vapidPublicKey = getRequiredEnv("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = getRequiredEnv("VAPID_PRIVATE_KEY");

    const supabaseAdmin = getAdminClient();
    const now = new Date();
    const horizon = new Date(now.getTime() + 31 * 60 * 1000);

    const { data: appointmentsData, error: appointmentsError } = await supabaseAdmin
      .from("appointments")
      .select("id, tenant_id, client_id, professional_id, service_id, start_time")
      .in("status", ["scheduled", "confirmed"])
      .is("deleted_at", null)
      .gt("start_time", now.toISOString())
      .lte("start_time", horizon.toISOString());
    if (appointmentsError) throw appointmentsError;

    const appointments = (appointmentsData ?? []) as AppointmentRow[];
    if (appointments.length === 0) return jsonResponse({ considered: 0, sent: 0, failed: 0 });

    const appointmentIds = appointments.map((row) => row.id);
    const { data: appointmentServices, error: appointmentServicesError } = await supabaseAdmin
      .from("appointment_services")
      .select("appointment_id, tenant_id, service_id, professional_id, position")
      .in("appointment_id", appointmentIds)
      .order("position", { ascending: true });
    if (appointmentServicesError) throw appointmentServicesError;

    const linesByAppointment = new Map<string, typeof appointmentServices>();
    for (const line of appointmentServices ?? []) {
      linesByAppointment.set(line.appointment_id, [
        ...(linesByAppointment.get(line.appointment_id) ?? []),
        line,
      ]);
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
        proceduresByProfessional.set(line.professional_id, [
          ...(proceduresByProfessional.get(line.professional_id) ?? []),
          line.service_id,
        ]);
      }

      return [...proceduresByProfessional.entries()].map(([professionalId, procedureIds]) => ({
        appointment,
        professionalId,
        procedureIds: unique(procedureIds),
      }));
    });
    if (assignments.length === 0) {
      return jsonResponse({ considered: appointments.length, assigned: 0, sent: 0, failed: 0 });
    }

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
    if (userIds.length === 0) return jsonResponse({ considered: appointments.length, sent: 0, failed: 0 });

    const [{ data: preferences, error: preferencesError }, { data: subscriptions, error: subscriptionsError }] = await Promise.all([
      supabaseAdmin
        .from("user_notification_preferences")
        .select("tenant_id, user_id, appointment_reminders_enabled, appointment_reminder_minutes")
        .in("user_id", userIds)
        .eq("appointment_reminders_enabled", true),
      supabaseAdmin
        .from("push_subscriptions")
        .select("id, tenant_id, user_id, endpoint, p256dh, auth_key")
        .in("user_id", userIds)
        .is("revoked_at", null),
    ]);
    if (preferencesError) throw preferencesError;
    if (subscriptionsError) throw subscriptionsError;

    const preferenceByTenantUser = new Map(
      (preferences ?? []).map((row) => [`${row.tenant_id}:${row.user_id}`, row]),
    );
    const subscriptionsByTenantUser = new Map<string, typeof subscriptions>();
    for (const subscription of subscriptions ?? []) {
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
      if (dueAt > now.getTime()) return [];
      return [{
        appointment,
        userId: professional.user_id,
        key,
        reminderMinutes: preference.appointment_reminder_minutes,
        procedureIds,
      }];
    });
    if (dueAppointments.length === 0) return jsonResponse({ considered: appointments.length, due: 0, sent: 0, failed: 0 });

    const clientIds = unique(dueAppointments.map(({ appointment }) => appointment.client_id));
    const { data: clients, error: clientsError } = clientIds.length > 0
      ? await supabaseAdmin.from("clients").select("id, tenant_id, name").in("id", clientIds).is("deleted_at", null)
      : { data: [], error: null };
    if (clientsError) throw clientsError;

    const serviceIds = unique(dueAppointments.flatMap(({ procedureIds }) => procedureIds));
    const { data: services, error: servicesError } = serviceIds.length > 0
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
      const procedureNames = procedureIds
        .map((serviceId) => serviceById.get(serviceId))
        .filter((service) => service?.tenant_id === appointment.tenant_id)
        .map((service) => service!.name);

      for (const subscription of subscriptionsByTenantUser.get(key) ?? []) {
        const match = {
          appointment_id: appointment.id,
          subscription_id: subscription.id,
          appointment_start_time: appointment.start_time,
        };
        const { data: existingData, error: existingError } = await supabaseAdmin
          .from("appointment_reminder_deliveries")
          .select("id, status, attempts, attempted_at")
          .match(match)
          .maybeSingle();
        if (existingError) throw existingError;

        const existing = existingData as DeliveryRow | null;
        if (existing && (existing.status === "sent" || existing.attempts >= MAX_ATTEMPTS)) {
          skipped += 1;
          continue;
        }
        if (existing?.status === "processing" && now.getTime() - new Date(existing.attempted_at).getTime() < STALE_PROCESSING_MS) {
          skipped += 1;
          continue;
        }

        let deliveryId = existing?.id;
        if (existing) {
          const { error } = await supabaseAdmin
            .from("appointment_reminder_deliveries")
            .update({
              status: "processing",
              attempts: existing.attempts + 1,
              attempted_at: now.toISOString(),
              updated_at: now.toISOString(),
              error_code: null,
              error_message: null,
            })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { data, error } = await supabaseAdmin
            .from("appointment_reminder_deliveries")
            .insert({
              tenant_id: appointment.tenant_id,
              appointment_id: appointment.id,
              user_id: userId,
              subscription_id: subscription.id,
              appointment_start_time: appointment.start_time,
              reminder_minutes: reminderMinutes,
            })
            .select("id")
            .single();
          if (error?.code === "23505") {
            skipped += 1;
            continue;
          }
          if (error) throw error;
          deliveryId = data.id;
        }

        try {
          const pushSubscription = {
            endpoint: subscription.endpoint,
            expirationTime: null,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
          };
          const message = JSON.stringify({
            appointmentId: appointment.id,
            clientName: client?.tenant_id === appointment.tenant_id ? client.name : "Cliente não identificado",
            procedureName: procedureNames.join(", ") || "Procedimento não informado",
            startTime: appointment.start_time,
            reminderMinutes,
            url: "/app/agenda",
            tag: `appointment-${appointment.id}-${appointment.start_time}`,
          });
          const pushRequest = await buildPushPayload(
            { data: message, options: { ttl: 300 } },
            pushSubscription,
            { subject: vapidSubject, publicKey: vapidPublicKey, privateKey: vapidPrivateKey },
          );
          const pushResponse = await fetch(subscription.endpoint, pushRequest);
          if (!pushResponse.ok) {
            throw Object.assign(new Error(`Push service returned ${pushResponse.status}`), {
              statusCode: pushResponse.status,
            });
          }

          await supabaseAdmin.from("appointment_reminder_deliveries").update({
            status: "sent",
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", deliveryId);
          sent += 1;
        } catch (error) {
          const pushError = sanitizeError(error);
          await supabaseAdmin.from("appointment_reminder_deliveries").update({
            status: "failed",
            error_code: pushError.code,
            error_message: pushError.message,
            updated_at: new Date().toISOString(),
          }).eq("id", deliveryId);

          if (pushError.statusCode === 404 || pushError.statusCode === 410) {
            await supabaseAdmin.from("push_subscriptions").update({
              revoked_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq("id", subscription.id);
          }
          failed += 1;
        }
      }
    }

    console.log(JSON.stringify({ considered: appointments.length, due: dueAppointments.length, sent, failed, skipped }));
    return jsonResponse({ considered: appointments.length, due: dueAppointments.length, sent, failed, skipped });
  } catch (error) {
    console.error("Appointment reminder dispatch failed", error instanceof Error ? error.message : "Unknown error");
    return jsonResponse({ error: "Appointment reminder dispatch failed" }, 500);
  }
});
