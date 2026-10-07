import { Link } from 'react-router-dom';
import { legalPath, type LegalAudience } from '../api/legal';

/**
 * "By continuing, you agree to Desi Tokri's Conditions of Use and Privacy
 * Notice." - under every sign-in / registration form. The two links open the
 * current version Super Admin published for this audience.
 */
export function LegalConsent({ audience, style }: { audience: LegalAudience; style?: React.CSSProperties }) {
  const link = { color: '#15803d', fontWeight: 600, textDecoration: 'underline' } as const;
  return (
    <p style={{ fontSize: 12, color: '#64748b', textAlign: 'center', lineHeight: 1.6, margin: '20px 0 0', ...style }}>
      By continuing, you agree to Desi Tokri&apos;s{' '}
      <Link to={legalPath(audience, 'TERMS_AND_CONDITIONS')} style={link} target="_blank" rel="noopener">Conditions of Use</Link>
      {' '}and{' '}
      <Link to={legalPath(audience, 'PRIVACY_POLICY')} style={link} target="_blank" rel="noopener">Privacy Notice</Link>.
    </p>
  );
}
