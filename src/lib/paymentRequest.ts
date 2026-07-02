import type { SettingsResponse } from './api'

export type MessageLanguage = 'de' | 'en'

/** €25.00 (en) / 25,00 € (de) — locale-correct EUR. */
function formatMoney(amount: number, lang: MessageLanguage): string {
  return new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

/** paypal.me amount segment: dot-decimal, whole numbers without trailing zeros. */
function paypalLink(handle: string, amount: number): string {
  const amt = Number.isInteger(amount) ? String(amount) : amount.toFixed(2)
  return `https://paypal.me/${handle}/${amt}EUR`
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
  /**
   * Stringer identity from Settings. A blank PayPal Handle omits the PayPal
   * line; a blank IBAN omits the bank-transfer line.
   */
  settings: Pick<SettingsResponse, 'fullName' | 'iban' | 'paypalHandle'>
  lang: MessageLanguage
}

/**
 * Build the plain-text Payment Request a Stringer shares with a Customer.
 * Per-Job: states that Job's Balance and how to pay. Never persisted.
 */
export function buildPaymentRequest({ firstName, racketName, balance, settings, lang }: PaymentRequestInput): string {
  const amount = formatMoney(balance, lang)
  const handle = settings.paypalHandle?.trim()
  const paypal = handle ? paypalLink(handle, balance) : ''
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
    if (paypal) lines.push(`• PayPal: ${paypal}`)
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
    if (paypal) lines.push(`• PayPal: ${paypal}`)
    if (iban) lines.push(`• Bank transfer: ${formatIban(iban)}${name ? `, ${name}` : ''}`)
    lines.push('• Cash: in person')
    lines.push('')
    lines.push('Thanks,')
    if (name) lines.push(name)
  }
  return lines.join('\n').trimEnd()
}
