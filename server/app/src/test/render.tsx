import { ColorSchemeProvider, MantineProvider } from "@mantine/core";
import { NotificationsProvider } from "@mantine/notifications";
import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query/react";
import { render, RenderOptions } from "@testing-library/react";
import { enableMapSet } from "immer";
import { ReactElement, ReactNode, useState } from "react";
import { Provider } from "react-redux";
import { openbooksApi } from "../state/api";
import historyReducer from "../state/historySlice";
import notificationReducer from "../state/notificationSlice";
import stateReducer from "../state/stateSlice";

enableMapSet();

// Build a store with the same reducer/middleware shape as the real app
// store (`src/state/store.ts`), minus the websocket middleware. Render
// smoke tests don't need a live socket connection, and constructing one in
// jsdom would attempt a real network connection.
export const buildTestStore = () => {
  const store = configureStore({
    reducer: {
      state: stateReducer,
      history: historyReducer,
      notifications: notificationReducer,
      [openbooksApi.reducerPath]: openbooksApi.reducer
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(openbooksApi.middleware)
  });

  setupListeners(store.dispatch);

  return store;
};

export type TestStore = ReturnType<typeof buildTestStore>;

// Render a component wrapped in a fresh Redux store's <Provider>. Components
// rendered this way still need to be wrapped in whatever Mantine providers
// they require (MantineProvider, NotificationsProvider, etc).
export function renderWithStore(
  ui: ReactElement,
  {
    store = buildTestStore(),
    ...options
  }: { store?: TestStore } & Omit<RenderOptions, "wrapper"> = {}
) {
  return {
    store,
    ...render(<Provider store={store}>{ui}</Provider>, options)
  };
}

// Mirrors the Mantine provider wiring in App.tsx (ColorSchemeProvider +
// MantineProvider + NotificationsProvider), without the AppShell/emotion
// cache wrapper. Used to render individual components that rely on Mantine
// context (theme, color scheme, notifications) outside of the full <App/>.
function Providers({ children }: { children: ReactNode }) {
  const [colorScheme, setColorScheme] = useState<"light" | "dark">("light");

  return (
    <ColorSchemeProvider
      colorScheme={colorScheme}
      toggleColorScheme={() =>
        setColorScheme((color) => (color === "dark" ? "light" : "dark"))
      }>
      <MantineProvider
        withGlobalStyles
        withNormalizeCSS
        theme={{
          colorScheme,
          primaryColor: "brand",
          primaryShade: { light: 4, dark: 2 },
          colors: {
            brand: [
              "#e0ecff",
              "#b0c6ff",
              "#7e9fff",
              "#4c79ff",
              "#3366ff",
              "#0039e6",
              "#002db4",
              "#002082",
              "#001351",
              "#000621"
            ]
          }
        }}>
        <NotificationsProvider position="top-center">
          {children}
        </NotificationsProvider>
      </MantineProvider>
    </ColorSchemeProvider>
  );
}

// Render a component wrapped in both a fresh Redux store and the Mantine
// provider stack used by the real app.
export function renderWithProviders(
  ui: ReactElement,
  options: { store?: TestStore } & Omit<RenderOptions, "wrapper"> = {}
) {
  return renderWithStore(<Providers>{ui}</Providers>, options);
}
