export const currency_format = (digit: number | string | null | undefined, abbreviate: boolean = false, decimals: number = 2, defaultValue: any = '$0.00') => {
  if (digit === null || digit === undefined || digit === '') {
    return defaultValue;
  }
  const num = typeof digit === 'string' ? parseFloat(digit) : digit;
  if (isNaN(num) || num === 0) {
    return defaultValue;
  }

  if (abbreviate) {
    if (num >= 1000000) {
      return '$' + (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (num >= 1000) {
      return '$' + Math.round(num / 1000) + 'K';
    }
  }
  return '$' + num.toFixed(decimals).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
};
