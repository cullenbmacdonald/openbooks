import {
  ActionIcon,
  Button,
  Center,
  Group,
  Image,
  Stack,
  TextInput,
  Title,
  useComputedColorScheme
} from "@mantine/core";
import { createStyles } from "@mantine/emotion";
import { MagnifyingGlass, Sidebar, Warning } from "@phosphor-icons/react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import image from "../assets/reading.svg";
import BookTable from "../components/tables/BookTable";
import ErrorTable from "../components/tables/ErrorTable";
import { MessageType } from "../state/messages";
import { sendMessage, sendSearch, toggleSidebar } from "../state/stateSlice";
import { useAppDispatch, useAppSelector } from "../state/store";

const useStyles = createStyles(
  (theme, { errorMode }: { errorMode: boolean }, u) => ({
    wFull: {
      width: "100%"
    },
    page: {
      width: "100%",
      margin: theme.spacing.xl
    },
    form: {
      marginBottom: theme.spacing.md
    },
    errorToggle: {
      "alignSelf": "start",
      "height": "24px",
      "marginBottom": theme.spacing.xs,
      "fontWeight": 500,
      "color": errorMode ? theme.colors.white : theme.colors.dark[3],
      "&:hover": {
        backgroundColor: errorMode
          ? theme.colors.brand[5]
          : theme.colors.gray[1]
      },

      [u.dark]: {
        "color": errorMode ? theme.colors.dark[8] : theme.colors.dark[2],
        "&:hover": {
          backgroundColor: errorMode
            ? theme.colors.brand[3]
            : theme.colors.dark[7]
        }
      }
    }
  })
);

export default function SearchPage() {
  const dispatch = useAppDispatch();
  const activeItem = useAppSelector((store) => store.state.activeItem);
  const opened = useAppSelector((store) => store.state.isSidebarOpen);

  const [searchQuery, setSearchQuery] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  const hasErrors = (activeItem?.errors ?? []).length > 0;
  const errorMode = showErrors && activeItem;
  const validInput = errorMode
    ? searchQuery.startsWith("!")
    : searchQuery !== "";

  const { classes } = useStyles({ errorMode: !!errorMode });
  const colorScheme = useComputedColorScheme("light");

  useEffect(() => {
    setShowErrors(false);
  }, [activeItem]);

  const searchHandler = (event: FormEvent) => {
    event.preventDefault();

    if (errorMode) {
      dispatch(
        sendMessage({
          type: MessageType.DOWNLOAD,
          payload: { book: searchQuery }
        })
      );
    } else {
      dispatch(sendSearch(searchQuery));
    }

    setSearchQuery("");
  };

  const bookTable = useMemo(
    () => <BookTable books={activeItem?.results ?? []} />,
    [activeItem?.results]
  );

  const errorTable = useMemo(
    () => (
      <ErrorTable
        errors={activeItem?.errors ?? []}
        setSearchQuery={setSearchQuery}
      />
    ),
    [activeItem?.errors]
  );

  return (
    <Stack gap={0} align="center" className={classes.page}>
      <form className={classes.wFull} onSubmit={(e) => searchHandler(e)}>
        <Group wrap="nowrap" gap="md" className={classes.form}>
          {!opened && (
            <ActionIcon size="lg" onClick={() => dispatch(toggleSidebar())}>
              <Sidebar weight="bold" size={20}></Sidebar>
            </ActionIcon>
          )}
          <TextInput
            className={classes.wFull}
            variant="filled"
            disabled={activeItem !== null && !activeItem.results}
            value={searchQuery}
            onChange={(e: any) => setSearchQuery(e.target.value)}
            placeholder={
              errorMode ? "Download a book manually." : "Search for a book."
            }
            radius="md"
            type="search"
            leftSection={<MagnifyingGlass weight="bold" size={22} />}
            required
          />

          <Button
            type="submit"
            color={colorScheme === "dark" ? "brand.2" : "brand"}
            disabled={!validInput}
            radius="md"
            variant={validInput ? "gradient" : "default"}
            gradient={{ from: "brand.4", to: "brand.3" }}>
            {errorMode ? "Download" : "Search"}
          </Button>
        </Group>
      </form>

      {hasErrors && (
        <Button
          className={classes.errorToggle}
          variant={errorMode ? "filled" : "subtle"}
          onClick={() => setShowErrors((show) => !show)}
          leftSection={<Warning size={18} />}
          size="xs">
          {activeItem?.errors?.length} Parsing{" "}
          {activeItem?.errors?.length === 1 ? "Error" : "Errors"}
        </Button>
      )}
      {!activeItem ? (
        <Center style={{ height: "100%", width: "100%" }}>
          <Stack align="center">
            <Title fw="normal" ta="center">
              Search a book to get started.
            </Title>
            <Image
              visibleFrom="md"
              width={600}
              fit="contain"
              src={image}
              alt="person reading"
            />
            <Image
              hiddenFrom="md"
              width={300}
              fit="contain"
              src={image}
              alt="person reading"
            />
          </Stack>
        </Center>
      ) : errorMode ? (
        errorTable
      ) : (
        bookTable
      )}
    </Stack>
  );
}
