import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient, requireSuperAdmin } from "../_shared/admin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = getAdminClient();
    await requireSuperAdmin(req, supabaseAdmin);

    const { tenantId, adminEmail, adminPassword, adminName } = await req.json();
    if (!tenantId || !adminEmail || !adminPassword) {
      return jsonResponse({ error: "tenantId, adminEmail and adminPassword are required" }, 400);
    }

    const email = String(adminEmail).trim().toLowerCase();
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { full_name: adminName || email },
    });

    if (createError) return jsonResponse({ error: createError.message }, 400);
    const userId = created.user?.id;
    if (!userId) return jsonResponse({ error: "User was not created" }, 400);

    const fullName = adminName || email;
    const writes = [
      supabaseAdmin.from("profiles").upsert({
        id: userId,
        email,
        full_name: fullName,
        tenant_id: tenantId,
      }, { onConflict: "id" }),
      supabaseAdmin.from("user_roles").upsert({
        user_id: userId,
        role: "admin",
        tenant_id: tenantId,
      }, { onConflict: "user_id,role,tenant_id" }),
    ];

    const results = await Promise.all(writes);
    const error = results.find((result) => result.error)?.error;
    if (error) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({ success: true, userId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message === "Forbidden" ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
