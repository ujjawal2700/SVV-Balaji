import type { ThemeConfig } from 'antd';

/**
 * Ant Design theme tokens.
 *
 * Kept small on purpose. The client has not supplied a brand palette yet, so
 * this is a neutral, legible starting point rather than a guess at their
 * colours — swap `colorPrimary` once branding lands.
 */
export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#2e7d32',
    borderRadius: 6,
    fontSize: 14,
  },
  components: {
    Layout: {
      headerBg: '#ffffff',
      siderBg: '#ffffff',
    },
  },
};
