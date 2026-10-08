import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { refreshSession, tokens } from '../api/client';
import { riderApi } from '../api/rider';
import { riderEvents, type OfferClosed, type TaskAssigned } from './alerts';
import { currentPosition } from './geo';

/**
 * Live link to the server while the rider is signed in (namespace /rider).
 * Events are nudges: each one refetches the affected screens, because the
 * REST API is the source of truth. While online, the rider's position is sent
 * every 30 s so the dispatcher can offer the nearest rider.
 */
export function useLive(enabled: boolean, online: boolean) {
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const s = io('/rider', { path: '/socket.io', transports: ['websocket', 'polling'], auth: (cb) => cb({ token: tokens.access }) });
    socketRef.current = s;
    const refresh = (...keys: string[][]) => keys.forEach((k) => void qc.invalidateQueries({ queryKey: k }));

    // The incoming-order pop-up (IncomingAlerts) rings when the refetched list has a new offer.
    s.on('offer:new', () => refresh(['offers'], ['dashboard']));
    s.on('offer:closed', (p: OfferClosed) => {
      riderEvents.offerClosed(p);
      refresh(['offers'], ['dashboard']);
    });
    s.on('task:assigned', (p: TaskAssigned) => {
      riderEvents.assigned(p);
      refresh(['dashboard'], ['tasks'], ['task', p.taskId]);
    });
    s.on('task:updated', (p: { taskId: string }) => refresh(['dashboard'], ['tasks'], ['task', p.taskId]));
    s.on('notification', () => refresh(['notifications']));
    // Re-sync everything after a reconnect: events sent while offline are gone.
    s.on('ready', () => refresh(['offers'], ['dashboard'], ['tasks'], ['notifications']));
    s.on('unauthorized', async () => {
      if (await refreshSession()) s.connect();
    });
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [enabled, qc]);

  useEffect(() => {
    if (!enabled || !online) return;
    // Also the "still here" beat: the dispatcher skips online riders whose app has gone quiet.
    const send = async () => {
      const p = await currentPosition(8_000);
      if (socketRef.current?.connected) socketRef.current.emit(p ? 'location' : 'heartbeat', p ?? {});
      else await riderApi.location(p ?? {}).catch(() => undefined);
    };
    // Every 10 s while carrying an order (the customer is watching the map), 30 s otherwise.
    const carrying = () =>
      (qc.getQueryData<{ active?: Array<{ status: string }> }>(['dashboard'])?.active ?? []).some((t) =>
        ['PICKED_UP', 'OUT_FOR_DELIVERY', 'AT_DROP'].includes(t.status),
      );
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await send();
      if (!stopped) timer = setTimeout(() => void loop(), carrying() ? 10_000 : 30_000);
    };
    void loop();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [enabled, online, qc]);
}
