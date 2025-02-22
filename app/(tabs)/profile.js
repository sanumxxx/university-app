import { useState, useEffect } from 'react';
import {
 View,
 StyleSheet,
 Text,
 TouchableOpacity,
 Alert,
 ScrollView,
 Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/auth';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Profile() {
 const { user, logout } = useAuth();
 const [pushNotifications, setPushNotifications] = useState(true);

 if (!user) {
   return null;
 }

 useEffect(() => {
   loadSettings();
 }, []);

 const loadSettings = async () => {
   try {
     const notifications = await AsyncStorage.getItem('pushNotifications');
     setPushNotifications(notifications !== 'false');
   } catch (error) {
     console.error('Error loading settings:', error);
   }
 };

 const handleLogout = () => {
   Alert.alert(
     'Выход',
     'Вы уверены, что хотите выйти?',
     [
       {
         text: 'Отмена',
         style: 'cancel'
       },
       {
         text: 'Выйти',
         style: 'destructive',
         onPress: async () => {
           await logout();
           router.replace('/');
         }
       }
     ]
   );
 };

 const toggleNotifications = async (value) => {
   try {
     await AsyncStorage.setItem('pushNotifications', value.toString());
     setPushNotifications(value);
   } catch (error) {
     console.error('Error saving settings:', error);
   }
 };

 return (
   <SafeAreaView style={styles.container} edges={['top']}>
     <View style={styles.header}>
       <Text style={styles.headerTitle}>Профиль</Text>
     </View>

     <ScrollView style={styles.content}>
       <View style={styles.userInfo}>
         <View style={styles.avatarContainer}>
           <Ionicons name="person-circle" size={80} color="#007AFF" />
         </View>
         {user.userType === 'teacher' ? (
           <Text style={styles.userName}>{user.teacher}</Text>
         ) : (
           <Text style={styles.userName}>{user.fullName || user.full_name}</Text>
         )}
         <Text style={styles.userRole}>
           {user.userType === 'teacher' ? 'Преподаватель' : 'Студент'}
         </Text>
         {user.userType === 'student' && (
           <Text style={styles.userGroup}>
             Группа: {user.group_name || user.group}
           </Text>
         )}
         <Text style={styles.userEmail}>{user.email}</Text>
       </View>

       <View style={styles.settingsContainer}>
         <Text style={styles.sectionTitle}>Настройки</Text>
         <View style={styles.settingRow}>
           <View style={styles.settingLeft}>
             <Ionicons name="notifications-outline" size={20} color="#007AFF" />
             <Text style={styles.settingText}>Push-уведомления</Text>
           </View>
           <Switch
             value={pushNotifications}
             onValueChange={toggleNotifications}
             trackColor={{ false: '#E5E5EA', true: '#34C759' }}
             ios_backgroundColor="#E5E5EA"
           />
         </View>
       </View>

       <TouchableOpacity
         style={styles.logoutButton}
         onPress={handleLogout}
       >
         <Ionicons name="log-out-outline" size={24} color="#FF3B30" />
         <Text style={styles.logoutText}>Выйти</Text>
       </TouchableOpacity>
     </ScrollView>
   </SafeAreaView>
 );
}

const styles = StyleSheet.create({
 container: {
   flex: 1,
   backgroundColor: '#F2F2F7',
 },
 header: {
   padding: 16,
   backgroundColor: '#fff',
   borderBottomWidth: 1,
   borderBottomColor: '#E5E5EA',
 },
 headerTitle: {
   fontSize: 17,
   fontWeight: '600',
   color: '#000',
   textAlign: 'center',
 },
 content: {
   flex: 1,
   padding: 20,
 },
 userInfo: {
   alignItems: 'center',
   backgroundColor: '#fff',
   borderRadius: 12,
   padding: 20,
   shadowColor: '#000',
   shadowOffset: {
     width: 0,
     height: 2,
   },
   shadowOpacity: 0.05,
   shadowRadius: 3.84,
   elevation: 5,
 },
 avatarContainer: {
   marginBottom: 16,
 },
 userName: {
   fontSize: 24,
   fontWeight: '600',
   color: '#000',
   marginBottom: 8,
   textAlign: 'center',
 },
 userRole: {
   fontSize: 17,
   color: '#8E8E93',
   marginBottom: 8,
 },
 userGroup: {
   fontSize: 17,
   color: '#8E8E93',
   marginBottom: 8,
 },
 userEmail: {
   fontSize: 15,
   color: '#8E8E93',
 },
 settingsContainer: {
   backgroundColor: '#fff',
   borderRadius: 12,
   padding: 16,
   marginTop: 20,
   shadowColor: '#000',
   shadowOffset: {
     width: 0,
     height: 2,
   },
   shadowOpacity: 0.05,
   shadowRadius: 3.84,
   elevation: 5,
 },
 sectionTitle: {
   fontSize: 20,
   fontWeight: '600',
   color: '#000',
   marginBottom: 16,
 },
 settingRow: {
   flexDirection: 'row',
   alignItems: 'center',
   justifyContent: 'space-between',
 },
 settingLeft: {
   flexDirection: 'row',
   alignItems: 'center',
 },
 settingText: {
   fontSize: 15,
   color: '#000',
   marginLeft: 12,
 },
 logoutButton: {
   flexDirection: 'row',
   alignItems: 'center',
   justifyContent: 'center',
   backgroundColor: '#fff',
   borderRadius: 12,
   padding: 16,
   marginTop: 20,
   marginBottom: 20,
   shadowColor: '#000',
   shadowOffset: {
     width: 0,
     height: 2,
   },
   shadowOpacity: 0.05,
   shadowRadius: 3.84,
   elevation: 5,
 },
 logoutText: {
   marginLeft: 8,
   fontSize: 17,
   color: '#FF3B30',
   fontWeight: '500',
 },
});