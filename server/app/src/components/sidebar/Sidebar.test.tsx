import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { toggleSidebar } from "../../state/stateSlice";
import { renderWithProviders } from "../../test/render";
import Sidebar from "./Sidebar";

describe("Sidebar", () => {
  it("renders without throwing", () => {
    renderWithProviders(<Sidebar />);

    expect(screen.getByText("OpenBooks")).toBeInTheDocument();
    expect(
      screen.getByText("Download eBooks from IRC Highway")
    ).toBeInTheDocument();
  });

  it("renders nothing when the sidebar is closed", () => {
    const { container, store } = renderWithProviders(<Sidebar />);
    expect(container.textContent).not.toBe("");

    act(() => {
      store.dispatch(toggleSidebar());
    });

    expect(screen.queryByText("OpenBooks")).not.toBeInTheDocument();
  });
});
