"use client";

import { useEffect, useRef, useState } from "react";
import { initSocket } from "@/lib/socket";

interface VideoCallProps {
  roomId: string;
}

export default function VideoCall({ roomId }: VideoCallProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>(
    []
  );
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const [selectedMicrophone, setSelectedMicrophone] = useState<string>("");
  const [showDeviceSelector, setShowDeviceSelector] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef(initSocket());

  useEffect(() => {
    const pcConfig = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    };

    const socket = socketRef.current;

    const getAvailableDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(
          (device) => device.kind === "videoinput"
        );
        const audioDevices = devices.filter(
          (device) => device.kind === "audioinput"
        );

        setAvailableDevices([...videoDevices, ...audioDevices]);

        // Standardgeräte setzen
        if (videoDevices.length > 0 && !selectedCamera) {
          setSelectedCamera(videoDevices[0].deviceId);
        }
        if (audioDevices.length > 0 && !selectedMicrophone) {
          setSelectedMicrophone(audioDevices[0].deviceId);
        }
      } catch (error) {
        console.error("Error getting devices:", error);
      }
    };

    const initializeMedia = async (
      videoDeviceId?: string,
      audioDeviceId?: string
    ) => {
      try {
        // Überprüfe Browser-Unterstützung
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error(
            "Browser unterstützt keine Mediengeräte oder läuft nicht über HTTPS"
          );
        }

        // Stoppe vorherigen Stream
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => track.stop());
        }

        const constraints: MediaStreamConstraints = {
          video: videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true,
          audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          // Stelle sicher, dass das Video abgespielt wird
          localVideoRef.current.play().catch(console.error);
        }

        // Aktualisiere Peer Connection falls vorhanden
        if (peerConnectionRef.current) {
          // Entferne alte Tracks
          const senders = peerConnectionRef.current.getSenders();
          senders.forEach((sender) => {
            if (sender.track) {
              peerConnectionRef.current?.removeTrack(sender);
            }
          });

          // Füge neue Tracks hinzu
          stream.getTracks().forEach((track) => {
            peerConnectionRef.current?.addTrack(track, stream);
          });
        }

        setIsConnected(true);
        setError(null);
      } catch (error) {
        console.error("Error accessing media devices:", error);
        if (error instanceof Error) {
          if (error.name === "NotAllowedError") {
            setError(
              "Kamera/Mikrofon Zugriff verweigert. Bitte erlaube den Zugriff in deinem Browser und lade die Seite neu."
            );
          } else if (error.name === "NotFoundError") {
            setError(
              "Keine Kamera oder Mikrofon gefunden. Bitte überprüfe deine Geräte."
            );
          } else if (
            error.message.includes("HTTPS") ||
            error.message.includes("Browser unterstützt")
          ) {
            setError(
              "WebRTC erfordert HTTPS oder localhost. Bitte verwende Chrome/Firefox über https:// oder localhost:3000"
            );
          } else {
            setError(`Fehler beim Zugriff auf Mediengeräte: ${error.message}`);
          }
        }
      }
    };

    const createPeerConnection = () => {
      const pc = new RTCPeerConnection(pcConfig);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", event.candidate, roomId);
        }
      };

      pc.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
          setIsCallActive(true);
        }
      };

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      return pc;
    };

    socket.on("connect", () => {
      socket.emit("join-room", roomId);
    });

    socket.on("user-connected", async (userId) => {
      console.log("User connected:", userId);
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", offer, roomId);
      } catch (error) {
        console.error("Error creating offer:", error);
      }
    });

    socket.on("offer", async (offer, userId) => {
      console.log("Received offer from:", userId);
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      try {
        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", answer, roomId);
      } catch (error) {
        console.error("Error handling offer:", error);
      }
    });

    socket.on("answer", async (answer, userId) => {
      console.log("Received answer from:", userId);
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.setRemoteDescription(answer);
        } catch (error) {
          console.error("Error handling answer:", error);
        }
      }
    });

    socket.on("ice-candidate", async (candidate) => {
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.addIceCandidate(candidate);
        } catch (error) {
          console.error("Error adding ice candidate:", error);
        }
      }
    });

    getAvailableDevices();
    initializeMedia();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      socket.off("connect");
      socket.off("user-connected");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
    };
  }, [roomId, selectedCamera, selectedMicrophone]);

  const changeCamera = async (deviceId: string) => {
    setSelectedCamera(deviceId);
    if (isConnected) {
      const initializeMedia = async (
        videoDeviceId?: string,
        audioDeviceId?: string
      ) => {
        try {
          if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => track.stop());
          }

          const constraints: MediaStreamConstraints = {
            video: videoDeviceId
              ? { deviceId: { exact: videoDeviceId } }
              : true,
            audio: audioDeviceId
              ? { deviceId: { exact: audioDeviceId } }
              : true,
          };

          const stream = await navigator.mediaDevices.getUserMedia(constraints);

          localStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
            localVideoRef.current.play().catch(console.error);
          }

          if (peerConnectionRef.current) {
            const senders = peerConnectionRef.current.getSenders();
            const videoSender = senders.find(
              (sender) => sender.track && sender.track.kind === "video"
            );

            const videoTrack = stream.getVideoTracks()[0];
            if (videoSender && videoTrack) {
              await videoSender.replaceTrack(videoTrack);
            }
          }
        } catch (error) {
          console.error("Error changing camera:", error);
        }
      };

      await initializeMedia(deviceId, selectedMicrophone);
    }
  };

  const changeMicrophone = async (deviceId: string) => {
    setSelectedMicrophone(deviceId);
    if (isConnected) {
      const initializeMedia = async (
        videoDeviceId?: string,
        audioDeviceId?: string
      ) => {
        try {
          if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => track.stop());
          }

          const constraints: MediaStreamConstraints = {
            video: videoDeviceId
              ? { deviceId: { exact: videoDeviceId } }
              : true,
            audio: audioDeviceId
              ? { deviceId: { exact: audioDeviceId } }
              : true,
          };

          const stream = await navigator.mediaDevices.getUserMedia(constraints);

          localStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
            localVideoRef.current.play().catch(console.error);
          }

          if (peerConnectionRef.current) {
            const senders = peerConnectionRef.current.getSenders();
            const audioSender = senders.find(
              (sender) => sender.track && sender.track.kind === "audio"
            );

            const audioTrack = stream.getAudioTracks()[0];
            if (audioSender && audioTrack) {
              await audioSender.replaceTrack(audioTrack);
            }
          }
        } catch (error) {
          console.error("Error changing microphone:", error);
        }
      };

      await initializeMedia(selectedCamera, deviceId);
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);

        // Video-Element aktualisieren
        if (localVideoRef.current) {
          if (videoTrack.enabled) {
            localVideoRef.current.srcObject = localStreamRef.current;
          }
        }
      }
    }
  };

  const copyRoomLink = () => {
    const link = window.location.href;
    navigator.clipboard.writeText(link);
    alert("Link kopiert! Teile ihn mit deinem Freund.");
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg max-w-md text-center">
          <h2 className="text-xl font-bold mb-2">🚫 Zugriff erforderlich</h2>
          <p className="mb-4">{error}</p>
          <div className="text-sm">
            <p className="mb-2">
              <strong>So behebst du das Problem:</strong>
            </p>
            <div className="text-left space-y-2">
              <div>
                <strong>Safari:</strong>
                <ol className="list-decimal list-inside ml-4">
                  <li>Safari → Einstellungen → Websites → Kamera/Mikrofon</li>
                  <li>Für localhost auf Zulassen setzen</li>
                </ol>
              </div>
              <div>
                <strong>Chrome/Firefox:</strong>
                <ol className="list-decimal list-inside ml-4">
                  <li>Verwende http://localhost:3000 (nicht 127.0.0.1)</li>
                  <li>Klicke auf das 🎥 Symbol und erlaube Zugriff</li>
                </ol>
              </div>
              <div>
                <strong>Allgemein:</strong>
                <ul className="list-disc list-inside ml-4">
                  <li>Verwende einen modernen Browser</li>
                  <li>
                    Stelle sicher, dass Kamera/Mikrofon angeschlossen sind
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
          >
            Seite neu laden
          </button>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">
          Kamera und Mikrofon werden eingerichtet...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4 flex justify-between items-center">
          <h1 className="text-white text-2xl font-bold">Raum: {roomId}</h1>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowDeviceSelector(!showDeviceSelector)}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
            >
              ⚙️ Geräte
            </button>
            <button
              onClick={copyRoomLink}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg"
            >
              Link kopieren
            </button>
          </div>
        </div>

        {showDeviceSelector && (
          <div className="mb-4 bg-gray-800 p-4 rounded-lg">
            <h3 className="text-white text-lg font-semibold mb-3">
              Geräte auswählen
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-white text-sm font-medium mb-2">
                  📹 Kamera:
                </label>
                <select
                  value={selectedCamera}
                  onChange={(e) => changeCamera(e.target.value)}
                  className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                >
                  {availableDevices
                    .filter((device) => device.kind === "videoinput")
                    .map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label ||
                          `Kamera ${device.deviceId.substring(0, 8)}`}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-white text-sm font-medium mb-2">
                  🎤 Mikrofon:
                </label>
                <select
                  value={selectedMicrophone}
                  onChange={(e) => changeMicrophone(e.target.value)}
                  className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                >
                  {availableDevices
                    .filter((device) => device.kind === "audioinput")
                    .map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label ||
                          `Mikrofon ${device.deviceId.substring(0, 8)}`}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="relative">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-64 lg:h-96 bg-gray-800 rounded-lg object-cover transform scale-x-[-1]"
            />
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded">
              Du {isVideoOff && "(Video aus)"}
            </div>
          </div>

          <div className="relative">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-64 lg:h-96 bg-gray-800 rounded-lg object-cover"
            />
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded">
              {isCallActive ? "Freund" : "Warten auf Verbindung..."}
            </div>
          </div>
        </div>

        <div className="flex justify-center space-x-4">
          <button
            onClick={toggleMute}
            className={`p-4 rounded-full ${
              isMuted
                ? "bg-red-500 hover:bg-red-600"
                : "bg-gray-600 hover:bg-gray-700"
            } text-white transition duration-200`}
            title={isMuted ? "Mikrofon einschalten" : "Mikrofon ausschalten"}
          >
            {isMuted ? "🔇" : "🎤"}
          </button>

          <button
            onClick={toggleVideo}
            className={`p-4 rounded-full ${
              isVideoOff
                ? "bg-red-500 hover:bg-red-600"
                : "bg-gray-600 hover:bg-gray-700"
            } text-white transition duration-200`}
            title={isVideoOff ? "Kamera einschalten" : "Kamera ausschalten"}
          >
            {isVideoOff ? "📹" : "📷"}
          </button>

          <button
            onClick={() => setShowDeviceSelector(!showDeviceSelector)}
            className="p-4 rounded-full bg-gray-600 hover:bg-gray-700 text-white transition duration-200"
            title="Geräte-Einstellungen"
          >
            ⚙️
          </button>
        </div>

        {!isCallActive && (
          <div className="text-center mt-6">
            <p className="text-white mb-2">
              Teile diesen Link mit deinem Freund:
            </p>
            <div className="bg-gray-800 p-3 rounded-lg text-white font-mono text-sm break-all">
              {typeof window !== "undefined" ? window.location.href : ""}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
