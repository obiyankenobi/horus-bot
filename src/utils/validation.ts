export function hasMoreThanTwoDecimals(amount: number | string): boolean {
    const s = amount.toString().replace(',', '');
    const parts = s.split('.');
    return parts.length > 1 && parts[1].length > 2;
}
