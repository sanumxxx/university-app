import { useState } from 'react';
import {
 View,
 StyleSheet,
 TouchableOpacity,
 Text,
 TextInput,
 ActivityIndicator,
 Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/auth';
import axios from 'axios';
import { API_URL } from '../utils/config';

export default function Index() {
 const { login } = useAuth();
 const [isLoginMode, setIsLoginMode] = useState(true);
 const [isLoading, setIsLoading] = useState(false);
 const [showPassword, setShowPassword] = useState(false);
 const [groups, setGroups] = useState([]);
 const [teachers, setTeachers] = useState([]);

 const [formData, setFormData] = useState({
   email: '',
   password: '',
   fullName: '',
   userType: '',
   group: '',
   teacher: ''
 });

 const loadInitialData = async () => {
   try {
     const [groupsResponse, teachersResponse] = await Promise.all([
       axios.get(`${API_URL}/groups`),
       axios.get(`${API_URL}/teachers`)
     ]);
     setGroups(groupsResponse.data);
     setTeachers(teachersResponse.data);
   } catch (error) {
     console.error('Failed to load initial data:', error);
   }
 };

 const handleSubmit = async () => {
   try {
     setIsLoading(true);

     if (!formData.email || !formData.password) {
       Alert.alert('Ошибка', 'Заполните все обязательные поля');
       return;
     }

     const endpoint = isLoginMode ? '/login' : '/register';
     const response = await axios.post(`${API_URL}${endpoint}`, formData);

     await login(response.data.user, response.data.token);
   } catch (error) {
     Alert.alert(
       'Ошибка',
       error.response?.data?.error || 'Произошла ошибка'
     );
   } finally {
     setIsLoading(false);
   }
 };

 const handleActionSheetSelect = (type, value) => {
   if (type === 'userType') {
     setFormData(prev => ({
       ...prev,
       userType: value,
       fullName: '',
       group: '',
       teacher: ''
     }));
   } else {
     setFormData(prev => ({ ...prev, [type]: value }));
   }
 };

 return (
   <SafeAreaView style={styles.container}>
     <View style={styles.header}>
       <Text style={styles.headerTitle}>
         {isLoginMode ? 'Вход' : 'Регистрация'}
       </Text>
     </View>

     <View style={styles.form}>
       <View style={styles.inputContainer}>
         <TextInput
           style={styles.input}
           placeholder="Email"
           placeholderTextColor="#999"
           value={formData.email}
           onChangeText={(value) => setFormData(prev => ({ ...prev, email: value }))}
           autoCapitalize="none"
           keyboardType="email-address"
         />
       </View>

       <View style={styles.inputContainer}>
         <TextInput
           style={[styles.input, { paddingRight: 50 }]}
           placeholder="Пароль"
           placeholderTextColor="#999"
           value={formData.password}
           onChangeText={(value) => setFormData(prev => ({ ...prev, password: value }))}
           secureTextEntry={!showPassword}
         />
         <TouchableOpacity
           style={styles.passwordIcon}
           onPress={() => setShowPassword(!showPassword)}
         >
           <Ionicons
             name={showPassword ? "eye-off" : "eye"}
             size={24}
             color="#999"
           />
         </TouchableOpacity>
       </View>

       {!isLoginMode && (
         <>
           <View style={styles.inputContainer}>
             <TextInput
               style={styles.input}
               placeholder="ФИО"
               placeholderTextColor="#999"
               value={formData.fullName}
               onChangeText={(value) => setFormData(prev => ({ ...prev, fullName: value }))}
             />
           </View>

           <TouchableOpacity
             style={styles.selectButton}
             onPress={() => handleActionSheetSelect('userType', 'student')}
           >
             <Text style={[
               styles.selectButtonText,
               !formData.userType && styles.placeholderText
             ]}>
               {formData.userType === 'student' ? 'Студент' : 'Преподаватель'}
             </Text>
             <Ionicons name="chevron-down" size={24} color="#999" />
           </TouchableOpacity>

           {formData.userType === 'student' && (
             <TouchableOpacity
               style={styles.selectButton}
               onPress={() => handleActionSheetSelect('group', groups[0])}
             >
               <Text style={[
                 styles.selectButtonText,
                 !formData.group && styles.placeholderText
               ]}>
                 {formData.group || 'Выберите группу'}
               </Text>
               <Ionicons name="chevron-down" size={24} color="#999" />
             </TouchableOpacity>
           )}

           {formData.userType === 'teacher' && (
             <TouchableOpacity
               style={styles.selectButton}
               onPress={() => handleActionSheetSelect('teacher', teachers[0])}
             >
               <Text style={[
                 styles.selectButtonText,
                 !formData.teacher && styles.placeholderText
               ]}>
                 {formData.teacher || 'Выберите преподавателя'}
               </Text>
               <Ionicons name="chevron-down" size={24} color="#999" />
             </TouchableOpacity>
           )}
         </>
       )}

       <TouchableOpacity
         style={[styles.button, isLoading && styles.buttonDisabled]}
         onPress={handleSubmit}
         disabled={isLoading}
       >
         {isLoading ? (
           <ActivityIndicator color="#FFFFFF" />
         ) : (
           <Text style={styles.buttonText}>
             {isLoginMode ? 'Войти' : 'Зарегистрироваться'}
           </Text>
         )}
       </TouchableOpacity>

       <TouchableOpacity
         style={styles.switchButton}
         onPress={() => {
           setIsLoginMode(!isLoginMode);
           setFormData({
             email: '',
             password: '',
             fullName: '',
             userType: '',
             group: '',
             teacher: ''
           });
         }}
       >
         <Text style={styles.switchButtonText}>
           {isLoginMode ? 'Создать аккаунт' : 'Уже есть аккаунт?'}
         </Text>
       </TouchableOpacity>
     </View>
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
 form: {
   padding: 20,
 },
 inputContainer: {
   backgroundColor: '#fff',
   borderRadius: 12,
   marginBottom: 16,
   shadowColor: '#000',
   shadowOffset: {
     width: 0,
     height: 2,
   },
   shadowOpacity: 0.05,
   shadowRadius: 3.84,
   elevation: 5,
 },
 input: {
   height: 50,
   paddingHorizontal: 16,
   fontSize: 17,
   color: '#000',
 },
 passwordIcon: {
   position: 'absolute',
   right: 12,
   top: 12,
 },
 selectButton: {
   backgroundColor: '#fff',
   borderRadius: 12,
   marginBottom: 16,
   height: 50,
   paddingHorizontal: 16,
   flexDirection: 'row',
   alignItems: 'center',
   justifyContent: 'space-between',
   shadowColor: '#000',
   shadowOffset: {
     width: 0,
     height: 2,
   },
   shadowOpacity: 0.05,
   shadowRadius: 3.84,
   elevation: 5,
 },
 selectButtonText: {
   fontSize: 17,
   color: '#000',
 },
 placeholderText: {
   color: '#999',
 },
 button: {
   backgroundColor: '#007AFF',
   borderRadius: 12,
   height: 50,
   justifyContent: 'center',
   alignItems: 'center',
   marginTop: 8,
 },
 buttonDisabled: {
   opacity: 0.7,
 },
 buttonText: {
   color: '#fff',
   fontSize: 17,
   fontWeight: '600',
 },
 switchButton: {
   marginTop: 16,
   alignItems: 'center',
 },
 switchButtonText: {
   color: '#007AFF',
   fontSize: 17,
 },
});