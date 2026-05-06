import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient, requireTenantAdmin } from "../_shared/admin.ts";

const allowedPermissions = new Set([
  "view_schedule",
  "edit_schedule",
  "view_clients",
  "view_commissions",
  "manage_cash_flow",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = getAdminClient();
    const { tenantId, email, password, fullName, permissions } = await req.json();

    if (!tenantId || !email || !password || !fullName) {
      return jsonResponse({ error: "tenantId, email, password and fullName are required" }, 400);
    }

    await requireTenantAdmin(req, supabaseAdmin, tenantId);

    const normalizedEmail = String(email).trim().toLowerCase();
    const selectedPermissions = Array.isArray(permissions)
      ? permissions.filter((permission) => allowedPermissions.has(permission))
      : [];

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError) return jsonResponse({ error: createError.message }, 400);
    const userId = created.user?.id;
    if (!userId) return jsonResponse({ error: "User was not created" }, 400);

    const writes = [
      supabaseAdmin.from("profiles").upsert({
        id: userId,
        email: normalizedEmail,
        full_name: fullName,
        tenant_id: tenantId,
      }, { onConflict: "id" }),
      supabaseAdmin.from("user_roles").upsert({
        user_id: userId,
        role: "professional",
        tenant_id: tenantId,
      }, { onConflict: "user_id,role,tenant_id" }),
    ];

    const results = await Promise.all(writes);
    const writeError = results.find((result) => result.error)?.error;
    if (writeError) return jsonResponse({ error: writeError.message }, 400);

    if (selectedPermissions.length > 0) {
      const { error: permissionsError } = await supabaseAdmin
        .from("user_permissions")
        .upsert(
          selectedPermissions.map((permission) => ({
            user_id: userId,
            permission,
            tenant_id: tenantId,
          })),
          { onConflict: "user_id,tenant_id,permission" },
        );

      if (permissionsError) return jsonResponse({ error: permissionsError.message }, 400);
    }

    return jsonResponse({ success: true, userId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message === "Forbidden" ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
