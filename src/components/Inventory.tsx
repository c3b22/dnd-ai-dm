import { CARRY_CAPACITY, catalogEntry } from '@/lib/inventory/catalog';
import { itemLabel, weightOf } from '@/lib/inventory/rules';
import type { InventoryItem } from '@/lib/inventory/types';

export interface InventoryProps {
  items: InventoryItem[];
  gold: number;
  /** False when downed or already acted this round: drinking takes the action. Equipping is always free. */
  canAct: boolean;
  /** True at max HP: drinking would heal nothing, so the potion is not offered to waste. */
  fullHp?: boolean;
  onEquip: (itemId: string, action: 'equip' | 'unequip') => void;
  onDrink: (itemId: string) => void;
}

const KIND_ORDER: Record<string, number> = { weapon: 0, armor: 1, consumable: 2 };
const rank = (item: InventoryItem) => KIND_ORDER[catalogEntry(item.itemId)?.kind ?? ''] ?? 3;

export function Inventory({ items: unsorted, gold, canAct, fullHp, onEquip, onDrink }: InventoryProps) {
  // The database returns rows in no particular order, so the list would jump around after every change.
  const items = [...unsorted].sort(
    (a, b) => rank(a) - rank(b) || Number(b.equipped) - Number(a.equipped) || itemLabel(a).localeCompare(itemLabel(b))
  );
  const weight = weightOf(items);
  return (
    <section className="card" aria-label="กระเป๋า">
      <h3>กระเป๋า</h3>
      <div className="inv-weight">
        <div className="hp-track" aria-hidden="true">
          <i className="hp-fill" style={{ width: `${Math.min(100, (weight / CARRY_CAPACITY) * 100)}%` }} />
        </div>
        <span className="hp-num">น้ำหนัก {weight}/{CARRY_CAPACITY}</span>
      </div>
      <p className="inv-gold">ทอง {gold}</p>
      {items.length === 0 ? (
        <p className="status">กระเป๋าว่าง</p>
      ) : (
        <ul className="inv-list">
          {items.map((item) => {
            const label = itemLabel(item);
            const kind = catalogEntry(item.itemId)?.kind;
            return (
              <li key={`${item.itemId}|${item.customName}`} className="inv-row">
                <span className="inv-name">
                  {label}
                  {item.quantity > 1 ? ` ×${item.quantity}` : ''}
                  {item.equipped && <b className="badge-worn">สวมอยู่</b>}
                </span>
                {(kind === 'weapon' || kind === 'armor') && (
                  <button
                    type="button"
                    className="qa"
                    aria-label={`${item.equipped ? 'ถอด' : 'สวม'} ${label}`}
                    onClick={() => onEquip(item.itemId, item.equipped ? 'unequip' : 'equip')}
                  >
                    {item.equipped ? 'ถอด' : 'สวม'}
                  </button>
                )}
                {kind === 'consumable' && (
                  <button
                    type="button"
                    className="qa"
                    aria-label={`ดื่ม ${label}`}
                    disabled={!canAct || fullHp}
                    title={fullHp ? 'เลือดเต็มแล้ว' : undefined}
                    onClick={() => onDrink(item.itemId)}
                  >
                    ดื่ม
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
