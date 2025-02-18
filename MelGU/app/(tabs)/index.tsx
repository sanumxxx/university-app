import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  Animated,
  ScrollView,
  RefreshControl
} from 'react-native';
import { useAuthStore } from '../../src/store/auth';
import { apiRequest } from '../../src/api/config';
import { Ionicons } from '@expo/vector-icons';
import _ from 'lodash';

interface ScheduleItem {
  id: number;
  date: string;
  time_start: string;
  time_end: string;
  subject: string;
  auditory: string;
  group_name: string;
  weekday: number;
  lesson_type: string;
  subgroup: number;
  teacher_name: string;
}

interface GroupedScheduleItem extends Omit<ScheduleItem, 'group_name'> {
  groups: string[];
}

const COLORS = {
  primary: '#4c6793',    // Main light blue
  secondary: '#7189b9',  // Lighter blue
  accent: '#ffffff',     // White for highlights
  background: '#f8f9fa',
  card: '#ffffff',
  text: {
    primary: '#202124',
    secondary: '#5f6368',
    light: '#ffffff',
  },
  lessonType: {
    lecture: '#5b8dd0',    // Light blue
    practice: '#6bae9f',   // Turquoise
    laboratory: '#7189b9', // Light purple
    default: '#8a97b1'     // Gray-blue
  },
};

const SCREEN_WIDTH = Dimensions.get('window').width;

const FadeInView = ({ children, index }: { children: React.ReactNode; index: number }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      delay: index * 100,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      {children}
    </Animated.View>
  );
};

const getWeekdayName = (weekday: number) => {
  const days = [
    'Воскресенье',
    'Понедельник',
    'Вторник',
    'Среда',
    'Четверг',
    'Пятница',
    'Суббота',
  ];
  return days[weekday];
};

const formatDate = (date: Date) => {
  const day = date.getDate();
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  return `${day} ${months[date.getMonth()]}`;
};

const getLessonTypeColor = (type: string) => {
  switch (type?.toLowerCase()) {
    case 'лекция':
      return COLORS.lessonType.lecture;
    case 'практика':
    case 'практическое занятие':
      return COLORS.lessonType.practice;
    case 'лабораторная':
    case 'лабораторная работа':
      return COLORS.lessonType.laboratory;
    default:
      return COLORS.lessonType.default;
  }
};

const DateBlock = ({
  date,
  isSelected,
  onSelect,
  isSmall = false
}: {
  date: Date;
  isSelected: boolean;
  onSelect: () => void;
  isSmall?: boolean;
}) => (
  <TouchableOpacity
    style={[
      styles.dateBlock,
      isSelected && styles.dateBlockSelected,
      isSmall && styles.dateBlockSmall
    ]}
    onPress={onSelect}
  >
    <Text style={[
      styles.dateWeekday,
      isSelected && styles.dateTextSelected,
      isSmall && styles.dateTextSmall
    ]}>
      {getWeekdayName(date.getDay())}
    </Text>
    <Text style={[
      styles.dateText,
      isSelected && styles.dateTextSelected,
      isSmall && styles.dateTextSmall
    ]}>
      {formatDate(date)}
    </Text>
  </TouchableOpacity>
);

const ScheduleCard = ({ item, isTeacher }: { item: GroupedScheduleItem, isTeacher: boolean }) => (
  <View style={styles.card}>
    <View style={styles.timeContainer}>
      <Text style={styles.time}>{item.time_start}</Text>
      <View style={styles.timeLine} />
      <Text style={styles.time}>{item.time_end}</Text>
    </View>
    <View style={styles.lessonContainer}>
      <View style={styles.subjectHeader}>
        <Text style={styles.subject}>{item.subject}</Text>
        <View
          style={[
            styles.lessonType,
            { backgroundColor: getLessonTypeColor(item.lesson_type) },
          ]}
        >
          <Text style={styles.lessonTypeText}>{item.lesson_type}</Text>
        </View>
      </View>
      <View style={styles.detailsContainer}>
        <View style={styles.detail}>
          <Ionicons
            name="location-outline"
            size={16}
            color={COLORS.text.secondary}
          />
          <Text style={styles.detailText}>{item.auditory}</Text>
        </View>
        {isTeacher ? (
          <View style={styles.detail}>
            <Ionicons
              name="people-outline"
              size={16}
              color={COLORS.text.secondary}
            />
            <Text style={styles.detailText}>{item.groups.join(', ')}</Text>
          </View>
        ) : (
          <View style={styles.detail}>
            <Ionicons
              name="person-outline"
              size={16}
              color={COLORS.text.secondary}
            />
            <Text style={styles.detailText}>{item.teacher_name}</Text>
          </View>
        )}
        {Number(item.subgroup) > 0 && (
          <View style={styles.detail}>
            <Ionicons
              name="people-circle-outline"
              size={16}
              color={COLORS.text.secondary}
            />
            <Text style={styles.detailText}>
              {item.subgroup === 1 ? '1-я подгруппа' :
               item.subgroup === 2 ? '2-я подгруппа' :
               `${item.subgroup}-я подгруппа`}
            </Text>
          </View>
        )}
      </View>
    </View>
  </View>
);

export default function Index() {
  const { user } = useAuthStore();
  const [allSchedule, setAllSchedule] = useState<ScheduleItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [refreshing, setRefreshing] = useState(false);

  const fetchSchedule = async () => {
    if (!user) return;
    try {
      const response = await apiRequest<ScheduleItem[]>(
        user.role === 'teacher'
          ? `/schedule?teacher=${encodeURIComponent(user.full_name)}`
          : `/schedule?group=${encodeURIComponent(user.group_name)}&course=${user.course}`
      );
      setAllSchedule(response);
    } catch (error) {
      console.error('Error fetching schedule:', error);
    }
  };

  useEffect(() => {
    fetchSchedule();
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSchedule();
    setRefreshing(false);
  };

  const getPrevDate = () => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() - 1);
    return date;
  };

  const getNextDate = () => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + 1);
    return date;
  };

  const groupScheduleByTime = (schedule: ScheduleItem[]): GroupedScheduleItem[] => {
    const grouped = _.groupBy(
      schedule,
      (item) =>
        `${item.time_start}-${item.time_end}-${item.subject}-${item.lesson_type}-${item.auditory}-${item.subgroup}`
    );

    return Object.values(grouped)
      .map((group) => ({
        ...group[0],
        groups: group.map((item) => item.group_name),
      }))
      .sort((a, b) => {
        const timeToMinutes = (time: string) => {
          const [hours, minutes] = time.split(':').map(Number);
          return hours * 60 + minutes;
        };
        return timeToMinutes(a.time_start) - timeToMinutes(b.time_start);
      });
  };

  if (!user) return null;

  const daySchedule = allSchedule.filter(
    (item) => new Date(item.date).toDateString() === selectedDate.toDateString()
  );

  const groupedSchedule = groupScheduleByTime(daySchedule);
  const isTeacher = user.role === 'teacher';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.dateContainer}>
          <DateBlock
            date={getPrevDate()}
            isSelected={false}
            onSelect={() => setSelectedDate(getPrevDate())}
            isSmall
          />
          <DateBlock
            date={selectedDate}
            isSelected={true}
            onSelect={() => {}}
          />
          <DateBlock
            date={getNextDate()}
            isSelected={false}
            onSelect={() => setSelectedDate(getNextDate())}
            isSmall
          />
        </View>
      </View>

      {groupedSchedule.length > 0 ? (
        <Animated.FlatList
          data={groupedSchedule}
          keyExtractor={(item) => `${item.id}-${item.subgroup}`}
          renderItem={({ item, index }) => (
            <FadeInView index={index}>
              <ScheduleCard item={item} isTeacher={isTeacher} />
            </FadeInView>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
        >
          <Ionicons name="calendar-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>Нет занятий в этот день</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingVertical: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 24,
    borderBottomLeftRadius: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  dateContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  dateBlock: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    borderRadius: 12,
    margin: 4,
  },
  dateBlockSelected: {
    backgroundColor: COLORS.accent,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  dateBlockSmall: {
    padding: 8,
    opacity: 0.8,
  },
  dateWeekday: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text.light,
  },
  dateText: {
    fontSize: 14,
    color: COLORS.text.light,
    marginTop: 4,
  },
  dateTextSelected: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  dateTextSmall: {
    fontSize: 12,
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    marginBottom: 12,
    padding: 16,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  timeContainer: {
    alignItems: 'center',
    marginRight: 16,
    minWidth: 50,
  },
  time: {
    fontSize: 14,
    color: COLORS.text.secondary,
    fontWeight: '600',
  },
  timeLine: {
    width: 2,
    height: 30,
    backgroundColor: COLORS.secondary,
    marginVertical: 4,
  },
  lessonContainer: {
    flex: 1,
  },
  subjectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  subject: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    flex: 1,
    marginRight: 8,
  },
  lessonType: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  lessonTypeText: {
    color: COLORS.text.light,
    fontSize: 12,
    fontWeight: '600',
  },
  detailsContainer: {
    gap: 8,
  },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: COLORS.text.secondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: COLORS.text.secondary,
  },
  filtersContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.secondary,
  },
  filterChipSelected: {
    backgroundColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 12,
    color: COLORS.text.secondary,
  },
  filterChipTextSelected: {
    color: COLORS.text.light,
  },
  subgroupIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  subgroupText: {
    color: COLORS.text.light,
    fontSize: 12,
    fontWeight: '500',
  },
  refreshContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.text.secondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
  },
  retryButtonText: {
    color: COLORS.text.light,
    fontSize: 14,
    fontWeight: '500',
  },
  weekNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  weekNavigationButton: {
    padding: 8,
  },
  weekNavigationText: {
    fontSize: 14,
    color: COLORS.text.light,
    fontWeight: '500',
  },
  currentWeekText: {
    fontSize: 16,
    color: COLORS.text.light,
    fontWeight: '600',
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.secondary + '20',
    marginVertical: 8,
  },
  headerInfo: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 12,
    color: COLORS.text.light,
    opacity: 0.8,
  },
  headerValue: {
    fontSize: 16,
    color: COLORS.text.light,
    fontWeight: '600',
  }
});
