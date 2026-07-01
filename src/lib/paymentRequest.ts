import type { SettingsResponse } from './api'

/**
 * PayPal.Me username used to build the pay-link in a shared Payment Request.
 *
 * Hardcoded stopgap: the Settings schema has no PayPal field yet, and a working
 * paypal.me link needs a username (it cannot be derived from an email). When
 * Settings gains a `paypalMe` field, read it from there and delete this constant.
 * See docs/adr/0016-share-payment-request-message.md.
 */
export const PAYPAL_ME_USERNAME = 'TLausmann'

export type MessageLanguage = 'de' | 'en'

/** €25.00 (en) / 25,00 € (de) — locale-correct EUR. */
function formatMoney(amount: number, lang: MessageLanguage): string {
  return new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

/** paypal.me amount segment: dot-decimal, whole numbers without trailing zeros. */
function paypalLink(amount: number): string {
  const amt = Number.isInteger(amount) ? String(amount) : amount.toFixed(2)
  return `https://paypal.me/${PAYPAL_ME_USERNAME}/${amt}EUR`
}

/** Group an IBAN into blocks of four for readability. */
function formatIban(iban: string): string {
  return iban
    .replace(/\s+/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim()
}

export interface PaymentRequestInput {
  /** Customer's first name; empty falls back to a name-less greeting. */
  firstName: string
  /** e.g. "Wilson Pro Staff"; empty falls back to a generic "racket". */
  racketName: string
  /** The Job's Balance (total − amountPaid), in EUR. */
  balance: number
  /** Stringer identity from Settings; a blank IBAN omits the bank-transfer line. */
  settings: Pick<SettingsResponse, 'fullName' | 'iban'>
  lang: MessageLanguage
}

/**
 * Build the plain-text Payment Request a Stringer shares with a Customer.
 * Per-Job: states that Job's Balance and how to pay. Never persisted.
 */
export function buildPaymentRequest({ firstName, racketName, balance, settings, lang }: PaymentRequestInput): string {
  const amount = formatMoney(balance, lang)
  const paypal = paypalLink(balance)
  const name = settings.fullName?.trim()
  const iban = settings.iban?.trim()
  const first = firstName.trim()
  const racket = racketName.trim()

  const lines: string[] = []
  if (lang === 'de') {
    lines.push(`Hallo${first ? ` ${first}` : ''},`)
    lines.push(`der offene Betrag fürs Bespannen ${racket ? `deines ${racket}` : 'deines Schlägers'} beträgt ${amount}.`)
    lines.push('')
    lines.push('So kannst du zahlen:')
    lines.push(`• PayPal: ${paypal}`)
    if (iban) lines.push(`• Überweisung: ${formatIban(iban)}${name ? `, ${name}` : ''}`)
    lines.push('• Bar: vor Ort')
    lines.push('')
    lines.push('Danke,')
    if (name) lines.push(name)
  } else {
    lines.push(`Hi${first ? ` ${first}` : ''},`)
    lines.push(`The balance for stringing ${racket ? `your ${racket}` : 'your racket'} is ${amount}.`)
    lines.push('')
    lines.push('You can pay via:')
    lines.push(`• PayPal: ${paypal}`)
    if (iban) lines.push(`• Bank transfer: ${formatIban(iban)}${name ? `, ${name}` : ''}`)
    lines.push('• Cash: in person')
    lines.push('')
    lines.push('Thanks,')
    if (name) lines.push(name)
  }
  return lines.join('\n').trimEnd()
}
