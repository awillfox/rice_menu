/** Where the customer eats. Exactly one is true on any given slip. */
export type ServeMode = 'dine-in' | 'takeaway';

export interface OrderItem {
	id: string;
	name: string;
	qty: number;
}

export interface Bill {
	id: string;
	shopName: string;
	customerName: string;
	mode: ServeMode;
	items: OrderItem[];
	/** Epoch milliseconds. Stamped when the JPEG is exported. */
	createdAt: number;
}

export const SERVE_MODE_LABEL: Record<ServeMode, string> = {
	'dine-in': 'ทานที่ร้าน',
	takeaway: 'กลับบ้าน'
};
