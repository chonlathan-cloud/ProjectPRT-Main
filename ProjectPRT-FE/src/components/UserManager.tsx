import React, { useState, useEffect } from 'react';
import { 
  Users, Search, Mail, 
  Edit2, Trash2,
  Loader2, AlertCircle,
  RotateCcw, KeyRound, EyeOff, UserCheck
} from 'lucide-react';
import { getUsers, updateUser, updateUserRoles, deleteUser, restoreUser, resetUserPassword, approveUser } from '../services/api';
import { User } from '../../types';

const DEFAULT_ROLES = ['admin', 'accounting', 'finance', 'viewer', 'requester'];
const SYSTEM_MANAGED_ROLES = new Set(['approver']);
const isAssignableRole = (role: string) => !SYSTEM_MANAGED_ROLES.has(role);

export const UserManager: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isApproving, setIsApproving] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, [showInactive]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getUsers(showInactive);
      setUsers(data);
    } catch (err: any) {
      console.error("Failed to fetch users:", err);
      setError(err.message || "ไม่สามารถดึงข้อมูลผู้ใช้งานได้ โปรดตรวจสอบการเชื่อมต่อ API");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (user: User) => {
    try {
      await updateUser(user.user_id, { name: user.name, position: user.position });
      if (user.roles) {
        await updateUserRoles(user.user_id, user.roles.filter(isAssignableRole));
      }
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      console.error("Failed to update user:", err);
      alert("ไม่สามารถอัปเดตข้อมูลผู้ใช้งานได้");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!globalThis.confirm("คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้งานนี้?")) return;
    try {
      setIsDeleting(userId);
      await deleteUser(userId);
      fetchUsers();
    } catch (err) {
      console.error("Failed to delete user:", err);
      alert("ไม่สามารถลบผู้ใช้งานได้");
    } finally {
      setIsDeleting(null);
    }
  };

  const handleRestoreUser = async (userId: string) => {
    try {
      setIsRestoring(userId);
      await restoreUser(userId);
      fetchUsers();
    } catch (err) {
      console.error("Failed to restore user:", err);
      alert("ไม่สามารถคืนค่าผู้ใช้งานได้");
    } finally {
      setIsRestoring(null);
    }
  };

  const handleApproveUser = async (userId: string) => {
    try {
      setIsApproving(userId);
      await approveUser(userId);
      fetchUsers();
    } catch (err) {
      console.error("Failed to approve user:", err);
      alert("ไม่สามารถอนุมัติผู้ใช้งานได้");
    } finally {
      setIsApproving(null);
    }
  };

  const openResetPassword = (user: User) => {
    setResetPasswordUser(user);
    setNewPassword('');
  };

  const handleResetPassword = async () => {
    if (!resetPasswordUser) return;
    if (newPassword.length < 6) {
      alert("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }

    try {
      setIsResettingPassword(true);
      await resetUserPassword(resetPasswordUser.user_id, newPassword);
      setResetPasswordUser(null);
      setNewPassword('');
      fetchUsers();
      alert("ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว");
    } catch (err) {
      console.error("Failed to reset password:", err);
      alert("ไม่สามารถตั้งรหัสผ่านใหม่ได้");
    } finally {
      setIsResettingPassword(false);
    }
  };

  const filteredUsers = users.filter(user => 
    (user.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.user_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const availableRoles = Array.from(new Set([
    ...DEFAULT_ROLES,
    ...users.flatMap((user) => user.roles || [])
  ])).filter(isAssignableRole);
  const pendingApprovalCount = users.filter((user) => user.is_active !== false && user.is_approved === false).length;

  const toggleRole = (role: string) => {
    if (!editingUser) return;
    const current = new Set(editingUser.roles || []);
    if (current.has(role)) {
      current.delete(role);
    } else {
      current.add(role);
    }
    setEditingUser({ ...editingUser, roles: Array.from(current) });
  };

  const renderContent = () => {
    if (loading && users.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
          <p className="text-slate-500 animate-pulse font-medium">กำลังเตรียมข้อมูลผู้ใช้งาน...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center py-20 bg-red-50 dark:bg-red-900/10 rounded-3xl border border-red-100 dark:border-red-900/20 shadow-sm group">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
             <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-lg font-bold text-red-800 dark:text-red-200">เกิดข้อผิดพลาดในการดึงข้อมูล</h3>
          <p className="text-red-600/70 dark:text-red-400/70 max-w-md text-center mt-2 px-6">{error}</p>
          <button 
            onClick={fetchUsers}
            className="mt-6 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-lg shadow-red-600/20 transition-all active:scale-95 flex items-center gap-2"
          >
            <Loader2 className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            ลองใหม่อีกครั้ง
          </button>
        </div>
      );
    }

    if (filteredUsers.length === 0 && !loading) {
      return (
        <div className="text-center py-20 bg-slate-50 dark:bg-slate-900/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
          <div className="bg-white dark:bg-slate-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
            <AlertCircle className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200">ไม่พบข้อมูลผู้ใช้งาน</h3>
          <p className="text-slate-500">ลองเปลี่ยนคำค้นหาใหม่อีกครั้ง</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredUsers.map((user) => {
          const isPendingApproval = user.is_active !== false && user.is_approved === false;

          return (
          <div 
            key={user.user_id}
            className={`group bg-white dark:bg-slate-900 border rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 relative overflow-hidden ${
              isPendingApproval
                ? 'border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-900/10'
                : user.is_active === false
                ? 'border-slate-300 dark:border-slate-700 opacity-75'
                : 'border-slate-200 dark:border-slate-800 hover:border-indigo-500/30'
            }`}
          >
            <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {user.is_active === false ? (
                <button
                  onClick={() => handleRestoreUser(user.user_id)}
                  disabled={isRestoring === user.user_id}
                  className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
                  title="คืนค่าผู้ใช้งาน"
                >
                  {isRestoring === user.user_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                </button>
              ) : (
                <button
                  onClick={() => handleDeleteUser(user.user_id)}
                  disabled={isDeleting === user.user_id}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="ลบผู้ใช้งาน"
                >
                  {isDeleting === user.user_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              )}
            </div>

            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-lg ring-4 ring-indigo-50 dark:ring-indigo-900/10">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                {editingUser?.user_id === user.user_id ? (
                  <div className="space-y-2">
                    <input 
                      className="w-full text-sm font-bold bg-slate-50 dark:bg-slate-800 border-none rounded p-1"
                      value={editingUser.name}
                      onChange={(e) => setEditingUser({...editingUser, name: e.target.value})}
                    />
                    <input 
                      className="w-full text-xs text-slate-500 bg-slate-50 dark:bg-slate-800 border-none rounded p-1"
                      value={editingUser.position || ''}
                      onChange={(e) => setEditingUser({...editingUser, position: e.target.value})}
                    />
                    <div className="flex flex-wrap gap-2 pt-1">
                      {availableRoles.map((role) => {
                        const isActive = (editingUser.roles || []).includes(role);
                        return (
                          <button
                            type="button"
                            key={role}
                            onClick={() => toggleRole(role)}
                            className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${
                              isActive
                                ? 'bg-indigo-500 text-white border-indigo-500'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {role}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleUpdateUser(editingUser)} className="text-[10px] bg-indigo-500 text-white px-2 py-1 rounded">บันทึก</button>
                      <button onClick={() => setEditingUser(null)} className="text-[10px] bg-slate-200 text-slate-700 px-2 py-1 rounded">ยกเลิก</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h3 className="font-bold text-slate-800 dark:text-white truncate group-hover:text-indigo-600 transition-colors">
                      {user.name}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5 mt-0.5">
                      <Mail className="w-3 h-3" />
                      {user.email}
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        {user.user_id}
                      </span>
                      {user.position && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50">
                          {user.position}
                        </span>
                      )}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                        isPendingApproval
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                          : user.is_active === false
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                          : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/50'
                      }`}>
                        {isPendingApproval ? 'รออนุมัติ' : user.is_active === false ? 'ถูกลบ' : 'ใช้งานอยู่'}
                      </span>
                    </div>
                    {user.roles && user.roles.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {user.roles.map((role) => (
                          <span
                            key={role}
                            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {!editingUser && (
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
                {isPendingApproval && (
                  <button
                    onClick={() => handleApproveUser(user.user_id)}
                    disabled={isApproving === user.user_id}
                    className="text-xs text-amber-600 hover:text-emerald-600 flex items-center gap-1 transition-colors font-bold"
                  >
                    {isApproving === user.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                    อนุมัติ
                  </button>
                )}
                <button
                  onClick={() => openResetPassword(user)}
                  className="text-xs text-slate-400 hover:text-emerald-600 flex items-center gap-1 transition-colors"
                >
                  <KeyRound className="w-3 h-3" />
                  ตั้งรหัสผ่าน
                </button>
                <button 
                  onClick={() => setEditingUser(user)}
                  disabled={user.is_active === false}
                  className="text-xs text-slate-400 hover:text-indigo-500 flex items-center gap-1 transition-colors"
                >
                  <Edit2 className="w-3 h-3" />
                  แก้ไขข้อมูล
                </button>
              </div>
            )}
          </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-3">
            <Users className="w-8 h-8 text-indigo-500" />
            การจัดการผู้ใช้งาน
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">จัดการสิทธิ์ ข้อมูล และบัญชีผู้ใช้งานในระบบ</p>
          {pendingApprovalCount > 0 && (
            <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              <UserCheck className="h-3.5 w-3.5" />
              รออนุมัติ {pendingApprovalCount} คน
            </p>
          )}
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full md:w-auto">
          <button
            type="button"
            onClick={() => setShowInactive((value) => !value)}
            className={`px-4 py-2.5 border rounded-xl font-bold text-xs transition-colors shadow-sm flex items-center gap-2 ${
              showInactive
                ? 'bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-slate-900 dark:border-white'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <EyeOff className="w-4 h-4" />
            {showInactive ? 'ซ่อนบัญชีที่ลบ' : 'แสดงบัญชีที่ลบ'}
          </button>
          <div className="relative group w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="text"
              placeholder="ค้นหาชื่อ, อีเมล หรือรหัส..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full sm:w-64 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm"
            />
          </div>
          <button 
            onClick={() => fetchUsers()}
            className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
            title="รีเฟรชข้อมูล"
          >
            <Loader2 className={`w-5 h-5 text-slate-600 dark:text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {renderContent()}

      {resetPasswordUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0">
                <h2 className="font-black text-slate-800 dark:text-white">ตั้งรหัสผ่านใหม่</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{resetPasswordUser.email}</p>
              </div>
            </div>

            <label htmlFor="new-user-password" className="text-xs font-semibold uppercase tracking-wider text-gray-500 pl-1">
              PASSWORD
            </label>
            <input
              id="new-user-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              className="mt-2 w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
              autoFocus
            />

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setResetPasswordUser(null);
                  setNewPassword('');
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={isResettingPassword}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-70"
              >
                {isResettingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
