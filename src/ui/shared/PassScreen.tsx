import type { ReactNode } from 'react';
import styles from './PassScreen.module.css';

// "Pass the phone to Alex." The cover a single-device table puts in front of
// anything secret. Render it INSTEAD of the secret (don't overlay it — the
// DOM is inspectable and a curious friend can scroll). The button is how
// the named player claims the device.

export function PassScreen({
  to,
  message,
  action,
  onReady,
  icon = '📱',
  children,
}: {
  /** Who should take the device. */
  to: string;
  /** One line about why ("Alex is describing next. Everyone else, no peeking!"). */
  message?: ReactNode;
  /** Button label. Default "I'm <name> — show me". */
  action?: string;
  onReady: () => void;
  icon?: string;
  /** Extra controls under the button (e.g. "skip this player"). */
  children?: ReactNode;
}) {
  return (
    <section className={styles.root} role="dialog" aria-labelledby="pass-title">
      <div className={styles.icon} aria-hidden>
        <span className={styles.hand}>🤲</span>
        <span className={styles.phone}>{icon}</span>
      </div>
      <p className="pg-kicker">Pass the device to</p>
      <h2 id="pass-title" className={styles.name}>
        {to}
      </h2>
      {message && <p className={styles.message}>{message}</p>}
      <button className="pg-btn pg-btn-primary pg-btn-lg" onClick={onReady} autoFocus>
        {action ?? `I'm ${to} — show me`}
      </button>
      {children}
    </section>
  );
}
