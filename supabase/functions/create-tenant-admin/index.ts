import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the request is from an authenticated super admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Check if user is super admin
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: superAdmin } = await supabaseAdmin
      .from("super_admins")
      .select("id")
      .eq("email", user.email)
      .single();

    if (!superAdmin) {
      return new Response(
        JSON.stringify({ error: "Apenas super admins podem criar administradores de tenant" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // Get request body
    const { tenantId, adminEmail, adminPassword, adminName } = await req.json();

    if (!tenantId || !adminEmail || !adminPassword) {
      return new Response(
        JSON.stringify({ error: "tenant_id, admin_email e admin_password são obrigatórios" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Validate password strength
    const passwordErrors: string[] = [];
    if (adminPassword.length < 8) passwordErrors.push('mínimo 8 caracteres');
    if (!/[A-Z]/.test(adminPassword)) passwordErrors.push('uma letra maiúscula');
    if (!/[a-z]/.test(adminPassword)) passwordErrors.push('uma letra minúscula');
    if (!/[0-9]/.test(adminPassword)) passwordErrors.push('um número');
    if (!/[^A-Za-z0-9]/.test(adminPassword)) passwordErrors.push('um caractere especial');

    if (passwordErrors.length > 0) {
      return new Response(
        JSON.stringify({ error: `Senha fraca. Requisitos: ${passwordErrors.join(', ')}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Check if tenant exists
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .select("id, name")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ error: "Tenant não encontrado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Check if admin already exists for this tenant
    const { data: existingAdmin } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("role", "admin")
      .limit(1);

    if (existingAdmin && existingAdmin.length > 0) {
      return new Response(
        JSON.stringify({ error: "Este tenant já possui um administrador" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Check if email is already in use
    const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
    const emailExists = existingUser?.users?.some(u => u.email?.toLowerCase() === adminEmail.toLowerCase());
    
    if (emailExists) {
      return new Response(
        JSON.stringify({ error: "Este email já está em uso" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log(`Creating admin for tenant ${tenant.name} with email ${adminEmail}`);

    // Create admin user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        full_name: adminName || `Admin ${tenant.name}`,
      },
    });

    if (authError) {
      console.error("Auth error:", authError);
      throw new Error(`Erro ao criar usuário: ${authError.message}`);
    }

    if (!authData.user) {
      throw new Error("Falha ao criar usuário");
    }

    const userId = authData.user.id;
    console.log(`User created with id ${userId}`);

    // Wait a moment for the trigger to create the profile
    await new Promise(resolve => setTimeout(resolve, 500));

    // Update profile with tenant_id using upsert to handle race conditions
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        email: adminEmail,
        full_name: adminName || `Admin ${tenant.name}`,
        tenant_id: tenantId,
      }, {
        onConflict: 'id'
      });

    if (profileError) {
      console.error("Profile error:", profileError);
      // Rollback: delete user
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(`Erro ao atualizar perfil: ${profileError.message}`);
    }

    console.log(`Profile updated with tenant_id ${tenantId}`);

    // Add admin role with tenant_id
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: userId,
        role: "admin",
        tenant_id: tenantId,
      });

    if (roleError) {
      console.error("Role error:", roleError);
      // Rollback: delete user
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(`Erro ao adicionar role: ${roleError.message}`);
    }

    console.log(`Admin role added for user ${userId}`);

    // Verify the data was saved correctly
    const { data: verifyProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, email, tenant_id")
      .eq("id", userId)
      .single();

    const { data: verifyRole } = await supabaseAdmin
      .from("user_roles")
      .select("id, role, tenant_id")
      .eq("user_id", userId)
      .single();

    console.log(`Verification - Profile: ${JSON.stringify(verifyProfile)}, Role: ${JSON.stringify(verifyRole)}`);

    if (!verifyProfile?.tenant_id || !verifyRole?.tenant_id || verifyRole?.role !== 'admin') {
      console.error("Data verification failed!");
      // Rollback: delete user
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error("Falha na verificação dos dados. Usuário removido.");
    }

    console.log(`Admin created successfully for tenant ${tenant.name}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Administrador criado com sucesso",
        admin: {
          email: adminEmail,
          name: adminName || `Admin ${tenant.name}`,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
