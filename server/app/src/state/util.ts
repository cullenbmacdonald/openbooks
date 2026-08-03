import { notifications } from "@mantine/notifications";
import { Notification, NotificationType } from "./messages";

// getBaseURL returns the directory the app is served from, which is also the
// root every API path hangs off of.
//
// The page URL can carry a query string or a fragment (deep links, embed
// parameters, a proxy's own params) and it doesn't necessarily end in a slash.
// Any of those silently corrupts a URL built by string concatenation — a page
// at "/?tab=1" turned into a websocket URL of "/?tab=1ws", which connects to
// the static file handler instead of /ws and fails the handshake.
const getBaseURL = (): URL => {
  const baseURL = new URL(window.location.href);
  baseURL.search = "";
  baseURL.hash = "";

  // Drop any trailing file name so relative paths resolve under the app's
  // basepath rather than replacing its last segment.
  if (!baseURL.pathname.endsWith("/")) {
    baseURL.pathname = baseURL.pathname.replace(/[^/]*$/, "");
  }

  if (import.meta.env.DEV) {
    baseURL.port = "5228";
  }

  return baseURL;
};

export const getWebsocketURL = (): URL => {
  const websocketURL = new URL("ws", getBaseURL());
  websocketURL.protocol = websocketURL.protocol === "https:" ? "wss:" : "ws:";

  return websocketURL;
};

export const getApiURL = (): URL => getBaseURL();

export const displayNotification = ({
  appearance = NotificationType.NOTIFY,
  title,
  detail
}: Notification) => {
  switch (appearance) {
    case NotificationType.NOTIFY:
      notifications.show({
        color: "brand",
        title: title,
        message: detail
      });
      break;
    case NotificationType.SUCCESS:
      notifications.show({
        color: "green",
        title: title,
        message: detail
      });

      break;
    case NotificationType.WARNING:
      notifications.show({
        color: "yellow",
        title: title,
        message: detail
      });
      break;
    case NotificationType.DANGER:
      notifications.show({
        color: "red",
        title: title,
        message: detail
      });
      break;
  }
};

// downloadFile saves a book the server has finished fetching.
//
// It pulls the bytes down itself instead of pointing a link at the URL. A bare
// anchor with target="_blank" navigates a new window whenever the browser
// declines to treat the response as a download — which is how an unrelated
// login page ends up in a popup when OpenBooks sits behind a reverse proxy or
// in an iframe. Fetching keeps the request in-page, sends the session cookie,
// and surfaces a failure as a notification rather than a stray window.
export async function downloadFile(relativeURL?: string): Promise<void> {
  if (relativeURL === "" || relativeURL === undefined) return;

  const url = new URL(relativeURL, getBaseURL());
  const fileName =
    decodeURIComponent(url.pathname.split("/").pop() ?? "") || "book";

  try {
    const response = await fetch(url.href, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`The server responded with ${response.status}.`);
    }

    const objectURL = URL.createObjectURL(await response.blob());
    try {
      const link = document.createElement("a");
      link.download = fileName;
      link.href = objectURL;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      URL.revokeObjectURL(objectURL);
    }
  } catch (error) {
    displayNotification({
      appearance: NotificationType.DANGER,
      title: `Unable to download ${fileName}.`,
      detail: error instanceof Error ? error.message : undefined,
      timestamp: new Date().getTime()
    });
  }
}
