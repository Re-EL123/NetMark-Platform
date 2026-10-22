import { API_BASE_URL } from './config';
import { getReferralCode, clearReferralCode } from './referralStore';
import { wireAddressFields } from './address';

/* Elements ----------------------------------------------------------------- */
const form = document.getElementById('signupForm') as HTMLFormElement;
const errorDiv = document.getElementById('error') as HTMLDivElement;
const steps = Array.from(document.querySelectorAll<HTMLElement>('.step'));
const trail = Array.from(document.querySelectorAll<HTMLElement>('#stepTrail li'));
const progressFill = document.getElementById('progressFill') as HTMLElement;
const backBtn = document.getElementById('backBtn') as HTMLButtonElement;
const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement;
const submitBtn = document.getElementById('submitBtn') as HTMLButtonElement;
const detailsTitle = document.getElementById('detailsTitle') as HTMLElement;
const detailsSub = document.getElementById('detailsSub') as HTMLElement;
const detailsBody = document.getElementById('detailsBody') as HTMLElement;
const reviewBody = document.getElementById('reviewBody') as HTMLElement;
const roleInput = document.getElementById('role') as HTMLInputElement;
const roleCards = document.getElementById('roleCards') as HTMLElement;
const codeGroup = document.getElementById('codeGroup') as HTMLElement;

const LAST = steps.length - 1;
let current = 0;

/* Password visibility ------------------------------------------------------ */
const pwToggle = document.getElementById('pwToggle');
const pwInput = document.getElementById('password') as HTMLInputElement;
pwToggle?.addEventListener('click', () => {
  const show = pwInput.type === 'password';
  pwInput.type = show ? 'text' : 'password';
  pwToggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  pwToggle.innerHTML = show
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
});

/* Password strength -------------------------------------------------------- */
const pwMeter = document.getElementById('pwMeter') as HTMLElement;
const pwHint = document.getElementById('pwHint') as HTMLElement;
pwInput?.addEventListener('input', () => {
  const v = pwInput.value;
  let score = 0;
  if (v.length >= 8) score++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
  if (/\d/.test(v)) score++;
  if (/[^A-Za-z0-9]/.test(v) && v.length >= 10) score++;
  pwMeter.dataset.score = String(score);
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];
  pwHint.textContent = v ? labels[score] : 'Use 8+ characters with a mix of letters, numbers and symbols.';
});

/* Referral prefill --------------------------------------------------------- */
const codeInput = document.getElementById('distributorCode') as HTMLInputElement | null;
const incomingRef = getReferralCode();
if (incomingRef && codeInput) {
  codeInput.value = incomingRef;
  codeGroup.style.display = 'block';
}

/* Role selection ----------------------------------------------------------- */
const PRESELECT_ROLE = new URLSearchParams(window.location.search).get('role') || '';
if (PRESELECT_ROLE && ['customer', 'storeOwner', 'owner', 'driver'].includes(PRESELECT_ROLE)) {
  roleInput.value = PRESELECT_ROLE;
  const card = roleCards.querySelector<HTMLButtonElement>(`.role-card[data-role="${PRESELECT_ROLE}"]`);
  card?.classList.add('selected');
  codeGroup.style.display = ['customer', 'storeOwner'].includes(PRESELECT_ROLE) ? 'block' : 'none';
}

roleCards.querySelectorAll<HTMLButtonElement>('.role-card').forEach((card) => {
  card.addEventListener('click', () => {
    roleCards.querySelectorAll('.role-card').forEach((c) => c.classList.remove('selected'));
    card.classList.add('selected');
    roleInput.value = card.dataset.role || 'customer';
    codeGroup.style.display = ['customer', 'storeOwner'].includes(roleInput.value) ? 'block' : 'none';
    renderDetails();
  });
});

/* Address autocomplete on the location field ------------------------------- */
wireAddressFields(document);

/* Field metadata per role -------------------------------------------------- *
 * Each role gets a tailored set of questions. `key` values are collected into
 * the submit payload grouped by `group` (profileData / business / vehicle /
 * license / payout / driver extra). Optional fields are marked optional.      */
interface FieldDef {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'tel' | 'number' | 'date' | 'select' | 'textarea';
  options?: string[];
  required?: boolean;
  help?: string;
  placeholder?: string;
  group?: 'profile' | 'business' | 'vehicle' | 'license' | 'payout' | 'emergency';
  full?: boolean;
  address?: boolean;
}

const HEARD = ['Google search', 'Social media', 'A friend or family', 'A distributor', 'In a store', 'Other'];

function fieldsForRole(role: string): { title: string; sub: string; fields: FieldDef[] } {
  switch (role) {
    case 'owner':
      return {
        title: 'Tell us about your company',
        sub: 'This sets up your company workspace, catalogue and team.',
        fields: [
          { name: 'businessName', label: 'Company / brand name', required: true, group: 'business', full: true },
          { name: 'businessCategory', label: 'Industry / category', group: 'business', placeholder: 'e.g. Health & wellness, Electronics' },
          { name: 'businessType', label: 'Business type', type: 'select', group: 'business', options: ['Sole proprietor', 'Close corporation (CC)', 'Private company (Pty) Ltd', 'Partnership', 'Other'] },
          { name: 'registrationNumber', label: 'Company registration no.', group: 'business', help: 'Optional — CIPC number if registered.' },
          { name: 'teamSize', label: 'Team size', type: 'select', group: 'business', options: ['Just me', '2–10', '11–50', '51–200', '200+'] },
          { name: 'businessAddress', label: 'Business address', group: 'business', address: true, full: true, help: 'Where you operate from — used for invoicing and logistics.' },
          { name: 'howHeard', label: 'How did you hear about NetMark?', type: 'select', group: 'profile', options: HEARD, full: true },
          { name: '__payout', label: 'Payout banking details', group: 'payout', help: 'So we can pay you commissions. You can update this later.' }
        ]
      };
    case 'storeOwner':
      return {
        title: 'Set up your storefront',
        sub: 'A few details so shoppers know who they are buying from.',
        fields: [
          { name: 'businessName', label: 'Store / business name', required: true, group: 'business', full: true },
          { name: 'businessCategory', label: 'What do you sell?', group: 'business', placeholder: 'e.g. Fashion, Groceries, Beauty' },
          { name: 'businessType', label: 'Are you registered?', type: 'select', group: 'business', options: ['Not registered yet', 'Sole proprietor', 'Private company (Pty) Ltd', 'Other'] },
          { name: 'businessAddress', label: 'Store / pickup address', group: 'business', address: true, full: true, help: 'Where customers collect or you ship from.' },
          { name: 'howHeard', label: 'How did you hear about NetMark?', type: 'select', group: 'profile', options: HEARD, full: true },
          { name: '__payout', label: 'Payout banking details', group: 'payout', help: 'So we can pay your sales. You can update this later.' }
        ]
      };
    case 'driver':
      return {
        title: 'Delivery details',
        sub: 'We use this to verify you and match you with nearby deliveries.',
        fields: [
          { name: 'vehicleType', label: 'Vehicle type', type: 'select', required: true, group: 'vehicle', options: ['Motorcycle', 'Scooter', 'Car', 'Bakkie / LDV', 'Bicycle', 'On foot'] },
          { name: 'vehicleModel', label: 'Make & model', group: 'vehicle', placeholder: 'e.g. Toyota Hilux' },
          { name: 'vehicleNumber', label: 'Registration / plate', group: 'vehicle', placeholder: 'e.g. CA 123-456' },
          { name: 'licenseNumber', label: "Driver's licence no.", group: 'license', required: true },
          { name: 'licenseExpiry', label: 'Licence expiry', type: 'date', group: 'license' },
          { name: 'operatingArea', label: 'Area you operate in', group: 'profile', full: true, placeholder: 'e.g. Cape Town CBD & southern suburbs' },
          { name: 'emergencyName', label: 'Emergency contact name', group: 'emergency' },
          { name: 'emergencyPhone', label: 'Emergency contact phone', type: 'tel', group: 'emergency' },
          { name: '__payout', label: 'Payout banking details', group: 'payout', help: 'Where we pay your delivery earnings.' }
        ]
      };
    default:
      return {
        title: 'Make it yours',
        sub: 'Optional — helps us recommend things you will love.',
        fields: [
          { name: 'interests', label: 'What are you interested in?', group: 'profile', full: true, placeholder: 'e.g. Electronics, home, fashion' },
          { name: 'howHeard', label: 'How did you hear about NetMark?', type: 'select', group: 'profile', options: HEARD, full: true }
        ]
      };
  }
}

function fieldHtml(f: FieldDef): string {
  if (f.name === '__payout') {
    return `
      <div class="subhead">${f.label}</div>
      <div class="field-grid">
        <div class="form-group"><label for="pd_accountHolder">Account holder name</label><input id="pd_accountHolder" data-payout="accountHolder"></div>
        <div class="form-group"><label for="pd_bankName">Bank name</label><input id="pd_bankName" data-payout="bankName" placeholder="e.g. FNB, Standard Bank"></div>
        <div class="form-group"><label for="pd_accountType">Account type</label><select id="pd_accountType" data-payout="accountType"><option value="cheque">Cheque/Current</option><option value="savings">Savings</option><option value="transmission">Transmission</option></select></div>
        <div class="form-group"><label for="pd_accountNumber">Account number</label><input id="pd_accountNumber" data-payout="accountNumber" inputmode="numeric"></div>
        <div class="form-group"><label for="pd_branchCode">Branch / universal code</label><input id="pd_branchCode" data-payout="branchCode" inputmode="numeric"></div>
        <div class="form-group"><label for="pd_reference">Payout reference (optional)</label><input id="pd_reference" data-payout="reference"></div>
      </div>
      ${f.help ? `<p class="hint">${f.help}</p>` : ''}`;
  }

  const attrs = [
    `id="f_${f.name}"`,
    `data-field="${f.name}"`,
    f.group ? `data-group="${f.group}"` : ''
  ].filter(Boolean).join(' ');

  const label = `<label for="f_${f.name}">${f.label}${f.required ? '' : ' <span class="hint" style="font-weight:400">(optional)</span>'}</label>`;
  const help = f.help ? `<p class="hint">${f.help}</p>` : '';

  let control: string;
  if (f.type === 'select') {
    control = `<select ${attrs}>${(f.options || []).map((o) => `<option value="${o}">${o}</option>`).join('')}</select>`;
  } else if (f.type === 'textarea') {
    control = `<textarea ${attrs} rows="2" placeholder="${f.placeholder || ''}"></textarea>`;
  } else {
    control = `<input type="${f.type || 'text'}" ${attrs} ${f.placeholder ? `placeholder="${f.placeholder}"` : ''}>`;
  }
  return `<div class="form-group"${f.full ? ' style="grid-column:1/-1"' : ''}${f.address ? ' data-address' : ''}>${label}${control}${help}</div>`;
}

function renderDetails(): void {
  const meta = fieldsForRole(roleInput.value || 'customer');
  detailsTitle.textContent = meta.title;
  detailsSub.textContent = meta.sub;
  detailsBody.innerHTML = `<div class="field-grid">${meta.fields.map(fieldHtml).join('')}</div>`;
  wireAddressFields(detailsBody);
}

/* Collect form data -------------------------------------------------------- */
function readValue(name: string): string {
  const el = document.querySelector<HTMLInputElement>(`[data-field="${name}"]`);
  return el ? el.value.trim() : '';
}

function collect() {
  const role = roleInput.value || 'customer';
  const profileData: Record<string, unknown> = {};
  const business: Record<string, unknown> = {};
  const vehicle: Record<string, unknown> = {};
  const license: Record<string, unknown> = {};
  const emergency: Record<string, unknown> = {};

  detailsBody.querySelectorAll<HTMLElement>('[data-field]').forEach((el) => {
    const name = el.dataset.field as string;
    const group = el.dataset.group;
    const value = (el as HTMLInputElement).value.trim();
    if (!value) return;
    if (group === 'business') business[name] = value;
    else if (group === 'vehicle') vehicle[name] = value;
    else if (group === 'license') license[name] = value;
    else if (group === 'emergency') emergency[name] = value;
    else profileData[name] = value;
  });

  const payout: Record<string, string> = {};
  detailsBody.querySelectorAll<HTMLInputElement>('[data-payout]').forEach((el) => {
    if (el.value.trim()) payout[el.dataset.payout as string] = el.value.trim();
  });

  return {
    role,
    profileData,
    business,
    vehicle,
    license,
    emergency,
    payout: Object.keys(payout).length ? payout : null
  };
}

/* Validation --------------------------------------------------------------- */
function showError(msg: string) {
  errorDiv.className = 'error';
  errorDiv.textContent = msg;
  errorDiv.style.display = 'block';
  errorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function clearError() { errorDiv.style.display = 'none'; }

function validateStep(step: number): string | null {
  if (step === 0) {
    const name = (document.getElementById('name') as HTMLInputElement).value.trim();
    const email = (document.getElementById('email') as HTMLInputElement).value.trim();
    const phone = (document.getElementById('phone') as HTMLInputElement).value.trim();
    if (!name) return 'Please enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
    if (phone && phone.replace(/\D/g, '').length < 9) return 'Please enter a valid mobile number.';
  }
  if (step === 1) {
    if (!roleInput.value) return 'Please choose how you want to use NetMark.';
  }
  if (step === 2) {
    for (const f of fieldsForRole(roleInput.value).fields) {
      if (f.name.startsWith('__') || !f.required) continue;
      if (!readValue(f.name)) return `Please fill in “${f.label}”.`;
    }
  }
  if (step === 3) {
    const pw = (document.getElementById('password') as HTMLInputElement).value;
    const cpw = (document.getElementById('confirmPassword') as HTMLInputElement).value;
    if (pw.length < 8) return 'Password must be at least 8 characters.';
    if (pw !== cpw) return 'Passwords do not match.';
    if (!(document.getElementById('acceptTerms') as HTMLInputElement).checked) {
      return 'Please accept the Terms and Privacy Policy to continue.';
    }
  }
  return null;
}

/* Navigation --------------------------------------------------------------- */
function go(step: number) {
  current = Math.max(0, Math.min(LAST, step));
  steps.forEach((s, i) => ((s as HTMLElement).hidden = i !== current));
  trail.forEach((li, i) => {
    li.classList.toggle('active', i === current);
    li.classList.toggle('done', i < current);
  });
  progressFill.style.width = `${((current + 1) / steps.length) * 100}%`;
  backBtn.hidden = current === 0;
  nextBtn.hidden = current === LAST;
  submitBtn.hidden = current !== LAST;
  clearError();
  if (current === LAST) renderReview();
  document.getElementById('signupCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* Review ------------------------------------------------------------------- */
function reviewRows(rows: [string, string][], title: string): string {
  const filled = rows.filter(([, v]) => v);
  if (!filled.length) return '';
  return `<div class="review-group"><h4>${title}</h4>${filled
    .map(([k, v]) => `<div class="review-row"><span class="k">${k}</span><span class="v">${escapeHtml(v)}</span></div>`)
    .join('')}</div>`;
}

function renderReview() {
  const d = collect();
  const name = (document.getElementById('name') as HTMLInputElement).value.trim();
  const email = (document.getElementById('email') as HTMLInputElement).value.trim();
  const phone = (document.getElementById('phone') as HTMLInputElement).value.trim();
  const location = (document.getElementById('location') as HTMLInputElement).value.trim();
  const code = codeInput?.value.trim() || '';
  const roleLabel = ({ customer: 'Customer', storeOwner: 'Store Owner', owner: 'Company Owner', driver: 'Driver' } as Record<string, string>)[d.role] || d.role;

  reviewBody.innerHTML =
    reviewRows([
      ['Name', name],
      ['Email', email],
      ['Mobile', phone],
      ['Location', location],
      ['Path', roleLabel],
      ['Referral code', code]
    ], 'Account') +
    reviewRows(Object.entries(d.business).map(([k, v]) => [humanize(k), String(v)]), 'Business') +
    reviewRows(Object.entries(d.vehicle).map(([k, v]) => [humanize(k), String(v)]), 'Vehicle') +
    reviewRows(Object.entries(d.license).map(([k, v]) => [humanize(k), String(v)]), 'Licence') +
    reviewRows(Object.entries(d.emergency).map(([k, v]) => [humanize(k), String(v)]), 'Emergency contact') +
    reviewRows(Object.entries(d.profileData).map(([k, v]) => [humanize(k), String(v)]), 'Preferences') +
    (d.payout ? reviewRows([
      ['Account holder', d.payout.accountHolder],
      ['Bank', d.payout.bankName],
      ['Account', d.payout.accountNumber ? `••••${d.payout.accountNumber.slice(-4)}` : '']
    ], 'Payout details') : '');
}

function humanize(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
}
function escapeHtml(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* Buttons ------------------------------------------------------------------ */
nextBtn.addEventListener('click', () => {
  const err = validateStep(current);
  if (err) return showError(err);
  go(current + 1);
});
backBtn.addEventListener('click', () => go(current - 1));

/* Submit ------------------------------------------------------------------- */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  for (let i = 0; i < LAST; i++) {
    const err = validateStep(i);
    if (err) return go(i), showError(err);
  }

  const d = collect();
  const payload = {
    name: (document.getElementById('name') as HTMLInputElement).value.trim(),
    email: (document.getElementById('email') as HTMLInputElement).value.trim(),
    phone: (document.getElementById('phone') as HTMLInputElement).value.trim(),
    password: (document.getElementById('password') as HTMLInputElement).value,
    role: d.role,
    distributorCode: codeInput?.value.trim() || undefined,
    location: (document.getElementById('location') as HTMLInputElement).value.trim() || undefined,
    profileData: d.profileData,
    businessName: (d.business.businessName as string) || undefined,
    businessCategory: (d.business.businessCategory as string) || undefined,
    businessType: (d.business.businessType as string) || undefined,
    businessAddress: (d.business.businessAddress as string) || undefined,
    registrationNumber: (d.business.registrationNumber as string) || undefined,
    teamSize: (d.business.teamSize as string) || undefined,
    howHeard: (d.profileData.howHeard as string) || undefined,
    payoutDetails: d.payout || undefined,
    vehicleDetails: Object.keys(d.vehicle).length ? d.vehicle : undefined,
    licenseDetails: Object.keys(d.license).length ? d.license : undefined,
    emergencyContact: Object.keys(d.emergency).length ? d.emergency : undefined,
    marketingOptIn: (document.getElementById('marketingOptIn') as HTMLInputElement).checked
  };

  const restore = () => {
    submitBtn.disabled = false;
    submitBtn.classList.remove('btn-loading');
    submitBtn.textContent = 'Create account';
  };
  submitBtn.disabled = true;
  submitBtn.classList.add('btn-loading');
  submitBtn.innerHTML = '<span class="btn-spinner"></span><span>Creating account…</span>';

  try {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Registration failed');

    clearReferralCode();
    errorDiv.className = 'success';
    errorDiv.textContent = "You're in! Check your email to verify your account. Taking you to sign in…";
    errorDiv.style.display = 'block';
    steps.forEach((s) => ((s as HTMLElement).hidden = true));
    setTimeout(() => { window.location.href = `${import.meta.env.BASE_URL}login.html`; }, 2600);
  } catch (err: any) {
    restore();
    showError(err.message || 'Registration failed');
  }
});

/* Init --------------------------------------------------------------------- */
renderDetails();
go(0);
