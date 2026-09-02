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
    borderRadius: 14,
    borderRadiusLG: 20,
    borderRadiusSM: 10,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif",
    fontSize: 15,
    controlHeight: 44,
    controlHeightLG: 52,
    boxShadowSecondary:
      '0 4px 14px -2px rgba(28, 25, 23, 0.08), 0 2px 6px -2px rgba(28, 25, 23, 0.04)',
  },
  components: {
    Button: {
      controlHeight: 46,
      controlHeightLG: 52,
      fontWeight: 600,
      borderRadius: 12,
      boxShadow: 'none',
      primaryShadow: '0 2px 10px 0 rgba(5, 150, 105, 0.28)',
    },
    Input: { controlHeight: 46, controlHeightLG: 52, borderRadius: 12 },
    Select: { controlHeight: 46, controlHeightLG: 52, borderRadius: 12 },
    Card: {
      paddingLG: 22,
      borderRadiusLG: 18,
      boxShadowTertiary: '0 1px 3px 0 rgba(28, 25, 23, 0.05)',
    },
    Tag: { borderRadiusSM: 8, fontSize: 12 },
  },
};
