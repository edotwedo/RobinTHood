import * as Haptics from 'expo-haptics';

export async function lightTick() {
  try {
    if (Haptics?.selectionAsync) {
      await Haptics.selectionAsync();
    }
  } catch {}
}

export async function successTick() {
  try {
    if (Haptics?.notificationAsync && Haptics?.NotificationFeedbackType) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  } catch {}
}
