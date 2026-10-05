import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

// Rung phản hồi trên điện thoại; trên web bỏ qua.

const native = Capacitor.isNativePlatform()

export function tapFeedback() {
  if (native) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
}

export function successFeedback() {
  if (native) Haptics.notification({ type: NotificationType.Success }).catch(() => {})
}

export function errorFeedback() {
  if (native) Haptics.notification({ type: NotificationType.Error }).catch(() => {})
}
