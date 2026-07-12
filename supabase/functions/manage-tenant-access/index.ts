import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient, requireTenantAdmin } from "../_shared/admin.ts";
import { getPasswordErrors } from "../_shared/password.ts";

// Gestão de acesso interno pelo PRÓPRIO admin do tenant (não exige super admin):
// promover usuário a administrador, rebaixar administrador e resetar senha.
// Owner é protegido: não pode ser rebaixado nem ter acesso removido.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = getAdminClient();
    const { action, tenantId, userId, newPassword } = await req.json();

    if (!action || !tenantId || !userId) {
      return jsonResponse({ error: "action, tenantId and userId are required" }, 400);
    }

    await requireTenantAdmin(req, supabaseAdmin, tenantId);

    // Owner do alvo — protegido em qualquer operação de rebaixamento/remoção.
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, is_owner")
      .eq("id", userId)
      .maybeSingle();

    if (action === "promote_admin") {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert(
          { user_id: userId, tenant_id: tenantId, role: "admin" },
          { onConflict: "user_id,role,tenant_id" },
        );
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ success: true });
    }

    if (action === "demote_admin") {
      if (targetProfile?.is_owner) {
        return jsonResponse({ error: "O owner não pode ser rebaixado." }, 400);
      }

      // Garante que reste ao menos um admin/owner válido no tenant.
      const { data: admins } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .eq("role", "admin");
      const { data: owners } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("is_owner", true);

      const adminIds = new Set((admins || []).map((a) => a.user_id));
      const ownerIds = new Set((owners || []).map((o) => o.id));
      // Após remover o alvo, quantos admins/owners sobram?
      adminIds.delete(userId);
      const remaining = new Set([...adminIds, ...ownerIds]);
      remaining.delete(userId);
      if (remaining.size === 0) {
        return jsonResponse({ error: "Não é possível rebaixar o último administrador do cliente." }, 400);
      }

      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)
        .eq("role", "admin");
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ success: true });
    }

    if (action === "reset_password") {
      if (!newPassword) return jsonResponse({ error: "newPassword is required" }, 400);
      const passwordErrors = getPasswordErrors(String(newPassword));
      if (passwordErrors.length > 0) {
        return jsonResponse({ error: "A nova senha não atende aos requisitos.", details: passwordErrors }, 400);
      }
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: String(newPassword) });
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Ação inválida." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    const status = message === "Forbidden" ? 403 : 400;
    return jsonResponse({ error: message }, status);
  }
});
