import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return respond({ error: 'الطريقة غير مدعومة.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return respond({ error: 'إعداد إدارة الحسابات غير مكتمل.' }, 500);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) return respond({ error: 'يلزم تسجيل الدخول مجدداً.' }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerProfile, error: callerProfileError } = await admin.from('app_user_profiles')
    .select('role, is_active').eq('user_id', callerData.user.id).maybeSingle();
  if (callerProfileError || callerProfile?.role !== 'admin' || !callerProfile.is_active) {
    return respond({ error: 'هذه العملية متاحة للمدير العام فقط.' }, 403);
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return respond({ error: 'الطلب غير صالح.' }, 400); }
  const action = String(body.action || '');
  const targetId = String(body.user_id || '');

  if (action === 'create') {
    const email = String(body.email || '').trim().toLowerCase();
    const username = String(body.username || '').trim().normalize('NFKC');
    const displayName = String(body.display_name || '').trim();
    const password = String(body.password || '');
    const role = String(body.role || 'data_entry');
    const permissions = body.permissions && typeof body.permissions === 'object' ? body.permissions : {};
    if (!email.includes('@') || !username || !displayName || password.length < 8 || !['admin', 'accountant', 'data_entry'].includes(role)) {
      return respond({ error: 'راجع البريد والاسم والدور، واجعل كلمة المرور 8 أحرف على الأقل.' }, 400);
    }
    const normalizedUsername = username.toLowerCase();
    const { data: usernameMatch, error: usernameLookupError } = await admin.from('app_user_profiles')
      .select('user_id').eq('username_normalized', normalizedUsername).limit(1).maybeSingle();
    if (usernameLookupError) return respond({ error: 'تعذر التحقق من اسم المستخدم.' }, 400);
    if (usernameMatch) return respond({ error: 'اسم المستخدم مستخدم بالفعل. اختر اسمًا آخر.' }, 409);
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { username, display_name: displayName },
    });
    if (inviteError || !invited.user) return respond({ error: inviteError?.message || 'تعذر إرسال دعوة المستخدم.' }, 400);
    const { error: passwordError } = await admin.auth.admin.updateUserById(invited.user.id, { password });
    if (passwordError) {
      await admin.auth.admin.deleteUser(invited.user.id);
      return respond({ error: 'تعذر إعداد كلمة المرور للحساب الجديد.' }, 400);
    }
    const { error: profileError } = await admin.from('app_user_profiles').upsert({
      user_id: invited.user.id, email, username, display_name: displayName, role,
      permissions, is_active: true,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(invited.user.id);
      return respond({ error: 'تعذر حفظ صلاحيات الحساب الجديد.' }, 400);
    }
    return respond({ success: true, invite_sent: true });
  }

  if (!targetId) return respond({ error: 'معرّف المستخدم مطلوب.' }, 400);
  const { data: target, error: targetError } = await admin.from('app_user_profiles')
    .select('user_id, role, is_active').eq('user_id', targetId).maybeSingle();
  if (targetError || !target) return respond({ error: 'الحساب المطلوب غير موجود.' }, 404);

  if (action === 'update_permissions') {
    if (!body.permissions || typeof body.permissions !== 'object') return respond({ error: 'الصلاحيات غير صالحة.' }, 400);
    const { error } = await admin.from('app_user_profiles').update({ permissions: body.permissions }).eq('user_id', targetId);
    if (error) return respond({ error: 'تعذر حفظ الصلاحيات.' }, 400);
  } else if (action === 'update_status') {
    if (typeof body.is_active !== 'boolean') return respond({ error: 'حالة الحساب غير صالحة.' }, 400);
    if (!body.is_active && target.role === 'admin') {
      const { count } = await admin.from('app_user_profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin').eq('is_active', true);
      if ((count || 0) <= 1) return respond({ error: 'لا يمكن تعطيل آخر حساب مدير.' }, 409);
    }
    const { error } = await admin.from('app_user_profiles').update({ is_active: body.is_active }).eq('user_id', targetId);
    if (error) return respond({ error: 'تعذر تحديث حالة الحساب.' }, 400);
  } else if (action === 'update_password') {
    const password = String(body.password || '');
    if (password.length < 8) return respond({ error: 'كلمة المرور يجب ألا تقل عن 8 أحرف.' }, 400);
    const { error } = await admin.auth.admin.updateUserById(targetId, { password });
    if (error) return respond({ error: 'تعذر تحديث كلمة المرور.' }, 400);
  } else if (action === 'delete') {
    if (targetId === callerData.user.id) return respond({ error: 'لا يمكن حذف الحساب المستخدم حالياً.' }, 409);
    if (target.role === 'admin') {
      const { count } = await admin.from('app_user_profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin').eq('is_active', true);
      if ((count || 0) <= 1) return respond({ error: 'لا يمكن حذف آخر حساب مدير.' }, 409);
    }
    const { error } = await admin.auth.admin.deleteUser(targetId);
    if (error) return respond({ error: 'تعذر حذف الحساب.' }, 400);
  } else {
    return respond({ error: 'العملية المطلوبة غير معروفة.' }, 400);
  }

  return respond({ success: true });
});
