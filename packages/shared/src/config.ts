/** Change cafe identity here; both applications consume this configuration. */
export const cafeConfig = {
  name: 'Kape Alon',
  tagline: 'Coffee, brunch & a little breathing room.',
  currency: 'PHP',
  locale: 'en-PH',
  timezone: 'Asia/Manila',
  demoTable: 5,
  kitchenWarningMinutes: 15,
} as const;

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat(cafeConfig.locale, {
    style: 'currency',
    currency: cafeConfig.currency,
  }).format(cents / 100);
}
