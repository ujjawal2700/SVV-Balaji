import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

export type OrderEventKind = 'new' | 'updated';

/**
 * In-process pub/sub between the code that changes an order and whatever wants
 * to tell people about it (the admin socket, web push).
 *
 * Publishing never throws and never blocks: a broken socket must not be able to
 * fail an order. Callers publish only AFTER their database transaction has
 * committed, so a listener that loads the order always sees the committed row.
 */
@Injectable()
export class OrderEventsService {
  private readonly emitter = new EventEmitter();

  publish(kind: OrderEventKind, orderId: string): void {
    setImmediate(() => {
      try {
        this.emitter.emit(kind, orderId);
      } catch {
        /* listeners are best-effort */
      }
    });
  }

  on(kind: OrderEventKind, handler: (orderId: string) => void): void {
    this.emitter.on(kind, handler);
  }
}
