import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { restaurantListQuerySchema, type RestaurantListQuery } from '@servebell/shared';
import { RestaurantsService } from './restaurants.service.js';
import { ZodPipe } from '../common/pipes/zod-validation.pipe.js';
import { Public } from '../common/decorators/public.decorator.js';
import { CurrentUser, OptionalAuth } from '../common/decorators/auth.decorators.js';
import type { AuthUser } from '../common/request-context.js';

@ApiTags('restaurants')
@Controller({ version: '1' })
export class RestaurantsController {
  constructor(private readonly restaurants: RestaurantsService) {}

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'Restaurant categories (public)' })
  categories() {
    return this.restaurants.categories();
  }

  @Public()
  @Get('restaurants')
  @ApiOperation({ summary: 'Discover restaurants: search, filter, distance ordering, cursor pagination (public)' })
  list(@Query(new ZodPipe(restaurantListQuerySchema)) q: RestaurantListQuery) {
    return this.restaurants.list(q);
  }

  @OptionalAuth()
  @Get('restaurants/:idOrSlug')
  @ApiOperation({ summary: 'Restaurant details by id or slug (public; includes isFavourite when signed in)' })
  detail(@Param('idOrSlug') idOrSlug: string, @CurrentUser() user?: AuthUser) {
    return this.restaurants.detail(idOrSlug, user?.id);
  }
}
