import { randomUUID } from 'crypto';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase, rowOut } from '../db';
import { verifySupabaseToken, loadUser } from '../middleware';
import { capabilitiesFor } from '../permissions';
import { rateLimit, rateLimitFail } from '../rateLimit';
import { ensureMembership } from '../ranks';
import { notifyEmail } from '../email';

function clientKey(req: VercelRequest, suffix = '') {
  const ip = (req.headers['x-forwarded-for'] as string) || (req.headers['x-real-ip'] as string) || (req.socket as any)?.remoteAddress || 'unknown';
  return `auth:${suffix}:${ip}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const slug = Array.isArray(req.query.slug) ? req.query.slug : [req.query.slug || ''];
  const path = slug.join('/');

  if (path === 'me' && req.method === 'GET') {
    return verifySupabaseToken(req, res, async () => {
      await loadUser(req, res, async () => {
        const sb = getSupabase();
        const userRow = (req as any).user;
        const payload: any = { user: rowOut(userRow), capabilities: capabilitiesFor(userRow.role) };

        if (userRow.role === 'driver') {
          const { data: driver } = await sb
            .from('drivers')
            .select('*')
            .eq('user_id', userRow.id)
            .maybeSingle();
          if (driver) {
            payload.driverProfile = rowOut(driver);
            payload.driver = rowOut(driver);
          }
        } else if (userRow.company_id) {
          const { data: company } = await sb
            .from('companies')
            .select('*')
            .eq('id', userRow.company_id)
            .maybeSingle();
          if (company) payload.company = rowOut(company);
        }

        return res.status(200).json({ success: true, data: payload });
      });
    });
  }

  if (path === 'me' && req.method === 'PUT') {
    return verifySupabaseToken(req, res, async () => {
      await loadUser(req, res, async () => {
        const sb = getSupabase();
        const userRow = (req as any).user;
        const { name, phone, profileImage } = req.body || {};
        const patch: any = {};
        if (name) patch.name = name;
        if (phone) patch.phone = phone;
        if (profileImage) patch.profile_image = profileImage;
        const { data, error } = await sb.from('users').update(patch).eq('id', userRow.id).select('*').single();
        if (error) return res.status(500).json({ success: false, message: 'Server error' });
        return res.status(200).json({ success: true, data: { user: rowOut(data) } });
      });
    });
  }

  if (path === 'register' && req.method === 'POST') {
    if (!rateLimit(clientKey(req, 'register'), { windowMs: 300000, max: 10 })) {
      return rateLimitFail(res);
    }
    try {
      const sb = getSupabase();
      const {
        name,
        email,
        phone,
        password,
        role = 'customer',
        distributorCode,
        driverInfo,
        // journey extensions
        location,
        profileData,
        businessName,
        businessCategory,
        businessType,
        businessAddress,
        registrationNumber,
        teamSize,
        howHeard,
        payoutDetails,
        bankDetails,
        vehicleDetails,
        licenseDetails,
        emergencyContact,
        consents,
        marketingOptIn,
        preferences
      } = req.body || {};

      if (!name || !email) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
      }
      if (role === 'owner' && !businessName && !name) {
        // allow but prefer business name; not fatal
      }

      const { data: genSettings } = await sb
        .from('settings')
        .select('value')
        .eq('scope', 'platform')
        .eq('key', 'general')
        .maybeSingle();
      if (genSettings?.value?.allowRegistrations === false && role !== 'platformAdmin') {
        return res.status(403).json({ success: false, message: 'Registrations are currently disabled' });
      }

      // Public signup may not create a platformAdmin once one already exists.
      // The very first platformAdmin is allowed as a bootstrap.
      const PUBLIC_ROLES = ['customer', 'storeOwner', 'driver', 'owner'];
      if (!PUBLIC_ROLES.includes(role)) {
        if (role === 'platformAdmin') {
          const { count } = await sb
            .from('users')
            .select('id', { count: 'exact', head: true })
            .eq('role', 'platformAdmin');
          if ((count || 0) > 0) {
            return res.status(403).json({ success: false, message: 'Registration not allowed for this role' });
          }
        } else {
          return res.status(400).json({ success: false, message: 'Invalid role' });
        }
      }

      const { data: existing } = await sb.from('users').select('id').eq('email', email).maybeSingle();
      if (existing) {
        return res.status(400).json({ success: false, message: 'User already exists' });
      }

      if (!password) {
        return res.status(400).json({ success: false, message: 'Password required' });
      }

      // Validate the optional distributor code before creating the account so we
      // never leave an orphaned auth user behind for an invalid referral.
      let codeRow: any = null;
      if (distributorCode) {
        const normalized = String(distributorCode).toUpperCase();
        const { data } = await sb
          .from('distributor_codes')
          .select('*')
          .eq('code', normalized)
          .maybeSingle();
        if (!data) return res.status(400).json({ success: false, message: 'Invalid distributor code' });
        if (data.is_active === false) return res.status(400).json({ success: false, message: 'That code is no longer active' });
        if (data.expires_at && new Date(data.expires_at) < new Date()) {
          return res.status(400).json({ success: false, message: 'That code has expired' });
        }
        if (data.max_uses != null && Number(data.uses || 0) >= Number(data.max_uses)) {
          return res.status(400).json({ success: false, message: 'That code has reached its usage limit' });
        }
        codeRow = data;
      }

      const { data: created, error: authErr } = await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
        user_metadata: { name }
      });
      if (authErr || !created?.user) {
        const msg = authErr?.message || 'Registration failed';
        return res.status(400).json({ success: false, message: msg });
      }

      const uid = created.user.id;

      let resolvedCompanyId: string | null = null;
      let resolvedTenantId: string | null = null;
      if (role === 'owner' || role === 'storeOwner') {
        // For owners create company; for store owners company may come via code/link later
        if (role === 'owner') {
          const baseName = businessName || name;
          const baseSlug =
            String(baseName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
            `company-${Date.now().toString(36)}`;
          const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
          const companyInsert: any = {
            name: businessName || `${name}'s Company`,
            slug,
            owner_id: uid,
            status: 'active'
          };
          if (businessAddress || location) companyInsert.address = businessAddress || location;
          if (businessCategory || businessType || registrationNumber) {
            companyInsert.settings = {
              businessCategory: businessCategory || null,
              businessType: businessType || null,
              registrationNumber: registrationNumber || null,
              teamSize: teamSize || null,
              howHeard: howHeard || null
            };
          }
          if (phone) companyInsert.contact = { phone };
          const { data: newCompany } = await sb
            .from('companies')
            .insert(companyInsert)
            .select('*')
            .single();
          if (newCompany) {
            resolvedCompanyId = newCompany.id;
            resolvedTenantId = newCompany.tenant_id || null;
          }
        }
      }
      if (!resolvedTenantId) resolvedTenantId = randomUUID();

      const mergedProfile = {
        ...(profileData || {}),
        location: location || profileData?.location || null,
        howHeard: howHeard || profileData?.howHeard || null,
        preferences: preferences || profileData?.preferences || null
      };

      const { data: user, error: userErr } = await sb
        .from('users')
        .insert({
          id: uid,
          name,
          email,
          phone: phone || null,
          role,
          company_id: resolvedCompanyId,
          tenant_id: resolvedTenantId,
          distributor_code: codeRow ? codeRow.code : null,
          verification_status: role === 'platformAdmin' ? 'verified' : 'pending',
          payout_details: payoutDetails || bankDetails || null,
          profile_data: Object.keys(mergedProfile).some(k => mergedProfile[k]) ? mergedProfile : null,
          marketing_opt_in: !!marketingOptIn
        })
        .select('*')
        .single();
      if (userErr) {
        console.error('register user insert error', userErr);
        return res.status(500).json({ success: false, message: 'Server error' });
      }

      try {
        const token = randomUUID();
        const expires = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
        await sb.from('user_email_verifications').insert({ user_id: uid, email, token, expires_at: expires });
        const appUrl = process.env.APP_URL || 'https://netmark.re-el.co.za';
        const link = `${appUrl.replace(/\/$/, '')}/verify.html?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
        await notifyEmail(
          email,
          'Verify your email address',
          `Hi ${name || ''},

Please verify your email address by clicking the link below:
${link}

If you didn't create this account, you can ignore this email.`
        );
      } catch (e) {
        console.error('email verification send error', e);
      }

      if (codeRow) {
        await sb.from('users').update({ distributor_id: codeRow.distributor_id }).eq('id', uid);
        await sb
          .from('distributor_codes')
          .update({ uses: Number(codeRow.uses || 0) + 1 })
          .eq('id', codeRow.id);

        // Store owners unlock companies through links (one per company). A
        // signup code seeds the first link so their catalog is available.
        if (role === 'storeOwner' && codeRow.company_id) {
          const { error: linkErr } = await sb.from('company_links').upsert(
            {
              store_owner_id: uid,
              company_id: codeRow.company_id,
              code_id: codeRow.id,
              code: codeRow.code,
              is_active: true,
              expires_at: codeRow.expires_at || null,
              last_renewed_at: new Date().toISOString()
            },
            { onConflict: 'store_owner_id,company_id' }
          );
          if (linkErr) console.error('register company_link error', linkErr);
        }

        // A signup code that names a company recruits the new member into that
        // company's downline, sponsored by whoever issued the code. Personal
        // codes (no company) only set global attribution above.
        if (codeRow.company_id) {
          try {
            await ensureMembership(sb, {
              companyId: codeRow.company_id,
              userId: uid,
              sponsorId: codeRow.distributor_id || null,
              tenantId: resolvedTenantId
            });
          } catch (memberErr) {
            console.error('register membership error', memberErr);
          }
        }
      }

      if (role === 'driver') {
        const di = driverInfo || vehicleDetails || {};
        const ld = licenseDetails || {};
        const bd = bankDetails || di.bankDetails || null;
        const { error: driverErr } = await sb.from('drivers').insert({
          user_id: uid,
          company_id: null,
          status: 'pending',
          is_available: false,
          vehicle_type: di.vehicleType || vehicleDetails?.type || null,
          vehicle_number: di.vehicleNumber || vehicleDetails?.registration || null,
          vehicle_model: di.vehicleModel || vehicleDetails?.model || null,
          license_number: ld.number || di.licenseNumber || null,
          license_expiry: (ld.expiry || di.licenseExpiry || di.driverExpiry)
            ? new Date(ld.expiry || di.licenseExpiry || di.driverExpiry).toISOString().slice(0, 10)
            : null,
          bank_details: bd
        });
        if (driverErr) console.error('register driver insert error', driverErr);
      }

      return res.status(201).json({ success: true, data: { user: rowOut(user) } });
    } catch (err: any) {
      console.error('register error', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  if (path === 'verify' && req.method === 'POST') {
    try {
      const sb = getSupabase();
      const { token, email } = req.body || {};
      if (!token || !email) return res.status(400).json({ success: false, message: 'Missing token or email' });
      const { data: v } = await sb
        .from('user_email_verifications')
        .select('*')
        .eq('email', email)
        .eq('token', token)
        .is('used_at', null)
        .maybeSingle();
      if (!v) return res.status(400).json({ success: false, message: 'Invalid or expired token' });
      if (v.expires_at && new Date(v.expires_at) < new Date()) return res.status(400).json({ success: false, message: 'Token expired' });
      await sb.from('users').update({ verification_status: 'verified' }).eq('id', v.user_id);
      await sb.from('user_email_verifications').update({ used_at: new Date().toISOString() }).eq('id', v.id);
      // Confirm the address in Supabase Auth too — otherwise signInWithPassword
      // still rejects the account with "Email not confirmed".
      await sb.auth.admin.updateUserById(v.user_id, { email_confirm: true }).catch((e: any) => {
        console.error('verify auth confirm error', e);
      });
      return res.status(200).json({ success: true, message: 'Email verified' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  if (path === 'verify' && req.method === 'GET') {
    try {
      const sb = getSupabase();
      const token = (req.query.token as string) || '';
      const email = (req.query.email as string) || '';
      if (!token || !email) return res.status(400).json({ success: false, message: 'Missing token or email' });
      const { data: v } = await sb
        .from('user_email_verifications')
        .select('*')
        .eq('email', email)
        .eq('token', token)
        .is('used_at', null)
        .maybeSingle();
      if (!v) return res.status(400).json({ success: false, message: 'Invalid or expired token' });
      if (v.expires_at && new Date(v.expires_at) < new Date()) return res.status(400).json({ success: false, message: 'Token expired' });
      await sb.from('users').update({ verification_status: 'verified' }).eq('id', v.user_id);
      await sb.from('user_email_verifications').update({ used_at: new Date().toISOString() }).eq('id', v.id);
      // Confirm the address in Supabase Auth too — otherwise signInWithPassword
      // still rejects the account with "Email not confirmed".
      await sb.auth.admin.updateUserById(v.user_id, { email_confirm: true }).catch((e: any) => {
        console.error('verify auth confirm error', e);
      });
      return res.status(200).json({ success: true, message: 'Email verified' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  // Heals accounts that verified through our custom email flow before this
  // endpoint started confirming the address in Supabase Auth. Safe to call
  // repeatedly — it only acts when our own record already says verified.
  if (path === 'reconfirm' && req.method === 'POST') {
    if (!rateLimit(clientKey(req, 'reconfirm'), { windowMs: 300000, max: 20 })) return rateLimitFail(res);
    try {
      const sb = getSupabase();
      const email = String((req.body || {}).email || '').trim();
      if (!email) return res.status(400).json({ success: false, message: 'Missing email' });
      const { data: u } = await sb
        .from('users')
        .select('id, verification_status')
        .eq('email', email)
        .maybeSingle();
      if (!u) return res.status(404).json({ success: false, message: 'Account not found' });
      if (u.verification_status !== 'verified') {
        return res.status(400).json({ success: false, message: 'This account has not been verified yet' });
      }
      await sb.auth.admin.updateUserById(u.id, { email_confirm: true });
      return res.status(200).json({ success: true, message: 'Email confirmed' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  res.status(404).json({ success: false, message: 'Not found' });
}
