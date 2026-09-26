import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CheckoutModule } from '../checkout/checkout.module';
import { CommonModule } from '../common/common.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SalesModule } from '../sales/sales.module';
import { DeliveryEventsService, DeliverySettingsService, FailureReasonsService } from './core/delivery-core';
import { DeliveryAdminController, RidersAdminController } from './delivery-admin.controller';
import { DispatchService } from './dispatch/dispatch.service';
import { TaskFlowService } from './dispatch/task-flow.service';
import { EarningsService } from './earnings/earnings.service';
import { RiderAppController } from './rider-app.controller';
import { RiderGateway } from './rider.gateway';
import { RiderAuthService, RiderJwtStrategy } from './riders/rider-auth';
import { RidersService } from './riders/riders.service';
import { DeliveryZonesModule } from './zones/zones.module';

/**
 * Last-mile delivery for local / Quick orders: riders (self sign-up + staff
 * approval), delivery tasks with auto-offer, the rider app API and socket,
 * COD collection and cash settlement, failed deliveries, rider pay rules.
 *
 * Depends on the order code (SalesModule / CheckoutModule) and listens to its
 * event bus; the order code never depends on this module, so the same
 * machinery can later carry return pickups and other delivery SLAs.
 */
@Module({
  imports: [DeliveryZonesModule, CheckoutModule, SalesModule, RealtimeModule, CommonModule, PassportModule, JwtModule.register({})],
  controllers: [RiderAppController, RidersAdminController, DeliveryAdminController],
  providers: [
    DeliverySettingsService, FailureReasonsService, DeliveryEventsService,
    EarningsService, DispatchService, TaskFlowService,
    RiderAuthService, RiderJwtStrategy, RidersService, RiderGateway,
  ],
  exports: [DispatchService],
})
export class DeliveryModule {}
