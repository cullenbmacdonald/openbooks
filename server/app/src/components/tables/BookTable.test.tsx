import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BookDetail } from "../../state/messages";
import { renderWithProviders } from "../../test/render";
import BookTable from "./BookTable";

const books: BookDetail[] = [
  {
    server: "Server1",
    author: "Frank Herbert",
    title: "Dune",
    format: "epub",
    size: "1.2MB",
    full: "!Server1 Frank Herbert - Dune.epub"
  },
  {
    server: "Server2",
    author: "Ursula K. Le Guin",
    title: "A Wizard of Earthsea",
    format: "mobi",
    size: "800KB",
    full: "!Server2 Ursula K. Le Guin - A Wizard of Earthsea.mobi"
  }
];

describe("BookTable", () => {
  it("renders without throwing when given no books", () => {
    renderWithProviders(<BookTable books={[]} />);
  });

  it("renders a row per book", () => {
    renderWithProviders(<BookTable books={books} />);

    expect(screen.getByText("Dune")).toBeInTheDocument();
    expect(screen.getByText("Frank Herbert")).toBeInTheDocument();
    expect(screen.getByText("A Wizard of Earthsea")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Download" })).toHaveLength(2);
  });
});
