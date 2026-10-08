import { describe, it, expect } from 'vitest';
import { describeItem } from './describe';
import { MAGIC_ITEMS } from './magicItems';
import { magicInfo } from './magicDescribe';

describe('describeItem', () => {
  it('describes a plain weapon with its dice, weight, prices and slot', () => {
    const d = describeItem('shortsword')!;
    expect(d.kindTh).toBe('อาวุธ');
    expect(d.stats).toEqual(['ลูกเต๋าดาเมจ 1d8']);
    expect(d.weight).toBe(2);
    expect(d.buyPrice).toBe(30);
    expect(d.sellPrice).toBe(15);
    expect(d.slotTh).toBe('อาวุธ');
    expect(d.magic).toBeNull();
  });

  it('describes armor reduction and potion heal', () => {
    expect(describeItem('armor_medium')!.stats).toEqual(['ลดดาเมจที่ได้รับ 2']);
    expect(describeItem('potion_minor')!.stats).toEqual(['ฟื้นฟู 1d6+1 HP']);
    expect(describeItem('potion_major')!.slotTh).toBeNull();
  });

  it('reuses magicInfo for magic items', () => {
    const weapon = MAGIC_ITEMS.find((i) => i.mechanic.kind === 'weapon')!;
    const d = describeItem(weapon.id)!;
    expect(d.magic).toEqual(magicInfo(weapon.id));
    expect(d.stats[0]).toMatch(/^ลูกเต๋าดาเมจ 1d\d+\+\d+$/);
    expect(d.stats).toContain(magicInfo(weapon.id)!.effectTh);
  });

  it('gives story items only a name, with no invented numbers', () => {
    const d = describeItem('story', 'Rusty Key')!;
    expect(d.nameTh).toBe('Rusty Key');
    expect(d.weight).toBeNull();
    expect(d.stats).toEqual([]);
    expect(d.buyPrice).toBeNull();
    expect(d.sellPrice).toBeNull();
  });

  it('returns null for an unknown id', () => {
    expect(describeItem('nope')).toBeNull();
    expect(describeItem('constructor')).toBeNull();
  });
});
