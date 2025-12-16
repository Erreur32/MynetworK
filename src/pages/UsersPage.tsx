/**
 * Users Management Page
 * 
 * Page for managing users (admin only)
 */

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2, Edit2, Shield, User as UserIcon, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import { useUserAuthStore, type User } from '../stores/userAuthStore';
import { Card } from '../components/widgets/Card';
import { Button } from '../components/ui/Button';

interface UsersPageProps {
    onBack: () => void;
}

export const UsersPage: React.FC<UsersPageProps> = ({ onBack }) => {
    const { user: currentUser } = useUserAuthStore();
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (currentUser?.role === 'admin') {
            fetchUsers();
        }
    }, [currentUser]);

    const fetchUsers = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await api.get<User[]>('/api/users');
            if (response.success && response.result) {
                setUsers(response.result);
            } else {
                setError(response.error?.message || 'Failed to fetch users');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch users');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (userId: number) => {
        if (!confirm(`Voulez-vous vraiment supprimer cet utilisateur ?`)) {
            return;
        }

        try {
            const response = await api.delete(`/api/users/${userId}`);
            if (response.success) {
                await fetchUsers();
            } else {
                alert(response.error?.message || 'Failed to delete user');
            }
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to delete user');
        }
    };

    if (currentUser?.role !== 'admin') {
        return (
            <div className="min-h-screen bg-[#050505] text-gray-300 flex items-center justify-center">
                <div className="text-center">
                    <Shield size={48} className="mx-auto text-gray-600 mb-4" />
                    <p className="text-gray-400">Accès administrateur requis</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#050505] text-gray-300">
            <div className="max-w-7xl mx-auto p-6">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-[#1a1a1a] rounded transition-colors"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-2xl font-semibold">Gestion des Utilisateurs</h1>
                    <button
                        onClick={fetchUsers}
                        className="ml-auto p-2 hover:bg-[#1a1a1a] rounded transition-colors"
                        title="Actualiser"
                    >
                        <RefreshCw size={20} />
                    </button>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {/* Users List */}
                {isLoading ? (
                    <div className="text-center py-12 text-gray-500">Chargement...</div>
                ) : (
                    <div className="grid gap-4">
                        {users.map((user) => (
                            <Card key={user.id} title={user.username}>
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <UserIcon size={16} className="text-gray-400" />
                                            <span className="font-medium">{user.username}</span>
                                            {user.role === 'admin' && (
                                                <span className="px-2 py-0.5 bg-blue-900/30 border border-blue-700 rounded text-xs text-blue-400">
                                                    Admin
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-400">{user.email}</p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Créé le {new Date(user.createdAt).toLocaleDateString('fr-FR')}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {user.id !== currentUser?.id && (
                                            <button
                                                onClick={() => handleDelete(user.id)}
                                                className="p-2 hover:bg-red-900/20 rounded text-red-400 hover:text-red-300 transition-colors"
                                                title="Supprimer"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

