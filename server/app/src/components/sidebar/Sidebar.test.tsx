import { AppShell } from "@mantine/core";
import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { toggleSidebar } from "../../state/stateSlice";
import { renderWithProviders } from "../../test/render";
import Sidebar from "./Sidebar";

// Sidebar renders <AppShell.Section> elements, which require an <AppShell>
// ancestor for context (mirrors the composition in App.tsx).
function renderSidebar() {
  return renderWithProviders(
    <AppShell navbar={{ width: 300, breakpoint: "sm" }}>
      <AppShell.Navbar>
        <Sidebar />
      </AppShell.Navbar>
    </AppShell>
  );
}

describe("Sidebar", () => {
  it("renders without throwing", () => {
    renderSidebar();

    expect(screen.getByText("OpenBooks")).toBeInTheDocument();
    expect(
      screen.getByText("Download eBooks from IRC Highway")
    ).toBeInTheDocument();
  });

  it("renders nothing when the sidebar is closed", () => {
    const { container, store } = renderSidebar();
    expect(container.textContent).not.toBe("");

    act(() => {
      store.dispatch(toggleSidebar());
    });

    expect(screen.queryByText("OpenBooks")).not.toBeInTheDocument();
  });
});
