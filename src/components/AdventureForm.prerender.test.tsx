import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// /adventures/new is statically prerendered; at `next build` time the Supabase keys may be
// absent and creating the client would throw. Simulate that: loading the client module fails.
const { clientModuleLoaded } = vi.hoisted(() => ({ clientModuleLoaded: vi.fn() }));
vi.mock('@/lib/supabase/client', () => {
  clientModuleLoaded();
  throw new Error('supabase client must not be created at module scope');
});

import { AdventureForm } from './AdventureForm';

describe('AdventureForm — static prerender safety', () => {
  it('imports and renders without loading the Supabase client', () => {
    render(<AdventureForm />);
    expect(screen.getByText('สร้างเนื้อเรื่อง')).toBeTruthy();
    expect(clientModuleLoaded).not.toHaveBeenCalled();
  });
});
