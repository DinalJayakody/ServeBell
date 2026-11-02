import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  amenityInputSchema, menuCategoryInputSchema, menuItemInputSchema, menuItemPatchSchema, openingHoursSchema, Permission,
  restaurantStatusSchema, serviceTypeInputSchema, updateRestaurantSchema, utensilInputSchema,
} from '@servebell/shared';
import { ManageService } from './manage.service.js';
import { ZodPipe } from '../common/pipes/zod-validation.pipe.js';
import { CurrentUser, RequirePermission } from '../common/decorators/auth.decorators.js';
import type { AuthUser } from '../common/request-context.js';

const A = (u: AuthUser, rid: string) => ({ userId: u.id, restaurantId: rid });
const R = 'restaurantId';

@ApiTags('manage')
@Controller({ path: 'restaurants/:restaurantId/manage', version: '1' })
export class ManageController {
  constructor(private readonly m: ManageService) {}

  @RequirePermission(Permission.RESTAURANT_READ) @Get()
  @ApiOperation({ summary: 'Restaurant profile for staff (any member)' })
  get(@Param(R) rid: string) { return this.m.getRestaurant(rid); }

  @RequirePermission(Permission.RESTAURANT_MANAGE) @Patch()
  @ApiOperation({ summary: 'Update profile (OWNER/ADMIN)' })
  update(@CurrentUser() u: AuthUser, @Param(R) rid: string, @Body(new ZodPipe(updateRestaurantSchema)) b: z.infer<typeof updateRestaurantSchema>) { return this.m.updateRestaurant(A(u, rid), b); }

  @RequirePermission(Permission.RESTAURANT_MANAGE) @Put('hours')
  @ApiOperation({ summary: 'Replace weekly opening hours (OWNER/ADMIN)' })
  hours(@CurrentUser() u: AuthUser, @Param(R) rid: string, @Body(new ZodPipe(openingHoursSchema)) b: z.infer<typeof openingHoursSchema>) { return this.m.setHours(A(u, rid), b); }

  @RequirePermission(Permission.RESTAURANT_MANAGE) @Post('status')
  @ApiOperation({ summary: 'Go live (ACTIVE) or hide (DRAFT) — OWNER/ADMIN' })
  status(@CurrentUser() u: AuthUser, @Param(R) rid: string, @Body(new ZodPipe(restaurantStatusSchema)) b: z.infer<typeof restaurantStatusSchema>) { return this.m.setStatus(A(u, rid), b.status); }

  // Menu
  @RequirePermission(Permission.MENU_MANAGE) @Get('menu/categories') categories(@Param(R) rid: string) { return this.m.listCategories(rid); }
  @RequirePermission(Permission.MENU_MANAGE) @Post('menu/categories') createCategory(@CurrentUser() u: AuthUser, @Param(R) rid: string, @Body(new ZodPipe(menuCategoryInputSchema)) b: z.infer<typeof menuCategoryInputSchema>) { return this.m.createCategory(A(u, rid), b); }
  @RequirePermission(Permission.MENU_MANAGE) @Patch('menu/categories/:id') updateCategory(@CurrentUser() u: AuthUser, @Param(R) rid: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(menuCategoryInputSchema.partial())) b: Partial<z.infer<typeof menuCategoryInputSchema>>) { return this.m.updateCategory(A(u, rid), id, b); }
  @RequirePermission(Permission.MENU_MANAGE) @HttpCode(204) @Delete('menu/categories/:id') async deleteCategory(@CurrentUser() u: AuthUser, @Param(R) rid: string, @Param('id', ParseUUIDPipe) id: string) { await this.m.deleteCategory(A(u, rid), id); }
  @RequirePermission(Permission.MENU_MANAGE) @Get('menu/items') items(@Param(R) rid: string) { return this.m.listItems(rid); }
  @RequirePermission(Permission.MENU_MANAGE) @Post('menu/items') createItem(@CurrentUser() u: AuthUser, @Param(R) rid: string, @Body(new ZodPipe(menuItemInputSchema)) b: z.infer<typeof menuItemInputSchema>) { return this.m.createItem(A(u, rid), b); }
  @RequirePermission(Permission.MENU_MANAGE) @Patch('menu/items/:id') updateItem(@CurrentUser() u: AuthUser, @Param(R) rid: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(menuItemPatchSchema)) b: z.infer<typeof menuItemPatchSchema>) { return this.m.updateItem(A(u, rid), id, b); }
  @RequirePermission(Permission.MENU_MANAGE) @HttpCode(204) @Delete('menu/items/:id') async deleteItem(@CurrentUser() u: AuthUser, @Param(R) rid: string, @Param('id', ParseUUIDPipe) id: string) { await this.m.deleteItem(A(u, rid), id); }

  // Utensils
  @RequirePermission(Permission.CATALOG_MANAGE) @Get('utensils') utensils(@Param(R) rid: string) { return this.m.listUtensils(rid); }
  @RequirePermission(Permission.CATALOG_MANAGE) @Post('utensils') createUtensil(@CurrentUser() u: AuthUser, @Param(R) rid: string, @Body(new ZodPipe(utensilInputSchema)) b: z.infer<typeof utensilInputSchema>) { return this.m.createUtensil(A(u, rid), b); }
  @RequirePermission(Permission.CATALOG_MANAGE) @Patch('utensils/:id') updateUtensil(@CurrentUser() u: AuthUser, @Param(R) rid: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(utensilInputSchema.partial())) b: Partial<z.infer<typeof utensilInputSchema>>) { return this.m.updateUtensil(A(u, rid), id, b); }
  @RequirePermission(Permission.CATALOG_MANAGE) @HttpCode(204) @Delete('utensils/:id') async deleteUtensil(@CurrentUser() u: AuthUser, @Param(R) rid: string, @Param('id', ParseUUIDPipe) id: string) { await this.m.deleteUtensil(A(u, rid), id); }

  // Amenities
  @RequirePermission(Permission.CATALOG_MANAGE) @Get('amenities') amenities(@Param(R) rid: string) { return this.m.listAmenities(rid); }
  @RequirePermission(Permission.CATALOG_MANAGE) @Post('amenities') createAmenity(@CurrentUser() u: AuthUser, @Param(R) rid: string, @Body(new ZodPipe(amenityInputSchema)) b: z.infer<typeof amenityInputSchema>) { return this.m.createAmenity(A(u, rid), b); }
  @RequirePermission(Permission.CATALOG_MANAGE) @Patch('amenities/:id') updateAmenity(@CurrentUser() u: AuthUser, @Param(R) rid: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(amenityInputSchema.partial())) b: Partial<z.infer<typeof amenityInputSchema>>) { return this.m.updateAmenity(A(u, rid), id, b); }
  @RequirePermission(Permission.CATALOG_MANAGE) @HttpCode(204) @Delete('amenities/:id') async deleteAmenity(@CurrentUser() u: AuthUser, @Param(R) rid: string, @Param('id', ParseUUIDPipe) id: string) { await this.m.deleteAmenity(A(u, rid), id); }

  // Service types
  @RequirePermission(Permission.SERVICE_TYPES_MANAGE) @Get('service-types') serviceTypes(@Param(R) rid: string) { return this.m.listServiceTypes(rid); }
  @RequirePermission(Permission.SERVICE_TYPES_MANAGE) @Post('service-types') createServiceType(@CurrentUser() u: AuthUser, @Param(R) rid: string, @Body(new ZodPipe(serviceTypeInputSchema)) b: z.infer<typeof serviceTypeInputSchema>) { return this.m.createServiceType(A(u, rid), b); }
  @RequirePermission(Permission.SERVICE_TYPES_MANAGE) @Patch('service-types/:id') updateServiceType(@CurrentUser() u: AuthUser, @Param(R) rid: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(serviceTypeInputSchema.partial())) b: Partial<z.infer<typeof serviceTypeInputSchema>>) { return this.m.updateServiceType(A(u, rid), id, b); }
  @RequirePermission(Permission.SERVICE_TYPES_MANAGE) @HttpCode(204) @Delete('service-types/:id') async deleteServiceType(@CurrentUser() u: AuthUser, @Param(R) rid: string, @Param('id', ParseUUIDPipe) id: string) { await this.m.deleteServiceType(A(u, rid), id); }
}
