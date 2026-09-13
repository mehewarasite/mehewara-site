import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  ShieldAlert,
  Trash2,
  RefreshCw,
  Mail,
  User,
  Lock,
  AlertCircle,
  Loader2,
  X
} from 'lucide-react';
import type { AdminThemeClasses } from './types';
import { dbAdminListUsers, dbAdminCreateUser, dbAdminDeleteUser, type AdminUser } from '../../api';

interface AccountsTabProps {
  theme: AdminThemeClasses;
  showFlash: (msg: string, isError?: boolean) => void;
  currentUsername?: string;
}

export default function AccountsTab({ theme, showFlash, currentUsername }: AccountsTabProps) {
  const { cardBg, cardBdr, inputBg, inputBdr, textPrimary, textMuted, textFaint, subtleBg } = theme;

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'super-admin'>('admin');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Delete State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadUsers = async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    else setIsRefreshing(true);
    try {
      const list = await dbAdminListUsers();
      setUsers(list);
    } catch (err: any) {
      console.error('Failed to load admin users:', err);
      showFlash('Failed to load administrators. Verify your permissions.', true);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newEmail.trim() || !newPassword) {
      setModalError('Please fill in all required fields.');
      return;
    }

    if (newPassword.length < 6) {
      setModalError('Password must be at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      const created = await dbAdminCreateUser({
        name: newName.trim() || newUsername.trim(),
        username: newUsername.trim(),
        email: newEmail.trim().toLowerCase(),
        password: newPassword,
        role: newRole,
      });

      const emailNote = created?.emailSent
        ? ` Welcome email with credentials sent to ${newEmail.trim().toLowerCase()}.`
        : created?.emailError
          ? ` (Note: Email delivery issue: ${created.emailError})`
          : '';
      showFlash(`Admin user "${newUsername}" created successfully!${emailNote}`);
      setShowAddModal(false);
      setNewName('');
      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('admin');
      loadUsers(true);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message;
      setModalError(msg || 'Failed to create user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    if (user.username === currentUsername) {
      alert('You cannot delete your own active administrator account.');
      return;
    }

    if (!window.confirm(`Are you sure you want to permanently delete the admin account "${user.username}" (${user.email})?`)) {
      return;
    }

    setDeletingId(user.id);
    try {
      await dbAdminDeleteUser(user.id);
      showFlash(`Account "${user.username}" has been removed.`);
      setUsers(prev => prev.filter(u => u.id !== user.id));
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message;
      showFlash(msg || 'Failed to delete user.', true);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-black tracking-tight ${textPrimary} flex items-center gap-2.5`}>
            <Users className="w-6 h-6 text-sky-500" />
            <span>Administrator Accounts</span>
          </h2>
          <p className={`text-xs ${textMuted} mt-1`}>
            Manage staff members, personalized login credentials, and permission roles.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadUsers(true)}
            disabled={isRefreshing}
            className={`p-2.5 rounded-xl border ${cardBdr} ${cardBg} ${textMuted} hover:${textPrimary} transition-all disabled:opacity-50 cursor-pointer`}
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-sky-500' : ''}`} />
          </button>

          <button
            onClick={() => {
              setModalError(null);
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-lg shadow-sky-500/25 transition-all cursor-pointer active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Administrator</span>
          </button>
        </div>
      </div>

      {/* Users List Card */}
      <div className={`rounded-2xl border ${cardBdr} ${cardBg} overflow-hidden shadow-sm`}>
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
            <span className={`text-xs font-medium ${textMuted}`}>Loading administrator accounts...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-12 h-12 text-slate-500/40 mx-auto mb-3" />
            <h3 className={`text-sm font-bold ${textPrimary}`}>No administrators found</h3>
            <p className={`text-xs ${textMuted} mt-1 max-w-sm mx-auto`}>
              No personalized accounts have been created in the database yet. Click "Add Administrator" to create the first staff account.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`border-b ${cardBdr} ${subtleBg} text-[11px] font-bold ${textMuted} uppercase tracking-wider`}>
                  <th className="py-3 px-5">Administrator</th>
                  <th className="py-3 px-5">Email Address</th>
                  <th className="py-3 px-5">Role</th>
                  <th className="py-3 px-5">Status</th>
                  <th className="py-3 px-5">Created</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${cardBdr} text-xs`}>
                {users.map((user) => {
                  const isCurrent = user.username === currentUsername;
                  const isSuper = user.role === 'super-admin';
                  return (
                    <tr key={user.id} className={`hover:${subtleBg} transition-colors`}>
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs uppercase ${
                            isSuper
                              ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                              : 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                          }`}>
                            {(user.name || user.username).slice(0, 2)}
                          </div>
                          <div>
                            <div className={`font-bold ${textPrimary} flex items-center gap-2`}>
                              <span>{user.name || user.username}</span>
                              {isCurrent && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-mono ${textMuted}`}>@{user.username}</span>
                              <span className={`text-[10px] ${textFaint}`}>&bull; ID: {user.id.slice(0, 8)}...</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className={`py-3.5 px-5 font-mono text-[11px] ${textMuted}`}>
                        {user.email}
                      </td>

                      <td className="py-3.5 px-5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          isSuper
                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                        }`}>
                          {isSuper ? <ShieldAlert className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                          <span>{isSuper ? 'Super Admin' : 'Admin'}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-5">
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Active</span>
                        </span>
                      </td>

                      <td className={`py-3.5 px-5 text-[11px] ${textFaint}`}>
                        {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        <button
                          onClick={() => handleDeleteUser(user)}
                          disabled={isCurrent || deletingId === user.id}
                          className={`p-2 rounded-lg text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer`}
                          title={isCurrent ? 'Cannot delete yourself' : 'Delete account'}
                        >
                          {deletingId === user.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className={`relative w-full max-w-md rounded-2xl border ${cardBdr} ${cardBg} p-6 shadow-2xl animate-scale-up`}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h3 className={`text-lg font-bold ${textPrimary}`}>New Administrator</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className={`p-1.5 rounded-lg text-slate-400 hover:${textPrimary} hover:${subtleBg} transition-colors cursor-pointer`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className={`block text-xs font-bold mb-1.5 ${textPrimary}`}>Full Name</label>
                <div className="relative">
                  <User className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${textMuted}`} />
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    required
                    className={`w-full pl-9 pr-3 py-2 rounded-xl border ${inputBdr} ${inputBg} ${textPrimary} text-xs focus:ring-2 focus:ring-sky-500/40 focus:outline-none`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-bold mb-1.5 ${textPrimary}`}>Username</label>
                <div className="relative">
                  <User className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${textMuted}`} />
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="e.g. jdoe"
                    required
                    className={`w-full pl-9 pr-3 py-2 rounded-xl border ${inputBdr} ${inputBg} ${textPrimary} text-xs focus:ring-2 focus:ring-sky-500/40 focus:outline-none`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-bold mb-1.5 ${textPrimary}`}>Email Address</label>
                <div className="relative">
                  <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${textMuted}`} />
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="staff@mehewara.edu.lk"
                    required
                    className={`w-full pl-9 pr-3 py-2 rounded-xl border ${inputBdr} ${inputBg} ${textPrimary} text-xs focus:ring-2 focus:ring-sky-500/40 focus:outline-none`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-bold mb-1.5 ${textPrimary}`}>Temporary Password</label>
                <div className="relative">
                  <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${textMuted}`} />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    required
                    className={`w-full pl-9 pr-3 py-2 rounded-xl border ${inputBdr} ${inputBg} ${textPrimary} text-xs focus:ring-2 focus:ring-sky-500/40 focus:outline-none`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-bold mb-1.5 ${textPrimary}`}>Role</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewRole('admin')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      newRole === 'admin'
                        ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                        : `${inputBdr} ${inputBg} ${textMuted}`
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Admin</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewRole('super-admin')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      newRole === 'super-admin'
                        ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                        : `${inputBdr} ${inputBg} ${textMuted}`
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Super Admin</span>
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs flex items-center gap-2">
                <Mail className="w-4 h-4 shrink-0 text-sky-400" />
                <span>Account credentials, password, and login instructions will be emailed automatically to this user.</span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold ${textMuted} hover:${textPrimary} cursor-pointer`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Account</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
