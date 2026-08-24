import { createElement } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDialogBehavior } from '../app/editor/hooks/use-dialog-behavior';

function DialogHarness({ open = true, dismissible = true, onClose }: { open?: boolean; dismissible?: boolean; onClose: () => void }) {
  const ref = useDialogBehavior(open, onClose, dismissible);
  if (!open) return null;
  return createElement('section', { ref, tabIndex: -1, role: 'dialog', 'aria-label': '테스트 대화상자' }, createElement('button', { type: 'button' }, '확인'));
}

describe('dialog keyboard behavior', () => {
  it('closes an available dialog with Escape', () => {
    const onClose = vi.fn();
    render(createElement(DialogHarness, { onClose }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close a busy dialog with Escape', () => {
    const onClose = vi.fn();
    render(createElement(DialogHarness, { dismissible: false, onClose }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
