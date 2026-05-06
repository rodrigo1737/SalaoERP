import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function getAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function requireSuperAdmin(req: Request, supabaseAdmin: ReturnType<typeof getAdminClient>) {
  const user = await getAuthenticatedUser(req, supabaseAdmin);
  if (!user.email) throw new Error("Invalid user");

  const { data: superAdmin } = await supabaseAdmin
    .from("super_admins")
    .select("id")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();

  if (!superAdmin) throw new Error("Forbidden");
  return user;
}

export async function getAuthenticatedUser(req: Request, supabaseAdmin: ReturnType<typeof getAdminClient>) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing authorization header");

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid user");
  return data.user;
}

export async function requireTenantAdmin(
  req: Request,
  supabaseAdmin: ReturnType<typeof getAdminClient>,
  tenantId: string,
) {
  const user = await getAuthenticatedUser(req, supabaseAdmin);

  if (user.email) {
    const { data: superAdmin } = await supabaseAdmin
      .from("super_admins")
      .select("id")
      .eq("email", user.email.toLowerCase())
      .maybeSingle();

    if (superAdmin) return user;
  }

  const { data: role, error } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", user.id)
    .eq("tenant_id", tenantId)
    .eq("role", "admin")
    .maybeSingle();

  if (error) throw error;
  if (!role) throw new Error("Forbidden");
  return user;
}
