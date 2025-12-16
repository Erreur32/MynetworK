/**
 * User authentication store
 * 
 * Handles user login/logout and JWT token management
 * This is separate from the Freebox auth store
 */

import { create } from 'zustand';
import { api } from '../api/client';
import type { ApiResponse } from '../types/api';

export interface User {
    id: number;
    username: string;
    email: string;
    role: 'admin' | 'user' | 'viewer';
    enabled: boolean;
    createdAt: string;
    lastLogin?: string;
}

interface LoginResponse {
    token: string;
    user: User;
    message: string;
}

interface UserAuthState {
    // State
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;

    // Actions
    login: (username: string, password: string) => Promise<boolean>;
    logout: () => void;
    checkAuth: () => Promise<void>;
    getToken: () => string | null;
    clearError: () => void;
}

// Store token in localStorage
const TOKEN_KEY = 'dashboard_user_token';

const getStoredToken = (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
};

const setStoredToken = (token: string | null): void => {
    if (typeof window === 'undefined') return;
    if (token) {
        localStorage.setItem(TOKEN_KEY, token);
    } else {
        localStorage.removeItem(TOKEN_KEY);
    }
};

export const useUserAuthStore = create<UserAuthState>((set, get) => ({
    user: null,
    token: getStoredToken(),
    isAuthenticated: false,
    isLoading: false,
    error: null,

    login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
            const response = await api.post<LoginResponse>('/api/users/login', {
                username,
                password
            });

            if (response.success && response.result) {
                const { token, user } = response.result;
                setStoredToken(token);
                set({
                    token,
                    user,
                    isAuthenticated: true,
                    isLoading: false,
                    error: null
                });
                return true;
            } else {
                set({
                    isLoading: false,
                    error: response.error?.message || 'Login failed'
                });
                return false;
            }
        } catch (error) {
            set({
                isLoading: false,
                error: error instanceof Error ? error.message : 'Login failed'
            });
            return false;
        }
    },

    logout: () => {
        setStoredToken(null);
        set({
            user: null,
            token: null,
            isAuthenticated: false,
            error: null
        });
    },

    checkAuth: async () => {
        const token = get().token || getStoredToken();
        if (!token) {
            set({ isAuthenticated: false, user: null });
            return;
        }

        set({ isLoading: true });

        try {
            const response = await api.get<User>('/api/users/me');
            if (response.success && response.result) {
                set({
                    user: response.result,
                    isAuthenticated: true,
                    isLoading: false,
                    error: null
                });
            } else {
                // Token invalid, clear it
                setStoredToken(null);
                set({
                    token: null,
                    user: null,
                    isAuthenticated: false,
                    isLoading: false
                });
            }
        } catch (error) {
            setStoredToken(null);
            set({
                token: null,
                user: null,
                isAuthenticated: false,
                isLoading: false
            });
        }
    },

    getToken: () => {
        return get().token || getStoredToken();
    },

    clearError: () => {
        set({ error: null });
    }
}));

