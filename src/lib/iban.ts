/**
 * Lightweight IBAN validation (ISO 13616): structural check plus the mod-97
 * checksum. Does not enforce per-country length tables — only the universal
 * 15–34 character bound and a remainder of 1.
 */
export function isValidIban(raw: string): boolean {
  const iban = raw.replace(/\s+/g, '').toUpperCase()

  // 2 country letters + 2 check digits + up to 30 alphanumerics; 15–34 total.
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false

  // Move the first four chars to the end, then map letters to numbers (A=10…Z=35).
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55))

  // Piecewise mod-97 to avoid BigInt / overflow on the long numeric string.
  let remainder = 0
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}
