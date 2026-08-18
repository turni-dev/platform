import type { ThemeConfig } from 'antd';

/**
 * Every value here is copied from `tokens.scss` — that file stays the single
 * source of truth for the brand's semantic colors, this just hands the same
 * values to AntD. `theme.spec.ts` catches the two files drifting apart.
 */
export const turniTheme: ThemeConfig = {
  cssVar: {},
  hashed: false,
  token: {
    colorPrimary: '#176b4d',
    colorSuccess: '#147447',
    colorWarning: '#8a5800',
    colorError: '#b42318',
    colorInfo: '#1b65c1',
    colorBgBase: '#ffffff',
    colorTextBase: '#17191c',
    colorBorder: '#cbd1d8',
    borderRadius: 8,
    controlHeight: 40,
    fontSize: 16,
    fontFamily: "var(--font-body), system-ui, -apple-system, 'Segoe UI', sans-serif"
  }
};
