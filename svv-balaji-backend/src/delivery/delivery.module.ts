import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CheckoutModule } from '../checkout/checkout.module';
import { CommonModule } from '../common/common.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SalesModule } from '../sales/sales.module';
import { DeliveryEventsService, DeliverySettingsService, FailureReasonsService } from './core/delivery-core';
import { DeliveryAdminController, RiderPayoutsController, RidersAdminController } from './delivery-admin.controller';
import { RiderPayoutsService } from './earnings/payouts.service';
import { DispatchService } from './dispatch/dispatch.service';
import { TaskFlowService } from './dispatch/task-flow.service';
import { EarningsService } from './earnings/earnings.service';
import { RiderAppController } from './rider-app.controller';
import { RiderGateway } from './rider.gateway';
import { RiderAuthService, RiderJwtStrategy } from './riders/rider-auth';
import { RidersService } from './riders/riders.service';
import { RiderVerificationService } from './verification/verification.service';
import { DeliveryZonesModule } from './zones/zones.module';

/**
 * Last-mile delivery for local / Quick orders: riders (self sign-up + staff
 * approval), delivery tasks with auto-offer, the rider app API and socket,
 * COD collection and cash settlement, failed deliveries, rider pay rules,
 * rider onboarding (documents incl. PCC, security deposit, verification gate).
 *
 * Depends on the order code (SalesModule / CheckoutModule) and listens to its
 * event bus; the order code never depends on this module, so the same
 * machinery can later carry return pickups and other delivery SLAs.
 */
@Module({
  imports: [DeliveryZonesModule, forwardRef(() => CheckoutModule), SalesModule, RealtimeModule, CommonModule, NotificationsModule, PassportModule, JwtModule.register({})],
  controllers: [RiderAppController, RidersAdminController, RiderPayoutsController, DeliveryAdminController],
  providers: [
    DeliverySettingsService, FailureReasonsService, DeliveryEventsService,
    EarningsService, RiderPayoutsService, DispatchService, TaskFlowService,
    RiderAuthService, RiderJwtStrategy, RidersService, RiderGateway, RiderVerificationService,
  ],
  exports: [DispatchService, EarningsService, DeliverySettingsService, FailureReasonsService, RiderVerificationService],
})
export class DeliveryModule {}
