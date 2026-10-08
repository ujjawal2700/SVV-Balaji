import { BadRequestException, Controller, Get, Global, Module, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomerJwtAuthGuard } from '../storefront/guards/customer-jwt-auth.guard';
import { MapsService } from './maps.service';

const SESSION = /^[A-Za-z0-9-]{8,64}$/;

function coord(v: string | undefined, min: number, max: number): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new BadRequestException('Bad coordinates');
  return n;
}

/**
 * Address search for signed-in shoppers (address book, checkout). Signed-in only,
 * so the company's Google quota cannot be spent by anyone on the internet.
 */
@ApiTags('storefront-maps')
@ApiBearerAuth()
@UseGuards(CustomerJwtAuthGuard)
@Controller('storefront/maps')
export class StorefrontMapsController {
  constructor(private readonly maps: MapsService) {}

  @Get('autocomplete')
  @ApiOperation({
    summary: 'Address suggestions (India) for what was typed. session = one UUID per address search, reused for its place call',
  })
  autocomplete(@Query('input') input = '', @Query('session') session = '', @Query('lat') lat?: string, @Query('lng') lng?: string) {
    if (!SESSION.test(session)) throw new BadRequestException('session must be a UUID per address search');
    if (input.length > 120) throw new BadRequestException('Too long');
    const la = coord(lat, -90, 90);
    const ln = coord(lng, -180, 180);
    return this.maps.autocomplete(input, session, la !== undefined && ln !== undefined ? { lat: la, lng: ln } : undefined);
  }

  @Get('place/:placeId')
  @ApiOperation({ summary: 'The chosen suggestion as address fields + pin (line1, line2, city, state, pincode, latitude, longitude)' })
  place(@Param('placeId') placeId: string, @Query('session') session = '') {
    if (!SESSION.test(session)) throw new BadRequestException('session must be a UUID per address search');
    return this.maps.placeDetails(placeId, session);
  }

  @Get('reverse')
  @ApiOperation({ summary: 'Address fields for a pin (use my location)' })
  reverse(@Query('lat') lat?: string, @Query('lng') lng?: string) {
    const la = coord(lat, -90, 90);
    const ln = coord(lng, -180, 180);
    if (la === undefined || ln === undefined) throw new BadRequestException('lat and lng are required');
    return this.maps.reverseGeocode(la, ln);
  }
}

/** Global: delivery, checkout and anything else needing roads or addresses inject MapsService directly. */
@Global()
@Module({
  controllers: [StorefrontMapsController],
  providers: [MapsService],
  exports: [MapsService],
})
export class MapsModule {}
