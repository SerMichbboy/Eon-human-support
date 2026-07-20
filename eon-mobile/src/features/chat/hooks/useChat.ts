import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, WS_URL } from '@/shared/api/client';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

interface RawMessage {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

function toMessage(m: RawMessage): ChatMessage {
  return { id: m.id, role: m.role as 'user' | 'assistant', content: m.content, createdAt: new Date(m.created_at) };
}

async function fetchMessages(limit = 30, beforeId?: string): Promise<ChatMessage[]> {
  try {
    const params: Record<string, string | number> = { limit };
    if (beforeId) params.before_id = beforeId;
    const res = await apiClient.get<RawMessage[]>('/messages/', { params });
    return res.data.map(toMessage);
  } catch {
    return [];
  }
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [isTyping, setIsTyping] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const ws = useRef<WebSocket | null>(null);

  const connect = useCallback(async () => {
    setConnectionStatus('connecting');
    const token = await SecureStore.getItemAsync('access_token');
    if (!token) return;
    const rawKey = await SecureStore.getItemAsync('raw_key');

    const socket = new WebSocket(`${WS_URL}/ws/chat?token=${token}`);
    ws.current = socket;

    socket.onopen = () => {
      // Send E2E key as first message before any chat messages
      socket.send(JSON.stringify({ key: rawKey ?? '' }));
      setConnectionStatus('connected');
    };

    socket.onmessage = (event) => {
      setIsTyping(false);
      const data = JSON.parse(event.data);
      if (data.reply) {
        setMessages((prev) => [
          ...prev,
          { id: Date.now().toString(), role: 'assistant', content: data.reply, createdAt: new Date() },
        ]);
      } else if (data.error) {
        // The backend normally turns provider failures into a graceful reply
        // itself; this is a fallback for anything unexpected that still hits
        // the WS handler's outer catch, so the user sees something instead of
        // the connection just dropping silently.
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'assistant',
            content: 'Что-то пошло не так. Попробуй ещё раз через минуту.',
            createdAt: new Date(),
          },
        ]);
      }
    };

    socket.onclose = () => {
      // Distinct from 'connecting': the retry hasn't started yet, so this
      // window genuinely reads as "unavailable" rather than "in progress".
      setConnectionStatus('disconnected');
      setTimeout(connect, 3000);
    };

    socket.onerror = () => socket.close();
  }, []);

  useEffect(() => {
    fetchMessages(30).then((history) => {
      setMessages(history);
      if (history.length < 30) setHasMore(false);
    });
    connect();
    return () => ws.current?.close();
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    const oldestId = messages[0].id;
    const older = await fetchMessages(30, oldestId);
    if (older.length < 30) setHasMore(false);
    if (older.length > 0) {
      setMessages((prev) => [...older, ...prev]);
    }
    setLoadingMore(false);
  }, [loadingMore, hasMore, messages]);

  // `voiceMode` tells the backend to keep the reply to 1-2 short sentences
  // (see SendMessage.execute / CLAUDE.md's Conversation Mode notes) — used by
  // ConversationOverlay, where a normal-length reply means a proportionally
  // longer TTS wait on top of the chat completion itself.
  //
  // `client_time`/`client_tz` are how the backend resolves "напомни в 18:00"
  // to an actual UTC instant (see CLAUDE.md's Reminders notes) — the server
  // has no other way to know the user's local wall-clock time. `client_time`
  // is the device's current UTC instant; `client_tz` its IANA zone name, so
  // the backend can correctly compute local time (DST etc.) rather than
  // trusting a raw, possibly-stale numeric offset from the client.
  const send = useCallback((text: string, voiceMode?: boolean) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), role: 'user', content: text, createdAt: new Date() },
    ]);
    setIsTyping(true);
    ws.current.send(JSON.stringify({
      text,
      voice_mode: !!voiceMode,
      client_time: new Date().toISOString(),
      client_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }));
  }, []);

  return {
    messages,
    connectionStatus,
    isConnected: connectionStatus === 'connected',
    isTyping,
    hasMore,
    loadingMore,
    loadMore,
    send,
  };
}
