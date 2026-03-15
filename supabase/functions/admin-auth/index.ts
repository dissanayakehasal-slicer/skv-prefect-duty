import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, password, newPassword } = await req.json();

    if (action === 'verify') {
      const { data: setting } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'admin_password_hash')
        .single();

      if (!setting) {
        return new Response(JSON.stringify({ success: false, error: 'No admin password configured' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const valid = await bcrypt.compare(password, setting.value);

      if (!valid) {
        // Log failed attempt
        await supabase.from('audit_logs').insert({
          entity_type: 'admin',
          action: 'login_failed',
          details: { timestamp: new Date().toISOString() },
        });
        return new Response(JSON.stringify({ success: false, error: 'Invalid password' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if password change required
      const { data: changed } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'admin_password_changed')
        .single();

      await supabase.from('audit_logs').insert({
        entity_type: 'admin',
        action: 'login_success',
        details: { timestamp: new Date().toISOString() },
      });

      return new Response(JSON.stringify({
        success: true,
        requirePasswordChange: changed?.value === 'false',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'change_password') {
      // Verify current password first
      const { data: setting } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'admin_password_hash')
        .single();

      if (!setting) {
        return new Response(JSON.stringify({ success: false, error: 'No admin password configured' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const valid = await bcrypt.compare(password, setting.value);
      if (!valid) {
        return new Response(JSON.stringify({ success: false, error: 'Current password is incorrect' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const newHash = await bcrypt.hash(newPassword);
      await supabase.from('settings').update({ value: newHash }).eq('key', 'admin_password_hash');
      await supabase.from('settings').update({ value: 'true' }).eq('key', 'admin_password_changed');

      await supabase.from('audit_logs').insert({
        entity_type: 'admin',
        action: 'password_changed',
        details: { timestamp: new Date().toISOString() },
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
