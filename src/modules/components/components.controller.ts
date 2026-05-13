import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ComponentsService } from './components.service';
import { PatchComponentDto } from './dto/patch-component.dto';
import { ReorderComponentsDto } from './dto/reorder-components.dto';
import { Component } from './entities/component.entity';

/**
 * Per RFC §5, both endpoints live under /v1/profiles/me/components.
 * The `me` segment means the user can only act on their own profile —
 * the auth guard supplies the user ID and the service does ownership
 * verification before any write.
 */
@Controller({ path: 'v1/profiles/me/components', version: undefined })
@UseGuards(JwtAuthGuard)
export class ComponentsController {
  constructor(private readonly componentsService: ComponentsService) {}

  /**
   * PUT /v1/profiles/me/components/order
   *
   * Note: this route is defined BEFORE the :componentId PATCH route below
   * so Nest's route matcher doesn't try to interpret "order" as a UUID
   * component ID. (Not strictly required since the methods differ, but
   * it's a cheap defence against future refactors that might add a GET.)
   */
  @Put('order')
  @HttpCode(HttpStatus.OK)
  async reorder(
    @CurrentUser('id') userId: string,
    @Body() dto: ReorderComponentsDto,
  ): Promise<{ components: Component[] }> {
    const components = await this.componentsService.reorderComponents(
      userId,
      dto,
    );
    return { components };
  }

  /**
   * PATCH /v1/profiles/me/components/:componentId
   *
   * ParseUUIDPipe rejects non-UUID componentIds with a 400 before the
   * service is hit — saves us a DB round-trip for obvious garbage.
   */
  @Patch(':componentId')
  async patch(
    @CurrentUser('id') userId: string,
    @Param('componentId', new ParseUUIDPipe())
    componentId: string,
    @Body() dto: PatchComponentDto,
  ): Promise<Component> {
    return this.componentsService.patchComponent(userId, componentId, dto);
  }
}
