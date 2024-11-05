import { defineApp } from "convex/server";
import shardedCounter from "@convex-dev/sharded-counter/convex.config";
import migrations from "@convex-dev/migrations/convex.config";

const app = defineApp();
app.use(shardedCounter);
app.use(shardedCounter, { name: "checkboxCounter" });
app.use(migrations);

export default app;
