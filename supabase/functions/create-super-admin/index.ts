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

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const superAdminEmail = "rodrigo.salomao@multisoluction.com.br";
    const superAdminPassword = "S@l0n#Adm1n$2025!";

    // Check if super admin already exists in super_admins table
    const { data: existingSuperAdmin } = await supabaseAdmin
      .from("super_admins")
      .select("id")
      .eq("email", superAdminEmail)
      .maybeSingle();

    if (existingSuperAdmin) {
      console.log("Super admin already exists in super_admins table");
      return new Response(
        JSON.stringify({ message: "Super admin já existe", exists: true }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Check if user already exists in auth
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === superAdminEmail);

    let userId: string;

    if (existingUser) {
      console.log("User already exists in auth, updating password");
      userId = existingUser.id;
      
      // Update password
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: superAdminPassword,
        email_confirm: true,
      });
      
      if (updateError) {
        console.error("Error updating user:", updateError);
        throw updateError;
      }
    } else {
      console.log("Creating new user");
      // Create new user
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: superAdminEmail,
        password: superAdminPassword,
        email_confirm: true,
        user_metadata: {
          full_name: "Rodrigo Salomão",
        },
      });

      if (authError) {
        console.error("Error creating user:", authError);
        throw authError;
      }

      if (!authData.user) {
        throw new Error("Falha ao criar usuário");
      }

      userId = authData.user.id;
    }

    // Add to super_admins table
    const { error: superAdminError } = await supabaseAdmin
      .from("super_admins")
      .insert({ email: superAdminEmail });

    if (superAdminError) {
      console.error("Error adding to super_admins:", superAdminError);
      throw superAdminError;
    }

    console.log("Super admin created successfully");

    return new Response(
      JSON.stringify({
        message: "Super admin criado com sucesso",
        email: superAdminEmail,
        created: true,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
