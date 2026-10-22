import { Severity, Verdict } from './analysis/analyze';

export const colors = {
  background: '#F6F7F4',
  surface: '#FFFFFF',
  text: '#1B1F1C',
  muted: '#5F6B63',
  border: '#DDE2DC',
  primary: '#2F6F4E',
  primaryText: '#FFFFFF',
  green: '#2E8B57',
  greenBg: '#E3F4EA',
  yellow: '#B7791F',
  yellowBg: '#FDF3DC',
  red: '#C0392B',
  redBg: '#FBE4E1',
  grey: '#6B7280',
  greyBg: '#ECEEF0',
};

export const VERDICT_STYLE: Record<Verdict, { color: string; bg: string; title: string; subtitle: string; icon: string }> = {
  green: {
    color: colors.green,
    bg: colors.greenBg,
    icon: '✓',
    title: 'Sopii todennäköisesti',
    subtitle: 'Ei tunnettuja runsas-FODMAP-ainesosia.',
  },
  yellow: {
    color: colors.yellow,
    bg: colors.yellowBg,
    icon: '!',
    title: 'Varo – annoskoko ratkaisee',
    subtitle: 'Sisältää kohtalaisia tai epävarmoja ainesosia.',
  },
  red: {
    color: colors.red,
    bg: colors.redBg,
    icon: '✕',
    title: 'Ei sovi – runsas-FODMAP',
    subtitle: 'Sisältää ainesosia, jotka aiheuttavat usein oireita.',
  },
  unknown: {
    color: colors.grey,
    bg: colors.greyBg,
    icon: '?',
    title: 'Ei ainesosatietoja',
    subtitle: 'Kirjoita ainesosaluettelo pakkauksesta, niin tarkistan sen.',
  },
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  bad: colors.red,
  caution: colors.yellow,
  ok: colors.green,
};
