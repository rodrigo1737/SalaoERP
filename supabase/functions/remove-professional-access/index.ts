import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient, requireTenantAdmin } from "../_shared/admin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = getAdminClient();
    const { tenantId, professionalId, userId, role } = await req.json();
    const targetRole = role === "staff" ? "staff" : "professional";

    if (!tenantId || !userId) {
      return jsonResponse({ error: "tenantId and userId are required" }, 400);
    }

    await requireTenantAdmin(req, supabaseAdmin, tenantId);

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("is_owner")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) return jsonResponse({ error: profileError.message }, 400);
    if (profile?.is_owner) {
      return jsonResponse({ error: "O acesso do owner não pode ser removido." }, 403);
    }

    const { error: permissionsError } = await supabaseAdmin
      .from("user_permissions")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("user_id", userId);

    if (permissionsError) return jsonResponse({ error: permissionsError.message }, 400);

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("role", targetRole);

    if (roleError) return jsonResponse({ error: roleError.message }, 400);

    if (professionalId) {
      const { error: unlinkError } = await supabaseAdmin
        .from("professionals")
        .update({ user_id: null })
        .eq("tenant_id", tenantId)
        .eq("id", professionalId);

      if (unlinkError) return jsonResponse({ error: unlinkError.message }, 400);
    }

    const { data: remainingRoles, error: remainingRolesError } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .limit(1);

    if (remainingRolesError) return jsonResponse({ error: remainingRolesError.message }, 400);

    const { data: authUserData, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (authUserError) return jsonResponse({ error: authUserError.message }, 400);

    const normalizedEmail = authUserData.user?.email?.toLowerCase();
    const { data: superAdmin } = normalizedEmail
      ? await supabaseAdmin
          .from("super_admins")
          .select("id")
          .eq("email", normalizedEmail)
          .maybeSingle()
      : { data: null };

    let accountDeleted = false;

    if (!superAdmin && (!remainingRoles || remainingRoles.length === 0)) {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("id", userId);

      if (profileError) return jsonResponse({ error: profileError.message }, 400);

      const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (deleteUserError) return jsonResponse({ error: deleteUserError.message }, 400);
      accountDeleted = true;
    }

    return jsonResponse({ success: true, accountDeleted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message === "Forbidden" ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
