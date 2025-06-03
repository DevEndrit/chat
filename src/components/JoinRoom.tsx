"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JoinRoom() {
  const [roomId, setRoomId] = useState("");
  const router = useRouter();

  const createRoom = () => {
    const newRoomId = Math.random().toString(36).substring(2, 15);
    router.push(`/room/${newRoomId}`);
  };

  const joinRoom = () => {
    if (roomId.trim()) {
      router.push(`/room/${roomId}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
          Video Call App
        </h1>

        <div className="space-y-6">
          <button
            onClick={createRoom}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg transition duration-200"
          >
            Neuen Raum erstellen
          </button>

          <div className="text-center text-gray-500">oder</div>

          <div className="space-y-3">
            <input
              type="text"
              placeholder="Raum-ID eingeben"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              onKeyPress={(e) => e.key === "Enter" && joinRoom()}
            />
            <button
              onClick={joinRoom}
              disabled={!roomId.trim()}
              className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition duration-200"
            >
              Raum beitreten
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
