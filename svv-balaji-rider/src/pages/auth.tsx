import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { errorCode, errorMessage } from '../api/client';
import { riderApi, type VehicleType } from '../api/rider';
import { useAuth } from '../auth/AuthContext';
import { EarnArt, HandoverArt, RouteArt, SuccessArt } from '../ui/illustrations';
import { Field, Logo, OtpInput, PasswordInput, TextInput, TopBar, useToast } from '../ui/kit';

const SEEN_KEY = 'svv.rider.onboarded';

// ---------------------------------------------------------------- onboarding

const SLIDES = [
  { art: <RouteArt />, title: 'Deliver in minutes', text: 'Quick orders from your nearby store to customers close by. Accept a request, pick it up, and go.' },
  { art: <HandoverArt />, title: 'Cash on delivery', text: 'See exactly how much to collect before you knock. Confirm it in the app and hand the store your cash at the end of the day.' },
  { art: <EarnArt />, title: 'Track what you earn', text: 'Every delivery, bonus and incentive shows up in your earnings as soon as it is done.' },
];

export function Onboarding() {
  const [i, setI] = useState(0);
  const navigate = useNavigate();
  const done = () => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* ignore */
    }
    navigate('/login', { replace: true });
  };
  const s = SLIDES[i];
  return (
    <div className="plain" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', padding: 'calc(24px + env(safe-area-inset-top)) 22px calc(24px + env(safe-area-inset-bottom))' }}>
      <div style={{ textAlign: 'right' }}>
        <button className="link dark" onClick={done} style={{ color: 'var(--muted)' }}>Skip</button>
      </div>
      <div className="hero" style={{ flex: 1 }}>{s.art}</div>
      <h2 className="auth-title" style={{ fontSize: 24 }}>{s.title}</h2>
      <p className="auth-sub" style={{ lineHeight: 1.6, padding: '0 6px' }}>{s.text}</p>
      <div className="dots">{SLIDES.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
      <button className="btn primary block" onClick={() => (i < SLIDES.length - 1 ? setI(i + 1) : done())}>
        {i < SLIDES.length - 1 ? 'Next' : 'Get Started'}
      </button>
    </div>
  );
}

export function hasOnboarded() {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------- sign in

export function SignIn() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanId = identifier.trim();
    if (!cleanId) {
      const msg = 'Please enter your Mobile Number or Email';
      setError(msg);
      toast(msg, 'error');
      return;
    }
    if (!password) {
      const msg = 'Please enter your Password';
      setError(msg);
      toast(msg, 'error');
      return;
    }
    setBusy(true);
    try {
      signIn(await riderApi.login(cleanId, password));
      toast('Signed in successfully', 'success');
      navigate('/', { replace: true });
    } catch (err) {
      if (errorCode(err) === 'PHONE_NOT_VERIFIED') {
        const phone = (err as { response?: { data?: { phone?: string } } }).response?.data?.phone ?? cleanId;
        await riderApi.resend(phone).catch(() => undefined);
        navigate('/verify', { state: { phone, purpose: 'signup' } });
        return;
      }
      const msg = errorMessage(err);
      setError(msg);
      toast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="plain">
      <TopBar title="Sign In" back={hasOnboarded() ? undefined : '/welcome'} />
      <form className="page" onSubmit={submit} style={{ paddingTop: 22 }}>
        <Logo />
        <h2 className="auth-title">Welcome Back!</h2>
        <p className="auth-sub">Sign in to your account</p>

        <Field label="Mobile Number or Email" required>
          <TextInput
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="98765 43210"
            autoComplete="username"
            inputMode="email"
            maxLength={120}
          />
        </Field>
        <Field label="Password" required>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            maxLength={72}
          />
        </Field>
        <div style={{ textAlign: 'right', marginTop: 10 }}>
          <Link to="/forgot" className="link dark" style={{ fontSize: 13, color: 'var(--muted)' }}>Forgot Password?</Link>
        </div>
        {error ? <div className="form-error">{error}</div> : null}
        <button className="btn primary block" style={{ marginTop: 22 }} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
        <p className="muted" style={{ textAlign: 'center', fontSize: 14, marginTop: 20 }}>
          I don't have an account? <Link to="/signup" className="link">Sign up</Link>
        </p>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- sign up

const VEHICLES: Array<{ value: VehicleType; label: string }> = [
  { value: 'MOTORCYCLE', label: 'Motorcycle' },
  { value: 'SCOOTER', label: 'Scooter' },
  { value: 'EV_SCOOTER', label: 'Electric scooter' },
  { value: 'BICYCLE', label: 'Bicycle' },
  { value: 'OTHER', label: 'Other' },
];

export function SignUp() {
  const navigate = useNavigate();
  const toast = useToast();
  const [f, setF] = useState({ fullName: '', phone: '', email: '', city: '', vehicleType: 'MOTORCYCLE' as VehicleType, vehicleNumber: '', maxCarryKg: '', password: '' });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow letters, spaces, dots, hyphens, and apostrophes (max 80 chars)
    const val = e.target.value.replace(/[^a-zA-Z\s.'-]/g, '').slice(0, 80);
    setF((x) => ({ ...x, fullName: val }));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow digits up to 10 characters
    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
    setF((x) => ({ ...x, phone: val }));
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setF((x) => ({ ...x, email: e.target.value.slice(0, 120) }));
  };

  const handleCityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^a-zA-Z\s.'-]/g, '').slice(0, 60);
    setF((x) => ({ ...x, city: val }));
  };

  const handleVehicleNumChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9\s-]/g, '').slice(0, 15);
    setF((x) => ({ ...x, vehicleNumber: val }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setF((x) => ({ ...x, password: e.target.value.slice(0, 72) }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = f.fullName.trim();
    if (!cleanName) {
      const msg = 'Please enter your Full Name';
      setError(msg);
      toast(msg, 'error');
      return;
    }
    if (cleanName.length < 2 || !/^[a-zA-Z\s.'-]+$/.test(cleanName)) {
      const msg = 'Full Name should contain only letters (at least 2 characters)';
      setError(msg);
      toast(msg, 'error');
      return;
    }

    const cleanPhone = f.phone.trim();
    if (!cleanPhone) {
      const msg = 'Please enter your Mobile Number';
      setError(msg);
      toast(msg, 'error');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      const msg = 'Please enter a valid 10-digit Indian mobile number starting with 6-9';
      setError(msg);
      toast(msg, 'error');
      return;
    }

    const cleanEmail = f.email.trim();
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      const msg = 'Please enter a valid email address';
      setError(msg);
      toast(msg, 'error');
      return;
    }

    const cleanCity = f.city.trim();
    if (cleanCity && (cleanCity.length < 2 || !/^[a-zA-Z\s.'-]+$/.test(cleanCity))) {
      const msg = 'Please enter a valid city name (alphabets only)';
      setError(msg);
      toast(msg, 'error');
      return;
    }

    const cleanVehNum = f.vehicleNumber.trim();
    if (cleanVehNum && !/^[A-Z0-9\s-]{5,15}$/.test(cleanVehNum)) {
      const msg = 'Please enter a valid vehicle number (e.g. MP04 AB 1234)';
      setError(msg);
      toast(msg, 'error');
      return;
    }

    const carryKg = Number(f.maxCarryKg);
    if (!f.maxCarryKg.trim() || !Number.isFinite(carryKg) || carryKg < 1 || carryKg > 500) {
      const msg = 'Enter how many kg you can carry at once (1 to 500)';
      setError(msg);
      toast(msg, 'error');
      return;
    }

    if (!f.password) {
      const msg = 'Please enter a password';
      setError(msg);
      toast(msg, 'error');
      return;
    }
    if (f.password.length < 8) {
      const msg = 'Password must be at least 8 characters long';
      setError(msg);
      toast(msg, 'error');
      return;
    }

    if (!agree) {
      const msg = 'Please accept the SVV Balaji delivery partner terms to sign up';
      setError(msg);
      toast(msg, 'error');
      return;
    }

    setBusy(true);
    try {
      const r = await riderApi.signup({
        fullName: cleanName,
        phone: cleanPhone,
        email: cleanEmail || undefined,
        password: f.password,
        city: cleanCity || undefined,
        vehicleType: f.vehicleType,
        vehicleNumber: cleanVehNum || undefined,
        maxCarryKg: carryKg,
      });
      toast('Verification code sent to your mobile number', 'success');
      navigate('/verify', { state: { phone: cleanPhone, purpose: 'signup', devCode: r.devCode } });
    } catch (err) {
      const msg = errorMessage(err);
      setError(msg);
      toast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="plain">
      <form className="page" onSubmit={submit} style={{ paddingTop: 'calc(24px + env(safe-area-inset-top))' }} noValidate>
        <Logo />
        <h2 className="auth-title">Create An Account</h2>
        <p className="auth-sub">Sign up as a delivery partner</p>

        <Field label="Full Name" required>
          <TextInput
            value={f.fullName}
            onChange={handleNameChange}
            placeholder="As on your driving licence"
            autoComplete="name"
            maxLength={80}
          />
        </Field>
        <Field label="Mobile Number" required>
          <TextInput
            value={f.phone}
            onChange={handlePhoneChange}
            placeholder="98765 43210"
            inputMode="tel"
            autoComplete="tel"
            maxLength={10}
          />
        </Field>
        <Field label="Email Address">
          <TextInput
            value={f.email}
            onChange={handleEmailChange}
            placeholder="you@example.com"
            type="email"
            autoComplete="email"
            maxLength={120}
          />
        </Field>
        <Field label="City">
          <TextInput
            value={f.city}
            onChange={handleCityChange}
            placeholder="Where you will deliver"
            maxLength={60}
          />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Vehicle" required>
            <select className="control" value={f.vehicleType} onChange={(e) => setF((x) => ({ ...x, vehicleType: e.target.value as VehicleType }))}>
              {VEHICLES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Vehicle No.">
            <TextInput
              value={f.vehicleNumber}
              onChange={handleVehicleNumChange}
              placeholder="MP04 AB 1234"
              maxLength={15}
              style={{ textTransform: 'uppercase' }}
            />
          </Field>
        </div>
        <Field label="How much can you carry? (kg)" required hint="You will only be offered orders you can carry with what you already have">
          <TextInput
            value={f.maxCarryKg}
            onChange={(e) => setF((x) => ({ ...x, maxCarryKg: e.target.value.replace(/[^\d.]/g, '').slice(0, 5) }))}
            placeholder="e.g. 20"
            inputMode="decimal"
          />
        </Field>
        <Field label="Password" required hint="We'll send a verification code to your mobile number">
          <PasswordInput
            value={f.password}
            onChange={handlePasswordChange}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            maxLength={72}
          />
        </Field>

        <label className="check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>
            I've read and understood the SVV Balaji{' '}
            <Link to="/terms-and-conditions" onClick={(e) => e.stopPropagation()} style={{ color: 'var(--orange)', textDecoration: 'underline' }}>
              delivery partner terms
            </Link>
          </span>
        </label>
        {error ? <div className="form-error">{error}</div> : null}
        <button className="btn primary block" style={{ marginTop: 22 }} disabled={busy}>
          {busy ? 'Creating account…' : 'Sign Up'}
        </button>
        <p className="muted" style={{ textAlign: 'center', fontSize: 14, marginTop: 20 }}>
          Already have an account? <Link to="/login" className="link">Sign In here</Link>
        </p>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- verification (sign-up and password reset)

interface VerifyState {
  phone: string;
  purpose: 'signup' | 'reset';
  devCode?: string;
}

const RESEND_SECONDS = 120;

export function Verify() {
  const { state } = useLocation() as { state: VerifyState | null };
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(RESEND_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Mock OTP mode (no SMS vendor yet): the server tells us the code, and we say so on screen.
  const [testCode, setTestCode] = useState<string | undefined>(state?.devCode);

  useEffect(() => {
    const t = setInterval(() => setWait((w) => (w > 0 ? w - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (code.length !== 6 || !state || busy) return;
    if (state.purpose === 'reset') {
      navigate('/reset', { state: { phone: state.phone, code } });
      return;
    }
    setBusy(true);
    riderApi
      .verify(state.phone, code)
      .then((s) => {
        signIn(s);
        navigate('/location', { replace: true });
      })
      .catch((e) => {
        const msg = errorMessage(e);
        setError(msg);
        toast(msg, 'error');
        setCode('');
      })
      .finally(() => setBusy(false));
  }, [code, state, busy, navigate, signIn, toast]);

  if (!state?.phone) return <Navigate to="/login" replace />;

  const resend = async () => {
    try {
      const r = state.purpose === 'reset' ? await riderApi.forgot(state.phone) : await riderApi.resend(state.phone);
      setWait(RESEND_SECONDS);
      setError(null);
      if (r.devCode) setTestCode(r.devCode);
      toast('New code sent', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const mm = String(Math.floor(wait / 60)).padStart(2, '0');
  const ss = String(wait % 60).padStart(2, '0');
  const masked = `(+91) ${state.phone.replace(/\D/g, '').slice(-10).replace(/^(\d{5})(\d{5})$/, '$1 $2')}`;

  return (
    <div className="app">
      <TopBar title="Verification" back />
      <div className="page" style={{ paddingTop: 26 }}>
        <h2 className="auth-title" style={{ marginTop: 0 }}>Enter The Code</h2>
        <p className="auth-sub">Please enter the 6-digit code sent to:</p>
        <p style={{ textAlign: 'center', fontWeight: 600, color: 'var(--ink)', margin: '4px 0 0' }}>{masked}</p>
        <OtpInput value={code} error={Boolean(error)} onChange={(v) => { setError(null); setCode(v); }} />
        {testCode ? (
          <div className="between" style={{ marginTop: 14, background: 'var(--orange-soft)', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: 'var(--orange-dark)' }}>
            <span>Test mode: use <b>{testCode}</b></span>
            <button className="link" onClick={() => { setError(null); setCode(testCode); }}>Fill</button>
          </div>
        ) : null}
        {error ? <p style={{ textAlign: 'center', color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</p> : null}
        <p className="muted" style={{ textAlign: 'center', fontSize: 13, marginTop: 14 }}>
          {wait > 0 ? `You can request OTP after ${mm}:${ss}` : "Didn't get it?"}
        </p>
        <button className="btn primary block" style={{ marginTop: 14 }} disabled={wait > 0 || busy} onClick={resend}>
          Send Via SMS
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- forgot / reset password

export function Forgot() {
  const navigate = useNavigate();
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanPhone = phone.trim();
    if (!cleanPhone) {
      const msg = 'Please enter your Mobile Number';
      setError(msg);
      toast(msg, 'error');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      const msg = 'Please enter a valid 10-digit mobile number starting with 6-9';
      setError(msg);
      toast(msg, 'error');
      return;
    }
    setBusy(true);
    try {
      const r = await riderApi.forgot(cleanPhone);
      toast('Verification code sent to your mobile number', 'success');
      navigate('/verify', { state: { phone: cleanPhone, purpose: 'reset', devCode: r.devCode } });
    } catch (err) {
      const msg = errorMessage(err);
      setError(msg);
      toast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="plain">
      <TopBar title="Forgot Password" back />
      <form className="page" onSubmit={submit} style={{ paddingTop: 26 }} noValidate>
        <p className="auth-sub" style={{ textAlign: 'left' }}>Enter your registered mobile number. We'll send a code to reset your password.</p>
        <Field label="Mobile Number" required>
          <TextInput
            value={phone}
            onChange={handlePhoneChange}
            placeholder="98765 43210"
            inputMode="tel"
            maxLength={10}
          />
        </Field>
        {error ? <div className="form-error">{error}</div> : null}
        <button className="btn primary block" style={{ marginTop: 22 }} disabled={busy}>Send Code</button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- reset password

export function ResetPassword() {
  const { state } = useLocation() as { state: { phone: string; code: string } | null };
  const navigate = useNavigate();
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="plain" style={{ display: 'grid', placeItems: 'center', padding: 20, background: 'var(--bg)' }}>
        <div className="success-card" style={{ width: '100%', maxWidth: 360 }}>
          <SuccessArt />
          <h2 style={{ margin: '6px 0 6px', fontSize: 20, fontWeight: 600, color: 'var(--ink)' }}>Password Reset</h2>
          <p className="muted" style={{ margin: '0 0 24px', fontSize: 14 }}>Your password has been reset successfully</p>
          <button className="btn primary" style={{ minWidth: 150 }} onClick={() => navigate('/login', { replace: true })}>Done</button>
        </div>
      </div>
    );
  }
  if (!state) return <Navigate to="/forgot" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!pw) {
      const msg = 'Please enter a new password';
      setError(msg);
      toast(msg, 'error');
      return;
    }
    if (pw.length < 8) {
      const msg = 'Password must be at least 8 characters long';
      setError(msg);
      toast(msg, 'error');
      return;
    }
    setBusy(true);
    try {
      await riderApi.reset(state.phone, state.code, pw);
      toast('Password reset successfully!', 'success');
      setDone(true);
    } catch (err) {
      const msg = errorMessage(err);
      setError(msg);
      toast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="plain">
      <TopBar title="New Password" back />
      <form className="page" onSubmit={submit} style={{ paddingTop: 26 }} noValidate>
        <Field label="New Password" required>
          <PasswordInput
            value={pw}
            onChange={(e) => setPw(e.target.value.slice(0, 72))}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            maxLength={72}
          />
        </Field>
        {error ? <div className="form-error">{error}</div> : null}
        <button className="btn primary block" style={{ marginTop: 22 }} disabled={busy}>Save Password</button>
      </form>
    </div>
  );
}

