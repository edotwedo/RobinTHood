// A random id for this install, kept on the phone. Reports carry it so repeats from one
// phone can be grouped, and worker requests carry it so phones sharing a carrier IP get
// their own rate limit. It is not tied to the user or the device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const ID_KEY = '@robinthood_install_id';
let cached;

export async function installId() {
  if (cached) return cached;
  let id = await AsyncStorage.getItem(ID_KEY).catch(() => null);
  if (!id) {
    id = Crypto.randomUUID();
    await AsyncStorage.setItem(ID_KEY, id).catch(() => {});
  }
  cached = id;
  return id;
}
