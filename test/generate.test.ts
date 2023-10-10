import { expect, it } from "vitest";
import { fetchOpenApi } from "@exaid/core";
it("should generate a test", async () => {
  const { result } = await fetchOpenApi("https://petstore.swagger.io/v2/swagger.json");

  expect(result.host).toBe("petstore.swagger.io");
});
