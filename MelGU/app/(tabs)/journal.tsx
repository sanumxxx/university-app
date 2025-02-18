import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
  Modal,
  ActivityIndicator,
  Alert
} from 'react-native';
import { useAuthStore } from '../../src/store/auth';
import { apiRequest } from '../../src/api/config';
import { Ionicons } from '@expo/vector-icons';
import DropDownPicker from 'react-native-dropdown-picker';
import { NotificationService } from '../../src/utils/notifications';

// Константы
const COLORS = {
  primary: '#4c6793',
  secondary: '#7189b9',
  accent: '#ffffff',
  background: '#f8f9fa',
  card: '#ffffff',
  text: {
    primary: '#202124',
    secondary: '#5f6368',
    light: '#ffffff',
  },
  grades: {
    '5': '#4CAF50',
    '4': '#8BC34A',
    '3': '#FFC107',
    '2': '#FF5252',
    'н': '#9E9E9E',
  }
};

const GRADES = ['5', '4', '3', '2', 'н'];

// Интерфейсы
interface Student {
  id: number;
  user_id: number;
  full_name: string;
  group_name: string;
}

interface Lesson {
  id: number;
  date: string;
  lesson_type: string;
  topic?: string;
}

interface Grade {
  id?: number;
  student_id: number;
  value: string;
  date: string;
  comment?: string;
}

interface TeacherSubjectsData {
  [semester: string]: {
    [subject: string]: string[];  // группы
  };
}

// Компонент таблицы журнала
const JournalTable = ({
  semester,
  subject,
  group,
  lessons,
  students,
  grades,
  onGradePress
}: {
  semester: string;
  subject: string;
  group: string;
  lessons: Lesson[];
  students: Student[];
  grades: Record<string, Grade>;
  onGradePress: (studentId: number, date: string) => void;
}) => {
  // Получение оценки для конкретного студента и даты
  const getGrade = (studentId: number, date: string) => {
    const key = `${studentId}-${date}`;
    return grades[key]?.value || '-';
  };

  // Расчет среднего балла для студента
  const getAverageGrade = (studentId: number) => {
    const studentGrades = lessons.map(lesson => {
      const grade = getGrade(studentId, lesson.date);
      return grade !== 'н' && grade !== '-' ? Number(grade) : null;
    }).filter(grade => grade !== null);

    if (studentGrades.length === 0) return '-';
    const average = studentGrades.reduce((sum, grade) => sum + grade, 0) / studentGrades.length;
    return average.toFixed(2);
  };

  // Сокращение типа занятия
  const getLessonTypeAbbr = (type: string) => {
    const types = {
      'лекция': 'лек',
      'практика': 'пр',
      'лабораторная': 'лаб',
      'практическое занятие': 'пр',
      'лабораторная работа': 'лаб'
    };
    return types[type.toLowerCase()] || type;
  };

  // Форматирование даты
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru', {
      day: '2-digit',
      month: '2-digit'
    });
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={true}>
      <View>
        {/* Заголовок таблицы */}
        <View style={styles.tableHeader}>
          <View style={styles.nameCell}>
            <Text style={styles.columnHeader}>Студент</Text>
          </View>
          {lessons.map((lesson) => (
            <View key={lesson.id} style={styles.gradeCell}>
              <Text style={styles.columnHeader}>
                {formatDate(lesson.date)}
              </Text>
              <Text style={styles.lessonType}>
                {getLessonTypeAbbr(lesson.lesson_type)}
              </Text>
            </View>
          ))}
          <View style={[styles.gradeCell, styles.averageCell]}>
            <Text style={styles.columnHeader}>Средний балл</Text>
          </View>
        </View>

        {/* Тело таблицы */}
        <ScrollView>
          {students.map((student) => (
            <View key={student.id} style={styles.tableRow}>
              <View style={styles.nameCell}>
                <Text style={styles.studentName}>{student.full_name}</Text>
              </View>
              {lessons.map((lesson) => (
                <TouchableOpacity
                  key={`${student.id}-${lesson.id}`}
                  style={styles.gradeCell}
                  onPress={() => onGradePress(student.id, lesson.date)}
                >
                  <Text
                    style={[
                      styles.grade,
                      { color: COLORS.grades[getGrade(student.id, lesson.date)] || COLORS.text.secondary }
                    ]}
                  >
                    {getGrade(student.id, lesson.date)}
                  </Text>
                </TouchableOpacity>
              ))}
              <View style={[styles.gradeCell, styles.averageCell]}>
                <Text style={[styles.grade, styles.averageGrade]}>
                  {getAverageGrade(student.id)}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Легенда оценок */}
        <View style={styles.legend}>
          {Object.entries(COLORS.grades).map(([grade, color]) => (
            <View key={grade} style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: color }]} />
              <Text style={styles.legendText}>
                {grade === 'н' ? 'неявка' : `оценка ${grade}`}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
};

// Основной компонент журнала
export default function Journal() {
  const { user } = useAuthStore();

  // Состояния для выпадающих списков
  const [semesterOpen, setSemesterOpen] = useState(false);
  const [subjectOpen, setSubjectOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);

  // Значения выбранных полей
  const [selectedSemester, setSelectedSemester] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);

  // Данные для выпадающих списков
  const [semesters, setSemesters] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [groups, setGroups] = useState([]);

  // Данные журнала
  const [teacherData, setTeacherData] = useState<TeacherSubjectsData>({});
  const [students, setStudents] = useState<Student[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [grades, setGrades] = useState<Record<string, Grade>>({});
  const [loading, setLoading] = useState(false);

  // Состояние модального окна
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    studentId: number;
    date: string;
  } | null>(null);

  // Загрузка данных преподавателя при монтировании
  useEffect(() => {
    if (user?.role === 'teacher') {
      loadTeacherData();
    }
  }, [user]);

  // Обновление списка предметов при выборе семестра
  useEffect(() => {
    if (selectedSemester && teacherData[selectedSemester]) {
      const subjectsList = Object.keys(teacherData[selectedSemester]).map(subject => ({
        label: subject,
        value: subject
      }));
      setSubjects(subjectsList);
      setSelectedSubject(null);
      setSelectedGroup(null);
    }
  }, [selectedSemester, teacherData]);

  // Обновление списка групп при выборе предмета
  useEffect(() => {
    if (selectedSemester && selectedSubject && teacherData[selectedSemester]?.[selectedSubject]) {
      const groupsList = teacherData[selectedSemester][selectedSubject].map(group => ({
        label: group,
        value: group
      }));
      setGroups(groupsList);
      setSelectedGroup(null);
    }
  }, [selectedSubject, selectedSemester, teacherData]);

  // Загрузка данных журнала при выборе группы
  useEffect(() => {
    if (selectedGroup) {
      loadJournalData();
    }
  }, [selectedGroup]);

  // Загрузка данных преподавателя
  const loadTeacherData = async () => {
    try {
      setLoading(true);
      const response = await apiRequest<TeacherSubjectsData>(
        `/teacher/subjects?teacher_name=${encodeURIComponent(user.full_name)}`
      );
      setTeacherData(response);

      const semestersList = Object.keys(response).map(sem => ({
        label: `${sem} семестр`,
        value: sem
      }));
      setSemesters(semestersList);
    } catch (error) {
      console.error('Error loading teacher data:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  };

  // Загрузка данных журнала
const loadJournalData = async () => {
  try {
    setLoading(true);

    // Загрузка студентов группы
    const studentsResponse = await apiRequest<Student[]>(
      `/students?group=${selectedGroup}`
    );

    // Сортировка студентов по имени
    const sortedStudents = studentsResponse.sort((a, b) =>
      a.full_name.localeCompare(b.full_name)
    );
    setStudents(sortedStudents);

    // Загрузка занятий для конкретной группы
    const lessonsResponse = await apiRequest<Lesson[]>(
      `/schedule?group=${selectedGroup}&subject=${selectedSubject}&semester=${selectedSemester}&teacher_name=${encodeURIComponent(user.full_name)}`
    );

    // Фильтрация и создание уникальных записей
    const uniqueLessons = lessonsResponse
      .filter(lesson =>
        lesson.group_name === selectedGroup &&
        lesson.subject === selectedSubject &&
        lesson.teacher_name === user.full_name
      )
      .reduce((unique, lesson) => {
        const existingLesson = unique.find(u => u.date === lesson.date);
        if (!existingLesson) {
          unique.push({
            id: lesson.id,
            date: lesson.date,
            lesson_type: lesson.lesson_type,
            topic: lesson.topic || null,
            subject: lesson.subject,
            group_name: lesson.group_name
          });
        }
        return unique;
      }, [] as Lesson[])
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    setLessons(uniqueLessons);

   // Если есть уникальные занятия, загружаем оценки
   if (uniqueLessons.length > 0) {
     // Загрузка оценок для отфильтрованных занятий
     const gradesResponse = await apiRequest<Grade[]>(
       `/grades?group=${selectedGroup}&subject=${selectedSubject}&semester=${selectedSemester}`
     );

     // Преобразование оценок в объект для быстрого доступа
     const gradesMap = {};
     gradesResponse.forEach(grade => {
       const key = `${grade.student_id}-${grade.date}`;
       gradesMap[key] = {
         id: grade.id,
         value: grade.value,
         date: grade.date,
         student_id: grade.student_id,
         comment: grade.comment
       };
     });

     setGrades(gradesMap);
   } else {
     // Если нет занятий, очищаем оценки
     setGrades({});
   }

   // Если нет данных, показываем сообщение
   if (uniqueLessons.length === 0) {
     Alert.alert(
       'Информация',
       'Нет занятий для выбранной группы в этом семестре'
     );
   }

 } catch (error) {
   console.error('Error loading journal data:', error);
   Alert.alert(
     'Ошибка',
     'Не удалось загрузить данные журнала. Попробуйте еще раз.'
   );
 } finally {
   setLoading(false);
 }
};

  // Обработка нажатия на ячейку оценки
  const handleGradePress = (studentId: number, date: string) => {
    setSelectedCell({ studentId, date });
    setModalVisible(true);
  };

  // Обработка выбора оценки
  const handleGradeSelect = async (value: string) => {
  if (!selectedCell) return;

  try {
    setLoading(true);

    const gradeData = {
      student_id: selectedCell.studentId,
      date: selectedCell.date,
      value: value,
      subject: selectedSubject,
      semester: selectedSemester
    };

    // Сохраняем оценку
    const gradeResponse = await apiRequest('/grades', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(gradeData)
    });

    if (gradeResponse.success) {
      // Обновляем локальное состояние
      const key = `${selectedCell.studentId}-${selectedCell.date}`;
      setGrades(prev => ({
        ...prev,
        [key]: {
          student_id: selectedCell.studentId,
          date: selectedCell.date,
          value
        }
      }));

      // Создаем уведомление для студента
      const student = students.find(s => s.id === selectedCell.studentId);
      if (student) {
        const notificationTitle = 'Новая оценка';
        const notificationBody = `Преподаватель ${user.full_name} поставил вам оценку "${value}" по предмету "${selectedSubject}"`;

        // Отправляем локальное уведомление
        await NotificationService.scheduleLocalNotification(
          notificationTitle,
          notificationBody
        );

        // Отправляем push-уведомление через сервер
        await NotificationService.registerOnServer(student.user_id);
      }

      Alert.alert('Успешно', 'Оценка сохранена');
    } else {
      throw new Error('Failed to save grade');
    }
  } catch (error) {
    console.error('Error setting grade:', error);
    Alert.alert('Ошибка', 'Не удалось сохранить оценку');
  } finally {
    setLoading(false);
    setModalVisible(false);
    setSelectedCell(null);
  }
};

  // Модальное окно выставления оценки
  const renderGradeModal = () => (
    <Modal
      animationType="slide"
      transparent={true}
      visible={modalVisible}
      onRequestClose={() => setModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Выставление оценки</Text>
          <View style={styles.gradesContainer}>
            {GRADES.map((grade) => (
              <TouchableOpacity
                key={grade}
                style={[
                  styles.gradeButton,
                  { backgroundColor: COLORS.grades[grade] }
                ]}
                onPress={() => handleGradeSelect(grade)}
              >
                <Text style={styles.gradeButtonText}>{grade}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setModalVisible(false)}
          >
            <Text style={styles.closeButtonText}>Отмена</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  if (!user || user.role !== 'teacher') return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Электронный журнал</Text>
      </View>

      <View style={styles.selectors}>
        {/* Выбор семестра */}
        <View style={styles.selectorContainer}>
          <Text style={styles.selectorLabel}>Семестр</Text>
          <DropDownPicker
            open={semesterOpen}
            value={selectedSemester}
            items={semesters}
            setOpen={setSemesterOpen}
            setValue={setSelectedSemester}
            setItems={setSemesters}
            placeholder="Выберите семестр"
            style={styles.dropdown}
            dropDownContainerStyle={styles.dropdownContainer}
            zIndex={3000}
          />
        </View>

        {/* Выбор предмета */}
        {selectedSemester && (
          <View style={[styles.selectorContainer, { zIndex: 2000 }]}>
            <Text style={styles.selectorLabel}>Дисциплина</Text>
            <DropDownPicker
              open={subjectOpen}
              value={selectedSubject}
              items={subjects}
              setOpen={setSubjectOpen}
              setValue={setSelectedSubject}
              setItems={setSubjects}
              placeholder="Выберите дисциплину"
              style={styles.dropdown}
              dropDownContainerStyle={styles.dropdownContainer}
              zIndex={2000}
            />
          </View>
        )}

        {/* Выбор группы */}
        {selectedSubject && (
          <View style={[styles.selectorContainer, { zIndex: 1000 }]}>
            <Text style={styles.selectorLabel}>Группа</Text>
            <DropDownPicker
              open={groupOpen}
              value={selectedGroup}
              items={groups}
              setOpen={setGroupOpen}
              setValue={setSelectedGroup}
              setItems={setGroups}
              placeholder="Выберите группу"
              style={styles.dropdown}
              dropDownContainerStyle={styles.dropdownContainer}
              zIndex={1000}
            />
          </View>
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color={COLORS.primary} />
      ) : selectedGroup ? (
        <JournalTable
          semester={selectedSemester}
          subject={selectedSubject}
          group={selectedGroup}
          lessons={lessons}
          students={students}
          grades={grades}
          onGradePress={handleGradePress}
        />
      ) : (
        <View style={styles.placeholder}>
          <Ionicons name="book-outline" size={64} color="#ccc" />
          <Text style={styles.placeholderText}>
            {!selectedSemester
              ? 'Выберите семестр'
              : !selectedSubject
              ? 'Выберите дисциплину'
              : 'Выберите группу'}
          </Text>
        </View>
      )}
      {renderGradeModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text.light,
  },
  selectors: {
    padding: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  selectorContainer: {
    marginBottom: 16,
  },
  selectorLabel: {
    fontSize: 14,
    color: COLORS.text.secondary,
    marginBottom: 8,
  },
  dropdown: {
    borderColor: COLORS.border,
    borderRadius: 8,
  },
  dropdownContainer: {
    borderColor: COLORS.border,
    borderRadius: 8,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  placeholderText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.text.secondary,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    minHeight: 300,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: 20,
    textAlign: 'center',
  },
  gradesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  gradeButton: {
    width: '18%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginBottom: 10,
  },
  gradeButtonText: {
    color: COLORS.text.light,
    fontSize: 20,
    fontWeight: '600',
  },
  closeButton: {
    backgroundColor: COLORS.background,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeButtonText: {
    color: COLORS.text.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.secondary,
  },
  nameCell: {
    width: 200,
    padding: 16,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: COLORS.secondary,
  },
  gradeCell: {
    width: 80,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: COLORS.secondary,
  },
  columnHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
  lessonType: {
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.secondary,
    backgroundColor: COLORS.card,
  },
  studentName: {
    fontSize: 14,
    color: COLORS.text.primary,
  },
  grade: {
    fontSize: 18,
    fontWeight: '600',
  },
  averageGrade: {
    color: COLORS.primary,
  },
  legend: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.secondary,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: COLORS.text.secondary,
  }
});