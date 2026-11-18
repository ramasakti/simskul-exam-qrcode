import { createApp } from './app.js';
import { db } from './db/client.js';
import { env } from './config/env.js';

const app = createApp().onStop(async () => { await db.destroy(); }).listen(env.port);
console.log(`Server berjalan di http://localhost:${env.port}`);
export default app;
