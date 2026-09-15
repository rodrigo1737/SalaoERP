import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient, requireTenantAdmin } from "../_shared/admin.ts";
import { getPasswordErrors } from "../_shared/password.ts";

const allowedRoles = new Set(["professional", "staff"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseAdmin = getAdminClient();
    const { tenantId, userId, newPassword } = await req.json();

    if (!tenantId || !userId || !newPassword) {
      return jsonResponse({ error: "tenantId, userId and newPassword are required" }, 400);
    }

    const caller = await requireTenantAdmin(req, supabaseAdmin, tenantId);
    if (caller.id === userId) {
      return jsonResponse({ error: "Use o seu perfil para alterar a própria senha." }, 400);
    }

    const password = String(newPassword);
    const passwordErrors = getPasswordErrors(password);
    if (password.length > 128) passwordErrors.push("Máximo 128 caracteres");
    if (passwordErrors.length > 0) {
      return jsonResponse({
        error: "A nova senha não atende aos requisitos.",
        details: passwordErrors,
      }, 400);
    }

    const { data: targetProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, tenant_id, is_owner")
      .eq("id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (profileError) return jsonResponse({ error: profileError.message }, 400);
    if (!targetProfile) {
      return jsonResponse({ error: "Usuário interno não encontrado neste cliente B2B." }, 403);
    }
    if (targetProfile.is_owner) {
      return jsonResponse({ error: "A senha do owner não pode ser alterada por esta tela." }, 403);
    }

    const { data: targetRoles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId);

    if (rolesError) return jsonResponse({ error: rolesError.message }, 400);
    const allTargetRoles = (targetRoles ?? []).map((row) => String(row.role));
    if (allTargetRoles.includes("admin")) {
      return jsonResponse({ error: "A senha de outro administrador não pode ser alterada por esta tela." }, 403);
    }

    const internalRoles = allTargetRoles
      .filter((role) => allowedRoles.has(role));
    if (internalRoles.length === 0) {
      return jsonResponse({ error: "O usuário não possui acesso profissional ou interno neste cliente B2B." }, 403);
    }

    let targetProfessionalId: string | null = null;
    if (internalRoles.includes("professional")) {
      const { data: professional, error: professionalError } = await supabaseAdmin
        .from("professionals")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .maybeSingle();

      if (professionalError) return jsonResponse({ error: professionalError.message }, 400);
      if (!professional) {
        return jsonResponse({ error: "O login profissional não está vinculado a um profissional deste cliente B2B." }, 403);
      }
      targetProfessionalId = professional.id;
    }

    const { data: authUser, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (authUserError || !authUser.user) {
      return jsonResponse({ error: authUserError?.message ?? "Conta de autenticação não encontrada." }, 404);
    }

    const normalizedTargetEmail = authUser.user.email?.trim().toLowerCase();
    if (normalizedTargetEmail) {
      const { data: superAdmin, error: superAdminError } = await supabaseAdmin
        .from("super_admins")
        .select("id")
        .eq("email", normalizedTargetEmail)
        .maybeSingle();

      if (superAdminError) return jsonResponse({ error: superAdminError.message }, 400);
      if (superAdmin) {
        return jsonResponse({ error: "A senha de um superadministrador não pode ser alterada por esta tela." }, 403);
      }
    }

    const { data: auditRow, error: auditInsertError } = await supabaseAdmin
      .from("internal_user_security_audit")
      .insert({
        tenant_id: tenantId,
        target_user_id: userId,
        target_professional_id: targetProfessionalId,
        changed_by: caller.id,
        action: "password_changed",
        status: "requested",
      })
      .select("id")
      .single();

    if (auditInsertError || !auditRow) {
      return jsonResponse({ error: "Não foi possível registrar a auditoria da alteração de senha." }, 500);
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
    if (updateError) {
      await supabaseAdmin
        .from("internal_user_security_audit")
        .update({ status: "failed", completed_at: new Date().toISOString(), error_code: updateError.code ?? null })
        .eq("id", auditRow.id);
      return jsonResponse({ error: updateError.message }, 400);
    }

    const { error: auditUpdateError } = await supabaseAdmin
      .from("internal_user_security_audit")
      .update({ status: "succeeded", completed_at: new Date().toISOString(), error_code: null })
      .eq("id", auditRow.id);

    if (auditUpdateError) {
      console.error("Password changed, but the security audit could not be finalized:", auditUpdateError.message);
    }

    return jsonResponse({
      success: true,
      auditRecorded: !auditUpdateError,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message === "Forbidden" ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
