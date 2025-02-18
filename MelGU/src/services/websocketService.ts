import { io, Socket } from 'socket.io-client';
import { useEffect } from 'react'; // useEffect is not used here, remove or use it

interface EventHandlers {
    [event: string]: Set<(...args: any[]) => void>; // Use Set instead of single handler
}

class WebSocketService {
    private socket: Socket | null = null;
    private eventHandlers: EventHandlers = {};
    private connectionPromise: Promise<void> | null = null;
    private reconnectionAttempts = 0;
    private maxReconnectionAttempts = 5;
    private reconnectionDelay = 1000;

    constructor() {
        this.initializeSocket(); // Initialize the socket ONCE
    }

    private initializeSocket(): void {
        if (this.socket) {
            return; // Already initialized
        }

        this.socket = io('http://81.200.144.179:5000', {
            autoConnect: false,
            reconnectionAttempts: this.maxReconnectionAttempts,
            reconnectionDelay: this.reconnectionDelay,
        });

        this.socket.on('connect', () => {
            console.log('WebSocket connected');
            this.reconnectionAttempts = 0;
            this.emit('connect');
        });

        this.socket.on('disconnect', (reason) => {
            console.log('WebSocket disconnected:', reason);
            this.emit('disconnect', reason);
              if (reason !== 'io server disconnect' && reason !== 'io client disconnect') {
                if (this.reconnectionAttempts < this.maxReconnectionAttempts) {
                  console.log(`Attempting reconnection (${this.reconnectionAttempts + 1}/${this.maxReconnectionAttempts})...`);
                  this.reconnectionAttempts++;
                    setTimeout(() => {
                       if(this.socket) this.socket.connect(); // Attempt to reconnect after delay
                    }, this.reconnectionDelay * this.reconnectionAttempts);
                } else {
                    console.log('Max reconnection attempts reached.');
                    this.emit('reconnection_failed');
                }
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('WebSocket connection error:', error);
        });

        this.socket.on('new_message', (data) => {
            this.emit('new_message', data);
        });

        this.socket.on('message_read', (data) => {
            this.emit('message_read', data);
        });

        this.socket.on('unread_count_updated', (data) => {
            this.emit('unread_count_updated', data);
        });
    }

    public connect(userId: number): Promise<void> {

        if (this.socket && this.socket.connected) {
            return Promise.resolve(); // Already connected
        }
        if (this.connectionPromise) {
            return this.connectionPromise; // Already in progress
        }

        this.connectionPromise = new Promise((resolve, reject) => {

            if (!this.socket) {
                this.initializeSocket();  // Initialize if not already done
            }

            // Add the userId to the query here (if needed), or manage it separately
            if(this.socket) this.socket.io.opts.query = { userId };
            if(this.socket) this.socket.connect();

            // We use the existing 'connect' and 'connect_error' events in initializeSocket
            //  to handle the promise resolution/rejection
            const connectHandler = () => {
              resolve();
              if(this.socket) this.socket.off('connect', connectHandler); // Remove the handler after resolving
              if(this.socket) this.socket.off('connect_error', errorHandler);
              this.connectionPromise = null;
            };

            const errorHandler = (error: Error) => {
              reject(error);
              if(this.socket)  this.socket.off('connect', connectHandler);
              if(this.socket)  this.socket.off('connect_error', errorHandler);
              this.connectionPromise = null;
            };
            if(this.socket) {
               this.socket.once('connect', connectHandler);
               this.socket.once('connect_error', errorHandler);
            }

        });

        return this.connectionPromise;
    }


    public disconnect(): void {
      if (this.socket && this.socket.connected) {
        this.socket.disconnect();
        this.connectionPromise = null;
      }
    }

    public isConnected(): boolean {
        return !!(this.socket && this.socket.connected);
    }

    public on(event: string, handler: (...args: any[]) => void): () => void {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = new Set();
        }
        this.eventHandlers[event].add(handler); // Add to the Set

        return () => {
            this.off(event, handler);
        };
    }

    private off(event: string, handlerToRemove: (...args: any[]) => void): void {
      if (this.eventHandlers[event]) {
        this.eventHandlers[event].delete(handlerToRemove); // Remove from the Set
        if (this.eventHandlers[event].size === 0) {
            delete this.eventHandlers[event]; // Clean up if no more handlers
        }
      }
    }

    private emit(event: string, ...args: any[]): void {
      if (this.eventHandlers[event]) {
        for (const handler of this.eventHandlers[event]) { // Iterate over the Set
            handler(...args);
        }
      }
    }

    public sendMessage(event: string, data: any): void {
      if (this.socket && this.socket.connected) {
        this.socket.emit(event, data);
      } else {
        console.error('WebSocket is not connected. Message not sent.');
        // Consider queueing the message for later delivery
      }
    }
}

export const websocketService = new WebSocketService(); // Create a single instance and export it