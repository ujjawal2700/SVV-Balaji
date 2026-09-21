import { useQueryClient } from '@tanstack/react-query';
import { notification } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { checkoutAdminApi, type OrderSummary } from '@shared/api/checkout';
import { queryKeys } from '@shared/api/queryKeys';
import { tokenStore } from '@shared/api/tokenStore';

const LAST_FETCHED_KEY = 'svv.orders.lastFetchedAt';
const SEEN_LIMIT = 500;

export type LiveStatus = 'connecting' | 'live' | 'offline';

const read = () => {
  try {
    return window.localStorage.getItem(LAST_FETCHED_KEY);
  } catch {
    return null;
  }
};
const write = (iso: string) => {
  try {
    window.localStorage.setItem(LAST_FETCHED_KEY, iso);
  } catch {
    /* private mode: reconciliation falls back to the last 24 hours */
  }
};

/** The API origin (the socket lives outside the /api/v1 prefix). */
function socketOrigin(): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
  if (/^https?:\/\//i.test(base)) return new URL(base).origin;
  return window.location.origin; // dev: the Vite proxy forwards /socket.io
}

/**
 * The live orders feed for the whole panel.
 *
 * - Connects to `/admin` with the current access token (re-read on every
 *   reconnect, so an expired token is replaced rather than retried forever).
 * - `orders:new` / `orders:updated` refresh every orders view and, for a new
 *   order, raise a notification - no page reload.
 * - On every (re)connect, and on load, it asks the server for everything created
 *   or changed since `last_fetched_timestamp`, so nothing that happened while the
 *   socket was down or the tab was closed is missed.
 * - `order.id` is the dedup key: an order seen through the socket AND the
 *   catch-up query is announced once.
 */
export function useLiveOrders(enabled: boolean, onOpenOrders: () => void): LiveStatus {
  const qc = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const seen = useRef<Set<string>>(new Set());
  const openRef = useRef(onOpenOrders);
  openRef.current = onOpenOrders;

  useEffect(() => {
    if (!enabled) return;
    let socket: Socket | null = null;
    let stopped = false;

    const refresh = () => {
      void qc.invalidateQueries({ queryKey: queryKeys.orders.all });
    };

    const announce = (o: OrderSummary, fromCatchUp = false) => {
      const key = `${o.id}:new`;
      if (seen.current.has(key)) return;
      seen.current.add(key);
      if (seen.current.size > SEEN_LIMIT) seen.current = new Set([...seen.current].slice(-SEEN_LIMIT / 2));
      notification.info({
        key: o.id,
        message: `${fromCatchUp ? 'Order received while you were away' : 'New order'}: ${o.orderNumber}`,
        description: `${o.customerName} · ₹${o.total.toFixed(2)} · ${o.channel}${o.fulfillmentMethod ? ` · ${o.fulfillmentMethod}` : ''} · ${o.nodeName}`,
        placement: 'bottomRight',
        duration: 8,
        onClick: () => openRef.current(),
      });
    };

    const reconcile = async () => {
      const since = read() ?? new Date(Date.now() - 24 * 3600_000).toISOString();
      try {
        let cursor = since;
        for (let page = 0; page < 10; page += 1) {
          const res = await checkoutAdminApi.syncSince(cursor);
          for (const o of res.orders) {
            // Only orders CREATED after the last fetch are "new"; older ones merely changed.
            if (new Date(o.createdAt) > new Date(since)) announce(o, true);
          }
          write(res.serverTime);
          if (!res.hasMore || res.orders.length === 0) break;
          cursor = res.orders[res.orders.length - 1].updatedAt;
        }
        refresh();
      } catch {
        /* the next reconnect / focus retries */
      }
    };

    const connect = () => {
      if (stopped) return;
      socket = io(`${socketOrigin()}/admin`, {
        // A function: evaluated on every (re)connection attempt, so it always sends the CURRENT token.
        auth: (cb) => cb({ token: tokenStore.getAccessToken() ?? '' }),
        transports: ['websocket', 'polling'],
        reconnectionDelayMax: 10_000,
      });
      socket.on('ready', () => {
        setStatus('live');
        void reconcile();
      });
      socket.on('disconnect', () => setStatus('offline'));
      socket.on('connect_error', () => setStatus('offline'));
      socket.on('unauthorized', () => setStatus('offline'));
      socket.on('orders:new', (o: OrderSummary) => {
        announce(o);
        write(o.updatedAt);
        refresh();
      });
      socket.on('orders:updated', () => refresh());
    };

    connect();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reconcile();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      socket?.disconnect();
    };
  }, [enabled, qc]);

  return status;
}
