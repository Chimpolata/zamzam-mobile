import * as SecureStore from 'expo-secure-store'
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { I18nManager, StyleSheet, useColorScheme } from 'react-native'

I18nManager.allowRTL(true)

export type ThemeMode = 'system' | 'light' | 'dark'

export interface ThemeColors {
  primary: string
  primaryDark: string
  teal: string
  background: string
  surface: string
  surfaceMuted: string
  elevated: string
  text: string
  muted: string
  border: string
  danger: string
  dangerSurface: string
  warning: string
  warningSurface: string
  success: string
  successSurface: string
  primarySurface: string
  input: string
  overlay: string
}

const lightColors: ThemeColors = {
  primary: '#0891b2',
  primaryDark: '#0e7490',
  teal: '#0f766e',
  background: '#f0f9ff',
  surface: '#ffffff',
  surfaceMuted: '#f1f5f9',
  elevated: '#ffffff',
  text: '#0f2942',
  muted: '#64748b',
  border: '#bae6fd',
  danger: '#dc2626',
  dangerSurface: '#fef2f2',
  warning: '#d97706',
  warningSurface: '#fef3c7',
  success: '#059669',
  successSurface: '#d1fae5',
  primarySurface: '#cffafe',
  input: '#ffffff',
  overlay: 'rgba(15, 23, 42, 0.42)',
}

const darkColors: ThemeColors = {
  primary: '#22d3ee',
  primaryDark: '#67e8f9',
  teal: '#5eead4',
  background: '#07131f',
  surface: '#102333',
  surfaceMuted: '#172f42',
  elevated: '#183246',
  text: '#e6f7ff',
  muted: '#9ab3c5',
  border: '#24516a',
  danger: '#f87171',
  dangerSurface: '#3a1b25',
  warning: '#fbbf24',
  warningSurface: '#3b2d15',
  success: '#34d399',
  successSurface: '#12382f',
  primarySurface: '#123b4a',
  input: '#0d1f2d',
  overlay: 'rgba(0, 0, 0, 0.68)',
}

export function createCommonStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
      color: '#ffffff',
      fontWeight: '800',
      fontSize: 16,
    },
    input: {
      minHeight: 50,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.input,
      borderRadius: 14,
      paddingHorizontal: 14,
      color: colors.text,
      textAlign: 'right',
    },
  })
}

export type CommonStyles = ReturnType<typeof createCommonStyles>

interface ThemeContextValue {
  mode: ThemeMode
  isDark: boolean
  colors: ThemeColors
  commonStyles: CommonStyles
  setMode(mode: ThemeMode): Promise<void>
}

const THEME_MODE_KEY = 'zamzam-theme-mode'
const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme()
  const [mode, setModeState] = useState<ThemeMode>('system')

  useEffect(() => {
    SecureStore.getItemAsync(THEME_MODE_KEY)
      .then((saved) => {
        if (saved === 'system' || saved === 'light' || saved === 'dark') setModeState(saved)
      })
      .catch(() => {
        // The system preference remains a safe fallback if secure storage is unavailable.
      })
  }, [])

  const setMode = useCallback(async (nextMode: ThemeMode) => {
    setModeState(nextMode)
    try {
      await SecureStore.setItemAsync(THEME_MODE_KEY, nextMode)
    } catch {
      // Keep the selected mode for this session even if persistence is unavailable.
    }
  }, [])

  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark')
  const colors = isDark ? darkColors : lightColors
  const commonStyles = useMemo(() => createCommonStyles(colors), [colors])
  const value = useMemo(
    () => ({ mode, isDark, colors, commonStyles, setMode }),
    [mode, isDark, colors, commonStyles, setMode],
  )

  return React.createElement(ThemeContext.Provider, { value }, children)
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside ThemeProvider')
  return value
}
