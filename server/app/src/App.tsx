import {
  AppShell,
  localStorageColorSchemeManager,
  MantineProvider
} from "@mantine/core";
import {
  emotionTransform,
  MantineEmotionProvider,
  createStyles
} from "@mantine/emotion";
import { Notifications } from "@mantine/notifications";
import NotificationDrawer from "./components/drawer/NotificationDrawer";
import Sidebar from "./components/sidebar/Sidebar";
import SearchPage from "./pages/SearchPage";
import { useAppSelector } from "./state/store";

const colorSchemeManager = localStorageColorSchemeManager();

const useStyles = createStyles((theme, _params, u) => ({
  wrapper: {
    boxSizing: "border-box",
    display: "flex",
    flexWrap: "nowrap",
    maxHeight: "100vh",
    minHeight: "100vh"
  },
  main: {
    backgroundColor: theme.colors.gray[0],

    [u.dark]: {
      backgroundColor: theme.colors.dark[8]
    }
  }
}));

// Renders the AppShell layout. `useStyles` (from @mantine/emotion) calls
// useMantineTheme() under the hood, which requires a MantineProvider
// ancestor — so this must be a descendant of <App>'s providers, not part of
// the same component that renders MantineProvider itself.
function AppLayout() {
  const { classes } = useStyles();

  const open = useAppSelector((state) => state.state.isSidebarOpen);

  return (
    <AppShell
      navbar={{
        width: 300,
        breakpoint: "sm",
        collapsed: { mobile: !open, desktop: !open }
      }}
      padding={0}>
      <AppShell.Navbar>
        <Sidebar />
      </AppShell.Navbar>
      <AppShell.Main className={classes.main}>
        <div className={classes.wrapper}>
          <SearchPage />
          <NotificationDrawer />
        </div>
      </AppShell.Main>
    </AppShell>
  );
}

export default function App() {
  return (
    <MantineProvider
      defaultColorScheme="light"
      colorSchemeManager={colorSchemeManager}
      stylesTransform={emotionTransform}
      theme={{
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
        },
        components: {
          ActionIcon: {
            defaultProps: {
              radius: "md",
              color: "brand"
            }
          }
        }
      }}>
      <MantineEmotionProvider>
        <Notifications position="top-center" />
        <AppLayout />
      </MantineEmotionProvider>
    </MantineProvider>
  );
}
