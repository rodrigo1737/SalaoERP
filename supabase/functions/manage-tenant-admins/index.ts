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
        JSON.stringify({ error: "Apenas super admins podem gerenciar administradores" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // Get request body
    const { action, tenantId, userId, newPassword } = await req.json();

    if (action === "list") {
      // List all admins for a tenant
      if (!tenantId) {
        return new Response(
          JSON.stringify({ error: "tenant_id é obrigatório" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // Get all admin users for this tenant
      const { data: adminRoles, error: rolesError } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role, created_at")
        .eq("tenant_id", tenantId)
        .eq("role", "admin");

      if (rolesError) {
        console.error("Error fetching roles:", rolesError);
        throw new Error("Erro ao buscar administradores");
      }

      if (!adminRoles || adminRoles.length === 0) {
        return new Response(
          JSON.stringify({ admins: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      // Get profile info for each admin
      const userIds = adminRoles.map(r => r.user_id);
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from("profiles")
        .select("id, email, full_name, created_at")
        .in("id", userIds);

      if (profilesError) {
        console.error("Error fetching profiles:", profilesError);
        throw new Error("Erro ao buscar perfis");
      }

      // Get auth user info for last sign in
      const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
      
      const admins = profiles?.map(profile => {
        const authUser = authUsers?.users?.find(u => u.id === profile.id);
        return {
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          created_at: profile.created_at,
          last_sign_in_at: authUser?.last_sign_in_at || null,
        };
      }) || [];

      return new Response(
        JSON.stringify({ admins }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );

    } else if (action === "reset_password") {
      // Reset password for a specific admin
      if (!userId || !newPassword) {
        return new Response(
          JSON.stringify({ error: "user_id e new_password são obrigatórios" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // Validate password strength
      const passwordErrors: string[] = [];
      if (newPassword.length < 8) passwordErrors.push('mínimo 8 caracteres');
      if (!/[A-Z]/.test(newPassword)) passwordErrors.push('uma letra maiúscula');
      if (!/[a-z]/.test(newPassword)) passwordErrors.push('uma letra minúscula');
      if (!/[0-9]/.test(newPassword)) passwordErrors.push('um número');
      if (!/[^A-Za-z0-9]/.test(newPassword)) passwordErrors.push('um caractere especial');

      if (passwordErrors.length > 0) {
        return new Response(
          JSON.stringify({ error: `Senha fraca. Requisitos: ${passwordErrors.join(', ')}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // Verify the user exists and is an admin
      const { data: userRole } = await supabaseAdmin
        .from("user_roles")
        .select("id, role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .single();

      if (!userRole) {
        return new Response(
          JSON.stringify({ error: "Usuário não encontrado ou não é administrador" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
        );
      }

      // Update password
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: newPassword,
      });

      if (updateError) {
        console.error("Error updating password:", updateError);
        throw new Error(`Erro ao atualizar senha: ${updateError.message}`);
      }

      console.log(`Password reset for user ${userId}`);

      return new Response(
        JSON.stringify({ success: true, message: "Senha alterada com sucesso" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );

    } else {
      return new Response(
        JSON.stringify({ error: "Ação inválida. Use 'list' ou 'reset_password'" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

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
