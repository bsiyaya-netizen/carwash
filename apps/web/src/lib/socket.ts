import { io, type Socket } from 'socket.io-client';
import { API_URL, getToken } from './api';

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) socket = io(API_URL, { auth: { token: getToken() } });
  return socket;
}

export function closeSocket() {
  socket?.close();
  socket = null;
}
