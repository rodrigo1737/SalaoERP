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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller is authenticated and is a super admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.log("No authorization header provided");
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's auth to verify their identity
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    
    if (userError || !user) {
      console.log("Invalid token:", userError);
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userEmail = user.email as string;
    console.log("Authenticated user email:", userEmail);

    // Use service role to check if user is super admin
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: superAdminCheck, error: checkError } = await supabaseAdmin
      .from("super_admins")
      .select("id")
      .eq("email", userEmail)
      .maybeSingle();

    if (checkError) {
      console.log("Error checking super admin status:", checkError);
      return new Response(
        JSON.stringify({ error: "Erro ao verificar permissões" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Special case: if no super admins exist, allow first registration
    const { data: allSuperAdmins } = await supabaseAdmin
      .from("super_admins")
      .select("id")
      .limit(1);

    const noSuperAdminsExist = !allSuperAdmins || allSuperAdmins.length === 0;
    const isCallerSuperAdmin = !!superAdminCheck;

    if (!isCallerSuperAdmin && !noSuperAdminsExist) {
      console.log("User is not a super admin and super admins already exist");
      return new Response(
        JSON.stringify({ error: "Apenas super admins podem gerenciar outros super admins" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, email } = await req.json();
    console.log("Action:", action, "Email:", email);

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Email inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (action === "add") {
      // Check if already exists
      const { data: existing } = await supabaseAdmin
        .from("super_admins")
        .select("id")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ error: "Este email já é um super admin" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Add new super admin
      const { error: insertError } = await supabaseAdmin
        .from("super_admins")
        .insert({ email: normalizedEmail });

      if (insertError) {
        console.log("Insert error:", insertError);
        return new Response(
          JSON.stringify({ error: "Erro ao adicionar super admin" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Super admin added successfully:", normalizedEmail);
      return new Response(
        JSON.stringify({ message: "Super admin adicionado com sucesso", email: normalizedEmail }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (action === "remove") {
      // Prevent self-removal
      if (normalizedEmail === userEmail.toLowerCase()) {
        return new Response(
          JSON.stringify({ error: "Você não pode remover a si mesmo" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if this would leave no super admins
      const { data: countData } = await supabaseAdmin
        .from("super_admins")
        .select("id");

      if (countData && countData.length <= 1) {
        return new Response(
          JSON.stringify({ error: "Não é possível remover o último super admin" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Remove super admin
      const { error: deleteError } = await supabaseAdmin
        .from("super_admins")
        .delete()
        .eq("email", normalizedEmail);

      if (deleteError) {
        console.log("Delete error:", deleteError);
        return new Response(
          JSON.stringify({ error: "Erro ao remover super admin" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Super admin removed successfully:", normalizedEmail);
      return new Response(
        JSON.stringify({ message: "Super admin removido com sucesso", email: normalizedEmail }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (action === "list") {
      const { data: superAdmins, error: listError } = await supabaseAdmin
        .from("super_admins")
        .select("*")
        .order("created_at", { ascending: true });

      if (listError) {
        console.log("List error:", listError);
        return new Response(
          JSON.stringify({ error: "Erro ao listar super admins" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ superAdmins }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else {
      return new Response(
        JSON.stringify({ error: "Ação inválida. Use: add, remove ou list" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error: unknown) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
