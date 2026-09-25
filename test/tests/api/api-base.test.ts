import { ApiBase } from "#api/api-base";
import * as appConstants from "#constants/app-constants";
import { describe, expect, it, vi } from "vitest";

class TestApi extends ApiBase {
  public request(): Promise<Response> {
    return this.doGet("/test");
  }
}

describe("ApiBase", () => {
  it("does not invoke fetch in offline mode", async () => {
    vi.spyOn(appConstants, "offlineMode", "get").mockReturnValue(true);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(new TestApi("http://example.test").request()).rejects.toThrow(
      "Network requests are disabled in offline mode",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
