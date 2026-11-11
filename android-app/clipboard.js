import * as Clipboard from 'expo-clipboard';

export async function copyToClipboard(text) {
  try {
    if (Clipboard?.setStringAsync) {
      await Clipboard.setStringAsync(String(text || ''));
      return true;
    }
  } catch {}
  return false;
}
