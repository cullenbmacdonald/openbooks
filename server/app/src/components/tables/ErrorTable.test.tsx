import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ParseError } from "../../state/messages";
import { renderWithProviders } from "../../test/render";
import ErrorTable from "./ErrorTable";

const errors: ParseError[] = [
  { error: "unparseable size", line: "!Server1 Some Book.epub::INFO::bad" }
];

describe("ErrorTable", () => {
  it("renders without throwing when given no errors", () => {
    renderWithProviders(<ErrorTable errors={[]} setSearchQuery={vi.fn()} />);

    expect(
      screen.getByText(/could not be parsed to due to their non-standard/)
    ).toBeInTheDocument();
  });

  it("renders a row per parse error", () => {
    renderWithProviders(
      <ErrorTable errors={errors} setSearchQuery={vi.fn()} />
    );

    expect(
      screen.getByText("!Server1 Some Book.epub::INFO::bad")
    ).toBeInTheDocument();
    expect(screen.getByText("unparseable size")).toBeInTheDocument();
  });
});
