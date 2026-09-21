import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, Max, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { validCoordinates } from './checkout.calculator';

const MAX_ADDRESSES = 10;

export class CreateAddressDto {
  @ApiPropertyOptional({ example: 'Home' }) @IsOptional() @IsString() @MaxLength(30) label?: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80) fullName!: string;
  @ApiProperty({ example: '9876543210' }) @Matches(/^[6-9]\d{9}$/, { message: 'Enter a valid 10-digit Indian mobile number' }) phone!: string;
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(160) line1!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) line2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) landmark?: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80) city!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80) state!: string;
  @ApiProperty({ example: '462001' }) @Matches(/^[1-9]\d{5}$/, { message: 'Enter a valid 6-digit pincode' }) pincode!: string;

  @ApiPropertyOptional({ description: 'Where to deliver. Decides local vs courier delivery.' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) @Min(-90) @Max(90) latitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) @Min(-180) @Max(180) longitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateAddressDto extends PartialType(CreateAddressDto) {}

/** Immutable copy of an address, frozen onto an order. */
export interface AddressSnapshot {
  fullName: string; phone: string; line1: string; line2: string | null; landmark: string | null;
  city: string; state: string; pincode: string; latitude: number | null; longitude: number | null;
}

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  list(customerId: string) {
    return this.prisma.customerAddress.findMany({
      where: { customerId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  private checkCoordinates(dto: { latitude?: number; longitude?: number }) {
    const hasLat = dto.latitude !== undefined;
    const hasLng = dto.longitude !== undefined;
    if (hasLat !== hasLng) throw new BadRequestException('Send both latitude and longitude, or neither');
    if (hasLat && !validCoordinates(dto.latitude, dto.longitude)) {
      throw new BadRequestException('Those coordinates are not a valid location');
    }
  }

  async create(customerId: string, dto: CreateAddressDto) {
    this.checkCoordinates(dto);
    const count = await this.prisma.customerAddress.count({ where: { customerId } });
    if (count >= MAX_ADDRESSES) throw new BadRequestException(`You can save up to ${MAX_ADDRESSES} addresses`);

    return this.prisma.$transaction(async (tx) => {
      // The first address is the default; asking for default demotes the old one.
      const makeDefault = dto.isDefault || count === 0;
      if (makeDefault) await tx.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
      return tx.customerAddress.create({ data: { ...dto, customerId, isDefault: makeDefault } });
    });
  }

  async update(customerId: string, id: string, dto: UpdateAddressDto) {
    await this.mine(customerId, id);
    this.checkCoordinates(dto);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
      return tx.customerAddress.update({ where: { id }, data: dto });
    });
  }

  async remove(customerId: string, id: string) {
    const address = await this.mine(customerId, id);
    await this.prisma.customerAddress.delete({ where: { id } });
    if (address.isDefault) {
      const next = await this.prisma.customerAddress.findFirst({ where: { customerId }, orderBy: { updatedAt: 'desc' } });
      if (next) await this.prisma.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    return { deleted: true };
  }

  /** An address that is provably this customer's - never trust an id from the client alone. */
  async mine(customerId: string, id: string) {
    const address = await this.prisma.customerAddress.findFirst({ where: { id, customerId } });
    if (!address) throw new NotFoundException('Address not found');
    return address;
  }

  toSnapshot(a: Awaited<ReturnType<AddressesService['mine']>>): AddressSnapshot {
    return {
      fullName: a.fullName, phone: a.phone, line1: a.line1, line2: a.line2, landmark: a.landmark,
      city: a.city, state: a.state, pincode: a.pincode,
      latitude: a.latitude === null ? null : Number(a.latitude),
      longitude: a.longitude === null ? null : Number(a.longitude),
    };
  }
}
