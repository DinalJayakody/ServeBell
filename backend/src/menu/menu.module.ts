import { Controller, Get, Module, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MenuService } from './menu.service.js';
import { Public } from '../common/decorators/public.decorator.js';

@ApiTags('menu')
@Controller({ path: 'restaurants/:idOrSlug/menu', version: '1' })
class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Food and drink menu with images and options (public)' })
  get(@Param('idOrSlug') idOrSlug: string) {
    return this.menu.forRestaurant(idOrSlug);
  }
}

@Module({ controllers: [MenuController], providers: [MenuService], exports: [MenuService] })
export class MenuModule {}
