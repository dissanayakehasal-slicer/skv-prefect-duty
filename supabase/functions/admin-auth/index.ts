import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple password hashing using Web Crypto API (PBKDF2)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt,
    iterations: 100000,
    hash: 'SHA-256',
  }, keyMaterial, 256);
  const hashArray = new Uint8Array(bits);
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2:${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored.startsWith('pbkdf2:')) return false;
  const [, saltHex, hashHex] = stored.split(':');
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt,
    iterations: 100000,
    hash: 'SHA-256',
  }, keyMaterial, 256);
  const computed = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return computed === hashHex;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, password, newPassword } = await req.json();

    if (action === 'init') {
      const hash = await hashPassword('SKV#1902');
      await supabase.from('settings').update({ value: hash }).eq('key', 'admin_password_hash');
      await supabase.from('settings').update({ value: 'false' }).eq('key', 'admin_password_changed');
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'verify') {
      let { data: setting } = await supabase
        .from('settings').select('value').eq('key', 'admin_password_hash').single();

      if (!setting || !setting.value) {
        // Auto-seed default password on first use
        const defaultHash = await hashPassword('SKV#1902');
        await supabase.from('settings').upsert({ key: 'admin_password_hash', value: defaultHash });
        await supabase.from('settings').upsert({ key: 'admin_password_changed', value: 'false' });
        // Re-fetch
        const { data: seeded } = await supabase
          .from('settings').select('value').eq('key', 'admin_password_hash').single();
        setting = seeded;
      }

      const valid = await verifyPassword(password, setting.value);
      if (!valid) {
        await supabase.from('audit_logs').insert({
          entity_type: 'admin', action: 'login_failed',
          details: { timestamp: new Date().toISOString() },
        });
        return new Response(JSON.stringify({ success: false, error: 'Invalid password' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: changed } = await supabase
        .from('settings').select('value').eq('key', 'admin_password_changed').single();

      await supabase.from('audit_logs').insert({
        entity_type: 'admin', action: 'login_success',
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
      const { data: setting } = await supabase
        .from('settings').select('value').eq('key', 'admin_password_hash').single();

      if (!setting) {
        return new Response(JSON.stringify({ success: false, error: 'No admin password configured' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const valid = await verifyPassword(password, setting.value);
      if (!valid) {
        return new Response(JSON.stringify({ success: false, error: 'Current password is incorrect' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const newHash = await hashPassword(newPassword);
      await supabase.from('settings').update({ value: newHash }).eq('key', 'admin_password_hash');
      await supabase.from('settings').update({ value: 'true' }).eq('key', 'admin_password_changed');

      await supabase.from('audit_logs').insert({
        entity_type: 'admin', action: 'password_changed',
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
