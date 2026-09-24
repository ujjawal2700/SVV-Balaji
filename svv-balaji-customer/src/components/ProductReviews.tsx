import { CheckCircleFilled, StarFilled } from '@ant-design/icons';
import { Typography } from 'antd';
import { useState } from 'react';
import type { StorefrontProductReview } from '@shared/api/types';

const STAR_COLOUR = (r: number) => (r >= 4 ? '#16a34a' : r >= 3 ? '#f59e0b' : '#dc2626');

/** Small "4.3 ★ (27)" chip for product cards. Renders nothing until someone has rated the product. */
export function RatingBadge({ rating, count, size = 'sm' }: { rating: number | null; count: number | null; size?: 'sm' | 'md' }) {
  if (!rating || !count) return null;
  const fs = size === 'md' ? 12.5 : 11;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span
        style={{
          background: STAR_COLOUR(rating),
          color: '#fff',
          borderRadius: 4,
          padding: size === 'md' ? '2px 7px' : '1px 5px',
          fontSize: fs,
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          lineHeight: 1.4,
        }}
      >
        {rating.toFixed(1)} <StarFilled style={{ fontSize: fs - 2 }} />
      </span>
      <span style={{ fontSize: fs, color: '#64748b' }}>({count.toLocaleString('en-IN')})</span>
    </span>
  );
}

const reviewDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** The product page's "Ratings & Reviews" block - every number is from real customer reviews. */
export function ProductReviews({
  rating,
  count,
  breakdown,
  reviews,
}: {
  rating: number | null;
  count: number;
  breakdown: Record<'1' | '2' | '3' | '4' | '5', number>;
  reviews: StorefrontProductReview[];
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? reviews : reviews.slice(0, 3);
  const written = reviews.filter((r) => r.comment).length;

  return (
    <div id="ratings-reviews" className="pdp-section-card" style={{ background: '#fff', padding: 16, marginTop: 8, scrollMarginTop: 80 }}>
      <Typography.Text strong style={{ fontSize: 16, display: 'block', marginBottom: 12 }}>
        Ratings &amp; Reviews
      </Typography.Text>

      {!count || !rating ? (
        <div style={{ textAlign: 'center', padding: '12px 8px 4px' }}>
          <div style={{ fontSize: 30 }}>⭐</div>
          <Typography.Text strong style={{ display: 'block', marginTop: 4 }}>No ratings yet</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            Bought this? You can rate it from My Orders once it's delivered.
          </Typography.Text>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center', minWidth: 96 }}>
              <div style={{ fontSize: 34, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
                {rating.toFixed(1)} <StarFilled style={{ fontSize: 22, color: STAR_COLOUR(rating) }} />
              </div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {count.toLocaleString('en-IN')} rating{count === 1 ? '' : 's'}
                {written ? ` & ${written} review${written === 1 ? '' : 's'}` : ''}
              </Typography.Text>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              {(['5', '4', '3', '2', '1'] as const).map((star) => {
                const n = breakdown[star] ?? 0;
                const pct = count ? (n / count) * 100 : 0;
                return (
                  <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 4 }}>
                    <span style={{ width: 22, color: '#475569' }}>
                      {star} <StarFilled style={{ fontSize: 9 }} />
                    </span>
                    <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: STAR_COLOUR(Number(star)), borderRadius: 999 }} />
                    </div>
                    <span style={{ width: 28, textAlign: 'right', color: '#64748b' }}>{n}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {visible.length > 0 ? (
            <div style={{ marginTop: 16, borderTop: '1px solid #f1f5f9' }}>
              {visible.map((r) => (
                <div key={r.id} style={{ padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        background: STAR_COLOUR(r.rating),
                        color: '#fff',
                        borderRadius: 4,
                        padding: '1px 6px',
                        fontSize: 11,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      {r.rating} <StarFilled style={{ fontSize: 9 }} />
                    </span>
                    <Typography.Text strong style={{ fontSize: 13 }}>{r.author}</Typography.Text>
                    {r.verifiedPurchase ? (
                      <span style={{ fontSize: 11, color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <CheckCircleFilled /> Verified buyer
                      </span>
                    ) : null}
                  </div>
                  {r.comment ? (
                    <Typography.Paragraph style={{ fontSize: 13, color: '#334155', margin: '6px 0 2px', whiteSpace: 'pre-line' }}>
                      {r.comment}
                    </Typography.Paragraph>
                  ) : (
                    <div style={{ height: 4 }} />
                  )}
                  <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>{reviewDate(r.date)}</Typography.Text>
                </div>
              ))}
              {reviews.length > 3 ? (
                <button
                  onClick={() => setShowAll((v) => !v)}
                  style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, fontSize: 13, padding: '12px 0 0', cursor: 'pointer' }}
                >
                  {showAll ? 'Show less' : `See all ${reviews.length} ratings`}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
