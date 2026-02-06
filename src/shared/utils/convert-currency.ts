/**
 * Converts an amount from a source currency subunit to a target currency subunit, generically.
 *
 * @param amountInSourceSubunit - Amount in source currency's subunit (e.g., paise)
 * @param fxRate - Exchange rate from source major to target major currency.
 * @param sourceSubunitToMajor - (Optional) Conversion factor source subunit→major. Default: 100
 * @param targetMajorToSubunit - (Optional) Conversion factor target major→subunit. Default: 100
 * @returns Amount in the target currency's subunit (integer, rounded)
 */
export function normalizeAndConvertCurrency(
  amountInSourceSubunit: number,
  fxRate: number,
  sourceSubunitToMajor: number = 100,
  targetMajorToSubunit: number = 100,
): number {
  if (
    typeof amountInSourceSubunit !== 'number' ||
    typeof fxRate !== 'number' ||
    amountInSourceSubunit < 0 ||
    fxRate <= 0 ||
    sourceSubunitToMajor <= 0 ||
    targetMajorToSubunit <= 0
  ) {
    throw new Error(
      'Invalid arguments: amounts and conversion factors must be positive numbers.',
    );
  }
  // Convert source subunit to its major currency unit
  const sourceMajor = amountInSourceSubunit / sourceSubunitToMajor;
  // Apply exchange rate
  const targetMajor = sourceMajor * fxRate;
  // Convert to target currency subunit (cents, etc.)
  const targetSubunit = Math.round(targetMajor * targetMajorToSubunit);
  return targetSubunit;
}
