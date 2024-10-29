/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest"
import schema from "./schema";
import componentSchema from "../../src/component/schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const componentModules = import.meta.glob("../../src/component/**/*.ts");

describe("nested sharded counter", () => {
  async function setupTest() {
    const t = convexTest(schema, modules);
    t.registerComponent("nestedCounter", componentSchema, componentModules);
    return t;
  }

  test("follower and follows count", async () => {
    const t = await setupTest();
    const users = await t.run((ctx) => {
      return Promise.all([
        ctx.db.insert("users", { name: "1" }),
        ctx.db.insert("users", { name: "2" }),
      ]);
    });
    await t.mutation(api.nested.addFollower, { follower: users[0], followee: users[1] });
    expect(await t.query(api.nested.countFollows, { user: users[0] })).toStrictEqual(1);
    expect(await t.query(api.nested.countFollowers, { user: users[0] })).toStrictEqual(0);
    expect(await t.query(api.nested.countFollowers, { user: users[1] })).toStrictEqual(1);
  })
});
