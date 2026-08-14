import { Global, Module } from '@nestjs/common';
import { PermissionsGuard } from '../guards/permissions.guard';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';

/**
 * Global because PermissionsGuard is constructed inside every feature module
 * that guards a route, and each one would otherwise have to import this module
 * by hand. Forgetting to would surface as a Nest dependency error at boot
 * rather than as an open endpoint, but there are twenty of them and no reason
 * to make each one repeat the import.
 */
@Global()
@Module({
  controllers: [PermissionsController],
  providers: [PermissionsService, PermissionsGuard],
  exports: [PermissionsService, PermissionsGuard],
})
export class PermissionsModule {}
