import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/render";
import Library from "./Library";

describe("Library", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports persistence being disabled when the server answers 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 404 }))
    );

    renderWithProviders(<Library />);

    expect(
      await screen.findByText("Book persistence disabled.")
    ).toBeInTheDocument();
  });

  it("reports a generic failure when the library can't be reached", async () => {
    // A request that never reaches the server (offline, dropped session,
    // server restarting) must not be reported as persistence being disabled.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    );

    renderWithProviders(<Library />);

    expect(
      await screen.findByText("Unable to load your library.")
    ).toBeInTheDocument();
  });
});
