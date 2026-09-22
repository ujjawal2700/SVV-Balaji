import type { ThemeConfig } from 'antd';

/**
 * Ant Design theme tokens aligned with SVV Balaji Brand Identity:
 * Primary: Forest / Deep Emerald Green (#1E5E3A / #166534)
 * Accent / Brand Saffron: Warm Orange (#E86A17 / #EA580C)
 * Success: Fresh Leaf Green (#16A34A / #22C55E)
 */
export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#1E5E3A',
    colorSuccess: '#16A34A',
    colorWarning: '#E86A17',
    colorInfo: '#0284C7',
    colorTextSecondary: '#64748B',
    colorBgLayout: '#F8FAFC',
    borderRadius: 8,
    fontSize: 14,
  },
  components: {
    Layout: {
      headerBg: '#FFFFFF',
      siderBg: '#FFFFFF',
    },
    Menu: {
      itemSelectedBg: '#ECFDF5',
      itemSelectedColor: '#166534',
      itemHoverBg: '#F0FDF4',
      itemHoverColor: '#15803D',
      subMenuItemBg: 'transparent',
    },
    Button: {
      primaryColor: '#FFFFFF',
      colorPrimary: '#1E5E3A',
      colorPrimaryHover: '#166534',
      colorPrimaryActive: '#14532D',
    },
    Segmented: {
      itemSelectedBg: '#FFFFFF',
      itemSelectedColor: '#1E5E3A',
      itemHoverBg: '#ECFDF5',
      itemHoverColor: '#166534',
    },
  },
};
