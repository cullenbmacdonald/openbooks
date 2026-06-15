import { createStyles } from "@mantine/emotion";

export const useTableStyles = createStyles((theme, _params, u) => ({
  container: {
    border: `1px solid ${theme.colors.gray[3]}`,
    borderRadius: theme.radius.md,
    backgroundColor: "white",
    height: "100%",
    overflow: "auto",
    width: "100%",
    boxShadow: theme.shadows.xs,

    [u.dark]: {
      border: `1px solid ${theme.colors.dark[3]}`,
      backgroundColor: theme.colors.dark[6]
    }
  },
  head: {
    position: "sticky",
    top: 0,
    backgroundColor: theme.colors.gray[1],
    zIndex: 1,

    [u.dark]: {
      backgroundColor: theme.colors.dark[5]
    }
  },
  headerCell: {
    textTransform: "uppercase",
    position: "relative"
  },
  resizer: {
    position: "absolute",
    right: 0,
    top: 0,
    height: "100%",
    width: "2px",
    background: theme.colors.gray[6],
    cursor: "col-resize",
    userSelect: "none",
    touchAction: "none",
    opacity: 0,

    ["&.isResizing"]: {
      background: theme.colors.brand[4],
      opacity: 1
    },

    ["&:hover"]: {
      opacity: 1
    },

    [u.dark]: {
      background: theme.colors.dark[3],

      ["&.isResizing"]: {
        background: theme.colors.brand[3]
      }
    }
  }
}));
