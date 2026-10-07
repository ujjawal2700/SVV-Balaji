import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CoffeeOutlined,
  DashboardOutlined,
  LinkOutlined,
  SafetyCertificateOutlined,
  ShareAltOutlined,
  ShoppingOutlined,
  TeamOutlined,
  UserAddOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Carousel, Collapse } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { affiliateApi, type AffiliateProgramInfo } from '../api/affiliate';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { formatInr } from '../utils/money';

/**
 * Public Desi Tokri Affiliate Program site.
 * Amazon Associates-inspired banner & editorial layout.
 * Clean, balanced typography with panoramic banner and clear information hierarchy.
 */

const HERO_SLIDES = [
  {
    image: '/images/snacks-basket.jpg',
    tag: 'Traditional Snacks & Namkeen Tokri',
    title: 'Recommend Products. Earn With Every Desi Tokri Products.',
    alt: 'Authentic Desi Tokri woven basket filled with traditional namkeen and snacks',
    position: 'center 60%',
  },
  {
    image: '/images/cat_spices.jpg',
    tag: 'Farm-Pure Spices & Masalas',
    title: 'Recommend Products. Earn With Every Desi Tokri Products.',
    alt: 'Hand-pounded authentic Indian spices and pure masalas',
    position: 'center center',
  },
  {
    image: '/images/premium_atta.jpg',
    tag: 'Stone-Ground Atta & Grains',
    title: 'Recommend Products. Earn With Every Desi Tokri Products.',
    alt: 'Premium stone-ground wheat flour and pantry staples',
    position: 'center center',
  },
];

const CSS = `
.dta {
  background: #fafaf9;
  color: #1c1917;
  min-height: 100dvh;
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.dta * { box-sizing: border-box; }
.dta-wrap { max-width: 1080px; margin: 0 auto; padding: 0 20px; }

/* Sticky slim header */
.dta-top {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid #e7e5e4;
}
.dta-top .dta-wrap {
  display: flex;
  align-items: center;
  gap: 20px;
  height: 56px;
}
.dta-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: #1c1917;
}
.dta-brand img { height: 28px; width: auto; }
.dta-brand-badge {
  font-size: 12px;
  font-weight: 500;
  color: #047857;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  padding: 2px 8px;
  border-radius: 6px;
}
.dta-nav { display: flex; gap: 24px; margin-left: 12px; }
.dta-nav a {
  color: #57534e;
  text-decoration: none;
  font-size: 13.5px;
  font-weight: 500;
  transition: color .15s ease;
}
.dta-nav a:hover { color: #047857; }
.dta-actions { margin-left: auto; display: flex; align-items: center; gap: 10px; }

/* Buttons */
.dta-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  font-weight: 500;
  border-radius: 8px;
  padding: 0 16px;
  height: 36px;
  font-size: 13px;
  text-decoration: none;
  transition: background-color .15s ease, border-color .15s ease, color .15s ease;
  white-space: nowrap;
}
.dta-btn-primary {
  background: #047857;
  color: #ffffff;
}
.dta-btn-primary:hover {
  background: #065f46;
  color: #ffffff;
}
.dta-btn-outline {
  background: #ffffff;
  color: #292524;
  border-color: #d6d3d1;
}
.dta-btn-outline:hover {
  background: #f5f5f4;
  color: #1c1917;
}
.dta-btn-ghost {
  background: transparent;
  color: #57534e;
  padding: 0 8px;
}
.dta-btn-ghost:hover {
  color: #047857;
}
.dta-btn-md {
  height: 40px;
  padding: 0 20px;
  font-size: 13.5px;
}

/* Amazon Associates Style Panoramic Hero Banner */
.dta-banner-section {
  background: #ffffff;
  border-bottom: 1px solid #e7e5e4;
  padding: 20px 0 44px;
}
.dta-banner {
  position: relative;
  width: 100%;
  min-height: 270px;
  border-radius: 12px;
  overflow: hidden;
  background: #171412;
  margin-bottom: 32px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
}
.dta-banner-bg {
  position: absolute;
  top: -10%;
  left: -10%;
  width: 120%;
  height: 120%;
  object-fit: cover;
  object-position: center 55%;
  filter: blur(24px) brightness(0.32);
  transform: scale(1.05);
}
.dta-banner-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(23, 20, 18, 0.88) 0%, rgba(23, 20, 18, 0.65) 55%, rgba(23, 20, 18, 0.35) 100%);
}
.dta-banner-grid {
  position: relative;
  z-index: 2;
  width: 100%;
  display: grid;
  grid-template-columns: 1.35fr 0.65fr;
  align-items: center;
  gap: 28px;
  padding: 24px 36px;
}
.dta-banner-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
}
.dta-banner-title {
  color: #ffffff;
  font-size: clamp(22px, 2.7vw, 30px);
  line-height: 1.25;
  font-weight: 700;
  letter-spacing: -0.01em;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  margin: 0;
}
.dta-banner-btn {
  background: #f7ca00;
  color: #111827;
  border: 1px solid #d97706;
  border-radius: 999px;
  font-weight: 600;
  font-size: 13.5px;
  height: 38px;
  padding: 0 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  transition: background-color .15s ease, transform .1s ease;
  text-decoration: none;
}
.dta-banner-btn:hover {
  background: #f59e0b;
  color: #111827;
  transform: translateY(-1px);
}
.dta-banner-tokri-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
}
.dta-tokri-frame {
  position: relative;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 0 3px rgba(255, 255, 255, 0.15);
  background: #261f1a;
  flex-shrink: 0;
}
.dta-banner-carousel {
  margin-bottom: 32px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}
.dta-banner-carousel .dta-banner {
  margin-bottom: 0;
  border-radius: 0;
  box-shadow: none;
}
.dta-banner-carousel .slick-dots {
  bottom: 12px !important;
}
.dta-banner-carousel .slick-dots li button {
  background: #ffffff !important;
  opacity: 0.35 !important;
  height: 4px !important;
  border-radius: 2px !important;
  transition: opacity .2s, width .2s !important;
}
.dta-banner-carousel .slick-dots li.slick-active button {
  background: #f7ca00 !important;
  opacity: 1 !important;
  width: 22px !important;
}
.dta-banner-tag {
  display: inline-flex;
  align-items: center;
  font-size: 11.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #fef08a;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.22);
  padding: 3px 10px;
  border-radius: 999px;
  backdrop-filter: blur(4px);
}
.dta-tokri-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 60%;
  display: block;
}

/* Amazon-style Intro Block directly below banner */
.dta-intro {
  margin-top: 4px;
}
.dta-intro-title {
  font-size: 22px;
  font-weight: 650;
  color: #1c1917;
  margin: 0 0 12px;
  letter-spacing: -0.01em;
}
.dta-intro-lead {
  font-size: 14px;
  line-height: 1.68;
  color: #44403c;
  max-width: 980px;
  margin: 0 0 22px;
}

/* Clean Feature Highlights Strip */
.dta-highlights {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  background: #fafaf9;
  border: 1px solid #e7e5e4;
  border-radius: 12px;
  padding: 14px 18px;
  max-width: 580px;
}
.dta-hl-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dta-hl-val {
  font-size: 13.5px;
  font-weight: 600;
  color: #1c1917;
}
.dta-hl-desc {
  font-size: 11.5px;
  color: #78716c;
}

/* Sections */
.dta-section {
  padding: 56px 0;
}
.dta-section-alt {
  background: #ffffff;
  border-top: 1px solid #e7e5e4;
  border-bottom: 1px solid #e7e5e4;
}
.dta-sec-header {
  text-align: center;
  max-width: 600px;
  margin: 0 auto 36px;
}
.dta-h2 {
  font-size: 22px;
  font-weight: 600;
  color: #1c1917;
  margin: 0 0 8px;
  letter-spacing: -0.01em;
}
.dta-sub {
  color: #78716c;
  font-size: 13.5px;
  line-height: 1.55;
  margin: 0;
}

/* 3-Step Flow */
.dta-steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.dta-step {
  background: #ffffff;
  border: 1px solid #e7e5e4;
  border-radius: 12px;
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
}
.dta-step-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.dta-step-badge {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #047857;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  padding: 2px 7px;
  border-radius: 4px;
}
.dta-step-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  font-size: 15px;
  background: #f5f5f4;
  color: #44403c;
}
.dta-step h3 {
  font-size: 15px;
  font-weight: 600;
  color: #1c1917;
  margin: 0 0 8px;
}
.dta-step p {
  color: #57534e;
  font-size: 13px;
  line-height: 1.55;
  margin: 0;
}

/* Audience / Who It Is For */
.dta-audiences {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
.dta-aud-card {
  background: #ffffff;
  border: 1px solid #e7e5e4;
  border-radius: 12px;
  padding: 20px 16px;
}
.dta-aud-icon {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: #ecfdf5;
  color: #047857;
  display: grid;
  place-items: center;
  font-size: 16px;
  margin-bottom: 12px;
}
.dta-aud-card h4 {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
  color: #1c1917;
}
.dta-aud-card p {
  margin: 0;
  color: #57534e;
  font-size: 12.5px;
  line-height: 1.5;
}

/* Lifecycle Pipeline */
.dta-pipeline {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.dta-pipe-col {
  background: #ffffff;
  border: 1px solid #e7e5e4;
  border-radius: 10px;
  padding: 16px;
}
.dta-pipe-col h5 {
  margin: 0 0 6px;
  font-size: 13.5px;
  font-weight: 600;
  color: #1c1917;
}
.dta-pipe-col p {
  margin: 0;
  color: #57534e;
  font-size: 12.5px;
  line-height: 1.5;
}

/* Transparency Badges Strip */
.dta-trust-strip {
  display: flex;
  justify-content: center;
  gap: 24px;
  flex-wrap: wrap;
  margin-top: 24px;
  color: #57534e;
  font-size: 13px;
  font-weight: 500;
}
.dta-trust-item {
  display: flex;
  align-items: center;
  gap: 7px;
}
.dta-trust-item .anticon {
  color: #047857;
}

/* FAQ */
.dta-faq-container {
  max-width: 780px;
  margin: 0 auto;
}
.dta-faq .ant-collapse-item {
  background: #ffffff !important;
  border: 1px solid #e7e5e4 !important;
  border-radius: 10px !important;
  margin-bottom: 8px !important;
}
.dta-faq .ant-collapse-header {
  font-weight: 550 !important;
  font-size: 14px !important;
  color: #1c1917 !important;
  padding: 14px 18px !important;
}

/* Bottom CTA Banner */
.dta-bottom-cta {
  background: #064e3b;
  color: #ffffff;
  border-radius: 16px;
  padding: 38px 28px;
  text-align: center;
  max-width: 900px;
  margin: 0 auto;
}
.dta-bottom-cta h2 {
  color: #ffffff;
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 8px;
}
.dta-bottom-cta p {
  color: #a7f3d0;
  margin: 0 auto 20px;
  max-width: 500px;
  font-size: 13.5px;
  line-height: 1.55;
}

/* Footer */
.dta-foot {
  border-top: 1px solid #e7e5e4;
  padding: 22px 0 28px;
  background: #ffffff;
  color: #78716c;
  font-size: 12.5px;
}
.dta-foot .dta-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  align-items: center;
}
.dta-foot a {
  color: #57534e;
  text-decoration: none;
  font-weight: 500;
  transition: color .15s ease;
}
.dta-foot a:hover {
  color: #047857;
}

/* Responsive adjustments */
@media (max-width: 900px) {
  .dta-banner-grid {
    grid-template-columns: 1.2fr 0.8fr;
    padding: 20px 24px;
    gap: 18px;
  }
  .dta-tokri-frame {
    width: 180px;
    height: 180px;
  }
  .dta-steps {
    grid-template-columns: 1fr;
  }
  .dta-audiences, .dta-pipeline {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 640px) {
  .dta-nav { display: none; }
  .dta-banner-grid {
    grid-template-columns: 1fr;
    text-align: center;
    padding: 24px 18px;
  }
  .dta-banner-text {
    align-items: center;
  }
  .dta-banner-title { font-size: 20px; }
  .dta-tokri-frame {
    width: 160px;
    height: 160px;
  }
  .dta-highlights { grid-template-columns: 1fr; }
  .dta-audiences, .dta-pipeline { grid-template-columns: 1fr; }
  .dta-actions .dta-btn-ghost { display: none; }
  .dta-section { padding: 40px 0; }
  .dta-bottom-cta { padding: 28px 18px; }
}

/* App-only elements: never rendered on desktop */
.dta-back, .dta-appbar { display: none; }

/* ============ APP VIEW (phones & small tablets, matches store breakpoint) ============ */
@media (max-width: 767px) {
  .dta { padding-bottom: calc(68px + env(safe-area-inset-bottom)); background: #f5f5f4; }
  .dta-wrap { padding: 0 14px; }
  .dta-section, .dta-banner-section { scroll-margin-top: 60px; }

  /* App bar */
  .dta-top { padding-top: env(safe-area-inset-top); background: #ffffff; }
  .dta-top .dta-wrap { height: 52px; gap: 8px; }
  .dta-nav { display: none; }
  .dta-back {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    margin-left: -6px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: #1c1917;
    font-size: 16px;
    cursor: pointer;
  }
  .dta-back:active { background: #f5f5f4; }
  .dta-brand { gap: 8px; }
  .dta-brand img { height: 24px; }
  .dta-brand-badge { font-size: 11px; padding: 1px 7px; }
  .dta-actions .dta-btn { height: 32px; padding: 0 12px; font-size: 12.5px; border-radius: 999px; }
  .dta-has-appbar .dta-actions { display: none; }

  /* Compact hero carousel */
  .dta-banner-section { padding: 12px 0 18px; }
  .dta-banner-carousel { margin-bottom: 16px; border-radius: 14px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08); }
  .dta-banner { min-height: 0; height: 156px; }
  .dta-banner-bg { filter: blur(18px) brightness(0.36); }
  .dta-banner-overlay {
    background: linear-gradient(90deg, rgba(23, 20, 18, 0.9) 0%, rgba(23, 20, 18, 0.6) 70%, rgba(23, 20, 18, 0.4) 100%);
  }
  .dta-banner-grid {
    grid-template-columns: 1fr auto;
    text-align: left;
    gap: 12px;
    padding: 14px 16px 22px;
  }
  .dta-banner-text { align-items: flex-start; gap: 8px; min-width: 0; }
  .dta-banner-tag {
    font-size: 9.5px;
    padding: 2px 8px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
  }
  .dta-banner-title {
    font-size: 16px;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .dta-banner-btn { height: 30px; padding: 0 16px; font-size: 12px; }
  .dta-tokri-frame {
    width: 96px;
    height: 96px;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45), 0 0 0 2px rgba(255, 255, 255, 0.18);
  }
  .dta-banner-carousel .slick-dots { bottom: 6px !important; }
  .dta-banner-carousel .slick-dots li.slick-active button { width: 16px !important; }

  /* Intro */
  .dta-intro-title { font-size: 17px; line-height: 1.3; margin-bottom: 8px; }
  .dta-intro-lead { font-size: 13px; line-height: 1.6; margin-bottom: 14px; }
  .dta-highlights {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    max-width: none;
    padding: 0;
    background: transparent;
    border: 0;
  }
  .dta-hl-item {
    background: #ffffff;
    border: 1px solid #e7e5e4;
    border-radius: 12px;
    padding: 10px;
    text-align: center;
    justify-content: center;
  }
  .dta-hl-val { font-size: 13px; color: #047857; }
  .dta-hl-desc { font-size: 10.5px; }
  .dta-signin-note { font-size: 12px !important; margin-top: 12px !important; }

  /* Sections as app cards */
  .dta-section { padding: 22px 0; }
  .dta-section-alt { background: transparent; border: 0; }
  .dta-sec-header { text-align: left; margin: 0 0 14px; max-width: none; }
  .dta-h2 { font-size: 17px; margin-bottom: 4px; }
  .dta-sub { font-size: 12.5px; }

  /* Steps: icon list rows */
  .dta-steps { grid-template-columns: 1fr; gap: 10px; }
  .dta-step {
    display: grid;
    grid-template-columns: 40px 1fr;
    column-gap: 12px;
    padding: 14px;
    border-radius: 14px;
  }
  .dta-step-top {
    grid-row: span 2;
    flex-direction: column;
    justify-content: flex-start;
    gap: 6px;
    margin: 0;
  }
  .dta-step-icon { order: -1; width: 40px; height: 40px; border-radius: 12px; background: #ecfdf5; color: #047857; font-size: 17px; }
  .dta-step-badge { font-size: 8px; padding: 1px 3px; letter-spacing: 0; white-space: nowrap; }
  .dta-step h3 { font-size: 14px; margin: 0 0 4px; }
  .dta-step p { font-size: 12.5px; line-height: 1.5; }

  /* Audiences: horizontal swipe rail */
  .dta-audiences {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 72%;
    grid-template-columns: none;
    gap: 10px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    margin: 0 -14px;
    padding: 0 14px 4px;
    scrollbar-width: none;
  }
  .dta-audiences::-webkit-scrollbar { display: none; }
  .dta-aud-card { scroll-snap-align: start; padding: 14px; border-radius: 14px; }
  .dta-aud-icon { width: 32px; height: 32px; font-size: 15px; margin-bottom: 10px; }
  .dta-aud-card h4 { font-size: 13.5px; }
  .dta-aud-card p { font-size: 12px; }

  /* Pipeline: vertical timeline */
  .dta-pipeline {
    grid-template-columns: 1fr;
    gap: 0;
    background: #ffffff;
    border: 1px solid #e7e5e4;
    border-radius: 14px;
    padding: 6px 14px;
  }
  .dta-pipe-col {
    position: relative;
    border: 0;
    border-radius: 0;
    background: transparent;
    padding: 12px 0 12px 22px;
  }
  .dta-pipe-col + .dta-pipe-col { border-top: 1px dashed #e7e5e4; }
  .dta-pipe-col::before {
    content: '';
    position: absolute;
    left: 0;
    top: 16px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #047857;
    box-shadow: 0 0 0 3px #d1fae5;
  }
  .dta-pipe-col h5 { font-size: 13.5px; margin-bottom: 3px; }
  .dta-pipe-col p { font-size: 12px; }

  /* Trust chips */
  .dta-trust-strip { justify-content: flex-start; gap: 8px; margin-top: 12px; font-size: 12px; }
  .dta-trust-item {
    background: #ffffff;
    border: 1px solid #e7e5e4;
    border-radius: 999px;
    padding: 6px 12px;
  }

  /* FAQ */
  .dta-faq .ant-collapse-item { border-radius: 12px !important; }
  .dta-faq .ant-collapse-header { font-size: 13.5px !important; padding: 12px 14px !important; }
  .dta-faq .ant-collapse-content-box { padding: 0 14px 14px !important; }

  /* Bottom CTA */
  .dta-bottom-section { padding: 6px 0 24px !important; }
  .dta-bottom-cta { border-radius: 16px; padding: 22px 18px; text-align: left; }
  .dta-bottom-cta h2 { font-size: 18px; }
  .dta-bottom-cta p { font-size: 12.5px; margin: 0 0 16px; }
  .dta-bottom-cta .dta-btn { width: 100%; height: 42px; border-radius: 12px; }

  /* Footer */
  .dta-foot { padding: 16px 0 20px; font-size: 12px; background: transparent; }
  .dta-foot .dta-wrap { gap: 8px 16px; }
  .dta-foot .dta-copy { margin-left: 0 !important; width: 100%; color: #a8a29e; font-size: 11px; }

  /* Sticky bottom action bar */
  .dta-appbar {
    display: block;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 60;
    background: rgba(255, 255, 255, 0.97);
    backdrop-filter: blur(8px);
    border-top: 1px solid #e7e5e4;
    padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
  }
  .dta-appbar .dta-btn { width: 100%; height: 46px; border-radius: 12px; font-size: 14.5px; font-weight: 600; }
}

/* Large phones / small tablets: more room */
@media (min-width: 480px) and (max-width: 767px) {
  .dta-wrap { padding: 0 20px; }
  .dta-banner { height: 184px; }
  .dta-banner-grid { padding: 18px 24px 24px; gap: 18px; }
  .dta-banner-title { font-size: 19px; }
  .dta-banner-tag { font-size: 10.5px; }
  .dta-banner-btn { height: 34px; font-size: 12.5px; padding: 0 20px; }
  .dta-tokri-frame { width: 128px; height: 128px; }
  .dta-audiences { grid-auto-flow: row; grid-auto-columns: auto; grid-template-columns: repeat(2, 1fr); overflow: visible; margin: 0; padding: 0; }
  .dta-hl-val { font-size: 14px; }
  .dta-hl-desc { font-size: 11.5px; }
  .dta-appbar { padding-left: 20px; padding-right: 20px; }
  .dta-appbar .dta-btn { max-width: 520px; margin: 0 auto; display: flex; }
}

/* Small phones (320–374px) */
@media (max-width: 374px) {
  .dta-wrap { padding: 0 12px; }
  .dta-banner { height: 140px; }
  .dta-banner-grid { padding: 12px 12px 20px; gap: 8px; }
  .dta-banner-title { font-size: 14px; }
  .dta-banner-btn { height: 28px; padding: 0 12px; font-size: 11.5px; }
  .dta-tokri-frame { width: 72px; height: 72px; }
  .dta-brand-badge { display: none; }
  .dta-intro-title { font-size: 16px; }
  .dta-highlights { gap: 6px; }
  .dta-hl-item { padding: 8px 4px; }
  .dta-hl-val { font-size: 12px; }
  .dta-hl-desc { font-size: 10px; }
  .dta-audiences { grid-auto-columns: 82%; margin: 0 -12px; padding: 0 12px 4px; }
}
`;

export function AffiliateProgramPage() {
  const navigate = useNavigate();
  const { role } = useCustomerAuth();
  const signedIn = role !== 'GUEST';
  const program = useQuery({ queryKey: ['storefront', 'affiliate', 'program'], queryFn: affiliateApi.program });
  const me = useQuery({ queryKey: ['storefront', 'affiliate', 'me'], queryFn: affiliateApi.me, enabled: signedIn });

  const p = program.data;
  const status = me.data?.affiliate?.status;
  const isAffiliate = status === 'APPROVED' || status === 'SUSPENDED';
  const closed = !!p && !p.enabled && !status;
  // ONE entry point: mobile OTP sign-in signs existing users in AND creates the account for new ones,
  // so separate "Sign in" and "Sign up" buttons would lead to the same screen. After it, /affiliate shows
  // the application (new) or the dashboard (existing affiliate).
  const signUp = () => (signedIn ? navigate('/affiliate') : navigate('/login', { state: { from: '/affiliate' } }));
  const ctaLabel = isAffiliate ? 'Go to dashboard' : status === 'PENDING' ? 'Application status' : signedIn ? 'Apply now' : 'Join / Sign in';
  const isJoinCta = !isAffiliate && status !== 'PENDING';
  const upTo = p && p.maxRatePercent > 0 ? `${p.maxRatePercent}%` : null;
  const cookieDays = p?.cookieDays ?? 30;
  const holdDays = p?.holdDays ?? 7;

  return (
    <div className={closed ? 'dta' : 'dta dta-has-appbar'}>
      <style>{CSS}</style>

      {/* Slim Header */}
      <header className="dta-top">
        <div className="dta-wrap">
          <button
            type="button"
            className="dta-back"
            aria-label="Back"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
          >
            <ArrowLeftOutlined />
          </button>
          <Link to="/" className="dta-brand" aria-label="Desi Tokri home">
            <img src="/images/desi-tokri-cropped.png" alt="Desi Tokri" />
            <span className="dta-brand-badge">Affiliates</span>
          </Link>
          <nav className="dta-nav">
            <a href="#how">How it works</a>
            <a href="#creators">Who it's for</a>
            <a href="#process">Payout process</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="dta-actions">
            {!closed ? <button className="dta-btn dta-btn-primary" onClick={signUp}>{ctaLabel}</button> : null}
          </div>
        </div>
      </header>

      {/* Hero Section: Amazon Associates style wide panoramic banner */}
      <section className="dta-banner-section">
        <div className="dta-wrap">
          {/* Panoramic Hero Banner Carousel showcasing Tokri, Spices & Atta */}
          <Carousel autoplay autoplaySpeed={4500} effect="fade" className="dta-banner-carousel">
            {HERO_SLIDES.map((slide, i) => (
              <div key={slide.tag}>
                <div className="dta-banner">
                  <img
                    src={slide.image}
                    alt=""
                    className="dta-banner-bg"
                    aria-hidden
                  />
                  <div className="dta-banner-overlay" aria-hidden />

                  <div className="dta-banner-grid">
                    <div className="dta-banner-text">
                      <span className="dta-banner-tag">{slide.tag}</span>
                      <h1 className="dta-banner-title">
                        {slide.title}
                      </h1>
                      {!closed ? (
                        <button className="dta-banner-btn" onClick={signUp}>
                          {ctaLabel}
                        </button>
                      ) : null}
                    </div>

                    <div className="dta-banner-tokri-wrap">
                      <div className="dta-tokri-frame">
                        <img
                          src={slide.image}
                          alt={slide.alt}
                          className="dta-tokri-img"
                          style={{ objectPosition: slide.position }}
                          loading={i === 0 ? 'eager' : 'lazy'}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </Carousel>

          {/* Intro text directly beneath banner */}
          <div className="dta-intro">
            <h2 className="dta-intro-title">Desi Tokri Affiliates - Desi Tokri's affiliate marketing program</h2>
            <p className="dta-intro-lead">
              Welcome to the Desi Tokri Affiliate Program. The program helps food bloggers, home chefs, content creators,
              and community leaders monetize their audience and recommendations. With farm-traceable masalas, stone-ground flours,
              cold-pressed oils, and traditional namkeen available on Desi Tokri, associates use easy link-building tools
              to direct their audience to authentic products, and earn {upTo ? `up to ${upTo}` : 'commission'} from qualifying purchases.
            </p>

            {/* Clean Feature Highlights Strip */}
            <div className="dta-highlights">
              <div className="dta-hl-item">
                <span className="dta-hl-val">{upTo ? `Up to ${upTo}` : 'Active rates'}</span>
                <span className="dta-hl-desc">On eligible items</span>
              </div>
              <div className="dta-hl-item">
                <span className="dta-hl-val">{cookieDays} Days</span>
                <span className="dta-hl-desc">Cookie tracking</span>
              </div>
              <div className="dta-hl-item">
                <span className="dta-hl-val">Direct Payouts</span>
                <span className="dta-hl-desc">Monthly UPI &amp; Bank</span>
              </div>
            </div>

            {!signedIn ? (
              <p className="dta-signin-note" style={{ marginTop: 14, fontSize: 13, color: '#6b5e4f' }}>
                New or existing affiliate - sign in with your mobile number. New numbers get an account automatically.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* 3 Steps: How it Works */}
      <section className="dta-section" id="how">
        <div className="dta-wrap">
          <div className="dta-sec-header">
            <h2 className="dta-h2">How the program works</h2>
            <p className="dta-sub">Simple tracking, zero inventory, and transparent reporting at every step.</p>
          </div>
          <div className="dta-steps">
            <div className="dta-step">
              <div className="dta-step-top">
                <span className="dta-step-badge">STEP 01</span>
                <span className="dta-step-icon"><UserAddOutlined /></span>
              </div>
              <h3>Join for free</h3>
              <p>Sign in with your mobile number and submit a short application. We review and approve accounts within 48 hours.</p>
            </div>
            <div className="dta-step">
              <div className="dta-step-top">
                <span className="dta-step-badge">STEP 02</span>
                <span className="dta-step-icon"><ShareAltOutlined /></span>
              </div>
              <h3>Share your links</h3>
              <p>Generate trackable links for any product, category, or recipe. Share them on Instagram, YouTube, WhatsApp, or blogs.</p>
            </div>
            <div className="dta-step">
              <div className="dta-step-top">
                <span className="dta-step-badge">STEP 03</span>
                <span className="dta-step-icon"><WalletOutlined /></span>
              </div>
              <h3>Earn monthly</h3>
              <p>Earn {upTo ? `up to ${upTo}` : 'commission'} on any purchase made within {cookieDays} days of clicking your link, settled monthly to your account.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Who this is for */}
      <section className="dta-section dta-section-alt" id="creators">
        <div className="dta-wrap">
          <div className="dta-sec-header">
            <h2 className="dta-h2">Built for everyday creators</h2>
            <p className="dta-sub">If you share food, lifestyle, or family grocery recommendations, this program is for you.</p>
          </div>
          <div className="dta-audiences">
            <div className="dta-aud-card">
              <div className="dta-aud-icon"><CoffeeOutlined /></div>
              <h4>Home Chefs &amp; Recipe Creators</h4>
              <p>Link the exact cold-pressed oils, flours, and masalas used in your recipes and step-by-step videos.</p>
            </div>
            <div className="dta-aud-card">
              <div className="dta-aud-icon"><ShareAltOutlined /></div>
              <h4>Food &amp; Lifestyle Influencers</h4>
              <p>Add your affiliate link in your Instagram bio, YouTube descriptions, recipe reels, and blog articles.</p>
            </div>
            <div className="dta-aud-card">
              <div className="dta-aud-icon"><TeamOutlined /></div>
              <h4>Community &amp; Society Admins</h4>
              <p>Recommend wholesome monthly grocery ration baskets to society groups, family circles, and WhatsApp communities.</p>
            </div>
            <div className="dta-aud-card">
              <div className="dta-aud-icon"><SafetyCertificateOutlined /></div>
              <h4>Nutrition &amp; Health Advocates</h4>
              <p>Recommend clean, unadulterated essentials backed by batch-level farm traceability your followers can verify.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Lifecycle / Process */}
      <section className="dta-section" id="process">
        <div className="dta-wrap">
          <div className="dta-sec-header">
            <h2 className="dta-h2">From click to payout</h2>
            <p className="dta-sub">Transparent tracking from the moment someone clicks your link until funds hit your account.</p>
          </div>
          <div className="dta-pipeline">
            <div className="dta-pipe-col">
              <h5>1 · Order Placed</h5>
              <p>Commission records instantly in your affiliate dashboard under hold status.</p>
            </div>
            <div className="dta-pipe-col">
              <h5>2 · {holdDays}-Day Hold</h5>
              <p>Covers our return window{p?.holdFrom === 'DELIVERY_DATE' ? ' after delivery' : ''}. A returned item adjusts only its own line.</p>
            </div>
            <div className="dta-pipe-col">
              <h5>3 · Matured &amp; Approved</h5>
              <p>Once delivered and past the hold window, commissions move to payable status.</p>
            </div>
            <div className="dta-pipe-col">
              <h5>4 · Monthly Transfer</h5>
              <p>Settled to your UPI ID or bank{p && p.minPayoutAmount > 0 ? ` (min. ${formatInr(p.minPayoutAmount)})` : ''} with bank reference.</p>
            </div>
          </div>

          <div className="dta-trust-strip">
            <span className="dta-trust-item"><DashboardOutlined /> Real-time clicks and earnings</span>
            <span className="dta-trust-item"><LinkOutlined /> Instant custom link generator</span>
            <span className="dta-trust-item"><SafetyCertificateOutlined /> 100% farm-traceable products</span>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="dta-section dta-section-alt" id="faq">
        <div className="dta-wrap">
          <div className="dta-sec-header">
            <h2 className="dta-h2">Frequently asked questions</h2>
            <p className="dta-sub">Common questions regarding tracking, commission policies, and payouts.</p>
          </div>
          <div className="dta-faq-container">
            <Collapse
              className="dta-faq"
              accordion
              bordered={false}
              ghost
              expandIconPosition="end"
              items={faqs(p).map(([q, a], i) => ({
                key: String(i),
                label: q,
                children: <p style={{ margin: 0, color: '#57534e', fontSize: 13.5, lineHeight: 1.65 }}>{a}</p>,
              }))}
            />
            {p?.termsText ? (
              <Collapse
                className="dta-faq"
                bordered={false}
                ghost
                expandIconPosition="end"
                style={{ marginTop: 8 }}
                items={[
                  {
                    key: 'terms',
                    label: 'Program terms & conditions',
                    children: <div style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, color: '#57534e', lineHeight: 1.6 }}>{p.termsText}</div>,
                  },
                ]}
              />
            ) : null}
          </div>
        </div>
      </section>

      {/* Bottom CTA Banner */}
      {!closed ? (
        <section className="dta-bottom-section" style={{ padding: '48px 0 56px' }}>
          <div className="dta-wrap">
            <div className="dta-bottom-cta">
              <h2>Start earning with Desi Tokri</h2>
              <p>Join our affiliate community today. Free to apply, quick approvals, and transparent monthly payouts.</p>
              <button className="dta-btn dta-btn-outline dta-btn-md" onClick={signUp}>
                {isJoinCta ? 'Apply Now — Free' : ctaLabel} <ArrowRightOutlined style={{ fontSize: 12 }} />
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {/* Clean Footer */}
      <footer className="dta-foot">
        <div className="dta-wrap">
          <Link to="/"><ShoppingOutlined /> Shop Desi Tokri</Link>
          <a href="#how">How it works</a>
          <a href="#creators">Who it's for</a>
          <a href="#process">Payout process</a>
          <a href="#faq">FAQ</a>
          <Link to="/help">Help &amp; Support</Link>
          {isAffiliate ? <Link to="/affiliate">Affiliate Dashboard</Link> : null}
          <span className="dta-copy" style={{ marginLeft: 'auto' }}>© {new Date().getFullYear()} SVV Balaji Food &amp; Beverages Pvt. Ltd.</span>
        </div>
      </footer>

      {/* App view only: sticky bottom action bar (hidden on desktop via CSS) */}
      {!closed ? (
        <div className="dta-appbar">
          <button className="dta-btn dta-btn-primary" onClick={signUp}>
            {isJoinCta ? "Join now — it's free" : ctaLabel} <ArrowRightOutlined style={{ fontSize: 12 }} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function faqs(p?: AffiliateProgramInfo): Array<[string, string]> {
  const days = p?.cookieDays ?? 30;
  const hold = p?.holdDays ?? 7;
  return [
    [
      'What is the Desi Tokri Affiliate Program?',
      'An affiliate partnership program that allows content creators, food bloggers, and community leaders to earn commission by recommending Desi Tokri products to their followers.',
    ],
    [
      'Who is eligible to join?',
      'Anyone with an engaged audience — including home chefs, food influencers, YouTube creators, WhatsApp group admins, and health advocates. You only need a mobile number to apply.',
    ],
    [
      'Are there any fees or charges?',
      'No. Joining is 100% free and there are no ongoing costs, deduction fees, or charges on payouts.',
    ],
    [
      'How does tracking and attribution work?',
      `Any purchase made within ${days} days of clicking your link earns you commission on all qualifying items in that order. Last-click attribution applies if multiple links were clicked.`,
    ],
    [
      'Can I earn commission on my personal orders?',
      'No. Self-referrals and orders sharing your phone number, email address, or payment details are strictly excluded to maintain program integrity.',
    ],
    [
      'What happens if a customer returns an item?',
      `Commissions are held for ${hold} days following order delivery to account for customer returns. If an item is returned, only that specific item's commission is adjusted.`,
    ],
    [
      'When and how do I receive payouts?',
      `Earnings are transferred monthly directly to your verified UPI ID or bank account${
        p && p.minPayoutAmount > 0 ? ` once your balance reaches ${formatInr(p.minPayoutAmount)}` : ''
      }. All transfer reference IDs are logged in your dashboard.`,
    ],
    [
      'How do I get started?',
      'Click on Join Now, sign in with your mobile number, and submit your profile with links to where you plan to share. Applications are typically reviewed within 24 to 48 hours.',
    ],
  ];
}
