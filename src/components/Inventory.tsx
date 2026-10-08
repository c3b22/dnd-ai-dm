import { useState } from 'react';
import { catalogEntry } from '@/lib/inventory/catalog';
import { magicInfo, setStatusTh } from '@/lib/inventory/magicDescribe';
import { carryCapacityOf, itemLabel, weightOf } from '@/lib/inventory/rules';
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
  /** M1: names of the live enemies in the current encounter. Empty/undefined = no fight, so scrolls get no button. */
  enemies?: string[];
  /** M1: read a scroll at the chosen enemy (sent as the action's item_target). */
  onUseScroll?: (itemId: string, enemy: string) => void;
}

function ScrollUse({ label, itemId, enemies, disabled, onUse }: {
  label: string; itemId: string; enemies: string[]; disabled: boolean; onUse: (itemId: string, enemy: string) => void;
}) {
  const [picked, setPicked] = useState('');
  const target = enemies.includes(picked) ? picked : enemies[0];
  return (
    <>
      <select aria-label={`เป้าหมายของ ${label}`} value={target} onChange={(e) => setPicked(e.target.value)}>
        {enemies.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>
      <button type="button" className="qa" aria-label={`ใช้ม้วน ${label}`} disabled={disabled} onClick={() => onUse(itemId, target)}>
        ใช้ม้วน
      </button>
    </>
  );
}

const KIND_ORDER: Record<string, number> = { weapon: 0, armor: 1, accessory: 2, consumable: 3 };
const rank = (item: InventoryItem) => KIND_ORDER[catalogEntry(item.itemId)?.kind ?? ''] ?? 4;

export function Inventory({ items: unsorted, gold, canAct, fullHp, onEquip, onDrink, enemies, onUseScroll }: InventoryProps) {
  // The database returns rows in no particular order, so the list would jump around after every change.
  const items = [...unsorted].sort(
    (a, b) => rank(a) - rank(b) || Number(b.equipped) - Number(a.equipped) || itemLabel(a).localeCompare(itemLabel(b))
  );
  const worn = items.filter((i) => i.equipped);
  const weight = weightOf(items);
  const capacity = carryCapacityOf(items);
  return (
    <section className="card" aria-label="กระเป๋า">
      <h3>กระเป๋า</h3>
      <div className="inv-weight">
        <div className="hp-track" aria-hidden="true">
          <i className="hp-fill" style={{ width: `${Math.min(100, (weight / capacity) * 100)}%` }} />
        </div>
        <span className="hp-num">น้ำหนัก {weight}/{capacity}</span>
      </div>
      <p className="inv-gold">ทอง {gold}</p>
      {items.length === 0 ? (
        <p className="status">กระเป๋าว่าง</p>
      ) : (
        <ul className="inv-list">
          {items.map((item) => {
            const label = itemLabel(item);
            const kind = catalogEntry(item.itemId)?.kind;
            const magic = magicInfo(item.itemId);
            return (
              <li key={`${item.itemId}|${item.customName}`} className="inv-row">
                <span className="inv-name">
                  {label}
                  {item.quantity > 1 ? ` ×${item.quantity}` : ''}
                  {item.equipped && <b className="badge-worn">สวมอยู่</b>}
                  {magic && <b className={`badge-rarity rarity-${magic.rarity}`}>{magic.rarityTh}</b>}
                  {magic?.theme && <b className="badge-theme">ธีม{magic.theme}</b>}
                  {magic && (
                    <span className="inv-effect">
                      {magic.effectTh}
                      {magic.specialTh && <small className="inv-special">{magic.specialTh}</small>}
                      {magic.theme && item.equipped && <small className="inv-set">{setStatusTh(magic.theme, worn)}</small>}
                      <small>{magic.flavorTh}</small>
                    </span>
                  )}
                </span>
                {(kind === 'weapon' || kind === 'armor' || kind === 'accessory') && (
                  <button
                    type="button"
                    className="qa"
                    aria-label={`${item.equipped ? 'ถอด' : 'สวม'} ${label}`}
                    onClick={() => onEquip(item.itemId, item.equipped ? 'unequip' : 'equip')}
                  >
                    {item.equipped ? 'ถอด' : 'สวม'}
                  </button>
                )}
                {kind === 'scroll' && onUseScroll && enemies && enemies.length > 0 && (
                  <ScrollUse label={label} itemId={item.itemId} enemies={enemies} disabled={!canAct} onUse={onUseScroll} />
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
