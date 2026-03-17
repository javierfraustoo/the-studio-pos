import { io } from 'socket.io-client';

const socket = io('/', { transports: ['websocket', 'polling'], autoConnect: true });

socket.on('connect', () => console.log('[WS] connected:', socket.id));
socket.on('disconnect', () => console.log('[WS] disconnected'));

export default socket;
