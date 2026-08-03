import { afterEach, describe, expect, it } from "vitest";
import { getApiURL, getWebsocketURL } from "./util";

const setLocation = (path: string): void => {
  window.history.pushState({}, "", path);
};

describe("URL construction", () => {
  afterEach(() => {
    setLocation("/");
  });

  it("builds the websocket URL from the app's directory", () => {
    setLocation("/");

    expect(getWebsocketURL().pathname).toBe("/ws");
  });

  it("ignores a query string on the page URL", () => {
    // Concatenating onto window.location.href used to yield "/?tab=1ws",
    // which connects to the static file handler and fails the handshake.
    setLocation("/?tab=1");

    const url = getWebsocketURL();
    expect(url.pathname).toBe("/ws");
    expect(url.search).toBe("");
  });

  it("ignores a fragment on the page URL", () => {
    setLocation("/#section");

    const url = getWebsocketURL();
    expect(url.pathname).toBe("/ws");
    expect(url.hash).toBe("");
  });

  it("resolves under a basepath", () => {
    setLocation("/openbooks/");

    expect(getWebsocketURL().pathname).toBe("/openbooks/ws");
  });

  it("resolves relative to the directory when the page URL names a file", () => {
    setLocation("/openbooks/index.html");

    expect(getWebsocketURL().pathname).toBe("/openbooks/ws");
  });

  it("uses a websocket protocol", () => {
    setLocation("/");

    expect(["ws:", "wss:"]).toContain(getWebsocketURL().protocol);
  });

  it("gives the API a base URL that paths can be appended to", () => {
    setLocation("/openbooks/?tab=1#section");

    const base = getApiURL();
    expect(base.pathname).toBe("/openbooks/");
    expect(base.search).toBe("");
    expect(base.hash).toBe("");
    // RTK Query joins the base with an endpoint path; a trailing query or
    // fragment would produce nonsense like "/openbooks/?tab=1/servers".
    expect(new URL("servers", base).pathname).toBe("/openbooks/servers");
  });
});
