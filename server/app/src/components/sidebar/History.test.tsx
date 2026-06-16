import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { addHistoryItem } from "../../state/historySlice";
import { buildTestStore } from "../../test/render";
import { renderWithProviders } from "../../test/render";
import History from "./History";

describe("History", () => {
  it("shows a placeholder when there is no history", () => {
    renderWithProviders(<History />);

    expect(screen.getByText("History is a mystery.")).toBeInTheDocument();
  });

  it("renders a card for each history item", () => {
    const store = buildTestStore();
    store.dispatch(addHistoryItem({ query: "dune", timestamp: 1 }));
    store.dispatch(
      addHistoryItem({
        query: "the great gatsby",
        timestamp: 2,
        results: [
          {
            server: "Server1",
            author: "F. Scott Fitzgerald",
            title: "The Great Gatsby",
            format: "epub",
            size: "1MB",
            full: "!Server1 F. Scott Fitzgerald - The Great Gatsby.epub"
          }
        ]
      })
    );

    renderWithProviders(<History />, { store });

    expect(screen.getByText("dune")).toBeInTheDocument();
    expect(screen.getByText("the great gatsby")).toBeInTheDocument();
    expect(screen.getByText("1 RESULTS")).toBeInTheDocument();
  });
});
