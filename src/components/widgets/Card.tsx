import React from 'react';

interface CardProps {
  title: string | React.ReactNode;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
  headerColor?: string;
  onTitleClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  title,
  children,
  className = '',
  actions,
  headerColor = 'text-theme-primary',
  onTitleClick
}) => {
  const hasHeader = title || actions;
  
  return (
    <div className={`bg-theme-card rounded-xl border border-theme p-4 sm:p-5 flex flex-col ${className}`} style={{ backdropFilter: 'var(--backdrop-blur)' }}>
      {hasHeader && (
        <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
          {onTitleClick ? (
            <h3
              className={`font-semibold text-base sm:text-lg theme-card-title cursor-pointer hover:opacity-80 transition-colors`}
              onClick={onTitleClick}
            >
              {title}
            </h3>
          ) : (
            title && <h3 className={`font-semibold text-base sm:text-lg theme-card-title`}>{title}</h3>
          )}
          {actions && <div>{actions}</div>}
        </div>
      )}
      <div className="flex-1 overflow-hidden flex flex-col">{children}</div>
    </div>
  );
};