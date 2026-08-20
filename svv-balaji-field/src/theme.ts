import type { ThemeConfig } from 'antd';

/**
 * Modern Slate & Emerald Green theme for the Field Operations Panel.
 *
 * Primary: Vibrant Emerald Green (#059669 / #10b981)
 * Accent/Slate: #0f172a / #1e293b / #334155
 * Background Layout: Clean crisp #f8fafc slate tint
 */
export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#059669', // Emerald 600
    colorPrimaryHover: '#10b981', // Emerald 500
    colorPrimaryActive: '#047857', // Emerald 700
    colorSuccess: '#10b981',
    colorInfo: '#3b82f6', // Blue 500
    colorWarning: '#f59e0b', // Amber 500
    colorError: '#ef4444', // Red 500
    colorText: '#0f172a', // Slate 900
    colorTextSecondary: '#64748b', // Slate 500
    colorBgLayout: '#f8fafc', // Slate 50
    colorBgContainer: '#ffffff',
    colorBorder: '#e2e8f0', // Slate 200
    colorBorderSecondary: '#f1f5f9',
    borderRadius: 12,
    borderRadiusLG: 16,
    borderRadiusSM: 8,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif",
    fontSize: 14,
    controlHeight: 40,
    controlHeightLG: 48,
    boxShadowSecondary: '0 4px 12px -2px rgba(15, 23, 42, 0.08), 0 2px 6px -2px rgba(15, 23, 42, 0.04)',
  },
  components: {
    Button: {
      controlHeight: 42,
      controlHeightLG: 48,
      fontWeight: 600,
      borderRadius: 10,
      boxShadow: 'none',
      primaryShadow: '0 2px 8px 0 rgba(5, 150, 105, 0.25)',
    },
    Input: { controlHeight: 42, controlHeightLG: 48, borderRadius: 10 },
    Select: { controlHeight: 42, controlHeightLG: 48, borderRadius: 10 },
    DatePicker: { controlHeight: 42, controlHeightLG: 48, borderRadius: 10 },
    Card: {
      paddingLG: 20,
      borderRadiusLG: 14,
      boxShadowTertiary: '0 1px 3px 0 rgba(15, 23, 42, 0.05)',
    },
    Tag: { borderRadiusSM: 6, fontSize: 12 },
    Segmented: { borderRadiusSM: 8 },
  },
};
