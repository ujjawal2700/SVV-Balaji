import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { tokenStore } from '@shared/api/tokenStore';

let adminSocket: Socket | null = null;

export function socketOrigin(): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
  if (/^https?:\/\//i.test(base)) return new URL(base).origin;
  return window.location.origin; // dev: the Vite proxy forwards /socket.io
}

export function getAdminSocket(): Socket {
  if (!adminSocket || adminSocket.disconnected) {
    adminSocket = io(`${socketOrigin()}/admin`, {
      auth: (cb) => cb({ token: tokenStore.getAccessToken() ?? '' }),
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 10_000,
    });
  }
  return adminSocket;
}

export interface TicketMessagePayload {
  ticketId: string;
  message: {
    id: string;
    author: 'CUSTOMER' | 'STAFF';
    body: string;
    createdAt: string;
    staffName: string | null;
  };
  status?: string;
  lastActivityAt?: string;
  awaitingReply?: boolean;
}

export interface TicketNewPayload {
  ticketId: string;
  ticketNumber: string;
  subject: string;
  orderNumber?: string | null;
  category?: string;
  createdAt: string;
}

export interface TicketUpdatedPayload {
  ticketId: string;
  status?: string;
  priority?: string;
  resolvedAt?: string | null;
  resolvedBy?: { id: string; fullName: string } | null;
}

/** Hook for components/pages to react instantly to ticket socket events */
export function useTicketSocketEvents(handlers: {
  onMessage?: (payload: TicketMessagePayload) => void;
  onNewTicket?: (payload: TicketNewPayload) => void;
  onTicketUpdated?: (payload: TicketUpdatedPayload) => void;
}) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const socket = getAdminSocket();

    const handleMessage = (payload: TicketMessagePayload) => {
      handlersRef.current.onMessage?.(payload);
    };

    const handleNew = (payload: TicketNewPayload) => {
      handlersRef.current.onNewTicket?.(payload);
    };

    const handleUpdated = (payload: TicketUpdatedPayload) => {
      handlersRef.current.onTicketUpdated?.(payload);
    };

    socket.on('tickets:message', handleMessage);
    socket.on('tickets:new', handleNew);
    socket.on('tickets:updated', handleUpdated);

    return () => {
      socket.off('tickets:message', handleMessage);
      socket.off('tickets:new', handleNew);
      socket.off('tickets:updated', handleUpdated);
    };
  }, []);
}
