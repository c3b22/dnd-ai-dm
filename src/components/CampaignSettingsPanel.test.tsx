import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignSettingsPanel } from './CampaignSettingsPanel';
import { DEFAULT_SETTINGS } from '@/lib/campaign/settings';

describe('CampaignSettingsPanel', () => {
  it('shows the current rules and only offers editing to the owner', () => {
    const { rerender } = render(
      <CampaignSettingsPanel settings={DEFAULT_SETTINGS} isOwner={false} onSave={async () => {}} />
    );
    expect(screen.getByText('5 นาที')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'แก้ไขการตั้งค่า' })).toBeNull();
    expect(screen.getByText(/เจ้าของโต๊ะเท่านั้น/)).toBeInTheDocument();

    rerender(<CampaignSettingsPanel settings={DEFAULT_SETTINGS} isOwner onSave={async () => {}} />);
    expect(screen.getByRole('button', { name: 'แก้ไขการตั้งค่า' })).toBeInTheDocument();
  });

  it('saves what the owner changed', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<CampaignSettingsPanel settings={DEFAULT_SETTINGS} isOwner onSave={onSave} />);

    await userEvent.click(screen.getByRole('button', { name: 'แก้ไขการตั้งค่า' }));
    await userEvent.selectOptions(screen.getByLabelText('เวลาต่อรอบ'), '60');
    await userEvent.selectOptions(screen.getByLabelText('ความยาก'), 'hard');
    await userEvent.click(screen.getByLabelText('ใช้ลูกเต๋า d20 ตัดสินผล'));
    await userEvent.click(screen.getByRole('button', { name: 'บันทึก' }));

    expect(onSave).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      roundSeconds: 60,
      difficulty: 'hard',
      diceEnabled: false,
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'แก้ไขการตั้งค่า' })).toBeInTheDocument());
  });

  it('keeps the form open and shows an error when saving fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('403'));
    render(<CampaignSettingsPanel settings={DEFAULT_SETTINGS} isOwner onSave={onSave} />);

    await userEvent.click(screen.getByRole('button', { name: 'แก้ไขการตั้งค่า' }));
    await userEvent.click(screen.getByRole('button', { name: 'บันทึก' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/บันทึกไม่สำเร็จ/);
    expect(screen.getByRole('button', { name: 'ยกเลิก' })).toBeInTheDocument();
  });
});
