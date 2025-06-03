import { io, Socket } from "socket.io-client";

let socket: Socket;

export const initSocket = (): Socket => {
  if (!socket) {
    socket = io(
      process.env.NODE_ENV === "production" ? "" : "http://localhost:3000"
    );
  }
  return socket;
};

export const getSocket = (): Socket => {
  if (!socket) {
    throw new Error("Socket not initialized");
  }
  return socket;
};
