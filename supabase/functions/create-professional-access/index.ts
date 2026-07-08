import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient, requireTenantAdmin } from "../_shared/admin.ts";
import { getPasswordErrors } from "../_shared/password.ts";

const allowedPermissions = new Set([
  "view_schedule",
  "edit_schedule",
  "view_clients",
  "view_commissions",
  "manage_cash_flow",
]);

const allowedRoles = new Set(["professional", "staff"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = getAdminClient();
    const { tenantId, email, password, fullName, permissions, role, professionalId } = await req.json();

    if (!tenantId || !email || !password || !fullName) {
      return jsonResponse({ error: "tenantId, email, password and fullName are required" }, 400);
    }

    await requireTenantAdmin(req, supabaseAdmin, tenantId);

    const passwordErrors = getPasswordErrors(String(password));
    if (passwordErrors.length > 0) {
      return jsonResponse({
        error: "A senha do profissional não atende aos requisitos.",
        details: passwordErrors,
      }, 400);
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedRole = allowedRoles.has(role) ? role : "professional";
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
        is_owner: false,
      }, { onConflict: "id" }),
      supabaseAdmin.from("user_roles").upsert({
        user_id: userId,
        role: normalizedRole,
        tenant_id: tenantId,
      }, { onConflict: "user_id,role,tenant_id" }),
    ];

    const results = await Promise.all(writes);
    const writeError = results.find((result) => result.error)?.error;
    if (writeError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return jsonResponse({ error: writeError.message }, 400);
    }

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

      if (permissionsError) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return jsonResponse({ error: permissionsError.message }, 400);
      }
    }

    if (professionalId) {
      const { error: professionalError } = await supabaseAdmin
        .from("professionals")
        .update({
          user_id: userId,
          email: normalizedEmail,
        })
        .eq("tenant_id", tenantId)
        .eq("id", professionalId);

      if (professionalError) {
        await supabaseAdmin.from("user_permissions").delete().eq("tenant_id", tenantId).eq("user_id", userId);
        await supabaseAdmin.from("user_roles").delete().eq("tenant_id", tenantId).eq("user_id", userId);
        await supabaseAdmin.from("profiles").delete().eq("id", userId);
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return jsonResponse({ error: professionalError.message }, 400);
      }
    }

    return jsonResponse({ success: true, userId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message === "Forbidden" ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
