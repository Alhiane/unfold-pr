// New file: class methods, arrow-function consts, callbacks passed by name.
const TAX_RATE = 0.21;

const round2 = (n: number): number => Math.round(n * 100) / 100;

function lineTotal(item: { price: number; qty: number }): number {
  return item.price * item.qty;
}

export class Cart {
  private items: { price: number; qty: number }[] = [];

  add(price: number, qty = 1): void {
    this.items.push({ price, qty });
  }

  subtotal(): number {
    return round2(this.items.map(lineTotal).reduce((a, b) => a + b, 0));
  }

  total(): number {
    return round2(this.subtotal() * (1 + TAX_RATE));
  }
}
