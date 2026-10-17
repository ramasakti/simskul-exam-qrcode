export function up(knex) {
    return knex.schema.createTable('links', (table) => {
        table.increments('id').primary();
        table.string('url', 2048).notNullable();
        table.string('url_hash', 64).notNullable().unique();
        table.boolean('token').nullable().defaultTo(null);
        table.string('kode_acak', 255).notNullable().unique();
        table.timestamp('start').nullable();
        table.timestamp('end').nullable();
        table.timestamps(true, true);
    });
}

export function down(knex) {
    return knex.schema.dropTable('links');
}