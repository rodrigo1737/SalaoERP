import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient, requireSuperAdmin } from "../_shared/admin.ts";

function getPasswordErrors(password: string) {
  const errors = [];
  if (password.length < 8) errors.push("Mínimo 8 caracteres");
  if (!/[A-Z]/.test(password)) errors.push("Uma letra maiúscula");
  if (!/[a-z]/.test(password)) errors.push("Uma letra minúscula");
  if (!/[0-9]/.test(password)) errors.push("Um número");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Um caractere especial");
  return errors;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = getAdminClient();
    await requireSuperAdmin(req, supabaseAdmin);

    const { action, tenantId, userId, newPassword } = await req.json();

    if (action === "list") {
      if (!tenantId) return jsonResponse({ error: "tenantId is required" }, 400);

      const { data: roles, error: rolesError } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .eq("role", "admin");

      if (rolesError) return jsonResponse({ error: rolesError.message }, 400);
      const userIds = (roles || []).map((role) => role.user_id);
      if (userIds.length === 0) return jsonResponse({ admins: [] });

      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from("profiles")
        .select("id, email, full_name, created_at")
        .in("id", userIds);

      if (profilesError) return jsonResponse({ error: profilesError.message }, 400);

      const admins = await Promise.all((profiles || []).map(async (profile) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(profile.id);
        return {
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          created_at: profile.created_at,
          last_sign_in_at: data.user?.last_sign_in_at || null,
        };
      }));

      return jsonResponse({ admins });
    }

    if (action === "reset_password") {
      if (!tenantId || !userId || !newPassword) {
        return jsonResponse({ error: "tenantId, userId and newPassword are required" }, 400);
      }

      const passwordErrors = getPasswordErrors(String(newPassword));
      if (passwordErrors.length > 0) {
        return jsonResponse({
          error: "A nova senha não atende aos requisitos.",
          details: passwordErrors,
        }, 400);
      }

      const { data: role, error: roleError } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();

      if (roleError) return jsonResponse({ error: roleError.message }, 400);
      if (!role) return jsonResponse({ error: "Admin does not belong to this tenant" }, 403);

      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Invalid action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message === "Forbidden" ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
