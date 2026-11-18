export function up(knex) {
    return knex.schema.createTable('links', (table) => {
        table.increments('id').primary();
        table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.string('url', 2048).notNullable();
        table.string('url_hash', 64).notNullable().unique();
        table.string('token_masuk').nullable().defaultTo(null);
        table.string('token_keluar').nullable().defaultTo(null);
        table.timestamp('start').nullable();
        table.timestamp('end').nullable();
        table.timestamp('min_logout').nullable();
        table.timestamps(true, true);
    });
}

export function down(knex) {
    return knex.schema.dropTable('links');
}
