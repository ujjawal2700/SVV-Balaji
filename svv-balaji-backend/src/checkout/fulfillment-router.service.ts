import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, WarehouseKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { haversineKm, validCoordinates, type Method } from './checkout.calculator';
import type { EffectiveCheckoutSettings } from './checkout-settings.service';
import { assertEnough, availableByProduct } from './stock-holds';

export interface RouteNode {
  id: string;
  name: string;
  kind: WarehouseKind;
  branchId: string;
  city: string | null;
}

export interface NodeConsideration {
  nodeId: string;
  name: string;
  distanceKm: number | null;
  withinRadius: boolean;
  hasStock: boolean | null;
}

export interface Route {
  method: Method;
  node: RouteNode;
  /** Straight-line km to the chosen node, when both ends have coordinates. */
  distanceKm: number | null;
  /** A plain-language why, safe to show the customer. */
  reason: string;
  considered: NodeConsideration[];
}

/**
 * Decides HOW and FROM WHERE an order is fulfilled. The customer never picks.
 *
 *   - B2B (bulk) always ships from the central depot.
 *   - B2C: the nearest active franchise outlet whose delivery radius covers the
 *     address AND that can supply every item -> LOCAL (in-house rider).
 *   - otherwise -> the central depot -> SHIPROCKET (3PL).
 *
 * An address with no coordinates has no distance, so it is never "local":
 * guessing would promise a 40-minute delivery the outlet cannot make.
 */
@Injectable()
export class FulfillmentRouterService {
  constructor(private readonly prisma: PrismaService) {}

  async central(client: Prisma.TransactionClient | PrismaService, settings: EffectiveCheckoutSettings): Promise<RouteNode> {
    const select = { id: true, name: true, kind: true, branchId: true, city: true } as const;
    const node = settings.centralWarehouseId
      ? await client.warehouse.findFirst({ where: { id: settings.centralWarehouseId, isActive: true }, select })
      : await client.warehouse.findFirst({ where: { kind: WarehouseKind.CENTRAL, isActive: true }, orderBy: { createdAt: 'asc' }, select });
    if (!node) throw new ServiceUnavailableException('No central warehouse is configured for shipping');
    return node;
  }

  async resolve(
    client: Prisma.TransactionClient | PrismaService,
    input: {
      b2b: boolean;
      address: { latitude: number | null; longitude: number | null };
      items: Array<{ productId: string; quantity: number }>;
      excludeNodeIds?: string[];
    },
    settings: EffectiveCheckoutSettings,
  ): Promise<Route> {
    const considered: NodeConsideration[] = [];
    const ids = input.items.map((i) => i.productId);
    const centralNode = await this.central(client, settings);

    const from = validCoordinates(input.address.latitude, input.address.longitude)
      ? { lat: input.address.latitude as number, lng: input.address.longitude as number }
      : null;

    if (!input.b2b && from) {
      const outlets = await client.warehouse.findMany({
        where: {
          kind: WarehouseKind.OUTLET,
          isActive: true,
          latitude: { not: null },
          longitude: { not: null },
          ...(input.excludeNodeIds?.length ? { id: { notIn: input.excludeNodeIds } } : {}),
        },
        select: { id: true, name: true, kind: true, branchId: true, city: true, latitude: true, longitude: true, serviceRadiusKm: true },
      });

      const ranked = outlets
        .map((o) => {
          const distanceKm = haversineKm(from, { lat: Number(o.latitude), lng: Number(o.longitude) });
          const radius = o.serviceRadiusKm === null ? settings.localRadiusKm : Number(o.serviceRadiusKm);
          return { o, distanceKm, withinRadius: distanceKm <= radius };
        })
        .sort((a, b) => a.distanceKm - b.distanceKm);

      for (const r of ranked) {
        const round2 = Math.round(r.distanceKm * 100) / 100;
        if (!r.withinRadius) {
          considered.push({ nodeId: r.o.id, name: r.o.name, distanceKm: round2, withinRadius: false, hasStock: null });
          continue;
        }
        const available = await availableByProduct(client as Prisma.TransactionClient, r.o.id, ids);
        const hasStock = input.items.every((i) => (available.get(i.productId) ?? 0) >= i.quantity);
        considered.push({ nodeId: r.o.id, name: r.o.name, distanceKm: round2, withinRadius: true, hasStock });
        if (hasStock) {
          return {
            method: 'LOCAL',
            node: { id: r.o.id, name: r.o.name, kind: r.o.kind, branchId: r.o.branchId, city: r.o.city },
            distanceKm: round2,
            reason: `Delivered from ${r.o.name}, ${round2} km from you`,
            considered,
          };
        }
      }
    }

    // Central depot: everything else.
    const available = await availableByProduct(client as Prisma.TransactionClient, centralNode.id, ids);
    assertEnough(input.items, available); // throws OutOfStockException with what is short
    const reason = input.b2b
      ? 'Bulk orders ship from our central warehouse'
      : !from
        ? 'Shipped from our central warehouse (pin your delivery location for faster local delivery)'
        : considered.some((c) => c.withinRadius)
          ? 'Your nearest store is out of stock on some items, so this ships from our central warehouse'
          : 'Outside our local delivery area, so this ships from our central warehouse';
    return { method: 'SHIPROCKET', node: centralNode, distanceKm: null, reason, considered };
  }
}

/** Compact guard used by callers that already know the node. */
export function assertNodeUsable(node: { isActive: boolean } | null): asserts node is { isActive: boolean } {
  if (!node || !node.isActive) throw new BadRequestException('The fulfilment location is no longer available');
}
