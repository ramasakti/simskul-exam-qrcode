import { hashUrl } from '../../shared/crypto.js';
import { parseTimestamp } from '../../shared/date.js';
import { isValidUrl } from '../../shared/validation.js';
import * as repository from './links.repository.js';
import { mapLink } from './links.mapper.js';

export async function generate(input: any, userId: number) {
  const { url, token_masuk, token_keluar, start, end, min_logout } = input;
  if (!url) return { status: 400, body: { success: false, message: 'Field "url" wajib diisi.' } };
  if (typeof url !== 'string' || !isValidUrl(url)) return { status: 400, body: { success: false, message: 'Format "url" tidak valid. Harus berupa URL http/https.' } };
  for (const [field, value] of [['token_masuk', token_masuk], ['token_keluar', token_keluar]] as const) if (value !== undefined && value !== null && typeof value !== 'string') return { status: 400, body: { success: false, message: `Field "${field}" harus berupa string atau null.` } };
  const dates: Record<string, Date | null> = {};
  for (const field of ['min_logout', 'start', 'end']) { if (input[field] !== undefined && input[field] !== null) { const date = parseTimestamp(input[field]); if (!date) return { status: 400, body: { success: false, message: `Field "${field}" tidak valid. Gunakan timestamp atau ISO string.` } }; dates[field] = date; } else dates[field] = null; }
  if (dates.start && dates.end && dates.end.getTime() <= dates.start.getTime()) return { status: 400, body: { success: false, message: 'Field "end" tidak boleh lebih kecil atau sama dengan "start".' } };
  const existing = await repository.findByHash(hashUrl(url)); if (existing) await repository.deleteById(existing.id);
  const saved = await repository.insert({ user_id: userId, url, url_hash: hashUrl(url), token_masuk: token_masuk ?? null, token_keluar: token_keluar ?? null, start: dates.start, end: dates.end, min_logout: dates.min_logout });
  return { status: existing ? 200 : 201, body: { success: true, message: existing ? 'Link berhasil dibuat ulang. Data lama dihapus.' : 'Link berhasil dibuat.', replaced: Boolean(existing), data: mapLink(saved) } };
}

export async function get(urlHash: string) { return repository.findByHash(urlHash); }

export async function getAllByUserId(userId: number) {
  const links = await repository.findAllByUserId(userId);
  return links.map(mapLink);
}
