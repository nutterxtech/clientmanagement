import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './use-auth';
import { useQueryClient } from '@tanstack/react-query';
import { getGetChatMessagesQueryKey, getGetChatsQueryKey, getGetMeQueryKey } from '@workspace/api-client-react';
import { playNotificationSound, requestNotificationPermission, showBrowserNotification } from '@/lib/notifications';

/** Optimistically update a chat's lastMessage (and optionally bump unreadCount) in the React Query cache. */
function patchChatInList(
  queryClient: ReturnType<typeof useQueryClient>,
  chatId: string,
  lastMessage: any,
  bumpUnread: boolean,
) {
  queryClient.setQueryData(getGetChatsQueryKey(), (old: any) => {
    if (!Array.isArray(old)) return old;
    return old.map((chat: any) => {
      if (chat._id !== chatId && chat.id !== chatId) return chat;
      return {
        ...chat,
        lastMessage,
        unreadCount: bumpUnread ? (chat.unreadCount || 0) + 1 : chat.unreadCount,
      };
    });
  });
}

export function useSocket() {
  const token = useAuthStore((state) => state.token);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    if (!socketRef.current) {
      socketRef.current = io(window.location.origin, {
        auth: { token },
        path: '/api/socket.io',
        transports: ['websocket', 'polling']
      });

      socketRef.current.on('connect', () => {
        setIsConnected(true);
        // Request browser notification permission on first connect (post user-gesture)
        requestNotificationPermission();
      });

      socketRef.current.on('disconnect', () => {
        setIsConnected(false);
      });

      // ── new_message: update messages cache + move chat to top ──────────────
      socketRef.current.on('new_message', (message: any) => {
        // Identify current user from cache
        const me = queryClient.getQueryData<any>(getGetMeQueryKey());
        const myId = me?._id ?? me?.id;
        const isOwn = myId && (message.senderId === myId || message.sender?._id === myId || message.sender?.id === myId);

        if (message._id && message.content !== undefined && message.type !== undefined) {
          // Insert into messages list
          queryClient.setQueryData(getGetChatMessagesQueryKey(message.chatId), (old: any) => {
            if (!old) return [message];
            if (old.some((m: any) => m._id === message._id)) return old;
            return [...old, message];
          });
          // Update lastMessage in chat list immediately (no unread bump — user is in the room)
          patchChatInList(queryClient, message.chatId, message, false);

          // Sound + browser notification for incoming messages only
          if (!isOwn) {
            playNotificationSound();
            const senderName = message.sender?.name ?? 'New message';
            const body = message.type === 'view_once_image'
              ? '📷 Photo'
              : message.content?.slice(0, 100);
            showBrowserNotification({ title: senderName, body });
          }
        } else {
          // View-once stub — just invalidate messages
          queryClient.invalidateQueries({ queryKey: getGetChatMessagesQueryKey(message.chatId) });
        }

        // Background sync to keep server state consistent
        queryClient.invalidateQueries({ queryKey: getGetChatsQueryKey() });
      });

      // ── chat_updated: recipient gets this when NOT in the room ─────────────
      // These are always from someone else — always play sound + notification.
      socketRef.current.on('chat_updated', ({ chatId, lastMessage }: { chatId: string; lastMessage: any }) => {
        patchChatInList(queryClient, chatId, lastMessage, true);
        queryClient.invalidateQueries({ queryKey: getGetChatsQueryKey() });

        playNotificationSound();
        const senderName = lastMessage?.sender?.name ?? 'New message';
        const body = lastMessage?.type === 'view_once_image'
          ? '📷 Photo'
          : lastMessage?.content?.slice(0, 100);
        showBrowserNotification({ title: senderName, body });
      });

      socketRef.current.on('user_online', ({ userId }: { userId: string }) => {
        setOnlineUsers(prev => Array.from(new Set([...prev, userId])));
      });

      socketRef.current.on('user_offline', ({ userId }: { userId: string }) => {
        setOnlineUsers(prev => prev.filter(id => id !== userId));
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [token, queryClient]);

  const emit = (event: string, data: any) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit(event, data);
    } else {
      console.warn(`Cannot emit ${event} - socket not connected`);
    }
  };

  return { isConnected, socket: socketRef.current, emit, onlineUsers };
}
