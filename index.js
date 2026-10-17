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
// POST /generate
// ============================================================
app.post('/generate', async (req, res) => {
    try {
        const { url, token } = req.body;

        // ---- Validasi ----
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

        // ---- Cek duplikat URL ----
        const urlHash = hashUrl(url);
        const existing = await db('links').where({ url_hash: urlHash }).first();

        if (existing) {
            return res.status(409).json({
                success: false,
                message: 'URL sudah pernah didaftarkan.',
                data: {
                    kode_acak: existing.kode_acak,
                    url: existing.url,
                },
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
            });

            const saved = await db('links')
                .where({ id: insertedId })
                .select('id', 'url', 'token', 'kode_acak', 'created_at', 'updated_at')
                .first();

            return res.status(201).json({
                success: true,
                message: 'Link berhasil dibuat.',
                data: saved,
            });
        } catch (dbError) {
            // Handle race condition
            if (dbError.code === 'ER_DUP_ENTRY') {
                const dup = await db('links').where({ url_hash: urlHash }).first();
                return res.status(409).json({
                    success: false,
                    message: 'URL sudah pernah didaftarkan.',
                    data: dup ? { kode_acak: dup.kode_acak, url: dup.url } : null,
                });
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
// GET /url/:kode_acak
// ============================================================
app.get('/url/:kode_acak', async (req, res) => {
    try {
        const { kode_acak } = req.params;

        const link = await db('links')
            .where({ kode_acak })
            .select('id', 'url', 'token', 'kode_acak', 'created_at', 'updated_at')
            .first();

        if (!link) {
            return res.status(404).json({
                success: false,
                message: `Link dengan kode "${kode_acak}" tidak ditemukan.`,
            });
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