import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Spinner, TopBar } from '../ui/kit';

interface PolicyData {
  title: string;
  version: string;
  content: string;
  updatedAt?: string;
}

export function FormattedLegalText({ content }: { content: string }) {
  if (!content) return null;

  const formatText = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: React.ReactNode[] = [];

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} style={{ paddingLeft: 20, margin: '8px 0 16px' }}>
          {currentList}
        </ul>,
      );
      currentList = [];
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }

    if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(
        <h2 key={index} style={{ fontSize: 19, fontWeight: 700, margin: '20px 0 10px', color: 'var(--ink)' }}>
          {formatText(trimmed.replace(/^#\s+/, ''))}
        </h2>,
      );
    } else if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(
        <h3 key={index} style={{ fontSize: 17, fontWeight: 700, margin: '18px 0 8px', color: 'var(--ink)' }}>
          {formatText(trimmed.replace(/^##\s+/, ''))}
        </h3>,
      );
    } else if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(
        <h4 key={index} style={{ fontSize: 15, fontWeight: 600, margin: '14px 0 6px', color: 'var(--ink)' }}>
          {formatText(trimmed.replace(/^###\s+/, ''))}
        </h4>,
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      currentList.push(
        <li key={index} style={{ margin: '4px 0', lineHeight: 1.5, color: 'var(--text)' }}>
          {formatText(trimmed.replace(/^[-*]\s+/, ''))}
        </li>,
      );
    } else {
      flushList();
      elements.push(
        <p key={index} style={{ margin: '0 0 12px', lineHeight: 1.6, color: 'var(--text)' }}>
          {formatText(trimmed)}
        </p>,
      );
    }
  });

  flushList();

  return <div>{elements}</div>;
}

export function PrivacyPolicyPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PolicyData | null>(null);

  useEffect(() => {
    let unmounted = false;
    api
      .get<PolicyData>('/public/legal-policies/RIDER/PRIVACY_POLICY')
      .then((r) => {
        if (!unmounted) setData(r.data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!unmounted) setLoading(false);
      });
    return () => {
      unmounted = true;
    };
  }, []);

  return (
    <div className="app">
      <TopBar title="Privacy Policy" back />
      <div className="page" style={{ paddingTop: 18, paddingBottom: 30 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Spinner />
          </div>
        ) : (
          <div className="card" style={{ padding: '20px 16px' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px', color: 'var(--ink)' }}>
              {data?.title || 'SVV Balaji Delivery Partner Privacy Policy'}
            </h1>
            {data?.version ? (
              <div className="muted" style={{ fontSize: 12, marginBottom: 16 }}>
                Version {data.version}
                {data.updatedAt ? ` · Updated ${new Date(data.updatedAt).toLocaleDateString()}` : ''}
              </div>
            ) : null}
            <FormattedLegalText content={data?.content || ''} />
          </div>
        )}
      </div>
    </div>
  );
}

export function TermsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PolicyData | null>(null);

  useEffect(() => {
    let unmounted = false;
    api
      .get<PolicyData>('/public/legal-policies/RIDER/TERMS_AND_CONDITIONS')
      .then((r) => {
        if (!unmounted) setData(r.data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!unmounted) setLoading(false);
      });
    return () => {
      unmounted = true;
    };
  }, []);

  return (
    <div className="app">
      <TopBar title="Terms & Conditions" back />
      <div className="page" style={{ paddingTop: 18, paddingBottom: 30 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Spinner />
          </div>
        ) : (
          <div className="card" style={{ padding: '20px 16px' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px', color: 'var(--ink)' }}>
              {data?.title || 'SVV Balaji Delivery Partner Terms & Conditions'}
            </h1>
            {data?.version ? (
              <div className="muted" style={{ fontSize: 12, marginBottom: 16 }}>
                Version {data.version}
                {data.updatedAt ? ` · Updated ${new Date(data.updatedAt).toLocaleDateString()}` : ''}
              </div>
            ) : null}
            <FormattedLegalText content={data?.content || ''} />
          </div>
        )}
      </div>
    </div>
  );
}
