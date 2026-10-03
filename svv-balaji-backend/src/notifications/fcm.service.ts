import { Injectable, Logger } from '@nestjs/common';
import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface FcmMessage {
  title: string;
  body: string;
  imageUrl?: string | null;
  /** Path inside the receiving app, opened when the notification is tapped. */
  link?: string | null;
  /** Grouping tag - a newer message with the same tag replaces the older one on screen. */
  tag?: string;
  notificationId?: string;
  /** Extra string fields the receiving app reads (e.g. `kind: 'OFFER'` keeps the alert on screen). */
  extra?: Record<string, string>;
}

export interface FcmResult {
  sent: number;
  failed: number;
  /** Tokens FCM says will never work again - the caller deletes them. */
  deadTokens: string[];
}

/** FCM rejects these tokens for good: uninstalled, cleared site data, revoked permission. */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Firebase Admin, the server half of push. The browser half (firebase.ts + the
 * firebase-messaging-sw.js service worker in each app) gets a token; this sends to it.
 *
 * Credentials, first match wins:
 *   FIREBASE_SERVICE_ACCOUNT_JSON  - the whole key JSON in one env var (servers, CI)
 *   FIREBASE_SERVICE_ACCOUNT_PATH  - path to the key file
 *   ./firebase-service-account.json next to package.json (local dev; git-ignored)
 * With none of them, push is off: broadcasts still land in every in-app inbox.
 *
 * Messages are data-only on purpose. A `notification` payload makes the Firebase SDK draw
 * its own notification AND call our handler, which shows two. Data-only leaves drawing to
 * the service worker, which is also where the app logo is chosen.
 */
@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private readonly messaging: Messaging | null;

  constructor() {
    this.messaging = this.init();
  }

  get enabled(): boolean {
    return this.messaging !== null;
  }

  private init(): Messaging | null {
    try {
      const account = this.loadServiceAccount();
      if (!account) {
        this.logger.warn('Push notifications are off: no Firebase service account (see src/notifications/fcm.service.ts)');
        return null;
      }
      const app: App = getApps().find((a) => a.name === 'svv-push') ?? initializeApp({ credential: cert(account) }, 'svv-push');
      return getMessaging(app);
    } catch (error) {
      this.logger.error(`Firebase Admin failed to start - push is off: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private loadServiceAccount(): ServiceAccount | null {
    const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (inline?.trim()) return JSON.parse(inline) as ServiceAccount;
    const path = resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? 'firebase-service-account.json');
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')) as ServiceAccount;
    return null;
  }

  async send(tokens: string[], msg: FcmMessage): Promise<FcmResult> {
    const result: FcmResult = { sent: 0, failed: 0, deadTokens: [] };
    if (!this.messaging || tokens.length === 0) return result;

    const data: Record<string, string> = { ...msg.extra, title: msg.title, body: msg.body, tag: msg.tag ?? 'svv-broadcast' };
    if (msg.imageUrl) data.imageUrl = msg.imageUrl;
    if (msg.link) data.link = msg.link;
    if (msg.notificationId) data.notificationId = msg.notificationId;

    // FCM takes at most 500 tokens per multicast.
    for (let i = 0; i < tokens.length; i += 500) {
      const chunk = tokens.slice(i, i + 500);
      try {
        const res = await this.messaging.sendEachForMulticast({
          tokens: chunk,
          data,
          // High urgency wakes a sleeping phone now rather than at its next batch window.
          webpush: { headers: { Urgency: 'high', TTL: String(7 * 24 * 3600) } },
          android: { priority: 'high' },
        });
        result.sent += res.successCount;
        result.failed += res.failureCount;
        res.responses.forEach((r, idx) => {
          if (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code)) result.deadTokens.push(chunk[idx]);
          else if (!r.success) this.logger.warn(`FCM send failed: ${r.error?.code} ${r.error?.message}`);
        });
      } catch (error) {
        result.failed += chunk.length;
        this.logger.error(`FCM multicast failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return result;
  }
}
