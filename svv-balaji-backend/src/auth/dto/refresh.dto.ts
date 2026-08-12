import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'The refreshToken returned by POST /auth/login or a previous /auth/refresh.',
  })
  @IsString()
  @MinLength(20)
  refreshToken: string;
}
