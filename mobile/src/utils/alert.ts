import { Alert, Platform } from 'react-native';

interface AlertButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

/**
 * Cross-platform alert: uses native Alert on mobile, window.confirm/alert on web.
 */
export function crossAlert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  // No buttons or single button = simple notification
  if (!buttons || buttons.length <= 1) {
    window.alert(message || title);
    buttons?.[0]?.onPress?.();
    return;
  }

  // Multiple buttons = confirmation dialog
  const cancelBtn = buttons.find(b => b.style === 'cancel');
  const actionBtn = buttons.find(b => b.style !== 'cancel') || buttons[buttons.length - 1];

  const confirmed = window.confirm(message || title);
  if (confirmed) {
    actionBtn?.onPress?.();
  } else {
    cancelBtn?.onPress?.();
  }
}
