import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { WS_URL } from '@/shared/api/client';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
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
          {
            id: Date.now().toString(),
            role: 'assistant',
            content: data.reply,
            createdAt: new Date(),
          },
        ]);
      }
    };

    socket.onclose = () => {
      setIsConnected(false);
      // Reconnect after 3s on unexpected disconnect
      setTimeout(connect, 3000);
    };

    socket.onerror = () => socket.close();
  }, []);

  useEffect(() => {
    connect();
    return () => ws.current?.close();
  }, []);

  const send = useCallback((text: string) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;

    const msg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, msg]);
    setIsTyping(true);
    ws.current.send(JSON.stringify({ text }));
  }, []);

  return { messages, isConnected, isTyping, send };
}
