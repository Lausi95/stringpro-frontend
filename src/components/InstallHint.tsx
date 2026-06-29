import { useEffect, useState } from 'react'
import { Share, X } from 'lucide-react'
import './InstallHint.css'

const DISMISS_KEY = 'stringpro:install-hint-dismissed'

/**
 * iOS Safari fires no `beforeinstallprompt`, so installing the PWA is a manual
 * Share → "Add to Home Screen" gesture. This dismissible hint surfaces that —
 * shown only on iOS Safari when the app is not already running standalone.
 * See docs/adr/0012-pwa-primary-target-ios.md
 */

function isIos(): boolean {
  const ua = navigator.userAgent
  // iPadOS 13+ reports as "Macintosh"; disambiguate with touch points.
  return /iphone|ipad|ipod/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))
}

function canAddToHomeScreen(): boolean {
  // Only Safari can Add to Home Screen on iOS — Chrome/Firefox/Edge cannot.
  return !/CriOS|FxiOS|EdgiOS|OPiOS|mercury/i.test(navigator.userAgent)
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export default function InstallHint() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return
    if (isIos() && canAddToHomeScreen() && !isStandalone()) setShow(true)
  }, [])

  if (!show) return null

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setShow(false)
  }

  return (
    <div className="install-hint" role="dialog" aria-label="Install StringPro">
      <span className="install-hint-text">
        Install StringPro — tap{' '}
        <Share size={15} className="install-hint-share" aria-label="Share" />{' '}
        then <strong>Add to Home Screen</strong>
      </span>
      <button className="install-hint-close" onClick={dismiss} aria-label="Dismiss">
        <X size={16} />
      </button>
    </div>
  )
}
