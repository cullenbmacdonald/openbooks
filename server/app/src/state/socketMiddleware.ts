import { Middleware, MiddlewareAPI } from "@reduxjs/toolkit";
import { openbooksApi } from "./api";
import { deleteHistoryItem } from "./historySlice";
import {
  ConnectionResponse,
  DownloadResponse,
  MessageType,
  Notification,
  NotificationType,
  Response,
  SearchResponse
} from "./messages";
import { addNotification } from "./notificationSlice";
import {
  removeInFlightDownload,
  sendMessage,
  setConnectionState,
  setSearchResults,
  setUsername
} from "./stateSlice";
import { AppDispatch, RootState } from "./store";
import { displayNotification, downloadFile } from "./util";

// How long to wait before the first reconnect attempt, and the ceiling the
// backoff grows to.
const RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 15_000;

// Web socket redux middleware.
// Listens to socket and dispatches handlers.
// Handles send_message actions by sending to socket.
//
// The socket is reconnected automatically. Anything that interrupts it — a
// page refresh racing its own previous connection, the server restarting,
// waking from sleep, a proxy dropping an idle connection — used to leave the
// app permanently dead with no indication beyond a stale UI, because the
// socket was opened exactly once when the store was created.
export const websocketConn =
  (wsUrl: string): Middleware =>
  ({ dispatch }: MiddlewareAPI<AppDispatch, RootState>) => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let failedAttempts = 0;
    // Tracks whether the user has been told the connection dropped, so a long
    // outage produces one notification rather than one per retry.
    let reportedDisconnect = false;
    let everConnected = false;

    const connect = (): void => {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log("WebSocket connected.");
        if (reportedDisconnect) {
          displayNotification({
            appearance: NotificationType.SUCCESS,
            title: "Reconnected to server.",
            timestamp: new Date().getTime()
          });
        }
        failedAttempts = 0;
        reportedDisconnect = false;
        everConnected = true;
        dispatch(setConnectionState(true));
        dispatch(sendMessage({ type: MessageType.CONNECT, payload: {} }));
      };

      socket.onclose = () => {
        console.log("WebSocket closed.");
        dispatch(setConnectionState(false));
        notifyDisconnected();
        scheduleReconnect();
      };

      socket.onmessage = (message) => route(dispatch, message);

      // A failed connection always fires onclose too, so the retry and the
      // notification are handled there to avoid duplicating either.
      socket.onerror = () => {};
    };

    const notifyDisconnected = (): void => {
      if (reportedDisconnect) return;
      reportedDisconnect = true;

      displayNotification({
        appearance: NotificationType.WARNING,
        title: everConnected
          ? "Lost connection to server. Reconnecting..."
          : "Unable to connect to server. Retrying...",
        timestamp: new Date().getTime()
      });
    };

    const scheduleReconnect = (): void => {
      if (reconnectTimer !== undefined) return;

      const delay = Math.min(
        RECONNECT_DELAY_MS * 2 ** failedAttempts,
        MAX_RECONNECT_DELAY_MS
      );
      failedAttempts += 1;

      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, delay);
    };

    // Waking from sleep or regaining network should retry immediately rather
    // than sitting out the remainder of a backoff window.
    const reconnectNow = (): void => {
      if (socket?.readyState === WebSocket.OPEN) return;
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      failedAttempts = 0;
      connect();
    };

    window.addEventListener("online", reconnectNow);
    window.addEventListener("focus", reconnectNow);

    connect();

    return (next: (action: unknown) => unknown) => (action: unknown) => {
      // Send Message action? Send data to the socket.
      if (sendMessage.match(action)) {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(action.payload.message);
        } else {
          displayNotification({
            appearance: NotificationType.WARNING,
            title: "Not connected to the server yet. Try again in a moment.",
            timestamp: new Date().getTime()
          });
        }
      }

      return next(action);
    };
  };

const route = (dispatch: AppDispatch, msg: MessageEvent<any>): void => {
  const getNotif = (): Notification => {
    const response = JSON.parse(msg.data) as Response;
    const timestamp = new Date().getTime();
    const notification: Notification = {
      ...response,
      timestamp
    };

    switch (response.type) {
      case MessageType.STATUS:
        return notification;
      case MessageType.CONNECT:
        dispatch(setUsername((response as ConnectionResponse).name));
        return notification;
      case MessageType.SEARCH:
        dispatch(setSearchResults(response as SearchResponse));
        return notification;
      case MessageType.DOWNLOAD:
        downloadFile((response as DownloadResponse)?.downloadPath);
        dispatch(openbooksApi.util.invalidateTags(["books"]));
        dispatch(removeInFlightDownload());
        return notification;
      case MessageType.RATELIMIT:
        dispatch(deleteHistoryItem());
        return notification;
      default:
        console.error(response);
        return {
          appearance: NotificationType.DANGER,
          title: "Unknown message type. See console.",
          timestamp
        };
    }
  };

  const notif = getNotif();
  dispatch(addNotification(notif));
  displayNotification(notif);
};
