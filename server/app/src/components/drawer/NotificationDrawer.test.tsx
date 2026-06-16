import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NotificationType } from "../../state/messages";
import { addNotification, toggleDrawer } from "../../state/notificationSlice";
import { buildTestStore, renderWithProviders } from "../../test/render";
import NotificationDrawer from "./NotificationDrawer";

describe("NotificationDrawer", () => {
  it("renders a closed drawer without throwing", () => {
    const { container } = renderWithProviders(<NotificationDrawer />);

    // Mantine's Drawer doesn't render its content while closed.
    expect(screen.queryByText("Notifications")).not.toBeInTheDocument();
    expect(container).toBeInTheDocument();
  });

  it("shows a placeholder when there are no notifications and the drawer is open", () => {
    const store = buildTestStore();
    store.dispatch(toggleDrawer());

    renderWithProviders(<NotificationDrawer />, { store });

    expect(screen.getByText("No notifications.")).toBeInTheDocument();
  });

  it("lists notifications when the drawer is open", () => {
    const store = buildTestStore();
    store.dispatch(
      addNotification({
        appearance: NotificationType.SUCCESS,
        title: "Download complete",
        timestamp: 1000
      })
    );
    store.dispatch(toggleDrawer());

    renderWithProviders(<NotificationDrawer />, { store });

    expect(screen.getByText("Download complete")).toBeInTheDocument();
  });

  it("clears notifications when the clear button is clicked", () => {
    const store = buildTestStore();
    store.dispatch(
      addNotification({
        appearance: NotificationType.SUCCESS,
        title: "Download complete",
        timestamp: 1000
      })
    );
    store.dispatch(toggleDrawer());

    renderWithProviders(<NotificationDrawer />, { store });

    // The "Clear Notifications" action is an icon-only ActionIcon with a
    // Mantine Tooltip (no accessible name in Mantine 5), so locate it
    // structurally: it's the only enabled button next to the drawer title.
    const heading = screen.getByText("Notifications");
    const clearButton = heading.parentElement?.querySelector("button");
    expect(clearButton).not.toBeNull();

    act(() => {
      clearButton!.click();
    });

    expect(store.getState().notifications.notifications).toEqual([]);
  });
});
