import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { refreshSession, tokens } from '../api/client';
import { riderApi } from '../api/rider';
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

    s.on('offer:new', () => {
      navigator.vibrate?.([200, 100, 200]);
      refresh(['offers'], ['dashboard']);
    });
    s.on('offer:closed', () => refresh(['offers'], ['dashboard']));
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
    const send = async () => {
      const p = await currentPosition(8_000);
      if (!p) return;
      if (socketRef.current?.connected) socketRef.current.emit('location', p);
      else await riderApi.location(p).catch(() => undefined);
    };
    void send();
    const t = setInterval(() => void send(), 30_000);
    return () => clearInterval(t);
  }, [enabled, online]);
}
