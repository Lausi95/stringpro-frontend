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
  /**
   * Wrap each method label in WhatsApp bold syntax (`*PayPal:*`). Renders bold
   * in WhatsApp; shows literal asterisks elsewhere. Off → plain labels.
   */
  whatsapp?: boolean
}

/**
 * Build the plain-text Payment Request a Stringer shares with a Customer.
 * Per-Job: states that Job's Balance and how to pay. Never persisted.
 */
export function buildPaymentRequest({ firstName, racketName, balance, settings, lang, whatsapp = false }: PaymentRequestInput): string {
  const amount = formatMoney(balance, lang)
  const handle = settings.paypalHandle?.trim()
  const paypal = handle ? paypalLink(handle, balance) : ''
  const name = settings.fullName?.trim()
  const iban = settings.iban?.trim()
  const first = firstName.trim()
  const racket = racketName.trim()

  // Method labels can be bolded for WhatsApp; the intro line stays plain so the
  // labels remain the scannable structure.
  const label = (t: string) => (whatsapp ? `*${t}*` : t)
  const copy =
    lang === 'de'
      ? { intro: 'So kannst du zahlen:', cash: 'Bar', cashValue: 'vor Ort', thanks: 'Danke,' }
      : { intro: 'You can pay via:', cash: 'Cash', cashValue: 'in person', thanks: 'Thanks,' }

  // Each pay method is a labeled block (label line + value line(s)); blocks are
  // separated by a blank line so a single value (e.g. the IBAN) is easy to grab.
  const blocks: string[][] = []
  if (paypal) blocks.push([label('PayPal:'), paypal])
  if (iban) blocks.push([label('IBAN:'), formatIban(iban), ...(name ? [name] : [])])
  blocks.push([label(`${copy.cash}:`), copy.cashValue])

  const lines: string[] = []
  if (lang === 'de') {
    lines.push(`Hallo${first ? ` ${first}` : ''},`)
    lines.push(`der offene Betrag fürs Bespannen ${racket ? `deines ${racket}` : 'deines Schlägers'} beträgt ${amount}.`)
  } else {
    lines.push(`Hi${first ? ` ${first}` : ''},`)
    lines.push(`The balance for stringing ${racket ? `your ${racket}` : 'your racket'} is ${amount}.`)
  }
  lines.push('', copy.intro)
  for (const block of blocks) lines.push('', ...block)
  lines.push('', copy.thanks)
  if (name) lines.push(name)

  return lines.join('\n').trimEnd()
}
