import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient, requireSuperAdmin } from "../_shared/admin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = getAdminClient();
    await requireSuperAdmin(req, supabaseAdmin);

    const { action, email } = await req.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!["add", "remove"].includes(action) || !normalizedEmail) {
      return jsonResponse({ error: "Invalid action or email" }, 400);
    }

    if (action === "add") {
      const { error } = await supabaseAdmin
        .from("super_admins")
        .upsert({ email: normalizedEmail }, { onConflict: "email" });
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ success: true });
    }

    const { count } = await supabaseAdmin
      .from("super_admins")
      .select("id", { count: "exact", head: true });

    if ((count || 0) <= 1) {
      return jsonResponse({ error: "Cannot remove the last super admin" }, 400);
    }

    const { error } = await supabaseAdmin
      .from("super_admins")
      .delete()
      .eq("email", normalizedEmail);

    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message === "Forbidden" ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
