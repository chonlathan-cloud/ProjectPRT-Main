import React, { useEffect, useState } from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  Lightbulb, 
  TrendingUp, 
  MessageSquare,
  CheckCircle,
  Files,
  Users,
  LogOut
} from 'lucide-react';
import { ViewType } from '../../types';
import { getCases, getCasesPage } from '../services/api';

interface SidebarProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  onLogout: () => void;
}

// MenuItem definition
const MENU_ITEMS = [
  { id: ViewType.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
  { id: ViewType.FORM, label: 'Form', icon: FileText },
  { id: ViewType.INSIGHTS, label: 'Insights', icon: Lightbulb },
  { id: ViewType.PROFIT_LOSS, label: 'Profit and loss', icon: TrendingUp },
  { id: ViewType.CHAT_VIEW, label: 'Chat View', icon: MessageSquare },
  { id: ViewType.ADMIN_APPROVAL, label: 'Approvals (Admin)', icon: CheckCircle },
  { id: ViewType.DOCUMENT_MANAGER, label: 'Document Manager', icon: Files },
  { id: ViewType.USER_MANAGER, label: 'User Management', icon: Users },
];

interface NavButtonProps {
  item: typeof MENU_ITEMS[0];
  isActive: boolean;
  onClick: () => void;
  badgeCount?: number;
}

const NavButton: React.FC<NavButtonProps> = ({ item, isActive, onClick, badgeCount }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
      isActive
        ? 'bg-gradient-to-r from-blue-700 to-blue-500 text-white shadow-lg'
        : 'text-slate-800 dark:text-sky-100 hover:bg-white/20 dark:hover:bg-sky-800'
    }`}
  >
    <item.icon size={20} className={isActive ? 'text-white' : 'text-slate-800 dark:text-sky-100'} />
    <span className="font-bold text-sm flex-1 text-left">{item.label}</span>
    {badgeCount !== undefined && badgeCount > 0 && (
      <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
        {badgeCount}
      </span>
    )}
  </button>
);

interface UserProfileProps {
  onLogout: () => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ onLogout }) => {
  const [user, setUser] = React.useState<{ name: string; position?: string } | null>(null);

  React.useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error("Failed to parse user from local storage", e);
      }
    }
  }, []);

  const displayName = user?.name || 'Guest User';
  const displayPosition = user?.position || 'Staff';

  return (
    <div className="space-y-3 rounded-xl bg-sky-500 p-4 shadow-inner dark:bg-sky-800">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full overflow-hidden bg-white border-2 border-white/50 dark:border-sky-600">
          <img
            src="https://picsum.photos/seed/user123/100"
            alt="User"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 overflow-hidden">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{displayName}</h3>
          <p className="text-xs text-blue-900 dark:text-sky-200 font-medium">{displayPosition}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/90 px-3 py-2 text-sm font-bold text-slate-800 transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-white/80 dark:bg-sky-950/70 dark:text-sky-100 dark:hover:bg-sky-950"
        aria-label="Logout"
      >
        <LogOut size={16} />
        <span>Logout</span>
      </button>
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange, onLogout }) => {
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [missingDocumentsCount, setMissingDocumentsCount] = useState(0);

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const pendingCases = await getCases('SUBMITTED');
        setPendingApprovalsCount(pendingCases.length);

        const missingDocsResult = await getCasesPage({ page: 1, limit: 1, missingOnly: true });
        setMissingDocumentsCount(missingDocsResult.total);
      } catch (e) {
        console.error("Failed to fetch notification counts", e);
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, [activeView]); // Refresh when view changes so badges stay updated

  return (
    <aside className="w-64 bg-sky-400 dark:bg-sky-950 dark:border-r dark:border-sky-900 flex flex-col h-screen sticky top-0 transition-colors duration-200">
      {/* Logo Section */}
      <div className="p-8">
        <div className="flex items-center gap-2">
          <img src="/metta-logo.png" alt="METTA Logo" className="w-24 h-auto object-contain" />
        </div>
      </div>

      <div className="px-4">
        <p className="text-xs font-semibold text-slate-600 dark:text-sky-200 mb-4 px-4 uppercase tracking-wider">Manage</p>
        <nav className="space-y-1">
          {MENU_ITEMS.map((item) => {
            let badgeCount = 0;
            if (item.id === ViewType.ADMIN_APPROVAL) {
              badgeCount = pendingApprovalsCount;
            } else if (item.id === ViewType.DOCUMENT_MANAGER) {
              badgeCount = missingDocumentsCount;
            }
            return (
              <NavButton
                key={item.id}
                item={item}
                isActive={activeView === item.id}
                onClick={() => onViewChange(item.id)}
                badgeCount={badgeCount}
              />
            );
          })}
        </nav>
      </div>

      {/* User Profile */}
      <div className="mt-auto p-4">
        <UserProfile onLogout={onLogout} />
      </div>
    </aside>
  );
};

