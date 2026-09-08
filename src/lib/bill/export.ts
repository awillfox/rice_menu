import { JPEG_QUALITY } from './constants';
import type { Bill } from './types';

/** canvas.toBlob is callback-based and can hand back null; surface that. */
export function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = JPEG_QUALITY): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
			'image/jpeg',
			quality
		);
	});
}

function pad(n: number): string {
	return String(n).padStart(2, '0');
}

/** e.g. bill-สมชาย-20260908-1432.jpg */
export function billFilename(bill: Bill): string {
	const d = new Date(bill.createdAt);
	const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
	// Strip path separators and characters Windows rejects in filenames.
	const who = bill.customerName
		.replace(/[\\/:*?"<>|]/g, '')
		.trim()
		.slice(0, 40);
	return who ? `bill-${who}-${stamp}.jpg` : `bill-${stamp}.jpg`;
}

export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	// Revoke on the next frame; revoking synchronously can cancel the download.
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
