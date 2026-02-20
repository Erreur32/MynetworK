/**
 * Decode HTML entities for proper French accents and quotes.
 * Used when displaying changelog from blog (e.g. &rsquo; → ')
 */
export function decodeHtmlEntities(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&agrave;/g, 'à')
    .replace(/&eacute;/g, 'é')
    .replace(/&egrave;/g, 'è')
    .replace(/&ecirc;/g, 'ê')
    .replace(/&ccedil;/g, 'ç')
    .replace(/&icirc;/g, 'î')
    .replace(/&ucirc;/g, 'û')
    .replace(/&ocirc;/g, 'ô')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}
