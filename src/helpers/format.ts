export const currency_format = (digit: number | null | undefined, abbreviate: boolean = false, decimals: number = 2, defaultValue: any = '$0.00') => {
  if (!digit && digit !== 0) {
    return defaultValue;
  }
  if (digit === 0) {
    return defaultValue;
  }

  if (abbreviate) {
    if (digit >= 1000000) {
      return '$' + (digit / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (digit >= 1000) {
      return '$' + Math.round(digit / 1000) + 'K';
    }
  }
  return '$' + digit.toFixed(decimals).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
};
