import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Provider } from "react-redux";
import App from "./App";
import { buildTestStore } from "./test/render";

describe("App", () => {
  it("renders without throwing", () => {
    const store = buildTestStore();
    render(
      <Provider store={store}>
        <App />
      </Provider>
    );

    expect(
      screen.getByText("Search a book to get started.")
    ).toBeInTheDocument();
  });
});
