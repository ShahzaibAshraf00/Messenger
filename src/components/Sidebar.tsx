import React, { useState } from 'react';
import { Conversation, UserProfile } from '../types';
import { ModernAvatar } from '../utils/avatar';
import { getEffectivePresence, isUserOnline } from '../utils/presence';
import {
  Search,
  MessageSquare,
  X,
  Phone,
  Video,
  UserCheck,
  SearchCode,
} from 'lucide-react';

interface SidebarProps {
  currentUser: UserProfile;
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onlineUsers: UserProfile[];
  onStartChatWithUser: (user: UserProfile) => void;
  onStartCallWithUser?: (user: UserProfile, type: 'audio' | 'video') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  conversations,
  activeConversationId,
  onSelectConversation,
  onlineUsers,
  onStartChatWithUser,
  onStartCallWithUser,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const query = searchQuery.toLowerCase().trim();

  // Active Chats: ONLY conversations where at least one message has been sent (lastMessage exists)
  const activeChats = conversations.filter(
    (conv) =>
      conv.lastMessage &&
      (conv.lastMessage.plainPreviewSnippet ||
        conv.lastMessage.encryptedCiphertext ||
        (conv.lastMessage as any).text)
  );

  // Filter conversations by search query
  const filteredConversations = activeChats.filter((conv) => {
    const peerUid = conv.participants.find((p) => p !== currentUser.uid);
    const peer = peerUid ? conv.participantData[peerUid] : null;
    if (!query) return true;
    if (!peer) return false;
    return (
      peer.displayName?.toLowerCase().includes(query) ||
      peer.email?.toLowerCase().includes(query) ||
      conv.lastMessage?.plainPreviewSnippet?.toLowerCase().includes(query)
    );
  });

  // Filter people from directory when searching
  const otherUsers = onlineUsers.filter((u) => u.uid !== currentUser.uid);
  const searchMatchingUsers = query
    ? otherUsers.filter((u) => {
        return (
          u.displayName?.toLowerCase().includes(query) ||
          u.email?.toLowerCase().includes(query)
        );
      })
    : [];

  const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return '';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);

      if (diffMin < 1) return 'Just now';
      if (diffMin < 60) return `${diffMin}m`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `${diffHours}h`;
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <aside className="w-full md:w-80 lg:w-92 bg-zinc-950 border-r border-zinc-800/80 flex flex-col h-full shrink-0 select-none">
      {/* Search Header */}
      <div className="p-3.5 border-b border-zinc-800/80">
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="sidebar-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users by name or email to chat..."
            className="w-full h-9 pl-9 pr-8 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {/* WHEN USER IS SEARCHING */}
        {query ? (
          <div className="space-y-4">
            {/* Search: Matching Users to Message */}
            <div>
              <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                <span>Users ({searchMatchingUsers.length})</span>
                <span className="text-[10px] text-zinc-400 font-normal">Click to message</span>
              </div>

              {searchMatchingUsers.length > 0 ? (
                <div className="space-y-1">
                  {searchMatchingUsers.map((user) => {
                    const isOnline = isUserOnline(user, currentUser.uid);
                    const effStatus = getEffectivePresence(user, currentUser.uid);
                    const statusDotColor =
                      effStatus === 'online'
                        ? 'bg-emerald-500'
                        : effStatus === 'idle'
                        ? 'bg-amber-500'
                        : effStatus === 'busy'
                        ? 'bg-rose-500'
                        : 'bg-zinc-600';

                    return (
                      <div
                        key={user.uid}
                        onClick={() => {
                          onStartChatWithUser(user);
                          setSearchQuery('');
                        }}
                        className="p-2.5 rounded-xl hover:bg-zinc-900/90 bg-zinc-900/40 border border-zinc-800/50 hover:border-zinc-700 transition-all cursor-pointer flex items-center justify-between gap-2.5 group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative shrink-0">
                            <ModernAvatar
                              seed={user.email || user.uid}
                              name={user.displayName}
                              photoUrl={(user as any).photoUrl}
                              size={38}
                            />
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-950 ${statusDotColor}`}
                            />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-zinc-100 truncate group-hover:text-blue-400 transition-colors">
                                {user.displayName}
                              </span>
                              {isOnline && (
                                <span className="text-[9px] font-medium text-emerald-400 bg-emerald-950/40 px-1.5 py-0.2 rounded-full border border-emerald-800/40">
                                  Online
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-400 truncate">
                              {user.email}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-1.5">
                          {onStartCallWithUser && (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onStartCallWithUser(user, 'audio');
                                }}
                                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-emerald-600/30 text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer"
                                title={`Audio call with ${user.displayName}`}
                              >
                                <Phone className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onStartCallWithUser(user, 'video');
                                }}
                                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-blue-600/30 text-zinc-400 hover:text-blue-400 transition-colors cursor-pointer"
                                title={`Video call with ${user.displayName}`}
                              >
                                <Video className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <span className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-medium transition-colors">
                            Message
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-zinc-900/30 border border-zinc-800/40 text-center text-xs text-zinc-400">
                  No registered users match &quot;{query}&quot;
                </div>
              )}
            </div>

            {/* Matching existing conversations */}
            {filteredConversations.length > 0 && (
              <div>
                <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Existing Chats ({filteredConversations.length})
                </div>
                <div className="space-y-1">
                  {filteredConversations.map((conv) => {
                    const peerUid = conv.participants.find((p) => p !== currentUser.uid);
                    const peer = peerUid ? conv.participantData[peerUid] : null;
                    const isSelected = conv.id === activeConversationId;
                    const livePeer = peerUid ? onlineUsers.find((u) => u.uid === peerUid) : null;
                    const effStatus = getEffectivePresence(livePeer, currentUser.uid);
                    const statusDotColor =
                      effStatus === 'online'
                        ? 'bg-emerald-500'
                        : effStatus === 'idle'
                        ? 'bg-amber-500'
                        : effStatus === 'busy'
                        ? 'bg-rose-500'
                        : 'bg-zinc-600';

                    return (
                      <div
                        key={conv.id}
                        onClick={() => {
                          onSelectConversation(conv.id);
                          setSearchQuery('');
                        }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-3 ${
                          isSelected
                            ? 'bg-zinc-900 border border-zinc-800 text-white shadow-xs'
                            : 'hover:bg-zinc-900/60 text-zinc-300 border border-transparent'
                        }`}
                      >
                        <div className="relative shrink-0">
                          <ModernAvatar
                            seed={peer?.email || peerUid || 'peer'}
                            name={peer?.displayName}
                            photoUrl={(peer as any)?.photoUrl}
                            size={40}
                          />
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-950 ${statusDotColor}`}
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <h4 className="text-xs font-semibold text-zinc-100 truncate">
                              {peer?.displayName || 'User'}
                            </h4>
                            <span className="text-[10px] text-zinc-400 shrink-0">
                              {formatTimestamp(conv.updatedAt)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <p className="text-[11px] text-zinc-400 truncate max-w-[170px]">
                              <span className="truncate">
                                {conv.lastMessage?.plainPreviewSnippet || 'Message'}
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* DEFAULT VIEW: Active Conversations Only */
          <div>
            <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
              <span>Chats ({filteredConversations.length})</span>
            </div>

            {filteredConversations.length > 0 ? (
              filteredConversations.map((conv) => {
                const peerUid = conv.participants.find((p) => p !== currentUser.uid);
                const peer = peerUid ? conv.participantData[peerUid] : null;
                const isSelected = conv.id === activeConversationId;
                const livePeer = peerUid ? onlineUsers.find((u) => u.uid === peerUid) : null;
                const effStatus = getEffectivePresence(livePeer, currentUser.uid);
                const statusDotColor =
                  effStatus === 'online'
                    ? 'bg-emerald-500'
                    : effStatus === 'idle'
                    ? 'bg-amber-500'
                    : effStatus === 'busy'
                    ? 'bg-rose-500'
                    : 'bg-zinc-600';

                return (
                  <div
                    key={conv.id}
                    onClick={() => onSelectConversation(conv.id)}
                    className={`p-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-3 ${
                      isSelected
                        ? 'bg-zinc-900 border border-zinc-800 text-white shadow-xs'
                        : 'hover:bg-zinc-900/60 text-zinc-300 border border-transparent'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <ModernAvatar
                        seed={peer?.email || peerUid || 'peer'}
                        name={peer?.displayName}
                        photoUrl={(peer as any)?.photoUrl}
                        size={42}
                      />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-950 ${statusDotColor}`}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <h4 className="text-xs font-semibold text-zinc-100 truncate">
                          {peer?.displayName || 'User'}
                        </h4>
                        <span className="text-[10px] text-zinc-400 shrink-0">
                          {formatTimestamp(conv.updatedAt)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <p className="text-[11px] text-zinc-400 truncate max-w-[170px]">
                          <span className="truncate">
                            {conv.lastMessage?.plainPreviewSnippet || 'Message'}
                          </span>
                        </p>

                        {conv.unreadCount && conv.unreadCount[currentUser.uid] > 0 && (
                          <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">
                            {conv.unreadCount[currentUser.uid]}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-12 px-4 text-center text-xs text-zinc-400">
                <div className="w-12 h-12 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-center mx-auto mb-3 text-zinc-400">
                  <SearchCode className="w-6 h-6 text-zinc-400" />
                </div>
                <p className="font-semibold text-zinc-200 text-sm">No chats yet</p>
                <p className="text-zinc-400 text-xs mt-1.5 max-w-[220px] mx-auto leading-relaxed">
                  Search for a user by their name or email using the search bar above. When you send your first message, it will automatically appear here.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
