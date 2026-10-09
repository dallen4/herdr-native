import { theme, type ThemeConfig } from 'antd';
import { fonts, palette, radius, status } from './tokens.ts';

// Ant Design's dark algorithm derives the full scale from these seeds;
// the map/alias overrides pin the surfaces and text to our palette so
// the default Ant look doesn't leak through.
export const antdTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: palette.blue,
    colorInfo: status.working,
    colorSuccess: status.done,
    colorWarning: status.needsYou,
    colorError: status.error,
    colorLink: palette.blueText,
    colorTextBase: palette.text,
    colorBgBase: palette.ground,

    colorBgLayout: palette.ground,
    colorBgContainer: palette.surface,
    colorBgElevated: palette.card,
    colorBorder: palette.borderStrong,
    colorBorderSecondary: palette.border,
    colorText: palette.text,
    colorTextSecondary: palette.textMuted,
    colorTextTertiary: palette.textFaint,

    fontFamily: fonts.body,
    fontFamilyCode: fonts.mono,
    fontSize: 13,
    borderRadius: radius.control,
    borderRadiusLG: radius.panel,
    wireframe: false,
  },
  components: {
    Layout: {
      bodyBg: palette.ground,
      headerBg: palette.ground,
      siderBg: palette.ground,
      headerHeight: 60,
      headerPadding: '0 20px',
    },
    Button: {
      fontWeight: 600,
      primaryShadow: 'none',
      defaultShadow: 'none',
      dangerShadow: 'none',
    },
    Segmented: {
      trackBg: 'transparent',
      itemSelectedBg: status.done,
      itemSelectedColor: palette.ground,
      itemColor: palette.text,
      itemHoverBg: palette.raised,
    },
    Tree: {
      nodeSelectedBg: palette.raised,
      nodeHoverBg: palette.card,
    },
  },
};
