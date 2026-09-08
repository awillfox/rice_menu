/**
 * Slip geometry. The output is a 100 x 150 mm JPEG at 300 DPI.
 *
 * 100 mm / 25.4 mm-per-inch * 300 dpi = 1181.10 -> 1181 px
 * 150 mm / 25.4 mm-per-inch * 300 dpi = 1771.65 -> 1772 px
 */
export const SLIP_MM_WIDTH = 100;
export const SLIP_MM_HEIGHT = 150;
export const SLIP_DPI = 300;

const MM_PER_INCH = 25.4;

export const CANVAS_W = Math.round((SLIP_MM_WIDTH / MM_PER_INCH) * SLIP_DPI);
export const CANVAS_H = Math.round((SLIP_MM_HEIGHT / MM_PER_INCH) * SLIP_DPI);

/** JPEG quality passed to canvas.toBlob. */
export const JPEG_QUALITY = 0.92;
