import { Box, TextInput } from "@mantine/core";
import { createStyles } from "@mantine/emotion";
import { getHotkeyHandler } from "@mantine/hooks";
import { Column, Table } from "@tanstack/react-table";
import { useEffect, useState } from "react";

interface TextFilterProps {
  icon?: React.ReactNode;
  placeholder: string;
  column: Column<any, string>;
  table: Table<any>;
}

const useStyles = createStyles(
  (theme, { filterValue }: { filterValue: string }, u) => ({
    icon: {
      display: "flex",
      color: filterValue ? theme.colors.brand[4] : theme.colors.dark[1],

      [u.dark]: {
        color: filterValue ? theme.colors.brand[3] : theme.colors.dark[3]
      }
    },
    input: {
      ["&::placeholder"]: {
        color: theme.colors.gray[7],
        textTransform: "uppercase",
        fontWeight: "bold"
      },

      [u.dark]: {
        ["&::placeholder"]: {
          color: theme.colors.dark[0]
        }
      }
    }
  })
);

export function TextFilter({
  icon,
  placeholder,
  column,
  table
}: TextFilterProps) {
  const [filterValue, setFilterValue] = useState(
    column.getFilterValue() as string
  );

  useEffect(() => {
    column.setFilterValue(filterValue);
  }, [filterValue]);

  const { classes } = useStyles({ filterValue });

  const styledIcon = (
    <Box component="span" className={classes.icon}>
      {icon}
    </Box>
  );

  return (
    <TextInput
      leftSection={styledIcon}
      size="xs"
      placeholder={placeholder}
      classNames={{ input: classes.input }}
      variant="unstyled"
      onChange={(e) => setFilterValue(e.currentTarget.value)}
      value={filterValue}
      onKeyDown={getHotkeyHandler([["Escape", () => setFilterValue("")]])}
    />
  );
}
