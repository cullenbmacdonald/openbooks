import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../test/render";
import Library from "./Library";

describe("Library", () => {
  it("renders without throwing", async () => {
    renderWithProviders(<Library />);

    // The RTK Query request to /library has no real server to hit in jsdom,
    // so it resolves to an error state.
    expect(
      await screen.findByText("Book persistence disabled.")
    ).toBeInTheDocument();
  });
});
