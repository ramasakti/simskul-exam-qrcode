// index.js
import 'dotenv/config';
import express from 'express';
import knex from 'knex';
import crypto from 'node:crypto';
import knexConfig from './knexfile.js';
import moment from 'moment';

const app = express();
const db = knex(knexConfig.development);

app.use(express.json());

// ============================================================
// Helper: Generate random code
// ============================================================
function generateRandomCode(length = 6) {
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
function hashUrl(url) {
    return crypto.createHash('sha256').update(url).digest('hex');
}

// ============================================================
// Helper: Validasi URL
// ============================================================
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

// ============================================================
// Helper: Parse timestamp
// ============================================================
function parseTimestamp(value) {
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
async function generateUniqueKodeAcak() {
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
async function insertNewLink(data) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const [insertedId] = await db('links').insert(data);
            return await db('links')
                .where({ id: insertedId })
                .first();
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY' && attempt === 0) {
                // Request lain baru saja insert URL yang sama -> hapus & retry
                await db('links').where({ url_hash: data.url_hash }).delete();
                continue;
            }
            throw err;
        }
    }
    throw new Error('Gagal insert link setelah retry.');
}

// ============================================================
// POST /generate
// ============================================================
app.post('/generate', async (req, res) => {
    try {
        const { url, token, start, end, min_logout } = req.body;

        // ---- Validasi dasar ----
        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'Field "url" wajib diisi.',
            });
        }

        if (!isValidUrl(url)) {
            return res.status(400).json({
                success: false,
                message: 'Format "url" tidak valid. Harus berupa URL http/https.',
            });
        }

        if (token !== undefined && typeof token !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'Field "token" harus berupa boolean (true/false).',
            });
        }

        if (min_logout !== undefined && min_logout !== null) {
            if (typeof min_logout !== 'number' || !Number.isInteger(min_logout) || min_logout < 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Field "min_logout" harus berupa angka bulat (menit) >= 0.',
                });
            }
        }

        // ---- Parse start/end ----
        let startDate = null;
        if (start !== undefined && start !== null) {
            startDate = parseTimestamp(start);
            if (startDate === null) {
                return res.status(400).json({
                    success: false,
                    message: 'Field "start" tidak valid. Gunakan Unix timestamp (detik/ms) atau ISO string.',
                });
            }
        }

        let endDate = null;
        if (end !== undefined && end !== null) {
            endDate = parseTimestamp(end);
            if (endDate === null) {
                return res.status(400).json({
                    success: false,
                    message: 'Field "end" tidak valid. Gunakan Unix timestamp (detik/ms) atau ISO string.',
                });
            }
        }

        // ---- Validasi end > start ----
        if (startDate && endDate) {
            const s = startDate.getTime();
            const e = endDate.getTime();
            if (e <= s) {
                return res.status(400).json({
                    success: false,
                    message: 'Field "end" tidak boleh lebih kecil atau sama dengan "start".',
                });
            }
        }

        // ---- Validasi: min_logout wajib punya end ----
        if (min_logout !== undefined && min_logout !== null && !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Field "end" wajib diisi jika "min_logout" diisi.',
            });
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
            min_logout: min_logout ?? null,
        });

        const replaced = Boolean(existing);

        return res.status(replaced ? 200 : 201).json({
            success: true,
            message: replaced
                ? 'Link berhasil dibuat ulang. Data lama dihapus, kode_acak baru diterbitkan.'
                : 'Link berhasil dibuat.',
            replaced,
            data: {
                ...saved,
                token: saved.token === true || saved.token === 1 || saved.token === '1',
                start: moment(saved.start).format('YYYY-MM-DD HH:mm:ss'),
                end: moment(saved.end).format('YYYY-MM-DD HH:mm:ss'),
            },
        });
    } catch (error) {
        console.error('[/generate] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
});

// ============================================================
// GET /url/:url_hash
// ============================================================
app.get('/url/:url_hash', async (req, res) => {
    try {
        const { url_hash } = req.params;

        const link = await db('links')
            .where({ url_hash })
            .first();

        if (!link) {
            return res.status(404).json({
                success: false,
                message: `Link dengan kode "${url_hash}" tidak ditemukan.`,
            });
        }

        if (link.start) {
            const startMs = new Date(link.end).getTime();
            if (Number.isFinite(startMs) && Date.now() > startMs) {
                return res.status(410).json({
                    success: false,
                    message: 'Ujian belum dimulai.',
                });
            }
        }

        if (link.end) {
            const endMs = new Date(link.end).getTime();
            if (Number.isFinite(endMs) && Date.now() > endMs) {
                return res.status(410).json({
                    success: false,
                    message: 'Ujian sudah berakhir.',
                });
            }
        }

        return res.status(200).json({
            success: true, 
            data: {
                ...link,
                token: link.token === true || link.token === 1 || link.token === '1',
                start: moment(link.start).format('YYYY-MM-DD HH:mm:ss'),
                end: moment(link.end).format('YYYY-MM-DD HH:mm:ss'),
            },
        });
    } catch (error) {
        console.error('[/url/:url_hash] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
});

// ============================================================
// GET /logout/:url_hash
// ============================================================
app.get('/logout/:url_hash', async (req, res) => {
    try {
        const { url_hash } = req.params;

        const link = await db('links')
            .where({ url_hash })
            .first();

        if (!link) {
            return res.status(404).json({
                success: false,
                message: `Link dengan kode "${url_hash}" tidak ditemukan.`,
            });
        }

        if (link.min_logout === null || link.min_logout === undefined) {
            return res.status(200).json({
                success: true,
                message: 'Logout valid.',
                data: { valid: true, earliest_logout: null },
            });
        }

        const referenceTime = link.start ? new Date(link.start) : new Date(link.created_at);
        if (isNaN(referenceTime.getTime())) {
            return res.status(500).json({
                success: false,
                message: 'Data waktu referensi tidak valid.',
            });
        }

        const minLogoutMs = link.min_logout * 60 * 1000;
        const earliestLogoutMs = new Date(link.end).getTime() - minLogoutMs;
        const earliestLogoutIso = moment(earliestLogoutMs).locale('id').format('LLLL')

        if (Date.now() < earliestLogoutMs) {
            return res.status(403).json({
                success: false,
                message: `Belum waktunya logout. Minimal ${link.min_logout} menit sebelum waktu berakhir.`,
                data: { valid: false, earliest_logout: earliestLogoutIso },
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Logout valid.',
            data: { valid: true, earliest_logout: earliestLogoutIso },
        });
    } catch (error) {
        console.error('[/logout/:url_hash] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
});

// ============================================================
// Jalankan server
// ============================================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});