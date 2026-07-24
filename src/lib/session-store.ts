import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'

import type { User } from '../types'

const ACCESS_TOKEN = 'zamzam.access-token'
const REFRESH_TOKEN = 'zamzam.refresh-token'
const DEVICE_ID = 'zamzam.device-id'
const USER = 'zamzam.user'
const ACTIVE_TAHFIZ = 'zamzam.active-tahfiz'

export async function getDeviceId() {
  const existing = await SecureStore.getItemAsync(DEVICE_ID)
  if (existing) return existing
  const next = Crypto.randomUUID()
  await SecureStore.setItemAsync(DEVICE_ID, next)
  return next
}

export async function getAccessToken() {
  return SecureStore.getItemAsync(ACCESS_TOKEN)
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_TOKEN)
}

export async function saveTokens(accessToken: string, refreshToken?: string | null) {
  await SecureStore.setItemAsync(ACCESS_TOKEN, accessToken)
  if (refreshToken) await SecureStore.setItemAsync(REFRESH_TOKEN, refreshToken)
}

export async function saveUser(user: User) {
  await SecureStore.setItemAsync(USER, JSON.stringify(user))
}

export async function getSavedUser(): Promise<User | null> {
  const value = await SecureStore.getItemAsync(USER)
  return value ? JSON.parse(value) : null
}

export async function saveActiveTahfiz(id: number) {
  await SecureStore.setItemAsync(ACTIVE_TAHFIZ, String(id))
}

export async function getActiveTahfiz() {
  const value = await SecureStore.getItemAsync(ACTIVE_TAHFIZ)
  return value ? Number(value) : null
}

export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN),
    SecureStore.deleteItemAsync(REFRESH_TOKEN),
    SecureStore.deleteItemAsync(USER),
    SecureStore.deleteItemAsync(ACTIVE_TAHFIZ),
  ])
}
