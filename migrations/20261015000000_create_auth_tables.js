export async function up(knex) {
    await knex.schema.createTable('users', (table) => {
        table.increments('id').primary();
        table.string('name', 120).notNullable();
        table.string('npsn', 8).notNullable().unique();
        table.string('email', 255).notNullable().unique();
        table.string('password_hash', 255).notNullable();
        table.timestamps(true, true);
    });

    await knex.schema.createTable('sessions', (table) => {
        table.string('token_hash', 64).primary();
        table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.timestamp('expires_at').notNullable();
        table.timestamps(true, true);
    });
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('sessions');
    await knex.schema.dropTableIfExists('users');
}
