import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './use-auth';
import { useQueryClient } from '@tanstack/react-query';
import { getGetChatMessagesQueryKey, getGetChatsQueryKey } from '@workspace/api-client-react';

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
      // Connect to same origin
      socketRef.current = io(window.location.origin, {
        auth: { token },
        path: '/api/socket.io',
        transports: ['websocket', 'polling']
      });

      socketRef.current.on('connect', () => {
        setIsConnected(true);
        console.log('Socket connected');
      });

      socketRef.current.on('disconnect', () => {
        setIsConnected(false);
        console.log('Socket disconnected');
      });

      // Global event listeners
      socketRef.current.on('new_message', (message: any) => {
        // Only do an optimistic cache insert when the payload is a full message
        // object (has _id, type, content).  View-once events emit a lightweight
        // { chatId, messageId } stub — inserting that into the cache causes the
        // UUID to render as a plain string.  For those, just invalidate so the
        // proper API fetch fires.
        if (message._id && message.content !== undefined && message.type !== undefined) {
          queryClient.setQueryData(getGetChatMessagesQueryKey(message.chatId), (old: any) => {
            if (!old) return [message];
            if (old.some((m: any) => m._id === message._id)) return old;
            return [...old, message];
          });
        } else {
          // Incomplete payload (e.g. view-once stub) — just invalidate so the
          // messages endpoint is re-fetched with full, correct data.
          queryClient.invalidateQueries({ queryKey: getGetChatMessagesQueryKey(message.chatId) });
        }

        // Always refresh the chats list (unread count / last message)
        queryClient.invalidateQueries({ queryKey: getGetChatsQueryKey() });
      });

      socketRef.current.on('user_online', ({ userId }: { userId: string }) => {
        setOnlineUsers(prev => Array.from(new Set([...prev, userId])));
      });

      socketRef.current.on('user_offline', ({ userId }: { userId: string }) => {
        setOnlineUsers(prev => prev.filter(id => id !== userId));
      });
    }

    return () => {
      // Don't disconnect on every re-render, only on unmount/token change
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
