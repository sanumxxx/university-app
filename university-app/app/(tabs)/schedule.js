import { useState, useEffect } from 'react';
import {
 View,
 StyleSheet,
 TouchableOpacity,
 Text,
 FlatList,
 ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import api from '../../utils/api';
import { SafeAreaView } from 'react-native-safe-area-context';


dayjs.locale('ru');

const formatTime = (time) => {
  if (!time) return '';
  // Защита от неправильного формата
  if (typeof time !== 'string') return '';

  // Преобразуем "08" в "08:00"
  if (time.length === 2) {
    return `${time}:00`;
  }

  // Если уже в формате HH:MM, просто возвращаем
  if (time.includes(':')) {
    return time;
  }

  return time;
};

export default function Schedule() {
 const [currentDate, setCurrentDate] = useState(dayjs());
 const [schedule, setSchedule] = useState([]);
 const [isLoading, setIsLoading] = useState(true);
 const [userData, setUserData] = useState(null);
 const [refreshing, setRefreshing] = useState(false);

 const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadSchedule();
    } finally {
      setRefreshing(false);
    }
  };

 useEffect(() => {
   loadUserData();
 }, []);

 useEffect(() => {
   loadSchedule();
 }, [currentDate]);

 const loadUserData = async () => {
   try {
     const userStr = await AsyncStorage.getItem('user');
     if (userStr) {
       setUserData(JSON.parse(userStr));
     }
   } catch (error) {
     console.error('Failed to load user data:', error);
   }
 };

 const loadSchedule = async () => {
   try {
     setIsLoading(true);

     const token = await AsyncStorage.getItem('token');
     if (!token) {
       router.replace('/');
       return;
     }

     const response = await api.get('/schedule', {
       params: {
         date: currentDate.format('YYYY-MM-DD')
       }
     });

     const groupedLessons = {};
     response.data.forEach(lesson => {
       const timeKey = `${lesson.time_start}-${lesson.time_end}`;
       if (!groupedLessons[timeKey]) {
         groupedLessons[timeKey] = [];
       }

       if (userData?.userType === 'student') {
         if (lesson.subgroup === 0 || lesson.subgroup === userData.subgroup) {
           groupedLessons[timeKey].push(lesson);
         }
       } else {
         groupedLessons[timeKey].push(lesson);
       }
     });

     const formattedSchedule = Object.entries(groupedLessons)
       .sort(([timeA], [timeB]) => timeA.localeCompare(timeB))
       .map(([time, lessons]) => ({
         id: time,
         timeStart: time.split('-')[0],
         timeEnd: time.split('-')[1],
         lessons
       }));

     setSchedule(formattedSchedule);

   } catch (error) {
     console.error('Failed to load schedule:', error);
     if (error.response?.status === 401) {
       router.replace('/');
     }
   } finally {
     setIsLoading(false);
   }
 };

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
               {userData?.userType === 'student' ? lesson.teacher_name : lesson.group_name}
             </Text>
           </View>
         </View>
       ))}
     </View>
   </View>
 );

 const goToPrevDay = () => setCurrentDate(prev => prev.subtract(1, 'day'));
 const goToNextDay = () => setCurrentDate(prev => prev.add(1, 'day'));

 return (
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

      {isLoading ? (
        <ActivityIndicator style={styles.loader} color="#007AFF" />
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
              colors={["#007AFF"]} // для Android
              title="Обновление..." // для iOS
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Нет пар на этот день</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
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
 loader: {
   flex: 1,
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