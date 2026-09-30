import { STARTING_WEAPON_IDS, diceLabel, weaponFor } from '@/lib/character/constants';

export interface WeaponPickerProps {
  value: string;
  onChange: (weaponId: string) => void;
}

export function WeaponPicker({ value, onChange }: WeaponPickerProps) {
  return (
    <fieldset className="wp-list">
      <legend className="lede">อาวุธเริ่มต้น (ทุกคนเริ่มที่ 20 HP)</legend>
      {STARTING_WEAPON_IDS.map((id) => {
        const weapon = weaponFor(id);
        return (
          <button
            type="button"
            key={id}
            className="adv wp-item"
            aria-pressed={value === id}
            onClick={() => onChange(id)}
          >
            <span className="t">{weapon.nameTh}</span>
            <span className="d">ดาเมจ {diceLabel(weapon.dice)}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
