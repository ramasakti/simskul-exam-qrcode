import { t } from 'elysia';
import moment from 'moment';
import * as authService from '../auth/auth.service.js';
import * as service from './links.service.js';

export function linksRoutes(app: any) {
  return app.post('/generate', async ({ body, headers, set }: any) => { try {
    const authorization = headers.authorization;
    if (!authorization?.startsWith('Bearer ')) { set.status = 401; return { success: false, message: 'Token autentikasi wajib diisi.' }; }
    const user = await authService.getUserFromToken(authorization.slice(7));
    if (!user) { set.status = 401; return { success: false, message: 'Token autentikasi tidak valid atau sudah kedaluwarsa.' }; }
    const result = await service.generate(body, user.id); set.status = result.status; return result.body; } catch (error: any) { set.status = 500; return { success: false, message: 'Terjadi kesalahan pada server.', error: error.message }; } }, { body: t.Any() })
    .get('/links', async ({ headers, set }: any) => { try {
      const authorization = headers.authorization;
      if (!authorization?.startsWith('Bearer ')) { set.status = 401; return { success: false, message: 'Token autentikasi wajib diisi.' }; }
      const user = await authService.getUserFromToken(authorization.slice(7));
      if (!user) { set.status = 401; return { success: false, message: 'Token autentikasi tidak valid atau sudah kedaluwarsa.' }; }
      return { success: true, data: await service.getAllByUserId(user.id) };
    } catch (error: any) { set.status = 500; return { success: false, message: 'Terjadi kesalahan pada server.', error: error.message }; } })
    .get('/url/:url_hash', async ({ params, set }: any) => { try { const link = await service.get(params.url_hash); if (!link) { set.status = 404; return { success: false, message: `Link dengan kode "${params.url_hash}" tidak ditemukan.` }; } if (link.start && Date.now() > new Date(link.start).getTime()) { set.status = 410; return { success: false, message: 'Ujian belum dimulai.' }; } if (link.end && Date.now() > new Date(link.end).getTime()) { set.status = 410; return { success: false, message: 'Ujian sudah berakhir.' }; } const { mapLink } = await import('./links.mapper.js'); return { success: true, data: mapLink(link) }; } catch (error: any) { set.status = 500; return { success: false, message: 'Terjadi kesalahan pada server.', error: error.message }; } }, { params: t.Object({ url_hash: t.String() }) })
    .get('/logout/:url_hash', async ({ params, set }: any) => { try { const link = await service.get(params.url_hash); if (!link) { set.status = 404; return { success: false, message: `Link dengan kode "${params.url_hash}" tidak ditemukan.` }; } if (link.min_logout == null) return { success: true, message: 'Logout valid.', data: { valid: true, earliest_logout: null } }; const ms = new Date(link.min_logout).getTime(); if (!Number.isFinite(ms)) { set.status = 500; return { success: false, message: 'Data min_logout tidak valid.' }; } const text = moment(ms).locale('id').format('LLLL'); if (Date.now() < ms) { set.status = 403; return { success: false, message: `Belum waktunya logout sampai ${text}.`, data: { valid: false, earliest_logout: text } }; } return { success: true, message: 'Logout valid.', data: { valid: true, earliest_logout: text } }; } catch (error: any) { set.status = 500; return { success: false, message: 'Terjadi kesalahan pada server.', error: error.message }; } }, { params: t.Object({ url_hash: t.String() }) });
}
