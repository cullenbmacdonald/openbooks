import { configureStore } from "@reduxjs/toolkit";
import { beforeEach, describe, expect, it } from "vitest";
import { openbooksApi } from "./api";
import historyReducer from "./historySlice";
import { MessageType, NotificationType } from "./messages";
import notificationReducer from "./notificationSlice";
import stateReducer, {
  addInFlightDownload,
  removeInFlightDownload,
  sendDownload,
  sendMessage,
  sendSearch,
  setActiveItem,
  setConnectionState,
  setSearchResults,
  setUsername,
  stateSlice,
  toggleSidebar
} from "./stateSlice";

describe("stateSlice reducers", () => {
  const initialState = stateSlice.getInitialState();

  it("returns the initial state", () => {
    expect(stateReducer(undefined, { type: "@@INIT" })).toEqual({
      ...initialState,
      // localStorage isn't populated in jsdom by default
      activeItem: null
    });
  });

  it("setActiveItem sets the active item", () => {
    const item = { query: "dune", timestamp: 123 };
    const state = stateReducer(initialState, setActiveItem(item));
    expect(state.activeItem).toEqual(item);
  });

  it("setActiveItem(null) clears the active item", () => {
    const item = { query: "dune", timestamp: 123 };
    let state = stateReducer(initialState, setActiveItem(item));
    state = stateReducer(state, setActiveItem(null));
    expect(state.activeItem).toBeNull();
  });

  it("setConnectionState toggles isConnected", () => {
    let state = stateReducer(initialState, setConnectionState(true));
    expect(state.isConnected).toBe(true);

    state = stateReducer(state, setConnectionState(false));
    expect(state.isConnected).toBe(false);
  });

  it("setUsername sets the username", () => {
    const state = stateReducer(initialState, setUsername("evan"));
    expect(state.username).toBe("evan");
  });

  it("addInFlightDownload appends a download", () => {
    const state = stateReducer(initialState, addInFlightDownload("book.epub"));
    expect(state.inFlightDownloads).toEqual(["book.epub"]);
  });

  it("removeInFlightDownload shifts the oldest download", () => {
    let state = stateReducer(initialState, addInFlightDownload("a.epub"));
    state = stateReducer(state, addInFlightDownload("b.epub"));
    state = stateReducer(state, removeInFlightDownload());
    expect(state.inFlightDownloads).toEqual(["b.epub"]);
  });

  it("toggleSidebar flips isSidebarOpen", () => {
    let state = stateReducer(initialState, toggleSidebar());
    expect(state.isSidebarOpen).toBe(!initialState.isSidebarOpen);

    state = stateReducer(state, toggleSidebar());
    expect(state.isSidebarOpen).toBe(initialState.isSidebarOpen);
  });
});

describe("sendMessage", () => {
  it("serializes the message payload as JSON", () => {
    const action = sendMessage({
      type: MessageType.SEARCH,
      payload: { query: "dune" }
    });
    expect(action.type).toBe("socket/send_message");
    expect(action.payload).toEqual({
      message: JSON.stringify({
        type: MessageType.SEARCH,
        payload: { query: "dune" }
      })
    });
  });
});

// A store matching the shape of the real app store (minus the websocket
// middleware), for exercising the thunks that dispatch sendMessage / update
// history / update active item.
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

describe("thunks", () => {
  let store: ReturnType<typeof buildStore>;

  beforeEach(() => {
    store = buildStore();
  });

  it("sendSearch adds a history item and sets it active", () => {
    store.dispatch(sendSearch("the great gatsby"));

    const state = store.getState();
    expect(state.history.items).toHaveLength(1);
    expect(state.history.items[0].query).toBe("the great gatsby");
    expect(state.state.activeItem?.query).toBe("the great gatsby");
  });

  it("sendDownload marks the book as in-flight", () => {
    store.dispatch(sendDownload("book.epub"));

    const state = store.getState();
    expect(state.state.inFlightDownloads).toEqual(["book.epub"]);
  });

  it("setSearchResults updates the active item and history entry", async () => {
    store.dispatch(sendSearch("dune"));
    const activeBefore = store.getState().state.activeItem!;

    const books = [
      {
        server: "Server1",
        author: "Frank Herbert",
        title: "Dune",
        format: "epub",
        size: "1.2MB",
        full: "!Server1 Frank Herbert - Dune.epub"
      }
    ];

    await store.dispatch(
      setSearchResults({
        type: MessageType.SEARCH,
        appearance: NotificationType.SUCCESS,
        title: "Search complete",
        books,
        errors: []
      })
    );

    const state = store.getState();
    expect(state.state.activeItem?.results).toEqual(books);
    expect(state.history.items[0].timestamp).toBe(activeBefore.timestamp);
    expect(state.history.items[0].results).toEqual(books);
  });

  it("setSearchResults is a no-op when there is no active item", async () => {
    await store.dispatch(
      setSearchResults({
        type: MessageType.SEARCH,
        appearance: NotificationType.SUCCESS,
        title: "Search complete",
        books: [],
        errors: []
      })
    );

    const state = store.getState();
    expect(state.state.activeItem).toBeNull();
    expect(state.history.items).toEqual([]);
  });
});
