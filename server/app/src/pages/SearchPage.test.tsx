import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { setActiveItem } from "../state/stateSlice";
import { buildTestStore, renderWithProviders } from "../test/render";
import SearchPage from "./SearchPage";

describe("SearchPage", () => {
  it("shows the empty state when there is no active search", () => {
    renderWithProviders(<SearchPage />);

    expect(
      screen.getByText("Search a book to get started.")
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Search for a book.")
    ).toBeInTheDocument();
  });

  it("shows the results table when there is an active item with results", () => {
    const store = buildTestStore();
    store.dispatch(
      setActiveItem({
        query: "dune",
        timestamp: 1,
        results: [
          {
            server: "Server1",
            author: "Frank Herbert",
            title: "Dune",
            format: "epub",
            size: "1.2MB",
            full: "!Server1 Frank Herbert - Dune.epub"
          }
        ]
      })
    );

    renderWithProviders(<SearchPage />, { store });

    expect(screen.getByText("Dune")).toBeInTheDocument();
    expect(screen.getByText("Frank Herbert")).toBeInTheDocument();
  });

  it("shows the error toggle when the active item has parse errors", () => {
    const store = buildTestStore();
    store.dispatch(
      setActiveItem({
        query: "dune",
        timestamp: 1,
        results: [],
        errors: [{ error: "bad format", line: "!Server1 some bad line" }]
      })
    );

    renderWithProviders(<SearchPage />, { store });

    expect(screen.getByText("1 Parsing Error")).toBeInTheDocument();
  });
});
