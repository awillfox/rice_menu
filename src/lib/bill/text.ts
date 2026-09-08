/**
 * Line breaking for mixed Thai/Latin text on a canvas.
 *
 * Thai is written without spaces between words, so the usual "split on
 * whitespace" wrapper produces one unbreakable blob. Two mechanisms handle it:
 *
 *   1. Intl.Segmenter('th', {granularity:'word'}) - ICU's dictionary-based Thai
 *      word segmentation, which yields real break opportunities.
 *   2. Grapheme segmentation as the fallback and as the last resort for a
 *      single word wider than the line. Splitting on bare code points would
 *      detach Thai vowel/tone marks (U+0E31, U+0E34-0E3A, U+0E47-0E4E) from
 *      their base consonant and render them as orphaned marks.
 */

type SegmenterOrNull = Intl.Segmenter | null;

let wordSegmenter: SegmenterOrNull | undefined;
let graphemeSegmenter: SegmenterOrNull | undefined;

function getSegmenter(granularity: 'word' | 'grapheme'): SegmenterOrNull {
	const cached = granularity === 'word' ? wordSegmenter : graphemeSegmenter;
	if (cached !== undefined) return cached;

	let made: SegmenterOrNull = null;
	try {
		if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
			made = new Intl.Segmenter('th', { granularity });
		}
	} catch {
		made = null;
	}

	if (granularity === 'word') wordSegmenter = made;
	else graphemeSegmenter = made;
	return made;
}

/** Break opportunities: Thai words when ICU is available, else graphemes. */
function wordPieces(text: string): string[] {
	const seg = getSegmenter('word');
	if (seg) return Array.from(seg.segment(text), (s) => s.segment);
	return graphemes(text);
}

/** Grapheme clusters, so combining marks stay attached to their base. */
export function graphemes(text: string): string[] {
	const seg = getSegmenter('grapheme');
	if (seg) return Array.from(seg.segment(text), (s) => s.segment);
	return Array.from(text);
}

/**
 * Greedily wrap `text` to `maxWidth`, measured with the context's CURRENT font.
 * Always returns at least one entry so callers can index [0] safely.
 */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
	const lines: string[] = [];
	let current = '';

	const flush = () => {
		if (current !== '') {
			lines.push(current);
			current = '';
		}
	};

	for (const piece of wordPieces(text)) {
		if (piece === '\n') {
			flush();
			continue;
		}
		// Never start a wrapped line with the space that caused the break.
		if (current === '' && piece.trim() === '') continue;

		if (ctx.measureText(current + piece).width <= maxWidth) {
			current += piece;
			continue;
		}

		if (current !== '') {
			flush();
			if (piece.trim() === '') continue;
			if (ctx.measureText(piece).width <= maxWidth) {
				current = piece;
				continue;
			}
		}

		// A single piece is wider than the whole line: break it by grapheme.
		for (const g of graphemes(piece)) {
			if (current !== '' && ctx.measureText(current + g).width > maxWidth) flush();
			current += g;
		}
	}

	flush();
	return lines.length > 0 ? lines : [''];
}
