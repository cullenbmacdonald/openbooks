import { describe, expect, it } from "vitest";
import { NotificationType } from "./messages";
import reducer, {
  addNotification,
  clearNotifications,
  dismissNotification,
  toggleDrawer
} from "./notificationSlice";

const baseNotification = {
  appearance: NotificationType.NOTIFY,
  title: "Test notification",
  timestamp: 1000
};

describe("notificationSlice", () => {
  it("returns the initial state", () => {
    const state = reducer(undefined, { type: "@@INIT" });
    expect(state).toEqual({ isOpen: false, notifications: [] });
  });

  it("addNotification prepends a notification", () => {
    const first = { ...baseNotification, timestamp: 1 };
    const second = { ...baseNotification, timestamp: 2 };

    let state = reducer(undefined, addNotification(first));
    state = reducer(state, addNotification(second));

    expect(state.notifications).toEqual([second, first]);
  });

  it("dismissNotification removes the matching notification by timestamp", () => {
    const first = { ...baseNotification, timestamp: 1 };
    const second = { ...baseNotification, timestamp: 2 };

    let state = reducer(undefined, addNotification(first));
    state = reducer(state, addNotification(second));
    state = reducer(state, dismissNotification(first));

    expect(state.notifications).toEqual([second]);
  });

  it("clearNotifications empties the notification list", () => {
    let state = reducer(undefined, addNotification(baseNotification));
    expect(state.notifications).toHaveLength(1);

    state = reducer(state, clearNotifications());
    expect(state.notifications).toEqual([]);
  });

  it("toggleDrawer flips isOpen", () => {
    let state = reducer(undefined, toggleDrawer());
    expect(state.isOpen).toBe(true);

    state = reducer(state, toggleDrawer());
    expect(state.isOpen).toBe(false);
  });
});
