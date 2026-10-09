// Native notifications: the Tauri notification plugin inside the app
// (WKWebView has no Notification API), the browser's otherwise.

import { isTauri } from '@tauri-apps/api/core';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

let granted: boolean | null = null;

async function permitted(): Promise<boolean> {
  if (granted !== null) return granted;
  if (isTauri()) {
    granted =
      (await isPermissionGranted()) ||
      (await requestPermission()) === 'granted';
  } else if ('Notification' in window) {
    granted =
      Notification.permission === 'granted' ||
      (await Notification.requestPermission()) === 'granted';
  } else {
    granted = false;
  }
  return granted;
}

export async function notify(title: string, body: string) {
  try {
    if (!(await permitted())) return;
    if (isTauri()) sendNotification({ title, body });
    else new Notification(title, { body });
  } catch {
    // notifications are best effort
  }
}
