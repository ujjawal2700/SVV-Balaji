import type { ThemeConfig } from 'antd';

/**
 * Ant Design theme tokens.
 *
 * Configured to use the modern, clean color palette requested.
 */
export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#844FC1',
    colorSuccess: '#21BF06',
    colorInfo: '#3B86D1',
    colorTextSecondary: '#6C7293',
    colorBgLayout: '#F8F9FA',
    borderRadius: 6,
    fontSize: 14,
  },
  components: {
    Layout: {
      headerBg: '#87ceeb',
      siderBg: '#ffffff',
    },
  },
};
