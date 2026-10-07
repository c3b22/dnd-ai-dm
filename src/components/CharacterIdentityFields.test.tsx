import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CharacterIdentityFields } from './CharacterIdentityFields';

const empty = { backstory: '', personality: '', goal: '' };

describe('CharacterIdentityFields', () => {
  it('renders three optional Thai-labelled fields capped at 500 characters', () => {
    render(<CharacterIdentityFields value={empty} onChange={() => {}} />);
    expect(screen.getByLabelText('ประวัติ (ไม่บังคับ)')).toHaveProperty('maxLength', 500);
    expect(screen.getByLabelText('บุคลิก (ไม่บังคับ)')).toBeTruthy();
    expect(screen.getByLabelText('เป้าหมาย (ไม่บังคับ)')).toBeTruthy();
  });

  it('reports the edited field merged with the others', () => {
    const onChange = vi.fn();
    render(<CharacterIdentityFields value={{ ...empty, goal: 'x' }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('ประวัติ (ไม่บังคับ)'), { target: { value: 'เด็กกำพร้า' } });
    expect(onChange).toHaveBeenCalledWith({ backstory: 'เด็กกำพร้า', personality: '', goal: 'x' });
  });
});
