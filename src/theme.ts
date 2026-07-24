import { I18nManager, StyleSheet } from 'react-native'

I18nManager.allowRTL(true)

export const colors = {
  primary: '#0891b2',
  primaryDark: '#0e7490',
  teal: '#0f766e',
  background: '#f0f9ff',
  surface: '#ffffff',
  text: '#0f2942',
  muted: '#64748b',
  border: '#bae6fd',
  danger: '#dc2626',
  warning: '#d97706',
  success: '#059669',
}

export const commonStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'right',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'right',
  },
  button: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    color: colors.text,
    textAlign: 'right',
  },
})
