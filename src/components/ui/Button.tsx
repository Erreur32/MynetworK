import React from 'react';
import { LucideIcon } from 'lucide-react';

interface ButtonProps {
  children?: React.ReactNode;
  icon?: LucideIcon;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger' | 'ghost' | 'secondary';
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  icon: Icon,
  onClick,
  variant = 'default',
  size = 'sm',
  disabled = false,
  className = '',
  type = 'button'
}) => {
  const baseClasses = 'flex items-center gap-1.5 rounded-lg border transition-colors font-medium';

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm'
  };

  const variantClasses = {
    default: 'btn-theme',
    primary: 'bg-accent-primary border-accent-primary text-white hover:bg-accent-primary-hover',
    secondary: 'btn-theme',
    danger: 'btn-theme hover:bg-accent-error/20 hover:text-accent-error',
    ghost: 'bg-transparent border-transparent text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary'
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`
        ${baseClasses}
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
    >
      {Icon && <Icon size={size === 'sm' ? 12 : 16} />}
      {children}
    </button>
  );
};

interface ActionButtonProps {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
}

export const ActionButton: React.FC<ActionButtonProps> = ({ label, icon: Icon, onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-1.5 text-xs btn-theme px-2.5 py-1.5 rounded-lg transition-colors"
  >
    <Icon size={12} />
    {label}
  </button>
);