import * as SecureStore from "expo-secure-store";

const KEY_REBRICKABLE = "rebrickable_api_key";

/** Returns the saved Rebrickable API key, or null if none set yet. */
export async function getRebrickableKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_REBRICKABLE);
}

/** Persists the Rebrickable API key to the device secure store. */
export async function setRebrickableKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    await SecureStore.deleteItemAsync(KEY_REBRICKABLE);
    return;
  }
  await SecureStore.setItemAsync(KEY_REBRICKABLE, trimmed);
}

/** True if a Rebrickable key has been configured. */
export async function hasRebrickableKey(): Promise<boolean> {
  return (await getRebrickableKey()) !== null;
}
