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

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const ws = useRef<WebSocket | null>(null);

  const connect = useCallback(async () => {
    const token = await SecureStore.getItemAsync('access_token');
    if (!token) return;

    const socket = new WebSocket(`${WS_URL}/ws/chat?token=${token}`);
    ws.current = socket;

    socket.onopen = () => setIsConnected(true);

    socket.onmessage = (event) => {
      setIsTyping(false);
      const data = JSON.parse(event.data);
      if (data.reply) {
        setMessages((prev) => [
          ...prev,
          { id: Date.now().toString(), role: 'assistant', content: data.reply, createdAt: new Date() },
        ]);
      }
    };

    socket.onclose = () => {
      setIsConnected(false);
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

  const send = useCallback((text: string) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), role: 'user', content: text, createdAt: new Date() },
    ]);
    setIsTyping(true);
    ws.current.send(JSON.stringify({ text }));
  }, []);

  return { messages, isConnected, isTyping, hasMore, loadingMore, loadMore, send };
}
