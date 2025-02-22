import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import { useAuth } from '../../context/auth';
import api from '../../utils/api';
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;

dayjs.locale('ru');

const formatTime = (time) => {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  return `${hours.padStart(2, '0')}:${minutes || '00'}`;
};

export default function Schedule() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(dayjs());
  const [schedule, setSchedule] = useState([]);
  const [weekSchedule, setWeekSchedule] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const translateX = useSharedValue(0);

  const processSchedule = (data) => {
  console.log('Starting processSchedule function');
  console.log('Raw data:', data);
  console.log('Processing for user:', user);

  if (!data || !Array.isArray(data)) {
    setSchedule([]);
    return;
  }

  const timeSlots = {};
  data.forEach(lesson => {
    console.log('Processing lesson:', lesson);

    // Для преподавателя просто сравниваем teacher_name
    const isTeacherLesson = user.userType === 'teacher' &&
      lesson.teacher_name === user.teacher;  // Изменили здесь: используем user.teacher вместо full_name

    const isStudentLesson = user.userType === 'student' &&
      (lesson.subgroup === 0 || lesson.subgroup === user.subgroup || !user.subgroup);

    console.log('Is teacher lesson:', isTeacherLesson);
    console.log('Is student lesson:', isStudentLesson);

    if (isTeacherLesson || isStudentLesson) {
      const timeKey = `${lesson.time_start}-${lesson.time_end}`;

      if (!timeSlots[timeKey]) {
        timeSlots[timeKey] = {
          id: timeKey,
          timeStart: lesson.time_start,
          timeEnd: lesson.time_end,
          lessons: []
        };
      }

      if (user.userType === 'teacher') {
        const existingLesson = timeSlots[timeKey].lessons.find(
          existing =>
            existing.subject === lesson.subject &&
            existing.lesson_type === lesson.lesson_type &&
            existing.auditory === lesson.auditory
        );

        if (existingLesson) {
          if (!existingLesson.groups) {
            existingLesson.groups = [existingLesson.group_name];
          }
          if (!existingLesson.groups.includes(lesson.group_name)) {
            existingLesson.groups.push(lesson.group_name);
          }
        } else {
          timeSlots[timeKey].lessons.push({
            ...lesson,
            groups: [lesson.group_name]
          });
        }
      } else {
        timeSlots[timeKey].lessons.push(lesson);
      }
    } else {
      console.log('Skipping lesson - not matching user criteria');
    }
  });

  const formattedSchedule = Object.entries(timeSlots)
    .sort(([timeA], [timeB]) => timeA.localeCompare(timeB))
    .map(([_, slot]) => ({
      ...slot,
      lessons: slot.lessons.sort((a, b) => (a.subgroup ?? 0) - (b.subgroup ?? 0))
    }))
    .filter(slot => slot.lessons.length > 0);

  console.log('Final formatted schedule:', formattedSchedule);
  setSchedule(formattedSchedule);
};

useEffect(() => {
  console.log('Schedule component mounted');
  loadWeekSchedule();
}, []);

useEffect(() => {
  console.log('Current date changed:', currentDate.format('YYYY-MM-DD'));
  if (weekSchedule[currentDate.format('YYYY-MM-DD')]) {
    console.log('Using cached data for date');
    processSchedule(weekSchedule[currentDate.format('YYYY-MM-DD')]);
  } else {
    console.log('Loading new data for date');
    loadSchedule();
  }
}, [currentDate]);

  const loadWeekSchedule = async () => {
    const startOfWeek = currentDate.startOf('week');
    const dates = Array.from({ length: 7 }, (_, i) => startOfWeek.add(i, 'day'));

    Promise.all(
      dates.map(date =>
        api.get('/schedule', {
          params: { date: date.format('YYYY-MM-DD') }
        })
        .then(response => ({ date: date.format('YYYY-MM-DD'), data: response.data }))
        .catch(() => ({ date: date.format('YYYY-MM-DD'), data: [] }))
      )
    ).then(results => {
      const newWeekSchedule = {};
      results.forEach(({ date, data }) => {
        newWeekSchedule[date] = data;
      });
      setWeekSchedule(newWeekSchedule);
      setIsLoading(false);
    });
  };

  const loadSchedule = async () => {
  try {
    console.log('Starting loadSchedule function');
    console.log('Fetching data for date:', currentDate.format('YYYY-MM-DD'));
    console.log('Current user:', user);

    const response = await api.get('/schedule', {
      params: {
        date: currentDate.format('YYYY-MM-DD')
      }
    });

    console.log('API Response:', response.data);

    if (!response.data || !Array.isArray(response.data)) {
      console.log('Invalid data received:', response.data);
      setSchedule([]);
      return;
    }

    processSchedule(response.data);
  } catch (error) {
    console.error('Error in loadSchedule:', error);
    console.error('Error details:', error.response?.data);
    console.error('Error status:', error.response?.status);
    setSchedule([]);
  } finally {
    setIsLoading(false);
    setRefreshing(false);
  }
};

  useEffect(() => {
    loadWeekSchedule();
  }, []);

  useEffect(() => {
    if (weekSchedule[currentDate.format('YYYY-MM-DD')]) {
      processSchedule(weekSchedule[currentDate.format('YYYY-MM-DD')]);
    } else {
      loadSchedule();
    }
  }, [currentDate]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadWeekSchedule();
    setRefreshing(false);
  };

  const goToNextDay = () => setCurrentDate(prev => prev.add(1, 'day'));
  const goToPrevDay = () => setCurrentDate(prev => prev.subtract(1, 'day'));

  const gesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > SWIPE_THRESHOLD) {
        if (e.translationX > 0) {
          runOnJS(goToPrevDay)();
        } else {
          runOnJS(goToNextDay)();
        }
      }
      translateX.value = withSpring(0);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }]
  }));

  const renderLesson = ({ item }) => (
    <View style={styles.lessonCard}>
      <View style={styles.timeContainer}>
        <Text style={styles.timeText}>
          {formatTime(item.timeStart)} - {formatTime(item.timeEnd)}
        </Text>
      </View>
      <View style={styles.lessonsContainer}>
        {item.lessons.map((lesson, index) => (
          <View key={`${lesson.id}-${index}`}>
            {index > 0 && <View style={styles.divider} />}
            <View style={styles.lessonInfo}>
              <Text style={styles.subjectText}>{lesson.subject}</Text>
              <Text style={styles.detailsText}>
                {lesson.lesson_type} • {lesson.auditory}
                {lesson.subgroup > 0 && ` • ${lesson.subgroup} подгруппа`}
              </Text>
              <Text style={styles.teacherText}>
                {user.userType === 'student' ? lesson.teacher_name : lesson.group_name}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goToPrevDay}>
            <Ionicons name="chevron-back" size={24} color="#007AFF" />
          </TouchableOpacity>
          <Text style={styles.dateText}>
            {currentDate.format('D MMMM')}
          </Text>
          <TouchableOpacity onPress={goToNextDay}>
            <Ionicons name="chevron-forward" size={24} color="#007AFF" />
          </TouchableOpacity>
        </View>

        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.scheduleContainer, animatedStyle]}>
            {isLoading ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
              </View>
            ) : (
              <FlatList
                data={schedule}
                renderItem={renderLesson}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor="#007AFF"
                    colors={["#007AFF"]}
                    title="Обновление..."
                  />
                }
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>Нет пар на этот день</Text>
                  </View>
                }
              />
            )}
          </Animated.View>
        </GestureDetector>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  scheduleContainer: {
    flex: 1,
  },
  header: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  dateText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    textTransform: 'capitalize',
  },
  listContent: {
    padding: 16,
  },
  lessonCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    padding: 16,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3.84,
    elevation: 5,
  },
  timeContainer: {
    width: 110,
    marginRight: 16,
    flexShrink: 0,
  },
  timeText: {
    fontSize: 15,
    color: '#8E8E93',
    fontVariant: ['tabular-nums'],
  },
  lessonsContainer: {
    flex: 1,
  },
  lessonInfo: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginVertical: 8,
  },
  subjectText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  detailsText: {
    fontSize: 15,
    color: '#8E8E93',
    marginBottom: 4,
  },
  teacherText: {
    fontSize: 15,
    color: '#007AFF',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 32,
  },
  emptyText: {
    fontSize: 15,
    color: '#8E8E93',
  },
});