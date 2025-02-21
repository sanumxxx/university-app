import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    Platform,
    ActivityIndicator,
    SafeAreaView,
} from 'react-native';
import { useAuthStore } from '../../src/store/auth';
import {
    useChatAndNavigationStore,
    updateChatUnreadCount,
    incrementChatUnreadCount,
    selectChatUnreadCount,
} from '../../src/store/chatAndNavigation';
import { apiRequest } from '../../src/api/config';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { websocketService } from '../../src/services/websocketService';
import _ from 'lodash';

// Interfaces
interface Chat {
    id: number;
    type: 'personal' | 'group';
    chatPartnerName?: string;
    subject?: string;
    last_message: Message | null;
    unread_count: number;
    created_at: string;
}

interface Message {
    id: number;
    chat_id: number;
    user_id: number;
    content: string;
    created_at: string;
    read: boolean;
}

// Memoized Components
const HeaderComponent = memo<{ title: string }>(({ title }) => (
    <View style={styles.header}>
        <Text style={styles.headerTitle}>{title}</Text>
    </View>
));

const EmptyListComponent = memo<{ type: 'chats' | 'announcements' }>(({ type }) => (
    <View style={styles.emptyContainer}>
        <Ionicons
            name={type === 'chats' ? 'chatbubbles-outline' : 'newspaper-outline'}
            size={64}
            color="#ccc"
        />
        <Text style={styles.emptyText}>
            {type === 'chats' ? 'У вас пока нет чатов' : 'Нет объявлений'}
        </Text>
    </View>
));

const TabComponent = memo<{
    activeTab: 'chats' | 'announcements';
    onTabChange: (tab: 'chats' | 'announcements') => void;
}>(({ activeTab, onTabChange }) => (
    <View style={styles.tabContainer}>
        <TouchableOpacity
            style={[styles.tab, activeTab === 'chats' && styles.activeTab]}
            onPress={() => onTabChange('chats')}
        >
            <Text style={[styles.tabText, activeTab === 'chats' && styles.activeTabText]}>
                Чаты
            </Text>
        </TouchableOpacity>
        <TouchableOpacity
            style={[styles.tab, activeTab === 'announcements' && styles.activeTab]}
            onPress={() => onTabChange('announcements')}
        >
            <Text style={[styles.tabText, activeTab === 'announcements' && styles.activeTabText]}>
                Объявления
            </Text>
        </TouchableOpacity>
    </View>
));

const FilterComponent = memo<{
    chatType: 'all' | 'personal' | 'group';
    onTypeChange: (type: 'all' | 'personal' | 'group') => void;
}>(({ chatType, onTypeChange }) => (
    <View style={styles.filterContainer}>
        <TouchableOpacity
            style={[styles.filterButton, chatType === 'all' && styles.activeFilter]}
            onPress={() => onTypeChange('all')}
        >
            <Text style={[styles.filterText, chatType === 'all' && styles.activeFilterText]}>
                Все
            </Text>
        </TouchableOpacity>
        <TouchableOpacity
            style={[styles.filterButton, chatType === 'personal' && styles.activeFilter]}
            onPress={() => onTypeChange('personal')}
        >
            <Text style={[styles.filterText, chatType === 'personal' && styles.activeFilterText]}>
                Личные
            </Text>
        </TouchableOpacity>
        <TouchableOpacity
            style={[styles.filterButton, chatType === 'group' && styles.activeFilter]}
            onPress={() => onTypeChange('group')}
        >
            <Text style={[styles.filterText, chatType === 'group' && styles.activeFilterText]}>
                Групповые
            </Text>
        </TouchableOpacity>
    </View>
));

// Main Component
const MessagesComponent: React.FC = () => {
    const { user } = useAuthStore();
    const {
        activeChat,
        activeTab,
        setActiveTab,
        updateChatUnreadCount,
        incrementChatUnreadCount,
    } = useChatAndNavigationStore();

    const [activeTabState, setActiveTabState] = useState<'chats' | 'announcements'>('chats');
    const [chatType, setChatType] = useState<'all' | 'personal' | 'group'>('all');
    const [data, setData] = useState<Chat[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Refs
    const mounted = useRef(true);
    const activeChatRef = useRef(activeChat);
    const lastFetchTime = useRef<number>(0);
    const fetchTimeout = useRef<NodeJS.Timeout>();

    // Получаем все значения unreadCounts сразу
    const chatUnreadCounts = useChatAndNavigationStore(state => state.chatUnreadCounts);

    useEffect(() => {
        activeChatRef.current = activeChat;
        return () => {
            mounted.current = false;
            if (fetchTimeout.current) {
                clearTimeout(fetchTimeout.current);
            }
        };
    }, [activeChat]);

    const fetchData = useCallback(async () => {
        if (!user?.id || !mounted.current) return;

        const now = Date.now();
        if (now - lastFetchTime.current < 1000) {
            return;
        }
        lastFetchTime.current = now;

        setLoading(true);
        try {
            const response = await apiRequest<{ success: boolean; chats: Chat[] }>(
                `/chats?user_id=${user.id}&type=${chatType}`
            );
            if (response.success && response.chats && mounted.current) {
                setData(response.chats);
                response.chats.forEach(chat => {
                    updateChatUnreadCount(chat.id.toString(), chat.unread_count);
                });
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            if (mounted.current) {
                setLoading(false);
            }
        }
    }, [user?.id, chatType, updateChatUnreadCount]);

    const debouncedFetchData = useCallback(
        _.debounce(() => {
            if (mounted.current) {
                fetchData();
            }
        }, 300),
        [fetchData]
    );

    const handleNewMessage = useCallback((data: any) => {
        if (!mounted.current || data.chat_id.toString() === activeChatRef.current) return;

        setData(prevData => {
            if (!Array.isArray(prevData)) return prevData;
            const chatExists = prevData.some(chat => chat.id === data.chat_id);
            if (!chatExists) {
                debouncedFetchData();
                return prevData;
            }
            return prevData.map(chat =>
                chat.id === data.chat_id
                    ? {
                          ...chat,
                          last_message: data.message,
                          unread_count: (chat.unread_count || 0) + 1,
                      }
                    : chat
            );
        });

        incrementChatUnreadCount(data.chat_id.toString());
    }, [debouncedFetchData, incrementChatUnreadCount]);

    const handleMessageRead = useCallback((data: any) => {
        if (!mounted.current || activeTabState !== 'chats') return;

        setData(prevData => {
            if (!Array.isArray(prevData)) return prevData;
            return prevData.map(chat =>
                chat.id === data.chat_id
                    ? {
                          ...chat,
                          unread_count: Math.max(0, (chat.unread_count || 0) - (data.message_ids?.length || 0)),
                      }
                    : chat
            );
        });
    }, [activeTabState]);

    const onRefresh = useCallback(async () => {
        if (!mounted.current) return;
        setRefreshing(true);
        await fetchData();
        setRefreshing(false);
    }, [fetchData]);

    const handleItemPress = useCallback((item: Chat) => {
        router.push(`/chat/${item.id}`);
    }, []);

    const handleCreateNew = useCallback(() => {
        if (activeTabState === 'chats') {
            router.push('/chat/new');
        }
    }, [activeTabState]);

    useEffect(() => {
        if (!user?.id) return;

        const unsubscribeNewMessage = websocketService.on('new_message', handleNewMessage);
        const unsubscribeMessageRead = websocketService.on('message_read', handleMessageRead);
        const unsubscribeUnreadCountUpdated = websocketService.on('unread_count_updated', debouncedFetchData);

        fetchData();
        setActiveTab('messages');

        return () => {
            unsubscribeNewMessage();
            unsubscribeMessageRead();
            unsubscribeUnreadCountUpdated();
            setActiveTab(null);
        };
    }, [user?.id, handleNewMessage, handleMessageRead, debouncedFetchData, fetchData, setActiveTab]);

    const renderChatItem = useCallback(({ item }: { item: Chat }) => {
        const unreadCount = chatUnreadCounts[item.id.toString()] || 0;

        return (
            <TouchableOpacity
                style={styles.card}
                onPress={() => handleItemPress(item)}
                activeOpacity={0.7}
            >
                <View style={styles.iconContainer}>
                    <Ionicons
                        name={item.type === 'personal' ? 'person-circle-outline' : 'people-outline'}
                        size={24}
                        color="#4c6793"
                    />
                </View>
                <View style={styles.contentContainer}>
                    <View style={styles.headerContainer}>
                        <Text style={styles.title} numberOfLines={1}>
                            {item.type === 'personal'
                                ? item.chatPartnerName || 'Личный чат'
                                : item.subject || 'Групповой чат'}
                        </Text>
                        <Text style={styles.time}>
                            {item.last_message
                                ? new Date(item.last_message.created_at).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                  })
                                : new Date(item.created_at).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                  })}
                        </Text>
                    </View>
                    {item.last_message && (
                        <Text style={styles.preview} numberOfLines={1}>
                            {item.last_message.content}
                        </Text>
                    )}
                </View>
                {unreadCount > 0 && (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    }, [chatUnreadCounts, handleItemPress]);

    if (!user) return null;

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                <HeaderComponent title="Сообщения" />
                <TabComponent activeTab={activeTabState} onTabChange={setActiveTabState} />
                {activeTabState === 'chats' && (
                    <FilterComponent chatType={chatType} onTypeChange={setChatType} />
                )}

                {loading ? (
                    <ActivityIndicator style={styles.loader} size="large" color="#4c6793" />
                ) : (
                    <FlatList
                        data={data}
                        renderItem={renderChatItem}
                        keyExtractor={item => item.id.toString()}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={onRefresh}
                                colors={['#4c6793']}
                            />
                        }
                        contentContainerStyle={styles.listContent}
                        ListEmptyComponent={<EmptyListComponent type={activeTabState} />}
                    />
                )}

                {activeTabState === 'chats' && (
                    <TouchableOpacity
                        style={styles.fab}
                        onPress={handleCreateNew}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="add" size={24} color="#fff" />
                    </TouchableOpacity>
                )}
            </View>
        </SafeAreaView>
    );
};

const Messages = memo(MessagesComponent);
export default Messages;


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
        backgroundColor: '#fff',
        padding: 16,
        paddingTop: Platform.OS === 'android' ? 16 : 0,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#333',
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        padding: 8,
        marginBottom: 8,
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: 8,
    },
    activeTab: {
        backgroundColor: '#4c6793',
    },
    tabText: {
        fontSize: 16,
        color: '#4c6793',
        fontWeight: '500',
    },
    activeTabText: {
        color: '#fff',
    },
    filterContainer: {
        flexDirection: 'row',
        padding: 8,
        backgroundColor: '#fff',
        marginBottom: 8,
    },
    filterButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 16,
        marginRight: 8,
        backgroundColor: '#f0f0f0',
    },
    activeFilter: {
        backgroundColor: '#4c6793',
    },
    filterText: {
        color: '#333',
        fontSize: 14,
    },
    activeFilterText: {
        color: '#fff',
    },
    listContent: {
        padding: 16,
        flexGrow: 1,
    },
    card: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    pinnedCard: {
        borderLeftWidth: 4,
        borderLeftColor: '#4c6793',
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f0f0f0',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    contentContainer: {
        flex: 1,
    },
    headerContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        flex: 1,
        marginRight: 8,
    },
    time: {
        fontSize: 12,
        color: '#666',
    },
    preview: {
        fontSize: 14,
        color: '#666',
    },
    badge: {
        backgroundColor: '#4c6793',
        borderRadius: 12,
        minWidth: 24,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 8,
        marginLeft: 8,
    },
    badgeText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    pinIcon: {
        position: 'absolute',
        top: 12,
        right: 12,
    },
    loader: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 100,
    },
    emptyText: {
        marginTop: 16,
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
    },
    fab: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#4c6793',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
});