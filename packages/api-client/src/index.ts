import type {
  FloorPlanDraft,
  DetectedLayout,
  TableInput,
  TableListItem,
  CreateInvitationInput,
  OwnerOnboardingInput,
  RedeemInvitationInput,
  RegisterDeviceInput,
  ReviewOnboardingInput,
  RestaurantRole,
  SessionUser,
  SyncProfileInput,
  UpdateProfileInput,
  OnboardingStatus,
  Category,
  Page,
  RestaurantDetail,
  RestaurantListQuery,
  RestaurantSummary,
  QrResolution,
  VisitView,
  CreateServiceRequestInput,
  ServiceRequestView,
  ServiceRequestDetail,
  ServiceMessageView,
  SendMessageInput,
  StaffServiceQuery,
  StaffServiceStats,
  NotificationView,
  MenuView,
  OrderView,
  CreateOrderInput,
  UpdateOrderStatusInput,
  ManagedRestaurant,
  UpdateRestaurantInput,
  MenuCategoryAdminView,
  MenuItemInput,
  UtensilView,
  AmenityView,
  ServiceTypeAdminView,
  FloorPlanView,
  SaveLayoutInput,
  TableDetailView,
  QrCodeView,
  AvailabilitySlot,
  CreateReservationInput,
  ReservationView,
  ReservationStatus,
  FavouriteView,
  AnalyticsQuery,
  AnalyticsSummary,
  EmployeeCard,
  EmployeeMetrics,
  FilePurpose,
  ServiceKind,
  MenuKind,
} from '@servebell/shared';
import { HttpClient, type ApiClientOptions } from './http.js';

export { ApiError, type ApiClientOptions } from './http.js';
export { queryKeys } from './query-keys.js';

export interface Invitation {
  id: string;
  email: string;
  role: RestaurantRole;
  expiresAt: string;
  createdAt: string;
  invitedBy?: { fullName: string };
}

export interface OwnerApplication extends OwnerOnboardingInput {
  id: string;
  status: OnboardingStatus;
  reviewNote: string | null;
  restaurantId: string | null;
  createdAt: string;
  /** Present in the platform-admin review listing. */
  applicant?: { id: string; fullName: string; email: string; phone: string | null };
}

/** One typed client for every app. Endpoint shapes come from @servebell/shared. */
export function createApiClient(options: ApiClientOptions) {
  const http = new HttpClient(options);
  return {
    http,
    health: () => http.request<{ status: string; time: string }>('GET', '/health', { auth: false }),
    auth: {
      sync: (body: SyncProfileInput) => http.request<SessionUser>('POST', '/auth/sync', { body }),
      me: () => http.request<SessionUser>('GET', '/auth/me'),
      updateProfile: (body: UpdateProfileInput) => http.request<SessionUser>('PATCH', '/auth/me', { body }),
    },
    invitations: {
      redeem: (body: RedeemInvitationInput) =>
        http.request<{ restaurantId: string; role: RestaurantRole; memberId: string; user: SessionUser }>('POST', '/invitations/redeem', { body }),
      create: (restaurantId: string, body: CreateInvitationInput) =>
        http.request<Invitation & { code: string }>('POST', `/restaurants/${restaurantId}/invitations`, { body }),
      list: (restaurantId: string) => http.request<Invitation[]>('GET', `/restaurants/${restaurantId}/invitations`),
      revoke: (restaurantId: string, id: string) => http.request<void>('DELETE', `/restaurants/${restaurantId}/invitations/${id}`),
    },
    onboarding: {
      apply: (body: OwnerOnboardingInput) => http.request<OwnerApplication>('POST', '/onboarding/owner-applications', { body }),
      mine: () => http.request<OwnerApplication[]>('GET', '/onboarding/owner-applications/mine'),
      list: (status: OnboardingStatus = 'PENDING') => http.request<OwnerApplication[]>('GET', '/onboarding/owner-applications', { query: { status } }),
      review: (id: string, body: ReviewOnboardingInput) => http.request<OwnerApplication>('POST', `/onboarding/owner-applications/${id}/review`, { body }),
    },
    restaurants: {
      categories: () => http.request<Category[]>('GET', '/categories', { auth: false }),
      list: (query: Partial<RestaurantListQuery>) => http.request<Page<RestaurantSummary>>('GET', '/restaurants', { query, auth: false }),
      detail: (idOrSlug: string) => http.request<RestaurantDetail>('GET', `/restaurants/${encodeURIComponent(idOrSlug)}`),
    },
    menu: {
      get: (idOrSlug: string) => http.request<MenuView>('GET', `/restaurants/${encodeURIComponent(idOrSlug)}/menu`, { auth: false }),
    },
    orders: {
      create: (body: CreateOrderInput) => http.request<OrderView>('POST', '/orders', { body }),
      mine: (query: { active?: boolean; cursor?: string; limit?: number } = {}) => http.request<Page<OrderView>>('GET', '/orders/mine', { query }),
      detail: (id: string) => http.request<OrderView>('GET', `/orders/${id}`),
      cancel: (id: string) => http.request<OrderView>('POST', `/orders/${id}/cancel`),
    },
    staffOrders: {
      list: (restaurantId: string, view: 'open' | 'done') => http.request<Page<OrderView>>('GET', `/restaurants/${restaurantId}/orders`, { query: { view } }),
      setStatus: (restaurantId: string, id: string, body: UpdateOrderStatusInput) => http.request<OrderView>('POST', `/restaurants/${restaurantId}/orders/${id}/status`, { body }),
    },
    visits: {
      start: (qr: string, guestCount?: number) => http.request<VisitView>('POST', '/visits', { body: { qr, guestCount } }),
      active: () => http.request<{ visit: VisitView | null }>('GET', '/visits/active'),
      leave: (id: string) => http.request<void>('POST', `/visits/${id}/leave`),
    },
    services: {
      create: (body: CreateServiceRequestInput) => http.request<ServiceRequestView & { duplicate: boolean }>('POST', '/services', { body }),
      mine: (query: { active?: boolean; cursor?: string; limit?: number } = {}) => http.request<Page<ServiceRequestView>>('GET', '/services/mine', { query }),
      detail: (id: string) => http.request<ServiceRequestDetail>('GET', `/services/${id}`),
      cancel: (id: string, reason?: string) => http.request<ServiceRequestView>('POST', `/services/${id}/cancel`, { body: { reason } }),
      messages: (id: string) => http.request<ServiceMessageView[]>('GET', `/services/${id}/messages`),
      sendMessage: (id: string, body: SendMessageInput) => http.request<ServiceMessageView>('POST', `/services/${id}/messages`, { body }),
      markRead: (id: string) => http.request<void>('POST', `/services/${id}/read`),
    },
    staffServices: {
      list: (restaurantId: string, query: Partial<StaffServiceQuery>) => http.request<Page<ServiceRequestView>>('GET', `/restaurants/${restaurantId}/services`, { query }),
      stats: (restaurantId: string) => http.request<StaffServiceStats>('GET', `/restaurants/${restaurantId}/services/stats/me`),
      accept: (restaurantId: string, id: string) => http.request<ServiceRequestView>('POST', `/restaurants/${restaurantId}/services/${id}/accept`),
      wait: (restaurantId: string, id: string) => http.request<ServiceRequestDetail>('POST', `/restaurants/${restaurantId}/services/${id}/wait`),
      start: (restaurantId: string, id: string) => http.request<ServiceRequestView>('POST', `/restaurants/${restaurantId}/services/${id}/start`),
      complete: (restaurantId: string, id: string) => http.request<ServiceRequestView>('POST', `/restaurants/${restaurantId}/services/${id}/complete`),
      cancel: (restaurantId: string, id: string, reason: string) => http.request<ServiceRequestView>('POST', `/restaurants/${restaurantId}/services/${id}/cancel`, { body: { reason } }),
    },
    notifications: {
      list: (cursor?: string) => http.request<Page<NotificationView>>('GET', '/notifications', { query: { cursor } }),
      unreadCount: () => http.request<{ count: number }>('GET', '/notifications/unread-count'),
      readAll: () => http.request<void>('POST', '/notifications/read-all'),
    },
    uploads: {
      /** `file` is a React Native file descriptor ({ uri, name, type }) or a Blob. */
      image: (file: unknown, purpose: FilePurpose, restaurantId?: string) => {
        const form = new FormData();
        form.append('file', file as Blob);
        form.append('purpose', purpose);
        if (restaurantId) form.append('restaurantId', restaurantId);
        return http.upload<{ id: string; url: string; width: number; height: number }>('/uploads', form);
      },
    },
    floorPlans: {
      published: (idOrSlug: string) => http.request<FloorPlanView[]>('GET', `/restaurants/${encodeURIComponent(idOrSlug)}/floor-plans`, { auth: false }),
      table: (idOrSlug: string, tableId: string) => http.request<TableDetailView>('GET', `/restaurants/${encodeURIComponent(idOrSlug)}/tables/${tableId}`, { auth: false }),
      manage: (rid: string) => http.request<FloorPlanView[]>('GET', `/restaurants/${rid}/manage/floor-plans`),
      create: (rid: string, body: { name: string; widthCm: number; depthCm: number }) => http.request<FloorPlanView>('POST', `/restaurants/${rid}/manage/floor-plans`, { body }),
      save: (rid: string, id: string, body: SaveLayoutInput) => http.request<FloorPlanView>('PUT', `/restaurants/${rid}/manage/floor-plans/${id}`, { body }),
      publish: (rid: string, id: string, publish: boolean) => http.request<FloorPlanView>('POST', `/restaurants/${rid}/manage/floor-plans/${id}/publish`, { body: { publish } }),
      setReference: (rid: string, id: string, fileId: string | null) => http.request<FloorPlanView>('PUT', `/restaurants/${rid}/manage/floor-plans/${id}/reference`, { body: { fileId } }),
      tableDetails: (rid: string, tableId: string, body: { description?: string | null; features?: string[]; imageFileIds?: string[] }) => http.request<TableDetailView>('PUT', `/restaurants/${rid}/manage/tables/${tableId}`, { body }),
      saveDraft: (rid: string, id: string, body: FloorPlanDraft) => http.request<{ draftSavedAt: string }>('PUT', `/restaurants/${rid}/manage/floor-plans/${id}/draft`, { body }),
      discardDraft: (rid: string, id: string) => http.request<void>('DELETE', `/restaurants/${rid}/manage/floor-plans/${id}/draft`),
      detect: (rid: string, id: string, fileId: string) => http.request<DetectedLayout>('POST', `/restaurants/${rid}/manage/floor-plans/${id}/detect`, { body: { fileId } }),
    },
    tables: {
      list: (rid: string) => http.request<TableListItem[]>('GET', `/restaurants/${rid}/manage/tables`),
      create: (rid: string, body: Partial<TableInput> & Pick<TableInput, 'label' | 'capacity'>) => http.request<TableListItem>('POST', `/restaurants/${rid}/manage/tables`, { body }),
      update: (rid: string, id: string, body: Partial<TableInput> & Pick<TableInput, 'label' | 'capacity'>) => http.request<TableListItem>('PUT', `/restaurants/${rid}/manage/tables/${id}/basics`, { body }),
      remove: (rid: string, id: string) => http.request<void>('DELETE', `/restaurants/${rid}/manage/tables/${id}`),
    },
    qr: {
      resolve: (token: string) => http.request<QrResolution>('GET', `/qr/${encodeURIComponent(token)}`, { auth: false }),
      list: (rid: string) => http.request<QrCodeView[]>('GET', `/restaurants/${rid}/manage/qr-codes`),
      regenerate: (rid: string, tableId: string) => http.request<QrCodeView>('POST', `/restaurants/${rid}/manage/tables/${tableId}/qr/regenerate`),
      deactivate: (rid: string, tableId: string) => http.request<void>('POST', `/restaurants/${rid}/manage/tables/${tableId}/qr/deactivate`),
      printHtml: (rid: string, tableIds?: string[]) => http.text(`/restaurants/${rid}/manage/qr-codes/print${tableIds?.length ? `?tables=${tableIds.join(',')}` : ''}`),
    },
    reservations: {
      availability: (tableId: string, date: string, partySize: number) => http.request<AvailabilitySlot[]>('GET', `/tables/${tableId}/availability`, { query: { date, partySize }, auth: false }),
      restaurantAvailability: (idOrSlug: string, date: string, partySize: number) => http.request<AvailabilitySlot[]>('GET', `/restaurants/${encodeURIComponent(idOrSlug)}/availability`, { query: { date, partySize }, auth: false }),
      create: (body: CreateReservationInput) => http.request<ReservationView>('POST', '/reservations', { body }),
      mine: () => http.request<ReservationView[]>('GET', '/reservations/mine'),
      cancel: (id: string) => http.request<ReservationView>('POST', `/reservations/${id}/cancel`),
      list: (rid: string, query: { date?: string; status?: ReservationStatus }) => http.request<ReservationView[]>('GET', `/restaurants/${rid}/reservations`, { query }),
      setStatus: (rid: string, id: string, status: Exclude<ReservationStatus, 'PENDING'>, reason?: string, tableId?: string) => http.request<ReservationView>('POST', `/restaurants/${rid}/reservations/${id}/status`, { body: { status, reason, tableId } }),
    },
    favourites: {
      list: () => http.request<FavouriteView[]>('GET', '/favourites'),
      add: (rid: string) => http.request<void>('PUT', `/favourites/${rid}`),
      remove: (rid: string) => http.request<void>('DELETE', `/favourites/${rid}`),
    },
    analytics: {
      summary: (rid: string, query: AnalyticsQuery = {}) => http.request<AnalyticsSummary>('GET', `/restaurants/${rid}/analytics/summary`, { query }),
      employees: (rid: string) => http.request<EmployeeCard[]>('GET', `/restaurants/${rid}/employees`),
      employee: (rid: string, memberId: string, query: AnalyticsQuery = {}) =>
        http.request<{ employee: EmployeeCard; range: { from: string; to: string; metrics: EmployeeMetrics }; requests: { id: string; number: number; status: string; table: string; service: string; kind: ServiceKind; icon: string | null; customer: string; messages: number; createdAt: string; acceptedAt: string | null; completedAt: string | null }[] }>('GET', `/restaurants/${rid}/employees/${memberId}`, { query }),
      updateEmployee: (rid: string, memberId: string, body: { status?: 'ACTIVE' | 'SUSPENDED' | 'REMOVED'; role?: 'ADMIN' | 'WAITER' }) => http.request<EmployeeCard>('PATCH', `/restaurants/${rid}/employees/${memberId}`, { body }),
    },
    manage: {
      get: (rid: string) => http.request<ManagedRestaurant>('GET', `/restaurants/${rid}/manage`),
      update: (rid: string, body: UpdateRestaurantInput) => http.request<ManagedRestaurant>('PATCH', `/restaurants/${rid}/manage`, { body }),
      setHours: (rid: string, hours: ManagedRestaurant['openingHours']) => http.request<ManagedRestaurant>('PUT', `/restaurants/${rid}/manage/hours`, { body: { hours } }),
      setStatus: (rid: string, status: 'ACTIVE' | 'DRAFT') => http.request<ManagedRestaurant>('POST', `/restaurants/${rid}/manage/status`, { body: { status } }),
      categories: (rid: string) => http.request<MenuCategoryAdminView[]>('GET', `/restaurants/${rid}/manage/menu/categories`),
      createCategory: (rid: string, body: { name: string; kind: MenuKind }) => http.request<MenuCategoryAdminView>('POST', `/restaurants/${rid}/manage/menu/categories`, { body }),
      updateCategory: (rid: string, id: string, body: Partial<{ name: string; kind: MenuKind; isActive: boolean; sortOrder: number }>) => http.request<MenuCategoryAdminView>('PATCH', `/restaurants/${rid}/manage/menu/categories/${id}`, { body }),
      deleteCategory: (rid: string, id: string) => http.request<void>('DELETE', `/restaurants/${rid}/manage/menu/categories/${id}`),
      items: (rid: string) => http.request<(Omit<MenuItemInput, 'imageFileId'> & { id: string; imageUrl: string | null; isAvailable: boolean })[]>('GET', `/restaurants/${rid}/manage/menu/items`),
      createItem: (rid: string, body: MenuItemInput) => http.request<{ id: string }>('POST', `/restaurants/${rid}/manage/menu/items`, { body }),
      updateItem: (rid: string, id: string, body: Partial<MenuItemInput>) => http.request<{ id: string }>('PATCH', `/restaurants/${rid}/manage/menu/items/${id}`, { body }),
      deleteItem: (rid: string, id: string) => http.request<void>('DELETE', `/restaurants/${rid}/manage/menu/items/${id}`),
      utensils: (rid: string) => http.request<UtensilView[]>('GET', `/restaurants/${rid}/manage/utensils`),
      saveUtensil: (rid: string, body: Partial<UtensilView> & { name: string }, id?: string) => http.request<UtensilView>(id ? 'PATCH' : 'POST', `/restaurants/${rid}/manage/utensils${id ? `/${id}` : ''}`, { body }),
      deleteUtensil: (rid: string, id: string) => http.request<void>('DELETE', `/restaurants/${rid}/manage/utensils/${id}`),
      amenities: (rid: string) => http.request<AmenityView[]>('GET', `/restaurants/${rid}/manage/amenities`),
      saveAmenity: (rid: string, body: Partial<AmenityView> & { name: string }, id?: string) => http.request<AmenityView>(id ? 'PATCH' : 'POST', `/restaurants/${rid}/manage/amenities${id ? `/${id}` : ''}`, { body }),
      deleteAmenity: (rid: string, id: string) => http.request<void>('DELETE', `/restaurants/${rid}/manage/amenities/${id}`),
      serviceTypes: (rid: string) => http.request<ServiceTypeAdminView[]>('GET', `/restaurants/${rid}/manage/service-types`),
      saveServiceType: (rid: string, body: Partial<ServiceTypeAdminView> & { name: string; kind: ServiceKind }, id?: string) => http.request<ServiceTypeAdminView>(id ? 'PATCH' : 'POST', `/restaurants/${rid}/manage/service-types${id ? `/${id}` : ''}`, { body }),
      deleteServiceType: (rid: string, id: string) => http.request<void>('DELETE', `/restaurants/${rid}/manage/service-types/${id}`),
    },
    devices: {
      register: (body: RegisterDeviceInput) => http.request<void>('POST', '/notifications/devices', { body }),
      unregister: (token: string) => http.request<void>('DELETE', `/notifications/devices/${encodeURIComponent(token)}`),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
