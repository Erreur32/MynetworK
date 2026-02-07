/**
 * UserMenu Component
 * 
 * Displays user avatar/badge with dropdown menu containing:
 * - User information (username, email, role)
 * - Settings option
 * - Administration option (admin only)
 * - Logout option
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Settings, LogOut, Shield, ChevronDown, User, Users } from 'lucide-react';

interface User {
    username: string;
    email?: string;
    role: 'admin' | 'user' | 'viewer';
    avatar?: string;
}

interface UserMenuProps {
    user?: User | null;
    onSettingsClick?: () => void;
    onAdminClick?: () => void;
    onProfileClick?: () => void;
    onUsersClick?: () => void;
    onLogout?: () => void;
}

export const UserMenu: React.FC<UserMenuProps> = ({
    user,
    onSettingsClick,
    onAdminClick,
    onProfileClick,
    onUsersClick,
    onLogout
}) => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Debug: log user to console (disabled to reduce console spam)
    // React.useEffect(() => {
    //     if (user) {
    //         console.log('[UserMenu] User received:', user);
    //     } else {
    //         console.log('[UserMenu] No user provided');
    //     }
    // }, [user]);

    // Calculate menu position when opened
    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setMenuPosition({
                top: rect.bottom + 8,
                left: rect.right - 256 // 256px = w-64 (width of menu)
            });
        } else {
            setMenuPosition(null);
        }
    }, [isOpen]);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    if (!user || !user.username) {
        return null;
    }

    // Get user initials for avatar
    const getInitials = (username: string): string => {
        if (!username) return 'U';
        return username
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2) || 'U';
    };

    const initials = getInitials(user.username);

    return (
        <>
            {/* Avatar Button */}
            <div className="relative">
                <button
                    ref={buttonRef}
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(!isOpen);
                    }}
                    className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] hover:bg-[#252525] border border-gray-700 rounded-lg transition-colors"
                >
                    {user.avatar ? (
                        <img 
                            src={user.avatar} 
                            alt={user.username}
                            className="w-10 h-10 rounded-full object-cover border-2 border-gray-600"
                        />
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-base">
                            {initials}
                        </div>
                    )}
                    <ChevronDown 
                        size={16} 
                        className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                </button>
            </div>

            {/* Dropdown Menu - Rendered in portal to avoid overflow issues */}
            {isOpen && menuPosition && createPortal(
                <div 
                    ref={menuRef}
                    className="fixed w-64 bg-[#1a1a1a] border border-gray-700 rounded-lg shadow-xl z-[9999] overflow-hidden"
                    style={{ 
                        top: `${menuPosition.top}px`, 
                        left: `${menuPosition.left}px` 
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* User Info Section */}
                    <div className="p-4 border-b border-gray-700">
                        <div className="flex items-center gap-3">
                            {user.avatar ? (
                                <img 
                                    src={user.avatar} 
                                    alt={user.username}
                                    className="w-12 h-12 rounded-full object-cover border-2 border-gray-600"
                                />
                            ) : (
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-base border-2 border-gray-600">
                                    {initials}
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="font-semibold text-gray-200 truncate">{user.username}</div>
                                {user.email && (
                                    <div className="text-sm text-gray-400 mt-1 truncate">{user.email}</div>
                                )}
                                <div className="text-xs text-gray-500 mt-1 uppercase">
                                    {user.role === 'admin' ? t('userMenu.roleAdmin') : user.role === 'user' ? t('userMenu.roleUser') : t('userMenu.roleViewer')}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Menu Items */}
                    <div className="py-2">
                        {/* Mon Profil */}
                        <button
                            onClick={() => {
                                setIsOpen(false);
                                onProfileClick?.();
                            }}
                            className="w-full px-4 py-2.5 text-left text-sm text-gray-300 hover:bg-[#252525] transition-colors flex items-center gap-3"
                        >
                            <User size={20} className="text-gray-400" />
                            <span>{t('userMenu.myProfile')}</span>
                        </button>

                        {/* Administration (Admin only) */}
                        {user.role === 'admin' && (
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    onAdminClick?.();
                                }}
                                className="w-full px-4 py-2.5 text-left text-sm text-gray-300 hover:bg-[#252525] transition-colors flex items-center gap-3 bg-blue-900/20 border-l-2 border-blue-500"
                            >
                                <Shield size={20} className="text-blue-400" />
                                <span className="font-medium">{t('userMenu.administration')}</span>
                            </button>
                        )}

                        {/* Utilisateurs (Admin only) */}
                        {user.role === 'admin' && (
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    onUsersClick?.();
                                }}
                                className="w-full px-4 py-2.5 text-left text-sm text-gray-300 hover:bg-[#252525] transition-colors flex items-center gap-3"
                            >
                                <Users size={20} className="text-gray-400" />
                                <span>{t('userMenu.users')}</span>
                            </button>
                        )}

                        {/* Logout */}
                        <button
                            onClick={() => {
                                setIsOpen(false);
                                onLogout?.();
                            }}
                            className="w-full px-4 py-2.5 text-left text-sm text-gray-300 hover:bg-[#252525] transition-colors flex items-center gap-3"
                        >
                            <LogOut size={20} className="text-gray-400" />
                            <span>{t('userMenu.logout')}</span>
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

