import { db } from '../../db/client.js';

export async function findByHash(urlHash: string) { return db('links').where({ url_hash: urlHash }).first(); }
export async function findAllByUserId(userId: number) { return db('links').where({ user_id: userId }).orderBy('created_at', 'desc'); }
export async function deleteById(id: number) { return db('links').where({ id }).delete(); }
export async function insert(data: Record<string, unknown>) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { const [id] = await db('links').insert(data); return db('links').where({ id }).first(); }
    catch (error: any) { if (error.code === 'ER_DUP_ENTRY' && attempt === 0) { await db('links').where({ url_hash: data.url_hash }).delete(); continue; } throw error; }
  }
  throw new Error('Gagal insert link setelah retry.');
}
