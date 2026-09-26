import { createContext, useCallback, useContext, useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff } from './icons';

// ------------------------------------------------------------------ top bar

export function TopBar({ title, back, right, left, leftTitle }: { title: ReactNode; back?: boolean | string; right?: ReactNode; left?: ReactNode; leftTitle?: boolean }) {
  const navigate = useNavigate();
  return (
    <header className={`topbar${leftTitle ? ' left-title' : ''}`}>
      <div>
        {left ??
          (back ? (
            <button className="icon-btn" aria-label="Back" onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}>
              <ArrowLeft />
            </button>
          ) : null)}
      </div>
      <h1>{title}</h1>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{right}</div>
    </header>
  );
}

// ------------------------------------------------------------------ fields

export function Field({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: ReactNode; error?: boolean; children: ReactNode }) {
  return (
    <div className={`field${error ? ' error' : ''}`}>
      <label>
        {label}
        {required ? '*' : ''}
      </label>
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="control" {...props} />;
}

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input className="control" type={show ? 'text' : 'password'} style={{ paddingRight: 48 }} {...props} />
      <span className="suffix">
        <button type="button" className="icon-btn" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((s) => !s)} style={{ color: '#9a9aa3' }}>
          {show ? <Eye size={20} /> : <EyeOff size={20} />}
        </button>
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ OTP + keypad

export function OtpBoxes({ value, length = 6, error, showCursor = true }: { value: string; length?: number; error?: boolean; showCursor?: boolean }) {
  return (
    <div className="otp" aria-label={`Code, ${value.length} of ${length} digits`}>
      {Array.from({ length }, (_, i) => (
        <div key={i} className={`box${showCursor && i === value.length ? ' active' : ''}${error ? ' error' : ''}`}>
          {value[i] ?? (showCursor && i === value.length ? '|' : '')}
        </div>
      ))}
    </div>
  );
}

/** Digits only; from pasted text like "Valid 5 min: 123456" take the run of exactly `length` digits. */
export function cleanCode(raw: string, length: number): string {
  if (raw.length > length) {
    // Separate digit groups: "Valid for 5 min: 123456" -> ["5", "123456"]; take the one of the right size.
    const exact = (raw.match(/\d+/g) ?? []).find((g) => g.length === length);
    if (exact) return exact;
  }
  return raw.replace(/\D/g, '').slice(0, length);
}

/**
 * The code boxes from the design, backed by one real input: tapping them opens
 * the phone's own numeric keyboard, a copied code can be pasted, and iOS /
 * Android can offer the code straight from the SMS ("one-time-code").
 */
export function OtpInput({ value, onChange, length = 6, error, autoFocus = true }: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  error?: boolean;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <div style={{ position: 'relative' }} onClick={() => ref.current?.focus()}>
      <OtpBoxes value={value} length={length} error={error} showCursor={focused} />
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(cleanCode(e.target.value, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        // No maxLength: a pasted "Your code is 123456" must reach onChange whole,
        // which keeps only the digits (the browser would cut it to 6 characters first).
        aria-label={`Enter the ${length}-digit code`}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, border: 'none',
          // 16px stops iOS zooming into the field; the text itself is invisible.
          fontSize: 16, color: 'transparent', caretColor: 'transparent', background: 'transparent',
        }}
      />
    </div>
  );
}

// ------------------------------------------------------------------ overlays

export function Modal({ open, onClose, children, sheet }: { open: boolean; onClose: () => void; children: ReactNode; sheet?: boolean }) {
  if (!open) return null;
  return (
    <div className={`overlay${sheet ? ' sheet-overlay' : ''}`} onClick={onClose} role="dialog" aria-modal>
      <div className={sheet ? 'sheet' : 'modal'} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />;
}

export function Logo({ size = 44 }: { size?: number }) {
  return (
    <div className="logo-row">
      <img src="/svv-balaji.png" alt="" style={{ width: size, height: size }} />
      <b>
        SVV <span>Rider</span>
      </b>
    </div>
  );
}

// ------------------------------------------------------------------ toast

type ToastKind = 'info' | 'error' | 'success';
const ToastCtx = createContext<(text: string, kind?: ToastKind) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ text: string; kind: ToastKind; id: number } | null>(null);
  const show = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = Date.now();
    setToast({ text, kind, id });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast ? <div className={`toast ${toast.kind}`} role="status">{toast.text}</div> : null}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ------------------------------------------------------------------ money / time

export const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const time = (d: string | null | undefined) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—');
export const date = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
