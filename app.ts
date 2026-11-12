import 'dotenv/config';
import { Elysia, t } from 'elysia';
import knex from 'knex';
import crypto from 'node:crypto';
import moment from 'moment';
import knexConfig from './knexfile.js';

const db = knex(knexConfig.development);

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
                const { url, token_masuk, token_keluar, start, end, min_logout } = body as {
                    url?: unknown;
                    token_masuk?: unknown;
                    token_keluar?: unknown;
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

                for (const [field, value] of [['token_masuk', token_masuk], ['token_keluar', token_keluar]] as const) {
                    if (value !== undefined && value !== null && typeof value !== 'string') {
                        set.status = 400;
                        return {
                            success: false,
                            message: `Field "${field}" harus berupa string atau null.`,
                        };
                    }
                }

                let minLogoutDate: Date | null = null;
                if (min_logout !== undefined && min_logout !== null) {
                    minLogoutDate = parseTimestamp(min_logout);
                    if (minLogoutDate === null) {
                        set.status = 400;
                        return {
                            success: false,
                            message: 'Field "min_logout" tidak valid. Gunakan timestamp atau ISO string.',
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

                // ---- Cek URL existing -> HAPUS data lama ----
                const urlHash = hashUrl(url);
                const existing = await db('links').where({ url_hash: urlHash }).first();

                if (existing) {
                    await db('links').where({ id: existing.id }).delete();
                }

                const saved = await insertNewLink({
                    url,
                    url_hash: urlHash,
                    token_masuk: token_masuk ?? null,
                    token_keluar: token_keluar ?? null,
                    start: startDate ?? null,
                    end: endDate ?? null,
                    min_logout: minLogoutDate,
                });

                const replaced = Boolean(existing);

                set.status = replaced ? 200 : 201;
                return {
                    success: true,
                    message: replaced
                        ? 'Link berhasil dibuat ulang. Data lama dihapus.'
                        : 'Link berhasil dibuat.',
                    replaced,
                    data: {
                        ...saved,
                        token_masuk: saved.token_masuk,
                        token_keluar: saved.token_keluar,
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

                if (link.start) {
                    const startMs = new Date(link.start).getTime();
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
                        token_masuk: link.token_masuk,
                        token_keluar: link.token_keluar,
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

                const earliestLogoutMs = new Date(link.min_logout).getTime();
                if (!Number.isFinite(earliestLogoutMs)) {
                    set.status = 500;
                    return {
                        success: false,
                        message: 'Data min_logout tidak valid.',
                    };
                }

                const earliestLogoutIso = moment(earliestLogoutMs)
                    .locale('id')
                    .format('LLLL');

                if (Date.now() < earliestLogoutMs) {
                    set.status = 403;
                    return {
                        success: false,
                        message: `Belum waktunya logout sampai ${earliestLogoutIso}.`,
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