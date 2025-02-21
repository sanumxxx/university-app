from flask import Flask, request, jsonify, g
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy.exc import SQLAlchemyError
from exponent_server_sdk import PushClient, PushMessage, PushServerError, DeviceNotRegisteredError, PushTicketError

from sqlalchemy import func, or_, and_
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask import request

active_users = {}  # user_id: sid
sid_to_user_id = {} # sid: user_id  Mapping SID to user_id for faster lookup during disconnect
chat_rooms = {}

# Initialize Flask app
app = Flask(__name__)

socketio = SocketIO(app, cors_allowed_origins="*")

# Initialize SQLAlchemy
db = SQLAlchemy()

# Initialize Push Client
push_client = PushClient()


def create_app():
    """App factory function."""
    app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql+pymysql://sanumxxx:Yandex200515_@147.45.153.76:3306/timetable'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
        'pool_size': 10,
        'pool_recycle': 3600,
        'pool_pre_ping': True
    }
    CORS(app)
    db.init_app(app)
    return app


app = create_app()


@socketio.on('connect')
def handle_connect():
    print('Client connected with SID:', request.sid)


@socketio.on('disconnect')
def handle_disconnect():
    sid_to_remove = request.sid
    user_id_to_remove = sid_to_user_id.get(sid_to_remove)

    print(f'Client disconnected: SID={sid_to_remove}, UserID (if known)={user_id_to_remove}')

    if user_id_to_remove:
        if user_id_to_remove in active_users and active_users[user_id_to_remove] == sid_to_remove:
            del active_users[user_id_to_remove]
        del sid_to_user_id[sid_to_remove]
        print(f"User {user_id_to_remove} removed from active users due to disconnect (SID: {sid_to_remove}).")
    else:
        print(f"No user found for SID {sid_to_remove} in sid_to_user_id mapping during disconnect.")

    # Remove from all chat rooms
    rooms_to_leave = list(chat_rooms.keys())
    for chat_id in rooms_to_leave:
        if request.sid in chat_rooms[chat_id]:
            chat_rooms[chat_id].discard(request.sid)
            print(f'Client {request.sid} left chat room: {chat_id} due to disconnect.')
            if not chat_rooms[chat_id]:
                del chat_rooms[chat_id]


@socketio.on('join')
def handle_join(data):
    user_id = data.get('user_id')
    sid = request.sid
    if user_id:
        active_users[user_id] = sid
        sid_to_user_id[sid] = user_id
        print(f'User {user_id} joined with SID {sid}')
    else:
        print(f"Join event received without user_id from SID {sid}")


@socketio.on('join_chat')
def handle_join_chat(data):
    chat_id = str(data.get('chat_id'))
    sid = request.sid
    if chat_id:
        join_room(chat_id)
        if chat_id not in chat_rooms:
            chat_rooms[chat_id] = set()
        chat_rooms[chat_id].add(sid)
        print(f'Client {sid} joined chat room: {chat_id}')
    else:
        print(f"join_chat event received without chat_id from SID {sid}")


@socketio.on('leave_chat')
def handle_leave_chat(data):
    chat_id = str(data.get('chat_id'))
    sid = request.sid
    if chat_id:
        leave_room(chat_id)
        if chat_id in chat_rooms:
            chat_rooms[chat_id].discard(sid)
            if not chat_rooms[chat_id]:
                del chat_rooms[chat_id]
        print(f'Client {sid} left chat room: {chat_id}')
    else:
        print(f"leave_chat event received without chat_id from SID {sid}")


@socketio.on('mark_messages_read')
def handle_mark_messages_read(data):
    chat_id = data.get('chat_id')
    user_id = data.get('user_id')
    message_ids = data.get('message_ids', [])

    if not all([chat_id, user_id, message_ids]):
        print("mark_messages_read event received with missing data.")
        return

    try:
        # Обновляем сообщения в базе данных
        Message.query.filter(
            Message.id.in_(message_ids),
            Message.chat_id == chat_id,
            Message.sender_id != user_id
        ).update({Message.is_read: True}, synchronize_session=False)

        # Обновляем last_read_at для участника чата
        participant = ChatParticipant.query.filter_by(
            chat_id=chat_id,
            user_id=user_id
        ).first()

        if participant:
            participant.last_read_at = datetime.utcnow()

        db.session.commit()

        # Отправляем уведомление другим участникам
        emit('message_read', {
            'chat_id': chat_id,
            'user_id': user_id,
            'message_ids': message_ids,
            'timestamp': datetime.utcnow().isoformat()
        }, room=str(chat_id))

        # Отправляем уведомление об обновлении счетчика непрочитанных
        socketio.emit('unread_count_updated', {
            'user_id': user_id,
            'chat_id': chat_id
        }, broadcast=True)

    except Exception as e:
        print(f"Error in handle_mark_messages_read: {str(e)}")
        db.session.rollback()


# --- Models ---

class Notification(db.Model):
    """Notification model."""
    __tablename__ = 'notifications'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    body = db.Column(db.Text, nullable=False)
    type = db.Column(db.Enum('message', 'grade', 'system', name='notification_type'), nullable=False)
    reference_id = db.Column(db.Integer)
    payload = db.Column(db.JSON)
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    __table_args__ = (
        db.Index('idx_user_created', 'user_id', 'created_at'),
        db.Index('idx_user_type', 'user_id', 'type'),
    )


class Schedule(db.Model):
    """Schedule model."""
    __tablename__ = 'schedule'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    semester = db.Column(db.Integer, nullable=False)
    week_number = db.Column(db.Integer, nullable=False)
    group_name = db.Column(db.String(20), nullable=False)
    course = db.Column(db.Integer, nullable=False)
    faculty = db.Column(db.String(100))
    subject = db.Column(db.String(256), nullable=False)
    lesson_type = db.Column(db.String(20))
    subgroup = db.Column(db.Integer, default=0)
    date = db.Column(db.Date, nullable=False)
    time_start = db.Column(db.String(5), nullable=False)
    time_end = db.Column(db.String(5), nullable=False)
    weekday = db.Column(db.Integer, nullable=False)
    teacher_name = db.Column(db.String(100), server_default='')
    auditory = db.Column(db.String(256), server_default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    __table_args__ = (
        db.Index('idx_group_course', 'group_name', 'course'),
        db.Index('idx_teacher', 'teacher_name'),
    )


class User(db.Model):
    """User model."""
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    __table_args__ = (db.Index('idx_email', 'email'),)


class Student(db.Model):
    """Student model."""
    __tablename__ = 'students'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    full_name = db.Column(db.String(100), nullable=False)
    group_name = db.Column(db.String(20), nullable=False)
    course = db.Column(db.Integer, nullable=False)
    __table_args__ = (db.Index('idx_user_id', 'user_id'), db.Index('idx_group_course', 'group_name', 'course'))


class Teacher(db.Model):
    """Teacher model."""
    __tablename__ = 'teachers'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    full_name = db.Column(db.String(100), nullable=False)
    __table_args__ = (db.Index('idx_user_id', 'user_id'), db.Index('idx_full_name', 'full_name'))


class Message(db.Model):
    """Message model."""
    id = db.Column(db.Integer, primary_key=True)
    chat_id = db.Column(db.Integer, db.ForeignKey('chat.id'))
    sender_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    content = db.Column(db.Text)
    reply_to = db.Column(db.Integer, db.ForeignKey('message.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_read = db.Column(db.Boolean, default=False) # Added is_read column to Message model


class PushToken(db.Model):
    """PushToken model."""
    __tablename__ = 'push_tokens'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    token = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint('user_id', 'token', name='unique_user_token'),)


class Announcement(db.Model):
    """Announcement model."""
    id = db.Column(db.Integer, primary_key=True)
    teacher_id = db.Column(db.Integer, db.ForeignKey('teachers.id'))
    title = db.Column(db.String(200))
    content = db.Column(db.Text)
    recipient_type = db.Column(db.String(20))  # 'group' or 'all'
    recipient_id = db.Column(db.String(50), nullable=True)  # group_name
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_pinned = db.Column(db.Boolean, default=False)


class Grade(db.Model):
    """Grade model."""
    __tablename__ = 'grades'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    value = db.Column(db.String(2), nullable=False)  # '2', '3', '4', '5', 'н'
    subject = db.Column(db.String(256), nullable=False)
    semester = db.Column(db.String(20), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    __table_args__ = (db.Index('idx_student_date', 'student_id', 'date'),)


class Chat(db.Model):
    """Chat model."""
    id = db.Column(db.Integer, primary_key=True)
    chat_type = db.Column(db.String(20))  # 'personal' or 'group'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    subject = db.Column(db.String(100), nullable=True)  # For group chats


class ChatParticipant(db.Model):
    """ChatParticipant model."""
    __tablename__ = 'chat_participant'  # Corrected table name
    id = db.Column(db.Integer, primary_key=True)
    chat_id = db.Column(db.Integer, db.ForeignKey('chat.id'))
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_read_at = db.Column(db.DateTime, nullable=True)


# --- Helper Functions ---

@app.route('/api/push-token', methods=['POST'])
def register_push_token():
    """
    Регистрирует токен push-уведомлений для пользователя.  Удаляет старые токены.

    Тело запроса (JSON):
        - user_id (int, обязательно): ID пользователя.
        - token (str, обязательно): Токен push-уведомления.

    Возвращает:
        JSON ответ:
            - success (bool): True, если регистрация токена прошла успешно, False в противном случае.
            - error (str, опционально): Сообщение об ошибке, если регистрация не удалась.
    """
    data = request.json
    user_id = data.get('user_id')
    token = data.get('token')

    if not user_id or not token:
        return jsonify({'success': False, 'error': 'Отсутствуют необходимые поля user_id и token'}), 400

    try:
        # Удаляем старые токены для данного пользователя.  Это важно для того,
        # чтобы гарантировать, что у пользователя будет только один активный токен
        # (иначе уведомления будут дублироваться).
        PushToken.query.filter_by(user_id=user_id).delete()

        # Создаем новую запись токена
        push_token = PushToken(user_id=user_id, token=token)
        db.session.add(push_token)
        db.session.commit()

        # Отправка тестового уведомления при успешной регистрации токена
        send_push_notification(
            token=token,
            title="Уведомления активированы",
            body="Вы успешно подключили уведомления"
        )
        return jsonify({'success': True})


    except Exception as e:
        db.session.rollback()
        print(f"Ошибка регистрации push-токена: {str(e)}")  # Логируем подробную ошибку
        return jsonify({'success': False, 'error': str(e)}), 500


def send_push_notification(token, title, body):
    """Sends a push notification."""
    try:
        print(f"Sending push to token: {token}")
        response = push_client.publish(
            PushMessage(to=token, title=title, body=body, data={'type': 'message'}, sound="default", priority='high')
        )
        print(f"Push response: {response}")
        return response
    except PushServerError as exc:
        print(f"Push Server Error: {exc}")
        return None
    except DeviceNotRegisteredError:
        print("Device not registered")
        return None
    except PushTicketError as exc:
        print(f"Push Ticket Error: {exc}")
        return None
    except Exception as exc:
        print(f"Other push error: {exc}")
        return None


def get_user_name(user):
    """Gets the user's full name based on role."""
    if user is None: return 'Unknown'
    if user.role == 'student':
        student = Student.query.filter_by(user_id=user.id).first()
        return student.full_name if student else 'Unknown'
    teacher = Teacher.query.filter_by(user_id=user.id).first()
    return teacher.full_name if teacher else 'Unknown'


def get_last_message(chat_id):
    """Gets the last message in a chat."""
    message = Message.query.filter_by(chat_id=chat_id).order_by(Message.created_at.desc()).first()
    return {'content': message.content, 'created_at': message.created_at.isoformat(), 'is_read': message.is_read if message else False} if message else None


def get_unread_count(chat_id, user_id):
    """Counts unread messages in a chat for a user."""
    participant = ChatParticipant.query.filter_by(chat_id=chat_id, user_id=user_id).first()
    if not participant or not participant.last_read_at:
        return Message.query.filter_by(chat_id=chat_id, is_read=False).count() # Count only unread messages
    return Message.query.filter(Message.chat_id == chat_id, Message.created_at > participant.last_read_at, Message.is_read == False).count() # Count only unread messages


def notify_chat_participants(chat_id, message):
    """Modified notify_chat_participants to use SocketIO"""
    try:
        # Broadcast the new message to all clients in the chat room
        broadcast_to_chat(str(chat_id), 'new_message', {
            'chat_id': chat_id,
            'message': {
                'id': message.id,
                'sender_id': message.sender_id,
                'content': message.content,
                'reply_to': message.reply_to,
                'created_at': message.created_at.isoformat(),
                'is_read': False # Message is initially unread
            }
        })

        # Continue with regular notification logic
        participants = ChatParticipant.query.filter(
            ChatParticipant.chat_id == chat_id,
            ChatParticipant.user_id != message.sender_id
        ).all()

        sender = User.query.get(message.sender_id)
        sender_name = get_user_name(sender) if sender else 'Unknown'

        for participant in participants:
            notification = Notification(
                user_id=participant.user_id,
                title="Новое сообщение",
                body=f"Сообщение от {sender_name}: {message.content[:100]}",
                type='message',
                reference_id=message.id,
                payload={
                    'chat_id': chat_id,
                    'sender_name': sender_name,
                    'message_preview': message.content[:100]
                }
            )
            db.session.add(notification)

            tokens = PushToken.query.filter_by(user_id=participant.user_id).all()
            for token in tokens:
                send_push_notification(
                    token=token.token,
                    title=f"Новое сообщение от {sender_name}",
                    body=message.content[:100]
                )

        db.session.commit()
    except Exception as e:
        print(f"Error in notify_chat_participants: {str(e)}")
        db.session.rollback()


def get_unique_teachers():
    """Gets unique teacher names."""
    return db.session.query(Schedule.teacher_name).distinct().filter(Schedule.teacher_name != '').all()


def get_unique_groups():
    """Gets unique group names and courses."""
    return db.session.query(Schedule.group_name, Schedule.course).distinct().all()


def get_chat_partner_name(chat_id, user_id):
    """
    Для личного чата возвращает полное имя второго участника.

    Args:
        chat_id (int): ID чата.
        user_id (int): ID текущего пользователя.

    Returns:
        str или None: Полное имя собеседника или None, если не найдено или если чат не личный.
    """
    print(f"get_chat_partner_name: chat_id={chat_id}, user_id={user_id}") # ЛОГ
    chat = Chat.query.get(chat_id)
    if chat is None: # Добавить проверку на случай, если чат не найден
        print(f"Чат с ID {chat_id} не найден!") # ЛОГ
        return None
    if chat.chat_type != 'personal':
        print(f"Чат {chat_id} не личный, тип: {chat.chat_type}") # ЛОГ
        return None

    participant = ChatParticipant.query.filter(
        ChatParticipant.chat_id == chat_id,
        ChatParticipant.user_id != user_id  # Находим второго участника, не текущего пользователя
    ).first()
    if participant is None: # Добавить проверку на случай, если участник не найден
        print(f"Второй участник для чата {chat_id} и пользователя {user_id} не найден!") # ЛОГ
        return None

    if participant:
        partner_user = User.query.get(participant.user_id)
        if partner_user:
            partner_name = get_user_name(partner_user)
            print(f"Для чата {chat_id} и пользователя {user_id} партнер: {partner_name}") # ЛОГ
            return partner_name
        else:
            print(f"Пользователь с ID {participant.user_id} не найден!") # ЛОГ
            return None
    return None


# --- API Endpoints ---
# --- Authentication ---
@app.route('/api/auth/register', methods=['POST'])
def register():
    """Registers a new user."""
    data = request.json
    print("Request data for registration:", data)

    required_fields = ['email', 'password', 'role', 'full_name']
    if not all(field in data for field in required_fields):
        error_message = "Not all required fields are filled. Required: " + ", ".join(required_fields)
        print(f"Registration error: {error_message}")
        return jsonify({'success': False, 'error': error_message}), 400

    if User.query.filter_by(email=data['email']).first():
        error_message = "Email is already taken."
        print(f"Registration error: {error_message} - Email: {data['email']}")
        return jsonify({'success': False, 'error': error_message}), 400

    try:
        user = User(email=data['email'], password_hash=generate_password_hash(data['password']), role=data['role'])
        db.session.add(user)
        db.session.flush()

        if data['role'] == 'student':
            if not all(field in data for field in ['group_name', 'course']):
                db.session.rollback()
                error_message = "Not all student fields are filled (group_name, course)."
                print(f"Registration error: {error_message}")
                return jsonify({'success': False, 'error': error_message}), 400
            if not Schedule.query.filter_by(group_name=data['group_name'], course=data['course']).first():
                db.session.rollback()
                error_message = "Specified group not found in schedule."
                print(f"Registration error: {error_message} - Group: {data['group_name']}, Course: {data['course']}")
                return jsonify({'success': False, 'error': error_message}), 400

            student = Student(user_id=user.id, full_name=data['full_name'], group_name=data['group_name'],
                              course=data['course'])
            db.session.add(student)

        elif data['role'] == 'teacher':
            if 'full_name' not in data:
                db.session.rollback()
                error_message = "Teacher name not specified for teacher role."
                print(f"Registration error: {error_message}")
                return jsonify({'success': False, 'error': error_message}), 400

            if not Schedule.query.filter_by(teacher_name=data['full_name']).first():
                db.session.rollback()
                error_message = "Teacher not found in schedule.";
                print(f"Registration error: {error_message} - Teacher Name: {data['full_name']}")
                return jsonify({'success': False, 'error': error_message}), 400

            teacher = Teacher(user_id=user.id, full_name=data['full_name'])
            db.session.add(teacher)
        else:
            db.session.rollback()
            error_message = "Invalid user role specified."
            print(f"Registration error: {error_message} - Role: {data['role']}")
            return jsonify({'success': False, 'error': error_message}), 400

        db.session.commit()
        print(f"User registered successfully: Email - {data['email']}, Role - {data['role']}")
        return jsonify({'success': True})

    except Exception as e:
        db.session.rollback()
        error_message = str(e)
        print(f"Error during registration: {error_message}")
        return jsonify({'success': False, 'error': error_message}), 400


@app.route('/api/auth/login', methods=['POST'])
def login():
    """Logs in a user."""
    data = request.json
    if not all(field in data for field in ['email', 'password']):
        return jsonify({'success': False, 'error': 'Not all fields are filled'}), 400
    user = User.query.filter_by(email=data['email']).first()
    if user and check_password_hash(user.password_hash, data['password']):
        user_data = {'id': user.id, 'email': user.email, 'role': user.role}
        if user.role == 'student':
            student = Student.query.filter_by(user_id=user.id).first()
            user_data.update(
                {'full_name': student.full_name, 'group_name': student.group_name, 'course': student.course})
        else:
            teacher = Teacher.query.filter_by(user_id=user.id).first()
            user_data['full_name'] = teacher.full_name
        return jsonify({'success': True, 'user': user_data})
    return jsonify({'success': False, 'error': 'Invalid email or password'}), 401


# --- Schedule ---

@app.route('/api/schedule', methods=['GET'])
def get_schedule():
    """Gets the schedule."""
    group_name = request.args.get('group')
    teacher_name = request.args.get('teacher')
    course = request.args.get('course', type=int)
    query = Schedule.query
    if group_name: query = query.filter_by(group_name=group_name)
    if teacher_name: query = query.filter_by(teacher_name=teacher_name)
    if course: query = query.filter_by(course=course)
    schedule = query.all()
    return jsonify([{
        'id': s.id, 'subject': s.subject, 'lesson_type': s.lesson_type,
        'date': s.date.strftime('%Y-%m-%d'), 'time_start': s.time_start,
        'time_end': s.time_end, 'weekday': s.weekday,
        'teacher_name': s.teacher_name, 'auditory': s.auditory,
        'group_name': s.group_name, 'course': s.course, 'subgroup': s.subgroup
    } for s in schedule])


@app.route('/api/teacher/subjects', methods=['GET'])
def get_teacher_subjects():
    """Gets subjects taught by a teacher."""
    teacher_name = request.args.get('teacher_name')
    semester = request.args.get('semester', type=int)
    query = db.session.query(Schedule.semester, Schedule.subject, Schedule.group_name).filter(
        Schedule.teacher_name == teacher_name).distinct()
    if semester:
        query = query.filter(Schedule.semester == semester)
    results = query.all()
    semesters = {}
    for row in results:
        if row.semester not in semesters: semesters[row.semester] = {}
        if row.subject not in semesters[row.semester]: semesters[row.semester][row.subject] = []
        semesters[row.semester][row.subject].append(row.group_name)
    return jsonify(semesters)


# --- Chat ---

@app.route('/api/chats/personal', methods=['POST'])
def create_personal_chat():
    """Creates a personal chat."""
    try:
        data = request.json
        student_id = data.get('student_id')
        teacher_id = data.get('teacher_id')

        existing_chat = Chat.query.filter(
            Chat.chat_type == 'personal',
            Chat.id.in_(
                db.session.query(ChatParticipant.chat_id)
                .filter(ChatParticipant.user_id.in_([student_id, teacher_id]))
                .group_by(ChatParticipant.chat_id)
                .having(func.count() == 2)
            )
        ).first()

        if existing_chat:
            return jsonify({'success': True, 'chat_id': existing_chat.id, 'message': 'Chat already exists'})

        chat = Chat(chat_type='personal')
        db.session.add(chat)
        db.session.commit()
        participants = [
            ChatParticipant(chat_id=chat.id, user_id=student_id),
            ChatParticipant(chat_id=chat.id, user_id=teacher_id)
        ]
        db.session.bulk_save_objects(participants)
        db.session.commit()
        return jsonify({'success': True, 'chat_id': chat.id})
    except Exception as e:
        db.session.rollback()
        print(f"Error creating personal chat: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/chats', methods=['GET'])
def get_user_chats():
    """
    Возвращает список чатов для конкретного пользователя.

    Query Parameters:
        - user_id (int, required): User ID.
        - type (str, optional): Chat type to filter by ('personal', 'group', 'all').

    Returns:
        JSON response:
            - success (bool): True if successful, False otherwise.
            - chats (list, optional): List of chat objects.
            - error (str, optional): Error message if retrieval fails.
    """
    try:
        user_id = request.args.get('user_id', type=int)
        chat_type = request.args.get('type')  # personal/group/all

        if not user_id:
            return jsonify({
                'success': False,
                'error': 'User ID is required'
            }), 400

        query = Chat.query.join(ChatParticipant).filter(
            ChatParticipant.user_id == user_id
        )

        if chat_type and chat_type != 'all':
            query = query.filter(Chat.chat_type == chat_type)

        chats = query.order_by(Chat.updated_at.desc()).all()
        print(f"get_user_chats: Fetched {len(chats)} chats for user_id={user_id}, type={chat_type}") # Log fetched chats

        # Create the chat data list, including chatPartnerName
        chat_data = []
        for chat in chats:
            chat_info = {
                'id': chat.id,
                'type': chat.chat_type,
                'subject': chat.subject,  # This will be None for personal chats
                'created_at': chat.created_at.isoformat(),
                'updated_at': chat.updated_at.isoformat(),
                'last_message': get_last_message(chat.id),
                'unread_count': get_unread_count(chat.id, user_id),
                'chatPartnerName': get_chat_partner_name(chat.id, user_id) if chat.chat_type == 'personal' else None
            }
            chat_data.append(chat_info)
        print(f"get_user_chats: Returning {len(chat_data)} chat data entries.") # Log returned chat data

        return jsonify({
            'success': True,
            'chats': chat_data  # Return the list with chat partner names
        })

    except Exception as e:
        print(f"Error getting user chats: {str(e)}")  # Логирование подробной ошибки
        return jsonify({
            'success': False,
            'error': 'Failed to get chats'
        }), 500


@app.route('/api/announcements/<int:announcement_id>', methods=['GET'])
def get_announcement(announcement_id):
    """
    Retrieves a single announcement by its ID.

    Args:
        announcement_id (int): The ID of the announcement.

    Returns:
        JSON response:
          - success (bool): True if the announcement is found, False otherwise.
          - announcement (dict, optional): The announcement data if found.
          - error (str, optional): An error message if the announcement is not found or another error occurs.
    """
    try:
        announcement = Announcement.query.get_or_404(announcement_id)  # Get announcement or return 404 if not found
        return jsonify({
            'success': True,
            'announcement': {
                'id': announcement.id,
                'title': announcement.title,
                'content': announcement.content,
                'teacher_id': announcement.teacher_id,
                'recipient_type': announcement.recipient_type,
                'recipient_id': announcement.recipient_id,
                'is_pinned': announcement.is_pinned,
                'created_at': announcement.created_at.isoformat()
            }
        })
    except Exception as e:
        print(f"Error fetching announcement: {str(e)}")  # Log the error
        return jsonify({'success': False, 'error': str(e)}), 500  # Return a 500 error




@app.route('/api/chats/<int:chat_id>', methods=['GET'])
def get_chat_info(chat_id):
    """Gets chat info by ID."""
    try:
        chat = Chat.query.get_or_404(chat_id)
        participants = ChatParticipant.query.filter_by(chat_id=chat_id).all()
        users = []
        for p in participants:
            user = User.query.get(p.user_id)
            if user:
                if user.role == 'student':
                    student = Student.query.filter_by(user_id=user.id).first()
                    if student:
                        users.append({'id': p.id, 'user_id': user.id, 'full_name': student.full_name})
                else:  # teacher
                    teacher = Teacher.query.filter_by(user_id=user.id).first()
                    if teacher:
                        users.append({'id': p.id, 'user_id': user.id, 'full_name': teacher.full_name})
        return jsonify({'success': True, 'chat': {
            'id': chat.id,
            'type': chat.chat_type,
            'subject': chat.subject,
            'participants': users
        }})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/chats/<int:chat_id>/messages', methods=['GET'])
def get_chat_messages(chat_id):
    """Gets chat messages with pagination."""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        messages_pagination = Message.query.filter_by(chat_id=chat_id).order_by(Message.created_at.desc()).paginate(page=page,
                                                                                                         per_page=per_page,
                                                                                                         error_out=False)
        messages = messages_pagination.items
        return jsonify({
            'success': True,
            'messages': [{'id': m.id, 'sender_id': m.sender_id, 'content': m.content, 'reply_to': m.reply_to,
                          'created_at': m.created_at.isoformat(), 'is_read': m.is_read} for m in messages], # Include is_read status
            'total': messages_pagination.total,
            'pages': messages_pagination.pages,
            'current_page': messages_pagination.page
        })
    except Exception as e:
        print(f"Error in get_chat_messages: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/chats/<int:chat_id>/messages', methods=['POST'])
def send_message(chat_id):
    """Sends a message to a chat."""
    try:
        data = request.get_json()
        message = Message(
            chat_id=chat_id,
            sender_id=data['sender_id'],
            content=data['content'],
            reply_to=data.get('reply_to'),
            is_read=False # New messages are initially unread
        )
        db.session.add(message)
        chat = Chat.query.get(chat_id)
        chat.updated_at = datetime.utcnow()
        db.session.commit()

        # Отправляем уведомление другим участникам
        notify_chat_participants(chat_id, message)

        return jsonify({
            'success': True,
            'message_id': message.id  # Возвращаем ID созданного сообщения
        })
    except Exception as e:
        db.session.rollback()
        print(f"Error sending message: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/chats/group', methods=['POST'])
def create_group_chat():
    """Creates a group chat."""
    try:
        data = request.json
        teacher_id = data['teacher_id']
        group_name = data['group_name']
        subject = data['subject']
        if not teacher_id or not group_name or not subject:
            return jsonify({'success': False, 'error': 'Missing required data'}), 400
        chat = Chat(chat_type='group', subject=subject)
        db.session.add(chat)
        db.session.commit()
        db.session.add(ChatParticipant(chat_id=chat.id, user_id=teacher_id))
        students = Student.query.filter_by(group_name=group_name).all()
        participants = [ChatParticipant(chat_id=chat.id, user_id=student.user_id) for student in students]
        db.session.bulk_save_objects(participants)
        db.session.commit()
        return jsonify({'success': True, 'chat_id': chat.id})
    except Exception as e:
        db.session.rollback()
        print(f"Error creating group chat: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to create group chat'}), 500


# --- Announcements ---

@app.route('/api/announcements', methods=['POST'])
def create_announcement():
    """
    Создает новое объявление и отправляет уведомления получателям.

    Тело запроса (JSON):
        - teacher_id (int, обязательно): ID преподавателя, создающего объявление.
        - title (str, обязательно): Заголовок объявления.
        - content (str, обязательно): Содержание объявления.
        - recipient_type (str, обязательно): Тип получателя ('group', 'all', or 'individual').
        - recipient_id (str, опционально): ID получателя (group_name if recipient_type is 'group',
                                           user_id if recipient_type is 'individual').  Required if recipient_type is NOT 'all'.
        - is_pinned (bool, опционально): Указывает, является ли объявление закрепленным (по умолчанию: False).

    Возвращает:
        JSON ответ:
            - success (bool): True, если создание объявления прошло успешно, False в противном случае.
            - announcement_id (int, опционально): ID созданного объявления.
            - error (str, опционально): Сообщение об ошибке, если создание не удалось.
    """
    try:
        data = request.json
        teacher_id = data['teacher_id']
        title = data['title']
        content = data['content']
        recipient_type = data['recipient_type']
        recipient_id = data.get('recipient_id')  # Can be None if recipient_type is 'all'
        is_pinned = data.get('is_pinned', False)  # Default to False if not provided

        # --- Input Validation (Crucial) ---
        if not teacher_id or not title or not content or not recipient_type:
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400

        if recipient_type not in ('group', 'all', 'individual'):
            return jsonify(
                {'success': False, 'error': 'Invalid recipient_type.  Must be "group", "all", or "individual".'}), 400

        if recipient_type != 'all' and not recipient_id:
            return jsonify(
                {'success': False, 'error': 'recipient_id is required when recipient_type is not "all".'}), 400
        # --- End Input Validation ---

        announcement = Announcement(
            teacher_id=teacher_id,
            title=title,
            content=content,
            recipient_type=recipient_type,
            recipient_id=recipient_id,
            is_pinned=is_pinned
        )
        db.session.add(announcement)
        db.session.commit()  # Commit to get the announcement.id

        # --- Determine Recipients and Send Notifications ---
        if recipient_type == 'all':
            # Send to ALL users
            users = User.query.all()

        elif recipient_type == 'group':
            # Send to all students in a specific group
            students = Student.query.filter_by(group_name=recipient_id).all()
            users = [User.query.get(student.user_id) for student in students if student.user_id]  # Get User objects

        elif recipient_type == 'individual':
            # Send to a specific user (by user_id)
            user = User.query.get(recipient_id)
            if not user:
                db.session.rollback()  # Rollback the announcement creation
                return jsonify({'success': False, 'error': f'User with id {recipient_id} not found.'}), 404
            users = [user]
        # Added to handle edge case.  Shouldn't normally happen due to input validation.
        else:
            db.session.rollback()
            return jsonify({'success': False, 'error': 'Invalid recipient_type.'}), 400

        # Create notifications and send push notifications
        for user in users:
            if user is None:  # defensive programming
                print("WARNING: user is None in announcement recipients. Skipping.")
                continue

            notification = Notification(
                user_id=user.id,
                title="Новое объявление",
                body=f"{title}: {content[:100]}",  # Limit body length for notification
                type='message',  # Or another appropriate type
                reference_id=announcement.id  # Link the notification to the announcement
            )
            db.session.add(notification)

            # Get push tokens for the user and send notifications.
            tokens = PushToken.query.filter_by(user_id=user.id).all()
            for token in tokens:
                send_push_notification(token=token.token, title="Новое объявление", body=f"{title}: {content[:100]}")

        db.session.commit()  # Commit *after* creating all notifications and sending pushes.

        return jsonify({'success': True, 'announcement_id': announcement.id})

    except Exception as e:
        db.session.rollback()  # Important: Rollback changes if *any* error occurs
        print(f"Error creating announcement: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/announcements', methods=['GET'])
def get_announcements():
    """
    Возвращает список объявлений для пользователя, с учетом его роли.

    Параметры запроса:
        - user_id (int, обязательно): ID пользователя.

    Возвращает:
        JSON ответ:
            - success (bool): True, если получение прошло успешно, False в противном случае.
            - announcements (list, опционально): Список объектов объявлений.
            - error (str, опционально): Сообщение об ошибке, если получение не удалось.
    """
    try:
        user_id = request.args.get('user_id', type=int)  # Ожидается, что user_id будет целым числом
        user = User.query.get(user_id)

        if user.role == 'student':
            student = Student.query.filter_by(user_id=user_id).first()
            announcements = Announcement.query.filter(
                or_(
                    Announcement.recipient_type == 'all',
                    and_(
                        Announcement.recipient_type == 'group',
                        Announcement.recipient_id == student.group_name
                    )
                )
            ).order_by(
                Announcement.is_pinned.desc(),  # Сначала закрепленные объявления
                Announcement.created_at.desc()  # Затем отсортированные по дате создания (последние сверху)
            ).all()
        else:  # Для преподавателя показываем его объявления
            teacher = Teacher.query.filter_by(user_id=user_id).first()
            announcements = Announcement.query.filter_by(
                teacher_id=teacher.id
            ).order_by(
                Announcement.is_pinned.desc(),
                Announcement.created_at.desc()
            ).all()

        return jsonify({
            'success': True,
            'announcements': [{
                'id': ann.id,
                'title': ann.title,
                'content': ann.content,
                'teacher_id': ann.teacher_id,
                'recipient_type': ann.recipient_type,
                'recipient_id': ann.recipient_id,
                'is_pinned': ann.is_pinned,
                'created_at': ann.created_at.isoformat()
            } for ann in announcements]
        })

    except Exception as e:
        print(f"Ошибка получения объявлений: {str(e)}")  # Логирование подробной ошибки
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/students', methods=['GET'])
def get_students():
    """
    Получает список студентов с возможностью фильтрации по имени и группе.
    """
    search = request.args.get('search', '').lower()
    group = request.args.get('group', '')

    query = Student.query

    if group:
        query = query.filter_by(group_name=group)
    if search:
        query = query.filter(Student.full_name.ilike(f'%{search}%'))

    students = query.all()
    return jsonify([{
        'id': s.id,
        'full_name': s.full_name,
        'group_name': s.group_name
    } for s in students])


@app.route('/api/teachers', methods=['GET'])
def get_teachers():
    """
    Возвращает список преподавателей.
    Позволяет фильтровать по имени (search).
    """
    search_term = request.args.get('search', default="", type=str).lower()
    query = Teacher.query

    if search_term:
        query = query.filter(Teacher.full_name.ilike(f'%{search_term}%'))

    teachers = query.all()

    result = []
    for teacher in teachers:
        result.append({
            'id': teacher.id,
            'full_name': teacher.full_name
        })
    return jsonify(result)


@app.route('/api/groups', methods=['GET'])
def get_groups():
    """
    Возвращает список групп с возможностью фильтрации по имени.
    ... (описание функции) ...
    """
    search_term = request.args.get('search', default="", type=str).lower()
    query = db.session.query(Schedule.group_name, Schedule.course).distinct()

    print(f"Запрос API /api/groups: search_term = '{search_term}'") # ЛОГ: Полученный поисковый запрос

    if search_term:
        query = query.filter(Schedule.group_name.ilike(f'%{search_term}%'))
        print(f"Фильтрация запроса: WHERE Schedule.group_name ILIKE '%{search_term}%'") # ЛОГ: Фильтр

    groups = query.all()

    print(f"Количество найденных групп: {len(groups)}") # ЛОГ: Кол-во групп
    # for g in groups: # Раскомментируйте для логов имен групп (если немного)
    #     print(f"Группа: {g[0]}, Курс: {g[1]}")

    return jsonify([{'group_name': g[0], 'course': g[1], 'id': i + 1} for i, g in enumerate(groups)])


@app.route('/api/available-teachers', methods=['GET'])
def get_available_teachers():
    """
    Возвращает список преподавателей, доступных для регистрации, то есть тех,
    чьи имена есть в расписании, но кто еще не зарегистрирован в системе как преподаватели.

    Возвращает:
        JSON response:
            - success (bool): True, если запрос выполнен успешно, False в противном случае.
            - teachers (list, optional): Список полных имен доступных преподавателей.
            - error (str, optional): Сообщение об ошибке, если запрос не удался.
    """
    try:
        # Получаем список всех уникальных имен преподавателей из таблицы schedule
        all_teachers_query = db.session.query(Schedule.teacher_name).distinct().filter(Schedule.teacher_name != '')
        all_teachers_results = all_teachers_query.all()
        all_teachers_in_schedule = {row[0] for row in all_teachers_results if
                                    row[0]}  # Преобразуем в set для эффективности

        # Получаем список полных имен всех зарегистрированных преподавателей из таблицы teachers
        registered_teachers_query = db.session.query(Teacher.full_name).all()
        registered_teachers_names = {row[0] for row in registered_teachers_query if
                                     row[0]}  # Преобразуем в set для эффективности

        # Находим преподавателей, которые есть в расписании, но не зарегистрированы
        available_teachers = list(all_teachers_in_schedule - registered_teachers_names)
        available_teachers.sort()  # Сортируем список имен для порядка

        return jsonify({
            'success': True,
            'teachers': available_teachers
        })

    except Exception as e:
        error_message = str(e)
        print(f"Error in get_available_teachers: {error_message}")  # Логирование ошибки на сервере
        return jsonify({
            'success': False,
            'error': error_message  # Возвращаем сообщение об ошибке в JSON
        }), 500  # Возвращаем код ошибки 500 (Internal Server Error)


@app.route('/api/notifications/mark-read', methods=['POST'])
def mark_notifications_read():
    """Отмечает уведомления как прочитанные."""
    data = request.json
    user_id = data.get('user_id')
    notification_ids = data.get('notification_ids', [])

    if not user_id or not notification_ids:
        return jsonify({'success': False, 'error': 'Missing required fields'}), 400
    try:
        Notification.query.filter(Notification.id.in_(notification_ids), Notification.user_id == user_id).update(
            {Notification.is_read: True}, synchronize_session=False)
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        print(f"Ошибка при запросе mark_notifications_read: {e}")
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/notifications', methods=['GET'])
def get_notifications():
    """Получает уведомления пользователя."""
    user_id = request.args.get('user_id', type=int)
    notification_type = request.args.get('type')
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    if not user_id:
        return jsonify({'success': False, 'error': 'User ID required'}), 400

    try:
        query = Notification.query.filter_by(user_id=user_id)
        if notification_type:
            query = query.filter_by(type=notification_type)

        notifications = query.order_by(Notification.created_at.desc()).paginate(page=page, per_page=per_page)
        notifications_list = [{
            'id': n.id, 'title': n.title, 'body': n.body, 'type': n.type,
            'reference_id': n.reference_id, 'payload': n.payload,
            'is_read': n.is_read, 'created_at': n.created_at.isoformat()
        } for n in notifications.items]

        return jsonify({
            'success': True, 'notifications': notifications_list,
            'total': notifications.total, 'pages': notifications.pages,
            'current_page': notifications.page
        })
    except Exception as e:
        print(f"Error getting notifications: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 400


# ----------------------------------------------------------------------
# API Endpoints - Тестирование и отладка
# ----------------------------------------------------------------------

@app.route('/api/test', methods=['GET'])
def test():
    """
    Тестовый endpoint для проверки работоспособности сервера.

    Возвращает:
        JSON ответ:
            - message (str): Сообщение 'Server is working!'.
    """
    return jsonify({'message': 'Server is working!'})


@app.route('/api/test-notification', methods=['POST'])
def test_notification():
    """
    Тестовый endpoint для отправки push-уведомления конкретному пользователю.

    Тело запроса (JSON):
        - user_id (int, обязательно): ID пользователя, которому нужно отправить тестовое уведомление.

    Возвращает:
        JSON ответ:
            - success (bool): True, если отправка тестового уведомления прошла успешно, False в противном случае.
            - message (str, опционально): Сообщение 'Test notification sent'.
            - ticket (str, опционально): Детали ответа от сервера push-уведомлений.
            - error (str, опционально): Сообщение об ошибке, если отправка не удалась.
    """
    try:
        data = request.json
        user_id = data.get('user_id')

        if not user_id:
            return jsonify({'success': False, 'error': 'ID пользователя обязателен'}), 400

        token_record = PushToken.query.filter_by(user_id=user_id).first()

        if not token_record:
            return jsonify({'success': False, 'error': 'Push-токен для этого пользователя не найден'}), 404

        result = send_push_notification(
            token=token_record.token,
            title="Тестовое уведомление",
            body="Это тестовое уведомление"
        )

        if result:
            return jsonify({
                'success': True,
                'message': 'Тестовое уведомление отправлено',
                'ticket': str(result)
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Не удалось отправить уведомление'
            }), 500

    except Exception as e:
        print(f"Ошибка в тестовом уведомлении: {str(e)}")  # Логирование подробной ошибки
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/chats/<int:chat_id>/mark-read', methods=['POST'])
def mark_chat_as_read(chat_id):
    try:
        data = request.get_json()
        if not data or 'user_id' not in data:
            return jsonify({
                'success': False,
                'error': 'user_id is required in request body'
            }), 400

        user_id = data['user_id']
        current_time = datetime.utcnow()

        # Проверяем существование чата и участника
        chat = Chat.query.get(chat_id)
        if not chat:
            return jsonify({
                'success': False,
                'error': 'Chat not found'
            }), 404

        participant = ChatParticipant.query.filter_by(
            chat_id=chat_id,
            user_id=user_id
        ).first()

        if not participant:
            return jsonify({
                'success': False,
                'error': 'User is not a participant in this chat'
            }), 404

        # Обновляем last_read_at
        participant.last_read_at = current_time

        # Получаем и обновляем непрочитанные сообщения
        messages_to_update = Message.query.filter(
            Message.chat_id == chat_id,
            Message.created_at <= current_time,
            Message.sender_id != user_id,
            Message.is_read == False
        ).all()

        message_ids = []
        if messages_to_update:
            for message in messages_to_update:
                message.is_read = True
                message_ids.append(message.id)

        try:
            db.session.commit()

            # Отправляем WebSocket уведомление об обновлении статуса сообщений
            if message_ids:
                socketio.emit('message_read', {
                    'chat_id': chat_id,
                    'user_id': user_id,
                    'message_ids': message_ids,
                    'timestamp': current_time.isoformat()
                }, room=str(chat_id))

            # Отправляем WebSocket уведомление об обновлении счетчика непрочитанных
            socketio.emit('unread_count_updated', {
                'user_id': user_id,
                'chat_id': chat_id
            }, broadcast=True)

            return jsonify({
                'success': True,
                'message_ids': message_ids,
                'timestamp': current_time.isoformat()
            })

        except Exception as e:
            print(f"Error in database commit: {str(e)}")
            db.session.rollback()
            return jsonify({
                'success': False,
                'error': 'Failed to update message status'
            }), 500

    except Exception as e:
        print(f"Error marking chat as read: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

def broadcast_to_chat(chat_id, event_type, data):
    """Broadcasts an event to all clients in a chat room"""
    try:
        socketio.emit(event_type, data, room=str(chat_id))
    except Exception as e:
        print(f"Error broadcasting to chat {chat_id}: {str(e)}")

# Also add this migration to create the last_read_at column if it doesn't exist
def add_last_read_at_column():
    with app.app_context():
        try:
            # Check if column exists
            with db.engine.connect() as conn:
                result = conn.execute("""
                    SELECT COUNT(*)
                    FROM information_schema.columns
                    WHERE table_name='chat_participant'
                    AND column_name='last_read_at';
                """)
                if result.scalar() == 0:
                    # Add the column
                    conn.execute("""
                        ALTER TABLE chat_participant
                        ADD COLUMN last_read_at TIMESTAMP;
                    """)
                    print("Added last_read_at column to chat_participant table")
        except Exception as e:
            print(f"Error adding last_read_at column: {e}")


# ----------------------------------------------------------------------
# Запуск приложения
# ----------------------------------------------------------------------

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        add_last_read_at_column() # Run migration on startup
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)