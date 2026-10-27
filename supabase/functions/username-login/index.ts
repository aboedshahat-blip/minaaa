import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: corsHeaders,
});

const hmac = async (secret: string, value: string) => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return respond({ error: 'الطريقة غير مدعومة.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return respond({ error: 'خدمة الدخول غير مهيأة.' }, 503);

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return respond({ error: 'الطلب غير صالح.' }, 400); }

  const username = String(body.username || '').trim().normalize('NFKC').toLowerCase();
  const password = String(body.password || '');
  if (!username || username.length > 80 || !password || password.length > 1024) {
    return respond({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const auth = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const forwardedIp = request.headers.get('cf-connecting-ip')
      || request.headers.get('x-real-ip')
      || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || 'unknown';
    const subjectHashes = await Promise.all([
      hmac(serviceRoleKey, `username:${username}`),
      hmac(serviceRoleKey, `ip:${forwardedIp}`),
    ]);
    const { data: allowed, error: limitError } = await admin.rpc('username_login_rate_limit', {
      p_subject_hashes: subjectHashes,
      p_action: 'consume',
    });
    if (limitError) {
      console.error('Username login rate-limit check failed:', limitError.message);
      return respond({ error: 'تعذر التحقق من تسجيل الدخول. حاول لاحقًا.' }, 503);
    }
    if (!allowed) return respond({ error: 'محاولات كثيرة. انتظر 15 دقيقة ثم حاول مرة أخرى.' }, 429);

    const { data: profiles, error: profileError } = await admin
      .from('app_user_profiles')
      .select('email, is_active')
      .eq('username_normalized', username)
      .limit(2);
    if (profileError) {
      console.error('Username profile lookup failed:', profileError.message);
      return respond({ error: 'تعذر التحقق من تسجيل الدخول. حاول لاحقًا.' }, 503);
    }

    const profile = profiles?.length === 1 ? profiles[0] : null;
    if (!profile?.email || !profile.is_active) return respond({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' }, 401);

    const { data, error } = await auth.auth.signInWithPassword({ email: profile.email, password });
    if (error || !data.session) return respond({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' }, 401);

    const { error: clearError } = await admin.rpc('username_login_rate_limit', {
      p_subject_hashes: subjectHashes,
      p_action: 'clear',
    });
    if (clearError) console.error('Could not clear successful login rate limits:', clearError.message);

    return respond({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    });
  } catch (error) {
    console.error('Username login failed unexpectedly:', error);
    return respond({ error: 'تعذر الاتصال بخدمة تسجيل الدخول. حاول مرة أخرى.' }, 503);
  }
});
