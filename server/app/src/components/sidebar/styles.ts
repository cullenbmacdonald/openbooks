import { getThemeColor } from "@mantine/core";
import { createStyles } from "@mantine/emotion";

export interface SidebarButtonStyleProps {
  isActive?: boolean;
}

export const useSidebarButtonStyle = createStyles(
  (theme, { isActive = false }: SidebarButtonStyleProps, u) => {
    const primaryColor = getThemeColor(undefined, theme);

    return {
      root: {
        "backgroundColor": "white",
        "borderColor": isActive ? primaryColor : theme.colors.gray[3],
        "boxShadow": isActive ? theme.shadows.sm : "none",

        "&:hover": {
          backgroundColor: theme.colors.gray[1]
        },

        [u.dark]: {
          "backgroundColor": theme.colors.dark[6],
          "borderColor": isActive ? primaryColor : theme.colors.gray[8],

          "&:hover": {
            backgroundColor: theme.colors.dark[5]
          }
        }
      },
      inner: {
        color: "black",
        fontWeight: "normal",
        justifyContent: "space-between",

        [u.dark]: {
          color: "white"
        }
      },
      label: {
        paddingLeft: theme.spacing.sm,
        flex: 1,
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        textAlign: "start"
      }
    };
  }
);
