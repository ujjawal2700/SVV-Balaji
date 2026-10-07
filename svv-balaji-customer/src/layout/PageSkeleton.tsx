import { Skeleton } from 'antd';
import { useLocation } from 'react-router-dom';

/**
 * Placeholder shaped like the page that is about to appear, shown while its
 * code chunk loads or the signed-in session is being restored. It holds the
 * page's space (so the footer does not jump up under the header) and avoids a
 * flash of the wrong content - a guest view, consumer prices for a retailer.
 */
export type SkeletonKind = 'account' | 'catalog' | 'detail' | 'home';

export function kindForPath(pathname: string): SkeletonKind {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/product-detail')) return 'detail';
  if (/^\/(products|categories|search)(\/|$)/.test(pathname)) return 'catalog';
  return 'account';
}

const box = { background: '#fff', borderRadius: 14, border: '1px solid #ece9e4', padding: 18 } as const;

function Cards({ n, rows = 2 }: { n: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={box}>
          <Skeleton active avatar={{ shape: 'square', size: 56 }} paragraph={{ rows }} />
        </div>
      ))}
    </>
  );
}

export function ProductTiles({ n }: { n: number }) {
  return (
    <div className="pskel-tiles">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{ ...box, padding: 12 }}>
          <Skeleton.Node active style={{ width: '100%', height: 130, borderRadius: 10 }}>
            <span />
          </Skeleton.Node>
          <Skeleton active title={{ width: '80%' }} paragraph={{ rows: 1, width: '50%' }} style={{ marginTop: 12 }} />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ kind }: { kind?: SkeletonKind }) {
  const { pathname } = useLocation();
  const k = kind ?? kindForPath(pathname);

  return (
    <div className="pskel" aria-busy="true" aria-label="Loading">
      {k === 'account' ? (
        <div className="dk-head desktop-only">
          <div className="store-container">
            <div style={{ width: '100%' }}>
              <Skeleton.Input active size="small" style={{ width: 200, height: 14, marginBottom: 10 }} />
              <Skeleton.Input active style={{ width: 280, height: 26, display: 'block' }} />
            </div>
          </div>
        </div>
      ) : null}

      <div className="store-container">
        {k === 'home' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Skeleton.Node active className="pskel-banner" style={{ width: '100%', borderRadius: 16 }}>
              <span />
            </Skeleton.Node>
            <ProductTiles n={10} />
          </div>
        ) : k === 'catalog' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Skeleton.Input active style={{ width: 260, height: 24 }} />
            <ProductTiles n={10} />
          </div>
        ) : k === 'detail' ? (
          <div className="pskel-detail">
            <Skeleton.Node active style={{ width: '100%', height: 380, borderRadius: 16 }}>
              <span />
            </Skeleton.Node>
            <div style={{ ...box, padding: 24 }}>
              <Skeleton active paragraph={{ rows: 6 }} />
            </div>
          </div>
        ) : (
          <div className="pskel-account">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Cards n={3} />
            </div>
            <div className="pskel-side" style={box}>
              <Skeleton active paragraph={{ rows: 5 }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
