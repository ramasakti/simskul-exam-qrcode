// index.js
import 'dotenv/config';
import express from 'express';
import knex from 'knex';
import crypto from 'node:crypto';
import knexConfig from './knexfile.js';

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
// Helper: Parse timestamp (Unix seconds / ms / ISO string)
//   -> Date valid, atau null kalau invalid
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
// Helper: Update link yang sudah ada
// ============================================================
async function updateExistingLink(existing, { token, start, end, startDate, endDate }) {
    const updates = {
        token: token ?? null,
        updated_at: db.fn.now(),
    };
    if (start !== undefined) updates.start = startDate;
    if (end !== undefined) updates.end = endDate;

    await db('links').where({ id: existing.id }).update(updates);

    return db('links')
        .where({ id: existing.id })
        .select('id', 'url', 'token', 'kode_acak', 'start', 'end', 'created_at', 'updated_at')
        .first();
}

// ============================================================
// POST /generate
// ============================================================
app.post('/generate', async (req, res) => {
    try {
        const { url, token, start, end } = req.body;

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

        // ---- Parse & validasi start/end ----
        let startDate;
        if (start === undefined) {
            startDate = undefined;
        } else if (start === null) {
            startDate = null;
        } else {
            startDate = parseTimestamp(start);
            if (startDate === null) {
                return res.status(400).json({
                    success: false,
                    message: 'Field "start" tidak valid. Gunakan Unix timestamp (detik/ms) atau ISO string.',
                });
            }
        }

        let endDate;
        if (end === undefined) {
            endDate = undefined;
        } else if (end === null) {
            endDate = null;
        } else {
            endDate = parseTimestamp(end);
            if (endDate === null) {
                return res.status(400).json({
                    success: false,
                    message: 'Field "end" tidak valid. Gunakan Unix timestamp (detik/ms) atau ISO string.',
                });
            }
        }

        // ---- Cek apakah URL sudah ada ----
        const urlHash = hashUrl(url);
        const existing = await db('links').where({ url_hash: urlHash }).first();

        // Tentukan nilai start/end final (request atau existing)
        const finalStart = start !== undefined ? startDate : (existing ? existing.start : null);
        const finalEnd = end !== undefined ? endDate : (existing ? existing.end : null);

        if (finalStart && finalEnd) {
            const s = new Date(finalStart).getTime();
            const e = new Date(finalEnd).getTime();
            if (Number.isFinite(s) && Number.isFinite(e) && e <= s) {
                return res.status(400).json({
                    success: false,
                    message: 'Field "end" tidak boleh lebih kecil atau sama dengan "start".',
                });
            }
        }

        // ---- Kalau sudah ada -> update ----
        if (existing) {
            const updated = await updateExistingLink(existing, {
                token, start, end, startDate, endDate,
            });

            return res.status(200).json({
                success: true,
                message: 'Link berhasil diperbarui.',
                data: updated,
            });
        }

        // ---- Generate kode acak unik ----
        let kode_acak;
        let isUnique = false;

        while (!isUnique) {
            kode_acak = generateRandomCode(6);
            const found = await db('links').where({ kode_acak }).first();
            if (!found) isUnique = true;
        }

        // ---- Simpan ke database ----
        try {
            const [insertedId] = await db('links').insert({
                url,
                url_hash: urlHash,
                token: token ?? null,
                kode_acak,
                start: startDate ?? null,
                end: endDate ?? null,
            });

            const saved = await db('links')
                .where({ id: insertedId })
                .select('id', 'url', 'token', 'kode_acak', 'start', 'end', 'created_at', 'updated_at')
                .first();

            return res.status(201).json({
                success: true,
                message: 'Link berhasil dibuat.',
                data: saved,
            });
        } catch (dbError) {
            // Handle race condition: baris sudah diinsert duluan -> update
            if (dbError.code === 'ER_DUP_ENTRY') {
                const dup = await db('links').where({ url_hash: urlHash }).first();
                if (dup) {
                    const updated = await updateExistingLink(dup, {
                        token, start, end, startDate, endDate,
                    });

                    return res.status(200).json({
                        success: true,
                        message: 'Link berhasil diperbarui.',
                        data: updated,
                    });
                }
            }
            throw dbError;
        }
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
            .select('id', 'url', 'token', 'kode_acak', 'start', 'end', 'created_at', 'updated_at')
            .first();

        if (!link) {
            return res.status(404).json({
                success: false,
                message: `Link dengan kode "${url_hash}" tidak ditemukan.`,
            });
        }

        // ---- Cek masa berlaku ujian ----
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
            data: link,
        });
    } catch (error) {
        console.error('[/url/:kode_acak] Error:', error);
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