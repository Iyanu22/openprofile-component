import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Body for PATCH /v1/profiles/me/components/:componentId.
 *
 * Per RFC §5.1, `display_order` is intentionally NOT patchable here — clients
 * must use the reorder endpoint instead. Whitelist-by-type validation +
 * `forbidNonWhitelisted: true` in the global ValidationPipe will reject any
 * `display_order` field with a 400, matching the spec.
 */
export class PatchComponentDto {
  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
