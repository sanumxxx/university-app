import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    RefreshControl,
    SafeAreaView,
    Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuthStore } from '../../../src/store/auth';
import {
    useChatAndNavigationStore,
    setActiveChat,
    resetChatUnreadCount,
} from '../../../src/store/chatAndNavigation';
import { apiRequest } from '../../../src/api/config';
import { Ionicons } from '@expo/vector-icons';
import { websocketService } from '../../../src/services/websocketService';
import _ from 'lodash';

interface Message {
    id: number;
    sender_id: number;
    content: string;
    created_at: string;
    reply_to?: number;
    is_read: boolean;
}

interface ChatInfo {
    id: number;
    type: 'personal' | 'group';
    subject?: string;
    participants: {
        id: number;
        user_id: number;
        full_name: string;
    }[];
}

const ChatHeader: React.FC<{ title: string; onBack: () => void }> = React.memo(({
    title,
    onBack,
}) => (
    <View style={styles.header}>
        <TouchableOpacity
            style={styles.headerBackButton}
            onPress={onBack}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
            <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>
                {title}
            </Text>
        </View>
    </View>
));

const Chat: React.FC = () => {
    const { id } = useLocalSearchParams();
    const { user } = useAuthStore();
    const { setActiveChat, resetChatUnreadCount } = useChatAndNavigationStore();

    const [messages, setMessages] = useState<Message[]>([]);
    const [chatInfo, setChatInfo] = useState<ChatInfo | null>(null);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [replyTo, setReplyTo] = useState<Message | null>(null);
    const [sending, setSending] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    // Refs
    const mounted = useRef(true);
    const flatListRef = useRef<FlatList>(null);
    const messagesEndReachedRef = useRef(false);
    const lastFetchTime = useRef<number>(0);
    const markReadTimeoutRef = useRef<NodeJS.Timeout>();
    const lastMessageIdRef = useRef<number | null>(null);
    const inputRef = useRef<TextInput>(null);

    const getChatTitle = useCallback((chatInfo: ChatInfo | null) => {
        if (!chatInfo) return 'Чат';
        if (chatInfo.type === 'personal') {
            const chatPartner = chatInfo.participants.find(p => p.user_id !== user?.id);
            return chatPartner?.full_name || 'Чат';
        }
        return chatInfo.subject || 'Групповой чат';
    }, [user?.id]);

    const fetchChatInfo = useCallback(async () => {
        if (!mounted.current) return;

        try {
            const response = await apiRequest<{ success: boolean; chat: ChatInfo }>(
                `/chats/${id}`
            );
            if (response.success && mounted.current) {
                setChatInfo(response.chat);
            }
        } catch (error) {
            console.error('Error fetching chat info:', error);
            if (mounted.current) {
                Alert.alert('Ошибка', 'Не удалось загрузить информацию о чате');
            }
        }
    }, [id]);

    const fetchMessages = useCallback(async (pageNumber = 1, loadMore = false) => {
        if (!mounted.current) return;

        const now = Date.now();
        if (now - lastFetchTime.current < 1000) return;
        lastFetchTime.current = now;

        try {
            const response = await apiRequest<{
                success: boolean;
                messages: Message[];
                total: number;
                pages: number;
            }>(`/chats/${id}/messages?page=${pageNumber}`);

            if (response.success && mounted.current) {
                if (loadMore) {
                    setMessages(prev => [...prev, ...response.messages]);
                } else {
                    setMessages(response.messages);
                }
                setHasMore(pageNumber < response.pages);
            }
        } catch (error) {
            console.error('Error fetching messages:', error);
            if (mounted.current) {
                Alert.alert('Ошибка', 'Не удалось загрузить сообщения');
            }
        } finally {
            if (mounted.current) {
                setLoading(false);
                setLoadingMore(false);
            }
        }
    }, [id]);

    const markAsRead = useCallback(async () => {
        if (!user?.id || !id || !mounted.current) return;

        const unreadMessages = messages.filter(
            msg => !msg.is_read && msg.sender_id !== user.id && msg.id > (lastMessageIdRef.current || 0)
        );

        if (unreadMessages.length === 0) return;

        const messagesToMark = unreadMessages.map(msg => msg.id);
        lastMessageIdRef.current = Math.max(...messagesToMark);

        try {
            const response = await apiRequest(`/chats/${id}/mark-read`, {
                method: 'POST',
                body: JSON.stringify({
                    user_id: user.id,
                    message_ids: messagesToMark,
                }),
            });

            if (response.success && mounted.current) {
                setMessages(prevMessages =>
                    prevMessages.map(msg =>
                        messagesToMark.includes(msg.id)
                            ? { ...msg, is_read: true }
                            : msg
                    )
                );

                resetChatUnreadCount(id.toString());

                websocketService.emit('message_read', {
                    chat_id: id,
                    user_id: user.id,
                    message_ids: messagesToMark,
                    timestamp: new Date().toISOString(),
                });
            }
        } catch (error) {
            console.error('Error marking messages as read:', error);
        }
    }, [id, user?.id, messages, resetChatUnreadCount]);

    const debouncedMarkAsRead = useCallback(
        _.debounce(() => {
            if (mounted.current) {
                markAsRead();
            }
        }, 1000),
        [markAsRead]
    );

    const sendMessage = useCallback(async () => {
        if (!newMessage.trim() || sending || !mounted.current) return;

        setSending(true);
        try {
            const response = await apiRequest<{
                success: boolean;
                message: Message;
            }>(`/chats/${id}/messages`, {
                method: 'POST',
                body: JSON.stringify({
                    sender_id: user?.id,
                    content: newMessage.trim(),
                    reply_to: replyTo?.id,
                }),
            });

            if (response.success && mounted.current) {
                setNewMessage('');
                setReplyTo(null);
                if (response.message) {
                    setMessages(prevMessages => [response.message, ...prevMessages]);
                }
                flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
            }
        } catch (error) {
            console.error('Error sending message:', error);
            if (mounted.current) {
                Alert.alert('Ошибка', 'Не удалось отправить сообщение');
            }
        } finally {
            if (mounted.current) {
                setSending(false);
            }
        }
    }, [id, user?.id, newMessage, replyTo?.id]);

    const loadMoreMessages = useCallback(async () => {
        if (loadingMore || !hasMore || messagesEndReachedRef.current || !mounted.current) return;

        setLoadingMore(true);
        messagesEndReachedRef.current = true;
        await fetchMessages(page + 1, true);
        if (mounted.current) {
            setPage(prev => prev + 1);
        }
        setTimeout(() => {
            messagesEndReachedRef.current = false;
        }, 1000);
    }, [loadingMore, hasMore, page, fetchMessages]);

    const onRefresh = useCallback(async () => {
        if (!mounted.current) return;
        setRefreshing(true);
        setPage(1);
        await fetchMessages(1);
        setRefreshing(false);
    }, [fetchMessages]);

    useEffect(() => {
        mounted.current = true;
        setActiveChat(id as string);

        const handleNewMessage = (data: any) => {
            if (!mounted.current || data.chat_id !== parseInt(id as string)) return;
            setMessages(prevMessages => {
                const messageExists = prevMessages.some(msg => msg.id === data.message.id);
                if (messageExists) return prevMessages;
                const newMessage = { ...data.message, is_read: true };
                return [newMessage, ...prevMessages];
            });
            debouncedMarkAsRead();
        };

        const handleMessageRead = (data: any) => {
            if (!mounted.current || data.chat_id !== parseInt(id as string)) return;
            setMessages(prevMessages =>
                prevMessages.map(msg =>
                    data.message_ids?.includes(msg.id) ? { ...msg, is_read: true } : msg
                )
            );
        };

        const setupChat = async () => {
            if (!mounted.current) return;
            websocketService.emit('join_chat', { chat_id: id });
            await fetchChatInfo();
            await fetchMessages();
            await markAsRead();
        };

        const unsubscribeNewMessage = websocketService.on('new_message', handleNewMessage);
        const unsubscribeMessageRead = websocketService.on('message_read', handleMessageRead);

        setupChat();

        return () => {
            mounted.current = false;
            websocketService.emit('leave_chat', { chat_id: id });
            unsubscribeNewMessage();
            unsubscribeMessageRead();
            if (markReadTimeoutRef.current) {
                clearTimeout(markReadTimeoutRef.current);
            }
            setActiveChat(null);
            resetChatUnreadCount(id as string);
        };
    }, [id, fetchChatInfo, fetchMessages, markAsRead, setActiveChat, resetChatUnreadCount, debouncedMarkAsRead]);

    const renderMessage = useCallback(({ item }: { item: Message }) => {
        const isOwnMessage = item.sender_id === user?.id;
        const sender = chatInfo?.participants.find(p => p.user_id === item.sender_id);
        const showSenderName = chatInfo?.type === 'group' && !isOwnMessage;

        return (
            <TouchableOpacity
                style={[
                    styles.messageContainer,
                    isOwnMessage ? styles.ownMessage : styles.otherMessage,
                ]}
                onLongPress={() => setReplyTo(item)}
                activeOpacity={0.7}
            >
                {showSenderName && (
                    <Text style={styles.senderName}>{sender?.full_name}</Text>
                )}

                {item.reply_to && (
                    <View
                        style={[
                            styles.replyContainer,
                            isOwnMessage ? styles.ownReply : styles.otherReply,
                        ]}
                    >
                        <Text style={styles.replyText}>
                            {messages.find(m => m.id === item.reply_to)?.content ||
                                'Сообщение недоступно'}
                        </Text>
                    </View>
                )}

                <Text style={[
                    styles.messageText,
                    isOwnMessage ? styles.ownMessageText : styles.otherMessageText
                ]}>
                    {item.content}
                </Text>

                <View style={styles.messageFooter}>
                    <Text style={[
                        styles.messageTime,
                        isOwnMessage ? styles.ownMessageTime : styles.otherMessageTime
                    ]}>
                        {new Date(item.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                        })}
                    </Text>
                    {isOwnMessage && (
                        <Ionicons
                            name={item.is_read ? 'checkmark-done' : 'checkmark'}
                            size={16}
                            color={item.is_read ? '#4c6793' : '#999'}
                            style={styles.readStatus}
                        />
                    )}
                </View>
            </TouchableOpacity>
        );
    }, [user?.id, chatInfo?.participants, chatInfo?.type, messages]);

    if (!user) return null;

    return (
        <SafeAreaView style={styles.safeArea}>
            <ChatHeader
                title={getChatTitle(chatInfo)}
                onBack={() => router.replace('/(tabs)/messages')}
            />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                {loading ? (
                    <ActivityIndicator style={styles.loader} size="large" color="#4c6793" />
                ) : (
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        renderItem={renderMessage}
                        keyExtractor={item => item.id.toString()}
                        contentContainerStyle={styles.messagesList}
                        inverted
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                        }
                        onEndReached={loadMoreMessages}
                        onEndReachedThreshold={0.3}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Text style={styles.emptyText}>Нет сообщений</Text>
                            </View>
                        }
                    />
                )}

                {replyTo && (
                    <View style={styles.replyPreview}>
                        <View style={styles.replyPreviewContent}>
                            <Text style={styles.replyPreviewTitle}>Ответ на сообщение:</Text>
                            <Text style={styles.replyPreviewText} numberOfLines={1}>
                                {replyTo.content}
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={styles.replyPreviewClose}
                            onPress={() => setReplyTo(null)}
                        >
                            <Ionicons name="close" size={20} color="#666" />
                        </TouchableOpacity>
                    </View>
                )}

                <View style={styles.inputContainer}>
                    <TextInput
                        ref={inputRef}
                        style={styles.input}
                        placeholder="Введите сообщение..."
                        value={newMessage}
                        onChangeText={setNewMessage}
                        multiline
                        maxLength={1000}
                    />
                    <TouchableOpacity
                        style={[
                            styles.sendButton,
                            (!newMessage.trim() || sending) && styles.sendButtonDisabled,
                        ]}
                        onPress={sendMessage}
                        disabled={!newMessage.trim() || sending}
                    >
                        {sending ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Ionicons
                                name="send"
                                size={24}
                                color={newMessage.trim() ? '#fff' : '#ccc'}
                            />
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default memo(Chat);

// --- StyleSheet ---
const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        paddingHorizontal: 8,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        minHeight: 56,
        ...Platform.select({
            android: {
                elevation: 4,
            },
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 2,
            },
        }),
    },
    headerBackButton: {
        padding: 8,
        marginRight: 8,
    },
    headerTitleContainer: {
        flex: 1,
        marginHorizontal: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
    },
    headerButton: {
        padding: 8,
    },
    messagesList: {
        padding: 16,
    },
    messageContainer: {
        maxWidth: '80%',
        marginVertical: 4,
        padding: 12,
        borderRadius: 12,
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    ownMessage: {
        alignSelf: 'flex-end',
        backgroundColor: '#4c6793',
        borderBottomRightRadius: 4,
        marginLeft: 50,
    },
    otherMessage: {
        alignSelf: 'flex-start',
        backgroundColor: '#fff',
        borderBottomLeftRadius: 4,
        marginRight: 50,
    },
    senderName: {
        fontSize: 12,
        color: '#4c6793',
        marginBottom: 4,
        fontWeight: '500',
    },
    replyContainer: {
        borderLeftWidth: 2,
        paddingLeft: 8,
        marginBottom: 4,
    },
    ownReply: {
        borderLeftColor: '#fff',
    },
    otherReply: {
        borderLeftColor: '#4c6793',
    },
    replyText: {
        fontSize: 12,
        opacity: 0.8,
        color: '#666',
    },
    messageText: {
        fontSize: 16,
        lineHeight: 20,
    },
    ownMessageText: {
        color: '#fff',
    },
    otherMessageText: {
        color: '#333',
    },
    messageFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginTop: 4,
    },
    messageTime: {
        fontSize: 10,
    },
    ownMessageTime: {
        color: '#fff',
        opacity: 0.7,
    },
    otherMessageTime: {
        color: '#666',
    },
    readStatus: {
        marginLeft: 4,
    },
    replyPreview: {
        flexDirection: 'row',
        padding: 12,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#eee',
        alignItems: 'center',
    },
    replyPreviewContent: {
        flex: 1,
        borderLeftWidth: 2,
        borderLeftColor: '#4c6793',
        paddingLeft: 8,
    },
    replyPreviewTitle: {
        fontSize: 12,
        color: '#4c6793',
        fontWeight: '500',
    },
    replyPreviewText: {
        fontSize: 14,
        color: '#666',
    },
    replyPreviewClose: {
        padding: 4,
        marginLeft: 8,
    },
    inputContainer: {
        flexDirection: 'row',
        padding: 12,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#eee',
        alignItems: 'flex-end',
    },
    input: {
        flex: 1,
        backgroundColor: '#f8f8f8',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 8,
        maxHeight: 100,
        marginRight: 8,
        fontSize: 16,
    },
    sendButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#4c6793',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 3,
    },
    sendButtonDisabled: {
        backgroundColor: '#f0f0f0',
        shadowOpacity: 0,
        elevation: 0,
    },
    loader: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loaderFooter: {
        paddingVertical: 16,
        alignItems: 'center',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    emptyText: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
    },
});