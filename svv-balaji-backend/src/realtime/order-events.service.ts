import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

export type OrderEventKind = 'new' | 'updated';
export interface OrderTimelineEvent {
  orderId: string;
  eventId: string;
}

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

  /**
   * Publish the exact committed timeline row. Customer notifications listen
   * here so two rapid updates cannot collapse into whichever row happens to
   * be newest when an asynchronous listener reads the order.
   */
  publishTimeline(event: OrderTimelineEvent): void {
    setImmediate(() => {
      try {
        this.emitter.emit('timeline', event);
      } catch {
        /* listeners are best-effort */
      }
    });
  }

  onTimeline(handler: (event: OrderTimelineEvent) => void): void {
    this.emitter.on('timeline', handler);
  }
}
