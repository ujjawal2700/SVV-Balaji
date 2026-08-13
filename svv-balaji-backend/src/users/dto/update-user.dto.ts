import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { IsEnum, IsString, MinLength } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

/**
 * Password is deliberately not editable here - it goes through
 * `PATCH /users/:id/password`, which also invalidates the user's refresh
 * token. Folding it into the general update would make it possible to change
 * a password as a side effect of editing a phone number.
 */
export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['password'] as const)) {}

export class UpdateUserStatusDto {
  @ApiProperty({ enum: UserStatus })
  @IsEnum(UserStatus)
  status: UserStatus;
}

export class ResetUserPasswordDto {
  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;
}

export class QueryUserDto {
  @ApiPropertyOptional()
  branchId?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  status?: UserStatus;
}
