import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient, getAuthenticatedUser } from "../_shared/admin.ts";

type FinalizeClientAccountPayload = {
  tenantId?: string;
  fullName?: string;
  phone?: string;
  birthDate?: string | null;
  preferredProfessionalId?: string | null;
  preferredServiceIds?: string[];
  photoUrl?: string | null;
};

const SERVICE_BOOKING_PACKAGES = new Set(["salon", "aesthetic_clinic", "business_erp"]);

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const normalizeOptionalString = (value: unknown) => {
  const normalized = normalizeString(value);
  return normalized.length > 0 ? normalized : null;
};

const normalizeServiceIds = (value: unknown) => (
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : []
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = getAdminClient();
    const user = await getAuthenticatedUser(req, supabaseAdmin);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const payload = (body || {}) as FinalizeClientAccountPayload;
    const metadata = user.user_metadata || {};

    const tenantId = normalizeString(payload.tenantId ?? metadata.client_signup_tenant_id);
    const fullName = normalizeString(payload.fullName ?? metadata.full_name);
    const phone = normalizeString(payload.phone ?? metadata.client_signup_phone);
    const birthDate = normalizeOptionalString(payload.birthDate ?? metadata.client_signup_birth_date);
    const preferredProfessionalId = normalizeOptionalString(
      payload.preferredProfessionalId ?? metadata.client_signup_preferred_professional_id,
    );
    const preferredServiceIds = normalizeServiceIds(
      payload.preferredServiceIds ?? metadata.client_signup_preferred_service_ids,
    );
    const photoUrl = normalizeOptionalString(payload.photoUrl ?? metadata.client_signup_photo_url);

    if (!tenantId || !fullName || !phone) {
      return jsonResponse({ error: "tenantId, fullName e phone são obrigatórios." }, 400);
    }

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .select("id, status, package_type")
      .eq("id", tenantId)
      .maybeSingle();

    if (tenantError) {
      return jsonResponse({ error: tenantError.message }, 400);
    }

    if (!tenant) {
      return jsonResponse({ error: "Tenant não encontrado." }, 404);
    }

    if (!SERVICE_BOOKING_PACKAGES.has(String(tenant.package_type || ""))) {
      return jsonResponse({ error: "Este segmento não permite cadastro público de clientes." }, 403);
    }

    if (String(tenant.status || "").toLowerCase() !== "active") {
      return jsonResponse({ error: "Este tenant está inativo." }, 403);
    }

    if (preferredProfessionalId) {
      const { data: professional, error: professionalError } = await supabaseAdmin
        .from("professionals")
        .select("id")
        .eq("id", preferredProfessionalId)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .eq("is_active", true)
        .maybeSingle();

      if (professionalError) {
        return jsonResponse({ error: professionalError.message }, 400);
      }

      if (!professional) {
        return jsonResponse({ error: "Profissional preferido inválido para este tenant." }, 400);
      }
    }

    if (preferredServiceIds.length > 0) {
      const { data: validServices, error: servicesError } = await supabaseAdmin
        .from("services")
        .select("id")
        .eq("tenant_id", tenantId)
        .in("id", preferredServiceIds)
        .is("deleted_at", null);

      if (servicesError) {
        return jsonResponse({ error: servicesError.message }, 400);
      }

      if ((validServices || []).length !== preferredServiceIds.length) {
        return jsonResponse({ error: "Há serviços preferidos inválidos para este tenant." }, 400);
      }
    }

    const { data: existingAccount, error: existingAccountError } = await supabaseAdmin
      .from("client_accounts")
      .select("id, client_id, tenant_id")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (existingAccountError) {
      return jsonResponse({ error: existingAccountError.message }, 400);
    }

    let createdClientId: string | null = null;
    let clientId = existingAccount?.client_id ?? null;

    if (clientId) {
      const { error: updateClientError } = await supabaseAdmin
        .from("clients")
        .update({
          name: fullName,
          phone,
          email: user.email ?? null,
          birth_date: birthDate,
          photo_url: photoUrl,
          deleted_at: null,
        })
        .eq("id", clientId)
        .eq("tenant_id", tenantId);

      if (updateClientError) {
        return jsonResponse({ error: updateClientError.message }, 400);
      }
    } else {
      const { data: createdClient, error: createClientError } = await supabaseAdmin
        .from("clients")
        .insert({
          tenant_id: tenantId,
          name: fullName,
          phone,
          email: user.email ?? null,
          birth_date: birthDate,
          photo_url: photoUrl,
        })
        .select("id")
        .single();

      if (createClientError || !createdClient) {
        return jsonResponse({ error: createClientError?.message || "Não foi possível criar o cliente." }, 400);
      }

      clientId = createdClient.id;
      createdClientId = createdClient.id;
    }

    const { data: account, error: upsertAccountError } = await supabaseAdmin
      .from("client_accounts")
      .upsert({
        user_id: user.id,
        client_id: clientId,
        tenant_id: tenantId,
        preferred_professional_id: preferredProfessionalId,
        terms_accepted_at: new Date().toISOString(),
      }, {
        onConflict: "user_id,tenant_id",
      })
      .select("id, user_id, client_id, tenant_id, preferred_professional_id, terms_accepted_at")
      .single();

    if (upsertAccountError || !account) {
      if (createdClientId) {
        await supabaseAdmin
          .from("clients")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", createdClientId)
          .eq("tenant_id", tenantId);
      }
      return jsonResponse({ error: upsertAccountError?.message || "Não foi possível vincular a conta do cliente." }, 400);
    }

    const { error: clearServicesError } = await supabaseAdmin
      .from("client_preferred_services")
      .delete()
      .eq("client_account_id", account.id);

    if (clearServicesError) {
      return jsonResponse({ error: clearServicesError.message }, 400);
    }

    if (preferredServiceIds.length > 0) {
      const { error: upsertServicesError } = await supabaseAdmin
        .from("client_preferred_services")
        .upsert(
          preferredServiceIds.map((serviceId) => ({
            client_account_id: account.id,
            service_id: serviceId,
          })),
          { onConflict: "client_account_id,service_id" },
        );

      if (upsertServicesError) {
        return jsonResponse({ error: upsertServicesError.message }, 400);
      }
    }

    return jsonResponse({
      success: true,
      account,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message === "Missing authorization header" || message === "Invalid user" ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});
