/**
 * 数字の日本語単位表示。1万未満はそのまま、以降 万・億・兆・京・垓…、無量大数を超えたら指数表記。
 */
const UNITS: Array<[number, string]> = [
  [1e68, '無量大数'],
  [1e64, '不可思議'],
  [1e60, '那由他'],
  [1e56, '阿僧祇'],
  [1e52, '恒河沙'],
  [1e48, '極'],
  [1e44, '載'],
  [1e40, '正'],
  [1e36, '澗'],
  [1e32, '溝'],
  [1e28, '穣'],
  [1e24, '𥝱'],
  [1e20, '垓'],
  [1e16, '京'],
  [1e12, '兆'],
  [1e8, '億'],
  [1e4, '万'],
];

export function formatNum(v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '-∞';
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a < 1e4) {
    // 小さい値は整数で（倍率など小数を見せたい箇所は呼び出し側で別処理）
    return sign + String(Math.floor(a));
  }
  if (a >= 1e72) {
    const exp = Math.floor(Math.log10(a));
    const mant = a / Math.pow(10, exp);
    return `${sign}${mant.toFixed(2)}e${exp}`;
  }
  for (const [u, name] of UNITS) {
    if (a >= u) {
      const x = a / u;
      let s: string;
      if (x < 100) s = (Math.floor(x * 10) / 10).toFixed(1).replace(/\.0$/, '');
      else s = String(Math.floor(x));
      return `${sign}${s}${name}`;
    }
  }
  return sign + String(Math.floor(a));
}

/** 桁数（表示サイズの演出に使う） */
export function magnitude(v: number): number {
  if (v <= 0 || !Number.isFinite(v)) return 0;
  return Math.floor(Math.log10(v));
}

export function formatPercent(r: number): string {
  return `${Math.round(r * 100)}%`;
}
