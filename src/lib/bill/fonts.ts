/**
 * Canvas fillText draws with whatever font is ALREADY loaded; it will not
 * trigger a webfont fetch and will not wait for one. This machine class often
 * has no Thai system font at all, so drawing before Sarabun is resident
 * produces tofu boxes. Every render path must await this first.
 */
const SAMPLE_TEXT = 'ทานที่ร้านกลับบ้านรายการชื่อ0123456789';

let readyPromise: Promise<void> | null = null;

async function loadFaces(): Promise<void> {
	if (typeof document === 'undefined' || !('fonts' in document)) return;
	await Promise.all([
		document.fonts.load(`400 40px 'Sarabun'`, SAMPLE_TEXT),
		document.fonts.load(`700 40px 'Sarabun'`, SAMPLE_TEXT)
	]);
	await document.fonts.ready;
}

/** Resolves once both Sarabun weights can be drawn. Safe to call repeatedly. */
export function ensureFontsReady(): Promise<void> {
	readyPromise ??= loadFaces();
	return readyPromise;
}

/** True when the browser confirms Sarabun can render Thai right now. */
export function fontsAreResident(): boolean {
	if (typeof document === 'undefined' || !('fonts' in document)) return false;
	return document.fonts.check(`400 40px 'Sarabun'`, SAMPLE_TEXT);
}
