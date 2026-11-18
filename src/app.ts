import { Elysia } from 'elysia';
import { authRoutes } from './modules/auth/auth.routes.js';
import { linksRoutes } from './modules/links/links.routes.js';

export function createApp() {
  return linksRoutes(authRoutes(new Elysia()));
}
