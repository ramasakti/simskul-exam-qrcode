import 'dotenv/config';
import { Elysia, t } from 'elysia';
import knex from 'knex';
import crypto from 'node:crypto';
import moment from 'moment';
import knexConfig from './knexfile.js';

const db = knex(knexConfig.development);

// ============================================================
// Helper: Generate random code
// ============================================================
function generateRandomCode(length = 6): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars[bytes[i] % chars.length];
    }
    return result;
}

// ============================================================
// Helper: Hash URL (SHA-256)
// ============================================================
function hashUrl(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex');
}

// ============================================================
// Helper: Validasi URL
// ============================================================
function isValidUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

// ============================================================
// Helper: Parse timestamp
// ============================================================
function parseTimestamp(value: unknown): Date | null {
    if (value === null || value === undefined) return null;

    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return null;
        const ms = value < 1e12 ? value * 1000 : value;
        const d = new Date(ms);
        return isNaN(d.getTime()) ? null : d;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^\d+$/.test(trimmed)) {
            const num = Number(trimmed);
            const ms = num < 1e12 ? num * 1000 : num;
            const d = new Date(ms);
            return isNaN(d.getTime()) ? null : d;
        }
        const d = new Date(trimmed);
        return isNaN(d.getTime()) ? null : d;
    }

    return null;
}

// ============================================================
// Helper: Generate kode_acak unik
// ============================================================
async function generateUniqueKodeAcak(): Promise<string> {
    for (let i = 0; i < 20; i++) {
        const code = generateRandomCode(6);
        const found = await db('links').where({ kode_acak: code }).first();
        if (!found) return code;
    }
    throw new Error('Gagal menghasilkan kode_acak unik setelah 20 percobaan.');
}

// ============================================================
// Helper: Insert baru dengan retry saat race condition
// ============================================================
async function insertNewLink(data: Record<string, unknown>) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const [insertedId] = await db('links').insert(data);
            return await db('links').where({ id: insertedId }).first();
        } catch (err: any) {
            if (err.code === 'ER_DUP_ENTRY' && attempt === 0) {
                await db('links').where({ url_hash: data.url_hash }).delete();
                continue;
            }
            throw err;
        }
    }
    throw new Error('Gagal insert link setelah retry.');
}

// ============================================================
// Elysia app
// ============================================================
const app = new Elysia()
    .decorate('db', db)

    // ========================================================
    // POST /generate
    // ========================================================
    .post(
        '/generate',
        async ({ body, set }) => {
            try {
                const { url, token, start, end, min_logout } = body as {
                    url?: unknown;
                    token?: unknown;
                    start?: unknown;
                    end?: unknown;
                    min_logout?: unknown;
                };

                // ---- Validasi dasar ----
                if (!url) {
                    set.status = 400;
                    return { success: false, message: 'Field "url" wajib diisi.' };
                }

                if (typeof url !== 'string' || !isValidUrl(url)) {
                    set.status = 400;
                    return {
                        success: false,
                        message: 'Format "url" tidak valid. Harus berupa URL http/https.',
                    };
                }

                if (token !== undefined && typeof token !== 'boolean') {
                    set.status = 400;
                    return {
                        success: false,
                        message: 'Field "token" harus berupa boolean (true/false).',
                    };
                }

                if (min_logout !== undefined && min_logout !== null) {
                    if (
                        typeof min_logout !== 'number' ||
                        !Number.isInteger(min_logout) ||
                        min_logout < 0
                    ) {
                        set.status = 400;
                        return {
                            success: false,
                            message: 'Field "min_logout" harus berupa angka bulat (menit) >= 0.',
                        };
                    }
                }

                // ---- Parse start/end ----
                let startDate: Date | null = null;
                if (start !== undefined && start !== null) {
                    startDate = parseTimestamp(start);
                    if (startDate === null) {
                        set.status = 400;
                        return {
                            success: false,
                            message:
                                'Field "start" tidak valid. Gunakan Unix timestamp (detik/ms) atau ISO string.',
                        };
                    }
                }

                let endDate: Date | null = null;
                if (end !== undefined && end !== null) {
                    endDate = parseTimestamp(end);
                    if (endDate === null) {
                        set.status = 400;
                        return {
                            success: false,
                            message:
                                'Field "end" tidak valid. Gunakan Unix timestamp (detik/ms) atau ISO string.',
                        };
                    }
                }

                // ---- Validasi end > start ----
                if (startDate && endDate) {
                    if (endDate.getTime() <= startDate.getTime()) {
                        set.status = 400;
                        return {
                            success: false,
                            message:
                                'Field "end" tidak boleh lebih kecil atau sama dengan "start".',
                        };
                    }
                }

                // ---- Validasi: min_logout wajib punya end ----
                if (min_logout !== undefined && min_logout !== null && !endDate) {
                    set.status = 400;
                    return {
                        success: false,
                        message: 'Field "end" wajib diisi jika "min_logout" diisi.',
                    };
                }

                // ---- Cek URL existing -> HAPUS data lama ----
                const urlHash = hashUrl(url);
                const existing = await db('links').where({ url_hash: urlHash }).first();

                if (existing) {
                    await db('links').where({ id: existing.id }).delete();
                }

                // ---- Generate kode_acak unik & insert ----
                const kode_acak = await generateUniqueKodeAcak();

                const saved = await insertNewLink({
                    url,
                    url_hash: urlHash,
                    token: Boolean(token),
                    kode_acak,
                    start: startDate ?? null,
                    end: endDate ?? null,
                    min_logout: (min_logout as number | undefined) ?? null,
                });

                const replaced = Boolean(existing);

                set.status = replaced ? 200 : 201;
                return {
                    success: true,
                    message: replaced
                        ? 'Link berhasil dibuat ulang. Data lama dihapus, kode_acak baru diterbitkan.'
                        : 'Link berhasil dibuat.',
                    replaced,
                    data: {
                        ...saved,
                        token:
                            saved.token === true ||
                            saved.token === 1 ||
                            saved.token === '1',
                        start: moment(saved.start).format('YYYY-MM-DD HH:mm:ss'),
                        end: moment(saved.end).format('YYYY-MM-DD HH:mm:ss'),
                    },
                };
            } catch (error: any) {
                console.error('[/generate] Error:', error);
                set.status = 500;
                return {
                    success: false,
                    message: 'Terjadi kesalahan pada server.',
                    error: error.message,
                };
            }
        },
        // Body sengaja pakai t.Any() agar validasi manual & pesan error
        // tetap sama persis seperti versi Express.
        { body: t.Any() }
    )

    // ========================================================
    // GET /url/:url_hash
    // ========================================================
    .get(
        '/url/:url_hash',
        async ({ params, set }) => {
            try {
                const { url_hash } = params;

                const link = await db('links').where({ url_hash }).first();

                if (!link) {
                    set.status = 404;
                    return {
                        success: false,
                        message: `Link dengan kode "${url_hash}" tidak ditemukan.`,
                    };
                }

                // NOTE: perilaku asli memakai link.end di sini (kemungkinan bug).
                // Dipertahankan agar identik dengan versi Express.
                if (link.start) {
                    const startMs = new Date(link.end).getTime();
                    if (Number.isFinite(startMs) && Date.now() > startMs) {
                        set.status = 410;
                        return { success: false, message: 'Ujian belum dimulai.' };
                    }
                }

                if (link.end) {
                    const endMs = new Date(link.end).getTime();
                    if (Number.isFinite(endMs) && Date.now() > endMs) {
                        set.status = 410;
                        return { success: false, message: 'Ujian sudah berakhir.' };
                    }
                }

                set.status = 200;
                return {
                    success: true,
                    data: {
                        ...link,
                        token:
                            link.token === true ||
                            link.token === 1 ||
                            link.token === '1',
                        start: moment(link.start).format('YYYY-MM-DD HH:mm:ss'),
                        end: moment(link.end).format('YYYY-MM-DD HH:mm:ss'),
                    },
                };
            } catch (error: any) {
                console.error('[/url/:url_hash] Error:', error);
                set.status = 500;
                return {
                    success: false,
                    message: 'Terjadi kesalahan pada server.',
                    error: error.message,
                };
            }
        },
        { params: t.Object({ url_hash: t.String() }) }
    )

    // ========================================================
    // GET /logout/:url_hash
    // ========================================================
    .get(
        '/logout/:url_hash',
        async ({ params, set }) => {
            try {
                const { url_hash } = params;

                const link = await db('links').where({ url_hash }).first();

                if (!link) {
                    set.status = 404;
                    return {
                        success: false,
                        message: `Link dengan kode "${url_hash}" tidak ditemukan.`,
                    };
                }

                if (link.min_logout === null || link.min_logout === undefined) {
                    set.status = 200;
                    return {
                        success: true,
                        message: 'Logout valid.',
                        data: { valid: true, earliest_logout: null },
                    };
                }

                const referenceTime = link.start ? new Date(link.start) : new Date(link.created_at);
                if (isNaN(referenceTime.getTime())) {
                    set.status = 500;
                    return {
                        success: false,
                        message: 'Data waktu referensi tidak valid.',
                    };
                }

                const minLogoutMs = link.min_logout * 60 * 1000;
                const earliestLogoutMs = new Date(link.end).getTime() - minLogoutMs;
                const earliestLogoutIso = moment(earliestLogoutMs)
                    .locale('id')
                    .format('LLLL');

                if (Date.now() < earliestLogoutMs) {
                    set.status = 403;
                    return {
                        success: false,
                        message: `Belum waktunya logout. Minimal ${link.min_logout} menit sebelum waktu berakhir.`,
                        data: { valid: false, earliest_logout: earliestLogoutIso },
                    };
                }

                set.status = 200;
                return {
                    success: true,
                    message: 'Logout valid.',
                    data: { valid: true, earliest_logout: earliestLogoutIso },
                };
            } catch (error: any) {
                console.error('[/logout/:url_hash] Error:', error);
                set.status = 500;
                return {
                    success: false,
                    message: 'Terjadi kesalahan pada server.',
                    error: error.message,
                };
            }
        },
        { params: t.Object({ url_hash: t.String() }) }
    )

    .onStop(async () => {
        await db.destroy();
    })

    .onStart(() => {
        console.log(`🚀 Server berjalan di http://localhost:${process.env.PORT}`);
    })

    .listen(Number(process.env.PORT));

export default app;