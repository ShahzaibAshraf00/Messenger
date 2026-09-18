import React, { useState } from 'react';
import { UserProfile, UserPresenceStatus } from '../types';
import { ModernAvatar } from '../utils/avatar';
import {
  LogOut,
  ChevronDown,
  Menu,
  Lock,
  Circle,
} from 'lucide-react';

interface NavbarProps {
  currentUser: UserProfile;
  onlineCount: number;
  onUpdateStatus: (status: UserPresenceStatus) => void;
  onSignOut: () => void;
  onToggleMobileSidebar: () => void;
  onOpenSecurityDrawer?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onlineCount,
  onUpdateStatus,
  onSignOut,
  onToggleMobileSidebar,
}) => {
  const [profileOpen, setProfileOpen] = useState(false);

  const statusColors: Record<UserPresenceStatus, string> = {
    online: 'bg-emerald-500',
    idle: 'bg-amber-500',
    busy: 'bg-rose-500',
    offline: 'bg-zinc-500',
  };

  return (
    <header className="h-14 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md px-4 flex items-center justify-between z-20 shrink-0 select-none">
      {/* Left: Mobile Toggle & Brand */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileSidebar}
          className="md:hidden p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-850 cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-blue-400 shadow-xs">
            <Lock className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sm tracking-tight text-white leading-none">
              Madebyshahzaib
            </span>
            <span className="text-[10px] text-zinc-400 font-medium tracking-wide mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              Secured
            </span>
          </div>
        </div>
      </div>

      {/* Right Controls: Online nodes & Profile */}
      <div className="flex items-center gap-3">
        {/* Live Users Counter */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-400 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="font-medium text-zinc-200">{onlineCount}</span>
          <span className="text-zinc-500 text-[11px]">online</span>
        </div>

        {/* User Profile Dropdown */}
        <div className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2.5 p-1 pr-2 rounded-full bg-zinc-900/80 hover:bg-zinc-850 border border-zinc-800 transition-all cursor-pointer"
          >
            <div className="relative">
              <ModernAvatar
                seed={currentUser.email || currentUser.uid}
                name={currentUser.displayName}
                photoUrl={(currentUser as any).photoUrl}
                size={30}
              />
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-950 ${
                  statusColors[currentUser.status || 'online']
                }`}
              />
            </div>
            <span className="hidden sm:block text-xs font-medium text-zinc-200 max-w-[100px] truncate">
              {currentUser.displayName}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          </button>

          {profileOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setProfileOpen(false)}
              />
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-zinc-900 border border-zinc-800 p-2 shadow-2xl z-40 text-xs animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-2 border-b border-zinc-800 mb-1">
                  <div className="font-medium text-white truncate">
                    {currentUser.displayName}
                  </div>
                  <div className="text-[11px] text-zinc-400 truncate">
                    {currentUser.email}
                  </div>
                </div>

                <div className="px-3 py-1.5 text-[10px] uppercase font-semibold text-zinc-500 tracking-wider">
                  Set status
                </div>

                <button
                  onClick={() => {
                    onUpdateStatus('online');
                    setProfileOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-zinc-800 text-zinc-200 cursor-pointer"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Online</span>
                </button>

                <button
                  onClick={() => {
                    onUpdateStatus('idle');
                    setProfileOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-zinc-800 text-zinc-200 cursor-pointer"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>Away</span>
                </button>

                <button
                  onClick={() => {
                    onUpdateStatus('busy');
                    setProfileOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-zinc-800 text-zinc-200 cursor-pointer"
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span>Do not disturb</span>
                </button>

                <button
                  onClick={() => {
                    onUpdateStatus('offline');
                    setProfileOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-zinc-800 text-zinc-200 cursor-pointer"
                >
                  <span className="w-2 h-2 rounded-full bg-zinc-500" />
                  <span>Appear offline</span>
                </button>

                <div className="border-t border-zinc-800 my-1 pt-1">
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      onSignOut();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-red-950/40 text-red-400 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
