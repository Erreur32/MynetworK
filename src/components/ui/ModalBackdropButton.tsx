import React from 'react';

/**
 * Invisible full-size button behind a modal's content that closes it on click.
 * A real button instead of an onClick on the backdrop div, so there's no non-interactive
 * element with a click handler. Render it as the first child of the fixed backdrop and give
 * the content `relative` so it stacks above; clicks on the content never reach this button.
 * Out of the tab order (tabIndex -1): the modal's own close button covers keyboard users.
 */
export const ModalBackdropButton: React.FC<{ onClose: () => void; label: string }> = ({ onClose, label }) => (
    <button
        type="button"
        tabIndex={-1}
        aria-label={label}
        className="absolute inset-0 w-full h-full cursor-default"
        onClick={onClose}
    />
);
