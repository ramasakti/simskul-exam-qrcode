import { db } from '../../db/client.js';
import { hashPassword, verifyPassword } from '../../shared/crypto.js';

export async function findUserByEmail(email: string) {
  return db('users').where({ email }).first();
}

export async function findUserByNpsn(npsn: string) {
  return db('users').where({ npsn }).first();
}

export async function createUser(name: string, npsn: string, email: string, password: string) {
  const [id] = await db('users').insert({ name, npsn, email, password_hash: hashPassword(password) });
  return db('users').select('id', 'name', 'npsn', 'email', 'created_at').where({ id }).first();
}

export { verifyPassword };

export async function createSession(userId: number, tokenHash: string, expiresAt: Date) {
  await db('sessions').insert({ token_hash: tokenHash, user_id: userId, expires_at: expiresAt });
}

export async function deleteSession(tokenHash: string) {
  await db('sessions').where({ token_hash: tokenHash }).delete();
}

export async function findSessionUser(tokenHash: string) {
  return db('sessions')
    .join('users', 'users.id', 'sessions.user_id')
    .select('users.id', 'users.name', 'users.npsn', 'users.email')
    .where('sessions.token_hash', tokenHash)
    .andWhere('sessions.expires_at', '>', new Date())
    .first();
}
