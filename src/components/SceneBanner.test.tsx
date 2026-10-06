import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SceneBanner } from './SceneBanner';

vi.mock('@/lib/supabase/client', () => ({ supabaseBrowserClient: {} }));
vi.mock('@/lib/scenes/scenes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/scenes/scenes')>()),
  getSceneAsync: vi.fn().mockResolvedValue({ id: 'custom-1-opening', scope: 'custom-1', nameTh: 'เปิดเรื่อง', imageUrl: 'https://cdn/custom-1/opening.jpg' }),
}));

describe('SceneBanner', () => {
  it('shows the scene image with its Thai name and the adventure mood tint', () => {
    const { container } = render(<SceneBanner sceneId="tavern-interior" adventureId="sunken-bell-of-marrowmere" />);

    expect(container.querySelector('img')?.getAttribute('src')).toBe('/scenes/tavern-interior.jpg');
    expect(screen.getByText('โรงเตี๊ยม (ภายใน)')).toBeTruthy();
    expect(screen.getByTestId('scene-tint')).toBeTruthy();
  });

  it('falls back to a plain backdrop with the name when the image fails to load', () => {
    const { container } = render(<SceneBanner sceneId="crypt" adventureId={null} />);

    fireEvent.error(container.querySelector('img')!);

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('สุสานใต้ดิน')).toBeTruthy();
  });

  it('renders nothing for an unknown or missing scene', () => {
    const { container } = render(<SceneBanner sceneId={null} adventureId="sunken-bell-of-marrowmere" />);
    expect(container.firstChild).toBeNull();
  });
});

describe('SceneBanner place announcement', () => {
  it('announces a new place only when the scene changes, not on first load', () => {
    const { rerender } = render(<SceneBanner sceneId="crypt" adventureId={null} />);
    expect(screen.queryByTestId('scene-title')).toBeNull();

    rerender(<SceneBanner sceneId="throne-room" adventureId={null} />);
    expect(screen.getByTestId('scene-title').textContent).toContain('ท้องพระโรง');
  });
});

describe('SceneBanner with a custom adventure', () => {
  it('resolves and shows the uploaded scene image', async () => {
    const { container } = render(<SceneBanner sceneId="custom-1-opening" adventureId="custom-1" />);
    await waitFor(() => expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn/custom-1/opening.jpg'));
    expect(screen.getByText('เปิดเรื่อง')).toBeTruthy();
  });
});
