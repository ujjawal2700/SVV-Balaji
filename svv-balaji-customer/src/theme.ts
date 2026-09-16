import type { ThemeConfig } from 'antd';

/**
 * Storefront theme.
 *
 * Same emerald as the staff apps, because it is one brand and a customer who
 * has seen the pack should recognise the site. Everything else is deliberately
 * softer and larger than `svv-balaji-admin/src/theme.ts`:
 *
 *   - bigger base font and control height — this is read one-handed on a phone,
 *     often outdoors, often by someone who is not a daily user
 *   - rounder corners and a warmer paper background — a shop, not a console
 *   - no dense-table tuning, because there are no dense tables here
 *
 * If the two ever need to diverge on colour, this file is the place. Do not
 * reach into the admin theme from here; a change made for a staff screen should
 * not be able to restyle the shop.
 */
export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#059669', // Emerald 600 — matches the pack and both staff apps
    colorPrimaryHover: '#10b981',
    colorPrimaryActive: '#047857',
    colorSuccess: '#10b981',
    colorInfo: '#3b82f6',
    colorWarning: '#f59e0b',
    colorError: '#ef4444',
    colorText: '#1c1917', // Stone 900 — warmer than the admin's slate
    colorTextSecondary: '#78716c',
    colorBgLayout: '#fafaf9', // Stone 50
    colorBgContainer: '#ffffff',
    colorBorder: '#e7e5e4',
    colorBorderSecondary: '#f5f5f4',
    borderRadius: 12,
    borderRadiusLG: 16,
    borderRadiusSM: 8,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif",
    fontSize: 13.5, // Refined from 15 to 13.5 for a sleeker, cleaner UI
    fontSizeHeading1: 24,
    fontSizeHeading2: 20,
    fontSizeHeading3: 17,
    fontSizeHeading4: 15,
    fontSizeHeading5: 13.5,
    lineHeight: 1.5,
    controlHeight: 38,
    controlHeightLG: 44,
    controlHeightSM: 30,
    boxShadowSecondary:
      '0 4px 14px -2px rgba(28, 25, 23, 0.08), 0 2px 6px -2px rgba(28, 25, 23, 0.04)',
  },
  components: {
    Typography: {
      titleMarginBottom: 6,
      titleMarginTop: 0,
    },
    Button: {
      controlHeight: 38,
      controlHeightLG: 44,
      controlHeightSM: 28,
      fontWeight: 600,
      borderRadius: 10,
      boxShadow: 'none',
      primaryShadow: '0 2px 10px 0 rgba(5, 150, 105, 0.28)',
    },
    Input: { controlHeight: 38, controlHeightLG: 44, borderRadius: 10 },
    Select: { controlHeight: 38, controlHeightLG: 44, borderRadius: 10 },
    Card: {
      paddingLG: 18,
      borderRadiusLG: 14,
      boxShadowTertiary: '0 1px 3px 0 rgba(28, 25, 23, 0.05)',
    },
    Tag: { borderRadiusSM: 6, fontSize: 11 },
  },
};
