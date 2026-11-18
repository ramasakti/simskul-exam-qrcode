import { t } from 'elysia';
import * as service from './auth.service.js';

export function authRoutes(app: any) {
  return app
    .post('/auth/register', async ({ body, set }: any) => {
      const { npsn, password } = body;

      if (typeof npsn !== 'string' || !/^\d{8}$/.test(npsn) || typeof password !== 'string' || password.length < 8) {
        set.status = 400; return { success: false, message: 'NPSN 8 digit dan password minimal 8 karakter wajib diisi.' };
      }
      const user = await service.register(npsn, password);
      if (user === null) { set.status = 409; return { success: false, message: 'NPSN atau email sudah terdaftar.' }; }
      if (user === undefined) { set.status = 404; return { success: false, message: 'NPSN tidak ditemukan pada data sekolah.' }; }
      set.status = 201; return { success: true, message: 'Registrasi berhasil.', data: user };
    }, { body: t.Object({ npsn: t.String(), password: t.String() }) })
    .post('/auth/login', async ({ body, set }: any) => {
      const { npsn, password } = body;
      if (typeof npsn !== 'string' || !/^\d{8}$/.test(npsn) || typeof password !== 'string') { set.status = 400; return { success: false, message: 'NPSN 8 digit dan password wajib diisi.' }; }
      const result = await service.login(npsn, password);
      if (!result) { set.status = 401; return { success: false, message: 'Email atau password salah.' }; }
      return { success: true, message: 'Login berhasil.', data: { token: result.token, expires_in: 2592000, user: { id: result.user.id, name: result.user.name, npsn: result.user.npsn, email: result.user.email } } };
    }, { body: t.Object({ npsn: t.String(), password: t.String() }) })
    .post('/auth/logout', async ({ headers, set }: any) => {
      const authorization = headers.authorization;
      if (!authorization?.startsWith('Bearer ')) { set.status = 401; return { success: false, message: 'Token autentikasi wajib diisi.' }; }
      await service.logout(authorization.slice(7)); return { success: true, message: 'Logout berhasil.' };
    });
}
