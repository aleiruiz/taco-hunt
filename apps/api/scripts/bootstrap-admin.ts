import pg from "pg";

const { Pool } = pg;
const userId = process.argv[2];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const connectionString = process.env.ADMIN_DATABASE_URL?.trim();

if (!userId || !uuidPattern.test(userId)) {
  console.error("Usage: pnpm --filter @taco-hunt/api admin:bootstrap -- <registered-user-uuid>");
  process.exitCode = 2;
} else if (!connectionString) {
  console.error(
    "Set ADMIN_DATABASE_URL to an operator-owned database connection before running this command.",
  );
  process.exitCode = 2;
} else {
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000 });
  try {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const role = await client.query<{ current_user: string }>("select current_user");
      if (role.rows[0]?.current_user === "taco_hunt_api") {
        throw new Error("Runtime database role cannot bootstrap administrators");
      }

      const update = await client.query(
        `insert into app_private.profiles (id, role)
         select id, 'admin' from auth.users where id = $1
         on conflict (id) do update set role = 'admin', updated_at = now()
         returning id`,
        [userId],
      );
      if (update.rowCount !== 1) throw new Error("Registered Auth user was not found");
      await client.query("commit");
      console.log(`Administrator role granted to ${userId}.`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Administrator bootstrap failed.");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
