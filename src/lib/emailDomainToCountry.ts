const TLD_TO_COUNTRY: Record<string, string> = {
  // Asia Pacific
  jp: 'JP', tw: 'TW', kr: 'KR', cn: 'CN', hk: 'HK',
  sg: 'SG', au: 'AU', nz: 'NZ', in: 'IN', th: 'TH',
  my: 'MY', id: 'ID', ph: 'PH', vn: 'VN',
  // Europe
  de: 'DE', fr: 'FR', uk: 'GB', it: 'IT', es: 'ES',
  nl: 'NL', ch: 'CH', se: 'SE', no: 'NO', dk: 'DK',
  fi: 'FI', pl: 'PL', at: 'AT', be: 'BE', pt: 'PT',
  cz: 'CZ', hu: 'HU', ro: 'RO', gr: 'GR', ru: 'RU', ua: 'UA',
  // Americas
  ca: 'CA', mx: 'MX', br: 'BR', ar: 'AR', cl: 'CL', co: 'CO',
  // Middle East / Africa
  il: 'IL', ae: 'AE', sa: 'SA', tr: 'TR', eg: 'EG', za: 'ZA',
}

const CHINESE_COUNTRIES = new Set(['TW', 'CN', 'HK', 'SG', 'MO'])
const JAPANESE_COUNTRIES = new Set(['JP'])
const KOREAN_COUNTRIES = new Set(['KR'])

// Infer ISO 3166-1 alpha-2 country code from email domain TLD.
// Returns null for generic TLDs (.com, .org, .io, etc.) where country
// cannot be determined from the domain alone.
export function tldToCountryCode(email: string): string | null {
  const domain = email.split('@')[1]
  if (!domain) return null
  const parts = domain.toLowerCase().split('.')
  const tld = parts[parts.length - 1]
  return TLD_TO_COUNTRY[tld] ?? null
}

export function countryCodeToLanguage(countryCode: string | null): string {
  if (!countryCode) return 'english'
  if (CHINESE_COUNTRIES.has(countryCode)) return 'chinese'
  if (JAPANESE_COUNTRIES.has(countryCode)) return 'japanese'
  if (KOREAN_COUNTRIES.has(countryCode)) return 'korean'
  return 'english'
}
