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
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      signIn(await riderApi.login(identifier.trim(), password));
      navigate('/', { replace: true });
    } catch (err) {
      if (errorCode(err) === 'PHONE_NOT_VERIFIED') {
        const phone = (err as { response?: { data?: { phone?: string } } }).response?.data?.phone ?? identifier;
        await riderApi.resend(phone).catch(() => undefined);
        navigate('/verify', { state: { phone, purpose: 'signup' } });
        return;
      }
      setError(errorMessage(err));
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
          <TextInput value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="98765 43210" autoComplete="username" inputMode="email" required />
        </Field>
        <Field label="Password" required>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
        </Field>
        <div style={{ textAlign: 'right', marginTop: 10 }}>
          <Link to="/forgot" className="link dark" style={{ fontSize: 13, color: 'var(--muted)' }}>Forgot Password?</Link>
        </div>
        {error ? <div className="form-error">{error}</div> : null}
        <button className="btn primary block" style={{ marginTop: 22 }} disabled={busy || !identifier || !password}>
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
  const [f, setF] = useState({ fullName: '', phone: '', email: '', city: '', vehicleType: 'MOTORCYCLE' as VehicleType, vehicleNumber: '', password: '' });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (f.password.length < 8) return setError('Use at least 8 characters for the password');
    setBusy(true);
    try {
      const r = await riderApi.signup({
        fullName: f.fullName.trim(), phone: f.phone, email: f.email.trim() || undefined, password: f.password,
        city: f.city.trim() || undefined, vehicleType: f.vehicleType, vehicleNumber: f.vehicleNumber.trim() || undefined,
      });
      navigate('/verify', { state: { phone: f.phone, purpose: 'signup', devCode: r.devCode } });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="plain">
      <form className="page" onSubmit={submit} style={{ paddingTop: 'calc(24px + env(safe-area-inset-top))' }}>
        <Logo />
        <h2 className="auth-title">Create An Account</h2>
        <p className="auth-sub">Sign up as a delivery partner</p>

        <Field label="Full Name" required>
          <TextInput value={f.fullName} onChange={set('fullName')} placeholder="As on your driving licence" autoComplete="name" required />
        </Field>
        <Field label="Mobile Number" required>
          <TextInput value={f.phone} onChange={set('phone')} placeholder="98765 43210" inputMode="tel" autoComplete="tel" required />
        </Field>
        <Field label="Email Address">
          <TextInput value={f.email} onChange={set('email')} placeholder="you@example.com" type="email" autoComplete="email" />
        </Field>
        <Field label="City">
          <TextInput value={f.city} onChange={set('city')} placeholder="Where you will deliver" />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Vehicle" required>
            <select className="control" value={f.vehicleType} onChange={set('vehicleType')}>
              {VEHICLES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Vehicle No.">
            <TextInput value={f.vehicleNumber} onChange={set('vehicleNumber')} placeholder="MP04 AB 1234" style={{ textTransform: 'uppercase' }} />
          </Field>
        </div>
        <Field label="Password" required hint="We'll send a verification code to your mobile number">
          <PasswordInput value={f.password} onChange={set('password')} placeholder="At least 8 characters" autoComplete="new-password" required />
        </Field>

        <label className="check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>I've read and understood the SVV Balaji <span style={{ color: 'var(--orange)' }}>delivery partner terms</span></span>
        </label>
        {error ? <div className="form-error">{error}</div> : null}
        <button className="btn primary block" style={{ marginTop: 22 }} disabled={busy || !agree || !f.fullName || !f.phone || !f.password}>
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
        setError(errorMessage(e));
        setCode('');
      })
      .finally(() => setBusy(false));
  }, [code, state, busy, navigate, signIn]);

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
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await riderApi.forgot(phone);
      navigate('/verify', { state: { phone, purpose: 'reset', devCode: r.devCode } });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="plain">
      <TopBar title="Forgot Password" back />
      <form className="page" onSubmit={submit} style={{ paddingTop: 26 }}>
        <p className="auth-sub" style={{ textAlign: 'left' }}>Enter your registered mobile number. We'll send a code to reset your password.</p>
        <Field label="Mobile Number" required>
          <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" inputMode="tel" required />
        </Field>
        {error ? <div className="form-error">{error}</div> : null}
        <button className="btn primary block" style={{ marginTop: 22 }} disabled={busy || !phone}>Send Code</button>
      </form>
    </div>
  );
}

export function ResetPassword() {
  const { state } = useLocation() as { state: { phone: string; code: string } | null };
  const navigate = useNavigate();
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
    if (pw.length < 8) return setError('Use at least 8 characters');
    setBusy(true);
    try {
      await riderApi.reset(state.phone, state.code, pw);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="plain">
      <TopBar title="New Password" back />
      <form className="page" onSubmit={submit} style={{ paddingTop: 26 }}>
        <Field label="New Password" required>
          <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
        </Field>
        {error ? <div className="form-error">{error}</div> : null}
        <button className="btn primary block" style={{ marginTop: 22 }} disabled={busy}>Save Password</button>
      </form>
    </div>
  );
}
