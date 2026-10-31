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
    const { data: existingProfile, error: existingProfileError } = await admin.from('app_user_profiles')
      .select('user_id').eq('email', email).maybeSingle();
    if (existingProfileError) return respond({ error: 'تعذر التحقق من البريد في ملفات المستخدمين.' }, 400);
    if (existingProfile) return respond({ error: 'هذا البريد مسجل بالفعل في النظام. اختر حسابه من قائمة المستخدمين لتغيير دوره أو كلمة مروره.' }, 409);

    let authUser: { id: string } | null = null;
    let createdAuthUser = false;
    for (let page = 1; page <= 100; page += 1) {
      const { data: authUsers, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (listError) return respond({ error: `تعذر التحقق من حساب الدخول: ${listError.message}` }, 400);
      const match = authUsers.users.find((user) => user.email?.toLowerCase() === email);
      if (match) { authUser = { id: match.id }; break; }
      if (authUsers.users.length < 1000) break;
    }

    if (authUser) {
      const { error } = await admin.auth.admin.updateUserById(authUser.id, {
        password,
        email_confirm: true,
        user_metadata: { username, display_name: displayName },
      });
      if (error) return respond({ error: `هذا البريد له حساب دخول موجود، لكن تعذر تهيئته: ${error.message}` }, 400);
    } else {
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username, display_name: displayName },
      });
      if (error || !created.user) return respond({ error: `تعذر إنشاء حساب الدخول: ${error?.message || 'لم تُرجع الخدمة حسابًا جديدًا.'}` }, 400);
      authUser = { id: created.user.id };
      createdAuthUser = true;
    }

    const { error: profileError } = await admin.from('app_user_profiles').upsert({
      user_id: authUser.id, email, username, display_name: displayName, role,
      permissions, is_active: true,
    });
    if (profileError) {
      if (createdAuthUser) await admin.auth.admin.deleteUser(authUser.id);
      return respond({ error: `تم تجهيز بيانات الدخول، لكن تعذر حفظ ملف المستخدم: ${profileError.message}` }, 400);
    }
    return respond({ success: true, invite_sent: false });
  }

  if (!targetId) return respond({ error: 'معرّف المستخدم مطلوب.' }, 400);
  const { data: target, error: targetError } = await admin.from('app_user_profiles')
    .select('user_id, role, is_active').eq('user_id', targetId).maybeSingle();
  if (targetError || !target) return respond({ error: 'الحساب المطلوب غير موجود.' }, 404);

  if (action === 'update_permissions') {
    if (!body.permissions || typeof body.permissions !== 'object') return respond({ error: 'الصلاحيات غير صالحة.' }, 400);
    const { error } = await admin.from('app_user_profiles').update({ permissions: body.permissions }).eq('user_id', targetId);
    if (error) return respond({ error: 'تعذر حفظ الصلاحيات.' }, 400);
  } else if (action === 'update_role') {
    const role = String(body.role || '');
    if (!['admin', 'accountant', 'data_entry'].includes(role)) return respond({ error: 'نوع الحساب غير صالح.' }, 400);
    if (target.role === 'admin' && role !== 'admin' && target.is_active) {
      if (targetId === callerData.user.id) return respond({ error: 'لا يمكن تغيير دور حسابك الحالي. عيّن مديرًا آخر أولًا ثم ادخل بحسابه.' }, 409);
      const { count, error: countError } = await admin.from('app_user_profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin').eq('is_active', true);
      if (countError) return respond({ error: 'تعذر التأكد من وجود مدير بديل؛ لم يتغير الدور.' }, 400);
      if ((count || 0) <= 1) return respond({ error: 'لا يمكن تغيير دور آخر مدير نشط.' }, 409);
    }
    const { error } = await admin.from('app_user_profiles').update({ role }).eq('user_id', targetId);
    if (error) return respond({ error: 'تعذر تحديث دور المستخدم.' }, 400);
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
