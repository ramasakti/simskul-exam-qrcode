import { createToken, hashToken } from '../../shared/crypto.js';
import * as repository from './auth.repository.js';

type School = { npsn: string; nama?: string; kontak?: { email?: string } };

export async function register(npsn: string, password: string) {
  if (await repository.findUserByNpsn(npsn)) return null;

  const response = await fetch(`https://sekolah.devapi.id/sekolah?npsn=${encodeURIComponent(npsn)}`);
  if (!response.ok) throw new Error('Gagal memvalidasi NPSN ke layanan sekolah.');
  const result = await response.json() as { data?: School[] };
  const school = result.data?.[0];
  const email = school?.kontak?.email?.trim().toLowerCase();
  const name = school?.nama?.trim();
  if (!school || !name || !email) return undefined;
  if (await repository.findUserByEmail(email)) return null;

  return repository.createUser(name, npsn, email, password);
}

export async function login(npsn: string, password: string) {
  const user = await repository.findUserByNpsn(npsn);
  if (!user || !repository.verifyPassword(password, user.password_hash)) return null;
  const token = createToken();
  await repository.createSession(user.id, hashToken(token), new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  return { token, user };
}

export async function logout(token: string) {
  await repository.deleteSession(hashToken(token));
}

export async function getUserFromToken(token: string) {
  return repository.findSessionUser(hashToken(token));
}
