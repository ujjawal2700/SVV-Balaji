import type { ThemeConfig } from 'antd';

/**
 * The field app's theme.
 *
 * Deliberately a different colour from the admin panel's purple. Two apps that
 * look identical but behave differently is how somebody records an inspection
 * in the wrong place; a green app on the phone and a purple one on the desktop
 * is a distinction you notice without reading anything.
 *
 * Controls are sized up across the board. The admin panel is used with a mouse
 * indoors; this is used with a thumb, one-handed, outdoors, often by someone
 * wearing gloves. 44px is the smallest reliable touch target.
 */
export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#1f7a3c',
    colorSuccess: '#21BF06',
    colorInfo: '#3B86D1',
    colorWarning: '#d48806',
    colorTextSecondary: '#6C7293',
    colorBgLayout: '#f5f7f5',
    borderRadius: 10,
    fontSize: 15,
    controlHeight: 40,
    controlHeightLG: 48,
  },
  components: {
    Button: { controlHeight: 44, controlHeightLG: 52, fontWeight: 500 },
    Input: { controlHeight: 44, controlHeightLG: 52 },
    Select: { controlHeight: 44, controlHeightLG: 52 },
    DatePicker: { controlHeight: 44, controlHeightLG: 52 },
    Card: { paddingLG: 16 },
  },
};
