import { configureStore } from "@reduxjs/toolkit";
import { beforeEach, describe, expect, it } from "vitest";
import { openbooksApi } from "./api";
import historyReducer, {
  addHistoryItem,
  deleteHistoryItem,
  historySlice,
  selectHistory,
  updateHistoryItem
} from "./historySlice";
import notificationReducer from "./notificationSlice";
import stateReducer, { setActiveItem } from "./stateSlice";

// A store matching the shape of the real app store (minus the websocket
// middleware), for exercising thunks that read/write across slices.
const buildStore = () =>
  configureStore({
    reducer: {
      state: stateReducer,
      history: historyReducer,
      notifications: notificationReducer,
      [openbooksApi.reducerPath]: openbooksApi.reducer
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(openbooksApi.middleware)
  });

describe("historySlice reducers", () => {
  const initialState = historySlice.getInitialState();

  it("returns the initial state", () => {
    expect(historyReducer(undefined, { type: "@@INIT" })).toEqual({
      items: []
    });
  });

  it("addHistoryItem prepends and caps the list at 16 items", () => {
    let state = initialState;
    for (let i = 0; i < 20; i++) {
      state = historyReducer(
        state,
        addHistoryItem({ query: `query-${i}`, timestamp: i })
      );
    }

    expect(state.items).toHaveLength(16);
    // Most recently added item is first.
    expect(state.items[0]).toEqual({ query: "query-19", timestamp: 19 });
  });

  it("updateHistoryItem replaces the item with the matching timestamp", () => {
    let state = historyReducer(
      initialState,
      addHistoryItem({ query: "dune", timestamp: 1 })
    );
    state = historyReducer(
      state,
      addHistoryItem({ query: "the great gatsby", timestamp: 2 })
    );

    const updated = {
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
    };

    state = historyReducer(state, updateHistoryItem(updated));

    expect(state.items).toHaveLength(2);
    expect(state.items.find((x) => x.timestamp === 1)).toEqual(updated);
  });
});

describe("selectHistory", () => {
  it("selects the history items slice", () => {
    const store = buildStore();
    store.dispatch(addHistoryItem({ query: "dune", timestamp: 1 }));

    expect(selectHistory(store.getState())).toEqual([
      { query: "dune", timestamp: 1 }
    ]);
  });
});

describe("deleteHistoryItem thunk", () => {
  let store: ReturnType<typeof buildStore>;

  beforeEach(() => {
    store = buildStore();
    store.dispatch(addHistoryItem({ query: "dune", timestamp: 1 }));
    store.dispatch(addHistoryItem({ query: "the great gatsby", timestamp: 2 }));
  });

  it("removes the item with the given timestamp", () => {
    store.dispatch(deleteHistoryItem(1));

    const state = store.getState();
    expect(state.history.items.map((x) => x.timestamp)).toEqual([2]);
  });

  it("clears the active item if it matches the deleted timestamp", () => {
    store.dispatch(setActiveItem({ query: "dune", timestamp: 1 }));
    store.dispatch(deleteHistoryItem(1));

    expect(store.getState().state.activeItem).toBeNull();
  });

  it("with no timestamp clears the active item and removes the most recent entry", () => {
    store.dispatch(setActiveItem({ query: "the great gatsby", timestamp: 2 }));
    store.dispatch(deleteHistoryItem());

    const state = store.getState();
    expect(state.state.activeItem).toBeNull();
    // Most recently added item (timestamp 2) is at the front and gets removed.
    expect(state.history.items.map((x) => x.timestamp)).toEqual([1]);
  });
});
