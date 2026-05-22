const entities: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#039;': "'",
  '&apos;': "'",
  '&ndash;': '–',
  '&mdash;': '—',
  '&laquo;': '«',
  '&raquo;': '»',
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&lsquo;': '‘',
  '&rsquo;': '’',
  '&hellip;': '…',
  '&deg;': '°',
  '&times;': '×',
  '&divide;': '÷',
  '&frac12;': '½',
  '&frac14;': '¼',
  '&frac34;': '¾',
  '&copy;': '©',
  '&reg;': '®',
  '&trade;': '™',
  '&euro;': '€',
  '&pound;': '£',
  '&yen;': '¥',
  '&cent;': '¢',
  '&alpha;': 'α',
  '&beta;': 'β',
  '&gamma;': 'γ',
  '&delta;': 'δ',
  '&pi;': 'π',
};

export function decodeHtml(html: string): string {
  let result = html.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
    String.fromCodePoint(parseInt(hex, 16)),
  );
  result = result.replace(/&#(\d+);/g, (_, dec: string) =>
    String.fromCodePoint(parseInt(dec, 10)),
  );
  result = result.replace(/&[a-z]+;/gi, (match) => entities[match] ?? match);
  return result;
}
