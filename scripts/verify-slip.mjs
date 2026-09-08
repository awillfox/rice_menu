/**
 * End-to-end check of the exported slip: drives the real built app in Chromium,
 * exports a JPEG, and asserts the things that are easy to claim but hard to know.
 *
 *   node scripts/verify-slip.mjs [baseUrl]
 */
import { chromium } from 'playwright-core';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const OUT = 'verify-out';

async function findChromium() {
	if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
	const root = join(homedir(), '.cache', 'ms-playwright');
	if (!existsSync(root)) throw new Error(`no playwright cache at ${root}`);
	for (const dir of (await readdir(root))
		.filter((d) => d.startsWith('chromium'))
		.sort()
		.reverse()) {
		for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
			const p = join(root, dir, rel);
			if (existsSync(p)) return p;
		}
	}
	throw new Error('no chromium binary found');
}

/** Read width/height from a JPEG's SOFn marker rather than trusting the app. */
function jpegSize(buf) {
	if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG (missing SOI)');
	let i = 2;
	while (i < buf.length) {
		if (buf[i] !== 0xff) {
			i++;
			continue;
		}
		const marker = buf[i + 1];
		// SOF0..SOF15, excluding DHT(c4), JPGA(c8), DAC(cc)
		if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
			return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
		}
		i += 2 + buf.readUInt16BE(i + 2);
	}
	throw new Error('no SOF marker in JPEG');
}

const checks = [];
const check = (name, pass, detail) => {
	checks.push({ name, pass, detail });
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ->  ${detail}` : ''}`);
};

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: await findChromium() });
const page = await browser.newPage({
	viewport: { width: 1280, height: 1000 },
	acceptDownloads: true
});

const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(String(e)));

await page.goto(BASE, { waitUntil: 'networkidle' });

// --- Sarabun actually resident? Without it Thai draws as tofu boxes. ---
const fontOk = await page.evaluate(
	() =>
		document.fonts.check(`400 40px 'Sarabun'`, 'ทานที่ร้าน') &&
		document.fonts.check(`700 40px 'Sarabun'`, 'กลับบ้าน')
);
check('Sarabun resident for Thai (400 + 700)', fontOk);

// --- Fill a realistic order ---
await page.getByPlaceholder('ชื่อร้านของคุณ').fill('ร้านข้าวมันไก่ป้านิด');
await page.getByPlaceholder('เช่น คุณสมชาย').fill('คุณสมชาย ใจดี');
await page.getByRole('button', { name: 'กลับบ้าน' }).click();

const ORDER = [
	['ข้าวมันไก่ต้ม', 2],
	['ข้าวขาหมูพิเศษ', 1],
	['ผัดกะเพราไก่ไข่ดาว', 3],
	['ต้มยำกุ้งน้ำข้น', 1]
];
for (const [i, [name, qty]] of ORDER.entries()) {
	if (i > 0) await page.getByRole('button', { name: '+ เพิ่มรายการ' }).click();
	await page.locator('[data-item-input]').nth(i).fill(name);
	for (let q = 1; q < qty; q++)
		await page.getByRole('button', { name: `เพิ่มจำนวน ${name}` }).click();
}

const modePressed = await page
	.getByRole('button', { name: 'กลับบ้าน' })
	.getAttribute('aria-pressed');
check(
	'takeaway toggle is exclusive',
	modePressed === 'true' &&
		(await page.getByRole('button', { name: 'ทานที่ร้าน' }).getAttribute('aria-pressed')) ===
			'false'
);

await page.screenshot({ path: `${OUT}/app-desktop.png`, fullPage: true });

// --- Export ---
const [download] = await Promise.all([
	page.waitForEvent('download'),
	page.getByRole('button', { name: 'บันทึกเป็น JPG' }).click()
]);
const jpgPath = `${OUT}/${download.suggestedFilename()}`;
await download.saveAs(jpgPath);

const buf = await readFile(jpgPath);
const { width, height } = jpegSize(buf);
check(
	'JPEG is exactly 1181 x 1772 px (100 x 150 mm @ 300 dpi)',
	width === 1181 && height === 1772,
	`${width} x ${height}`
);
check(
	'filename carries customer + timestamp',
	/^bill-.+-\d{8}-\d{4}\.jpg$/.test(download.suggestedFilename()),
	download.suggestedFilename()
);
check(
	'file size is sane',
	buf.length > 20_000 && buf.length < 3_000_000,
	`${(buf.length / 1024).toFixed(0)} KB`
);

// --- Corner pixels must be white paper, not black (JPEG has no alpha) ---
const corners = await page.evaluate(() => {
	const c = document.querySelector('canvas');
	const ctx = c.getContext('2d');
	const at = (x, y) =>
		Array.from(ctx.getImageData(x, y, 1, 1).data)
			.slice(0, 3)
			.join(',');
	return { tl: at(2, 2), br: at(c.width - 3, c.height - 3) };
});
check(
	'slip background is white paper',
	corners.tl === '255,255,255' && corners.br === '255,255,255',
	JSON.stringify(corners)
);

// --- History persisted, survives reload ---
check('bill saved to history', (await page.locator('text=ใบที่บันทึกไว้').count()) === 1);
await page.reload({ waitUntil: 'networkidle' });
check('history survives reload', (await page.locator('text=ใบที่บันทึกไว้').count()) === 1);
check(
	'shop name remembered',
	(await page.getByPlaceholder('ชื่อร้านของคุณ').inputValue()) === 'ร้านข้าวมันไก่ป้านิด'
);

// --- Overflow: 30 items cannot fit; the app must SAY so, not silently drop ---
await page.getByPlaceholder('เช่น คุณสมชาย').fill('ทดสอบรายการยาว');
for (let i = 0; i < 30; i++) {
	if (i > 0) await page.getByRole('button', { name: '+ เพิ่มรายการ' }).click();
	await page
		.locator('[data-item-input]')
		.nth(i)
		.fill(`รายการทดสอบที่ ${i + 1} ข้าวผัดหมูใส่ไข่`);
}
await page.waitForTimeout(300);
const warned = await page.getByRole('alert').count();
check(
	'overflow is reported to the user',
	warned === 1,
	warned ? await page.getByRole('alert').innerText() : 'no alert'
);
await page.screenshot({ path: `${OUT}/app-overflow.png`, fullPage: true });

// --- Mobile ---
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(200);
const overflowX = await page.evaluate(
	() => document.documentElement.scrollWidth - document.documentElement.clientWidth
);
check('no horizontal scroll at 390px', overflowX <= 0, `overflow ${overflowX}px`);
await page.screenshot({ path: `${OUT}/app-mobile.png`, fullPage: true });

check('no console/page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

await browser.close();

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
await writeFile(`${OUT}/report.json`, JSON.stringify(checks, null, 2));
process.exit(failed.length ? 1 : 0);
