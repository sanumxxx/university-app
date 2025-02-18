import { create } from 'zustand';
import { Chat } from '../types/'; // Assuming you have type definitions

interface ChatAndNavigationState {
    activeChat: string | null;
    activeTab: 'messages' | 'notifications' | 'schedule' | 'journal' | 'profile' | null;
    // unreadMessagesCount: number; // <-- Removed global unreadMessagesCount
    isWebSocketConnected: boolean;
    chatUnreadCounts: { [chatId: string]: number };
    setActiveChat: (chatId: string | null) => void;
    setActiveTab: (tab:  'messages' | 'notifications' | 'schedule' | 'journal' | 'profile' | null) => void;
    // setUnreadMessagesCount: (count: number) => void; // <-- Removed setUnreadMessagesCount
    setIsWebSocketConnected: (isConnected: boolean) => void;
    incrementChatUnreadCount: (chatId: string) => void;
    updateChatUnreadCount: (chatId: string, count: number) => void;
    resetChatUnreadCount: (chatId: string) => void;
    setChatUnreadCount: (chatId: string, count: number) => void;
}

export const useChatAndNavigationStore = create<ChatAndNavigationState>((set, get) => ({
    activeChat: null,
    activeTab: null,
    // unreadMessagesCount: 0, // <-- Removed initial unreadMessagesCount
    isWebSocketConnected: false,
    chatUnreadCounts: {},

    setActiveChat: (chatId) => {
        console.log('chatAndNavigationStore: setActiveChat action called', { chatId }); // Added log
        set({ activeChat: chatId });
    },
    setActiveTab: (tab) => {
        console.log('chatAndNavigationStore: setActiveTab action called', { tab }); // Added log
        set({ activeTab: tab });
    },
    // setUnreadMessagesCount: (count) => { // <-- Removed setUnreadMessagesCount action
    //     console.log('chatAndNavigationStore: setUnreadMessagesCount action called', { count }); // Added log
    //     set({ unreadMessagesCount: count });
    // },
    setIsWebSocketConnected: (isConnected) => {
        console.log('chatAndNavigationStore: setIsWebSocketConnected action called', { isConnected }); // Added log
        set({ isWebSocketConnected: isConnected });
    },

    incrementChatUnreadCount: (chatId) => {
        console.log('chatAndNavigationStore: incrementChatUnreadCount action called', { chatId }); // Added log
        set((state) => {
            const currentCount = state.chatUnreadCounts[chatId] || 0;
            return {
                chatUnreadCounts: {
                    ...state.chatUnreadCounts,
                    [chatId]: currentCount + 1,
                },
            };
        });
    },
    updateChatUnreadCount: (chatId, count) => {
        console.log('chatAndNavigationStore: updateChatUnreadCount action called', { chatId, count }); // Added log
        set((state) => ({
            chatUnreadCounts: {
                ...state.chatUnreadCounts,
                [chatId]: count,
            },
        }));
    },
    resetChatUnreadCount: (chatId) => {
        console.log('chatAndNavigationStore: resetChatUnreadCount action called', { chatId }); // Added log
         set((state) => ({
            chatUnreadCounts: {
                ...state.chatUnreadCounts,
                [chatId]: 0,
            },
        }));
    },
    setChatUnreadCount: (chatId, count) => {
        console.log('chatAndNavigationStore: setChatUnreadCount action called', { chatId, count }); // Added log
        set((state) => ({
            chatUnreadCounts: {
                ...state.chatUnreadCounts,
                [chatId]: count,
            },
        }));
    },
}));

// Селектор для общего количества непрочитанных сообщений (сумма по всем чатам) - remains the same
export const selectUnreadMessagesCount = (state: ChatAndNavigationState) => {
    return Object.values(state.chatUnreadCounts).reduce((sum, count) => sum + count, 0);
};

export const selectChatUnreadCount = (chatId: string) => (state: ChatAndNavigationState) => {
    return state.chatUnreadCounts[chatId] || 0;
};

export const selectIsWebSocketConnected = (state: ChatAndNavigationState) => state.isWebSocketConnected;