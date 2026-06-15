import {
  ActionIcon,
  AppShell,
  Burger,
  Group,
  SegmentedControl,
  Text,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme
} from "@mantine/core";
import { createStyles } from "@mantine/emotion";
import { useLocalStorage } from "@mantine/hooks";
import {
  BellSimple,
  IdentificationBadge,
  MoonStars,
  Plugs,
  Sidebar as SidebarIcon,
  Sun
} from "@phosphor-icons/react";
import { toggleDrawer } from "../../state/notificationSlice";
import { toggleSidebar } from "../../state/stateSlice";
import { useAppDispatch, useAppSelector } from "../../state/store";
import History from "./History";
import Library from "./Library";

const useStyles = createStyles((theme, _params, u) => {
  return {
    navbar: {
      backgroundColor: theme.white,

      [u.dark]: {
        backgroundColor: theme.colors.dark[7]
      }
    },
    footer: {
      borderTop: `1px solid ${theme.colors.gray[3]}`,
      paddingTop: theme.spacing.sm,

      [u.dark]: {
        borderTop: `1px solid ${theme.colors.dark[4]}`
      }
    }
  };
});

export default function Sidebar() {
  const { classes } = useStyles();
  const { toggleColorScheme } = useMantineColorScheme();
  const colorScheme = useComputedColorScheme("light");

  const dispatch = useAppDispatch();
  const connected = useAppSelector((store) => store.state.isConnected);
  const username = useAppSelector((store) => store.state.username);
  const opened = useAppSelector((store) => store.state.isSidebarOpen);

  const [index, setIndex] = useLocalStorage<"books" | "history">({
    key: "sidebar-state",
    defaultValue: "history"
  });

  if (!opened) {
    return <></>;
  }

  return (
    <>
      <AppShell.Section p="sm" className={classes.navbar}>
        <Group justify="space-between">
          <Text fw="bold" size="lg">
            OpenBooks
          </Text>
          <Group>
            <Tooltip
              label={`OpenBooks server ${
                connected ? "connected" : "disconnected"
              }.`}>
              <ActionIcon
                aria-label="Toggle notifications"
                disabled={!connected}
                onClick={() => dispatch(toggleDrawer())}>
                <BellSimple weight="bold" size={18} />
              </ActionIcon>
            </Tooltip>
            <Burger
              hiddenFrom="sm"
              opened={opened}
              onClick={() => dispatch(toggleSidebar())}
              size="sm"
            />
          </Group>
        </Group>

        <Text size="sm" c="dimmed">
          Download eBooks from IRC Highway
        </Text>

        <SegmentedControl
          size="sm"
          styles={(theme) => ({
            root: {
              marginTop: theme.spacing.md
            },
            label: {
              fontSize: theme.fontSizes.xs
            }
          })}
          value={index}
          onChange={(value: string) => setIndex(value as "books" | "history")}
          data={[
            { label: "Search History", value: "history" },
            { label: "Previous Downloads", value: "books" }
          ]}
          fullWidth
        />
      </AppShell.Section>

      <AppShell.Section
        grow
        p="xs"
        className={classes.navbar}
        style={{ overflow: "auto" }}>
        {index === "history" ? <History /> : <Library />}
      </AppShell.Section>

      <AppShell.Section className={classes.footer} p="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group>
            {username ? (
              <>
                <IdentificationBadge size={24} />
                <Text
                  size="sm"
                  lineClamp={1}
                  style={{
                    maxWidth: 150,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}>
                  {username}
                </Text>
              </>
            ) : (
              <>
                <Plugs size={24} />
                <Text size="sm">Not connected.</Text>
              </>
            )}
          </Group>

          <Group align="end" gap="xs">
            <ActionIcon
              aria-label="Toggle color scheme"
              onClick={() => toggleColorScheme()}>
              {colorScheme === "dark" ? (
                <Sun size={18} weight="bold" />
              ) : (
                <MoonStars size={18} weight="bold" />
              )}
            </ActionIcon>
            <ActionIcon
              aria-label="Collapse sidebar"
              onClick={() => dispatch(toggleSidebar())}>
              <SidebarIcon weight="bold" size={18} />
            </ActionIcon>
          </Group>
        </Group>
      </AppShell.Section>
    </>
  );
}
