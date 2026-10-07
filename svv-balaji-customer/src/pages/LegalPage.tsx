import { ArrowLeftOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Segmented, Skeleton, Typography } from 'antd';
import type { ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { DOC_LABEL, DOC_SLUG, legalApi, legalPath, type LegalAudience, type LegalDoc } from '../api/legal';

const AUDIENCES: Record<string, LegalAudience> = { customer: 'CUSTOMER', retailer: 'RETAILER' };
const DOCS = Object.fromEntries(Object.entries(DOC_SLUG).map(([k, v]) => [v, k as LegalDoc])) as Record<string, LegalDoc>;

/**
 * /legal/:audience/:doc - e.g. /legal/customer/conditions-of-use,
 * /legal/retailer/privacy-notice. Content is whatever Super Admin last
 * published under Terms & Privacy Policies.
 */
export function LegalPage() {
  const navigate = useNavigate();
  const params = useParams<{ audience: string; doc: string }>();
  const audience = AUDIENCES[params.audience ?? ''];
  const doc = DOCS[params.doc ?? ''];
  const q = useQuery({ queryKey: ['legal', audience, doc], queryFn: () => legalApi.get(audience, doc), enabled: !!audience && !!doc });
  if (!audience || !doc) return <Navigate to={legalPath('CUSTOMER', 'TERMS_AND_CONDITIONS')} replace />;

  return (
    <div style={{ background: '#fafaf9', minHeight: '100vh', paddingBottom: 40 }}>
      <header style={{ background: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #e7e5e4', position: 'sticky', top: 0, zIndex: 100 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} aria-label="Back" />
        <Typography.Title level={5} style={{ margin: 0 }}>{DOC_LABEL[doc]}</Typography.Title>
      </header>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: 16 }}>
        <Segmented
          block
          style={{ marginBottom: 16 }}
          value={doc}
          onChange={(v) => navigate(legalPath(audience, v as LegalDoc), { replace: true })}
          options={(Object.keys(DOC_LABEL) as LegalDoc[]).map((d) => ({ value: d, label: DOC_LABEL[d] }))}
        />
        <div style={{ background: '#fff', border: '1px solid #e7e5e4', borderRadius: 14, padding: '20px 22px' }}>
          {q.isLoading ? (
            <Skeleton active paragraph={{ rows: 10 }} />
          ) : q.error || !q.data ? (
            <Alert type="error" showIcon message="Could not load this page. Please try again shortly." />
          ) : (
            <>
              <Typography.Title level={3} style={{ marginTop: 0 }}>{q.data.title}</Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Version {q.data.version}
                {q.data.updatedAt ? ` · Last updated ${new Date(q.data.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
                {audience === 'RETAILER' ? ' · For retailers & business partners' : ''}
              </Typography.Text>
              <div style={{ marginTop: 16 }}><LegalText content={q.data.content} /></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Renders the small markdown subset the admin editor produces: #/##/### headings, - lists, **bold**. Text only, never HTML. */
export function LegalText({ content }: { content: string }) {
  const bold = (text: string) =>
    text.split(/(\*\*.*?\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={`ul-${out.length}`} style={{ paddingLeft: 20, margin: '6px 0 14px' }}>{list}</ul>);
    list = [];
  };
  content.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return flush();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const size = [20, 17, 15][h[1].length - 1];
      out.push(<div key={i} role="heading" aria-level={h[1].length + 1} style={{ fontSize: size, fontWeight: 700, margin: '18px 0 8px', color: '#1c1917' }}>{bold(h[2])}</div>);
    } else if (/^[-*]\s+/.test(line)) {
      list.push(<li key={i} style={{ margin: '4px 0', lineHeight: 1.6, color: '#44403c' }}>{bold(line.replace(/^[-*]\s+/, ''))}</li>);
    } else {
      flush();
      out.push(<p key={i} style={{ margin: '0 0 12px', lineHeight: 1.7, color: '#44403c' }}>{bold(line)}</p>);
    }
  });
  flush();
  return <>{out}</>;
}
