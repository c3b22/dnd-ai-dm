import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyAdventures } from './MyAdventures';

describe('MyAdventures', () => {
  it('renders nothing when there are no custom adventures', () => {
    const { container } = render(<MyAdventures adventures={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('lists each adventure with an edit link', () => {
    render(<MyAdventures adventures={[{ id: 'c1', titleTh: 'เรื่องของฉัน', taglineTh: 'แท็กไลน์', thumbnailUrl: null }]} />);
    expect(screen.getByText('เรื่องของฉัน')).toBeTruthy();
    expect(screen.getByText('แก้ไข').closest('a')).toHaveAttribute('href', '/adventures/c1/edit');
  });
});
