import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminOrdersGateway } from './admin-orders.gateway';
import { OrderEventsService } from './order-events.service';
import { PushService } from './push.service';
import { RealtimeController } from './realtime.controller';

/** Global so any module that changes an order can publish without importing this. */
@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [RealtimeController],
  providers: [OrderEventsService, PushService, AdminOrdersGateway],
  exports: [OrderEventsService, PushService],
})
export class RealtimeModule {}
