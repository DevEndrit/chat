import { createServer } from "http";
import { Server } from "socket.io";
import next from "next";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;

const app = next({ dev });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handler);

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", (roomId) => {
      socket.join(roomId);
      socket.to(roomId).emit("user-connected", socket.id);
      console.log(`User ${socket.id} joined room ${roomId}`);
    });

    socket.on("offer", (offer, roomId) => {
      socket.to(roomId).emit("offer", offer, socket.id);
    });

    socket.on("answer", (answer, roomId) => {
      socket.to(roomId).emit("answer", answer, socket.id);
    });

    socket.on("ice-candidate", (candidate, roomId) => {
      socket.to(roomId).emit("ice-candidate", candidate, socket.id);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
