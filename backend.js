import { firebaseConfig } from './config.js';

export const onlineConfigured = Boolean(firebaseConfig?.apiKey && firebaseConfig?.projectId && firebaseConfig?.appId);
const sdkUrl = 'https://www.gstatic.com/firebasejs/12.5.0/';
const clients = new Map();
let sdk;

function withTimeout(promise) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('수업 서버 응답을 기다리는 중 시간이 초과됐습니다.')), 10000);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function client(role) {
  if (!onlineConfigured) throw new Error('Firebase 연결이 설정되지 않았습니다.');
  sdk ??= Promise.all([
    import(sdkUrl + 'firebase-app.js'),
    import(sdkUrl + 'firebase-auth.js'),
    import(sdkUrl + 'firebase-firestore.js'),
  ]).catch(error => { sdk = undefined; throw error; });
  const [appApi, authApi, db] = await sdk;
  if (!clients.has(role)) {
    const app = appApi.initializeApp(firebaseConfig, role);
    clients.set(role, { auth: authApi.getAuth(app), authApi, db, firestore: db.getFirestore(app) });
  }
  const connection = clients.get(role);
  await connection.auth.authStateReady();
  return connection;
}

let studentSignIn;
async function studentClient() {
  const connection = await client('student');
  if (!connection.auth.currentUser) {
    studentSignIn ??= connection.authApi.signInAnonymously(connection.auth).finally(() => { studentSignIn = undefined; });
    await studentSignIn;
  }
  if (!connection.auth.currentUser.isAnonymous) throw new Error('학생 인증 정보를 확인할 수 없습니다.');
  return connection;
}

export function joinClass(code, name) {
  return withTimeout((async () => {
    const { auth, db, firestore } = await studentClient();
    const studentId = auth.currentUser.uid;
    const ref = db.doc(firestore, 'classes', code, 'students', studentId);
    try {
      return await db.runTransaction(firestore, async transaction => {
        const existing = await transaction.get(ref);
        if (existing.exists()) {
          return { sessionId: code, playerId: studentId, name: existing.data().name };
        }
        transaction.set(ref, { sessionId: code, studentId, name, status: 'playing', joinedAt: db.serverTimestamp() });
        return { sessionId: code, playerId: studentId, name };
      });
    } catch (error) {
      if (error.code === 'permission-denied') throw new Error('수업 참여 코드를 확인해 주세요.');
      throw error;
    }
  })());
}

export async function studentIdentity() {
  const { auth } = await withTimeout(client('student'));
  return auth.currentUser?.isAnonymous ? auth.currentUser.uid : null;
}

export async function switchStudent() {
  const { auth, authApi } = await withTimeout(client('student'));
  await authApi.signOut(auth);
}

function publicAnswer(name, handover, submittedAt) {
  return { name, education: handover.education, reason: handover.reason, submittedAt };
}

export function savePlayer(entry, payload) {
  return withTimeout((async () => {
    const { auth, db, firestore } = await studentClient();
    if (auth.currentUser.uid !== entry.playerId) throw new Error('이 게임을 시작한 브라우저의 학생 인증이 필요합니다.');
    const ref = db.doc(firestore, 'classes', entry.sessionId, 'students', entry.playerId);
    const answer = db.doc(firestore, 'classes', entry.sessionId, 'answers', entry.playerId);
    return db.runTransaction(firestore, async transaction => {
      const current = await transaction.get(ref);
      if (!current.exists()) throw new Error('수업 참여 기록을 찾을 수 없습니다.');
      const student = current.data();
      if (student.status === 'submitted') {
        return student.submissionId === entry.runId ? 'submitted' : 'duplicate';
      }
      const submittedAt = db.serverTimestamp();
      transaction.update(ref, { ...payload, status: 'submitted', submissionId: entry.runId, submittedAt });
      transaction.set(answer, publicAnswer(student.name, payload.handover, submittedAt));
      return 'submitted';
    });
  })());
}

export async function watchAnswers(entry, onChange, onError) {
  const { auth, db, firestore } = await withTimeout(client('student'));
  if (auth.currentUser?.uid !== entry.playerId) throw new Error('학생 인증을 다시 확인해 주세요.');
  const answer = db.doc(firestore, 'classes', entry.sessionId, 'answers', entry.playerId);
  const student = db.doc(firestore, 'classes', entry.sessionId, 'students', entry.playerId);
  // Students who submitted before the public collection existed can publish their original answer once.
  await withTimeout(db.runTransaction(firestore, async transaction => {
    const own = await transaction.get(student);
    if (own.data()?.status !== 'submitted') throw new Error('먼저 인수인계서를 제출해 주세요.');
    if (!(await transaction.get(answer)).exists()) {
      const { name, handover, submittedAt } = own.data();
      transaction.set(answer, publicAnswer(name, handover, submittedAt));
    }
  }));
  const answers = db.collection(firestore, 'classes', entry.sessionId, 'answers');
  return db.onSnapshot(answers, { includeMetadataChanges: true }, snapshot => {
    if (auth.currentUser?.uid !== entry.playerId) return onError();
    if (snapshot.metadata.fromCache) return;
    onChange(snapshot.docs.map(item => ({ ...item.data(), id: item.id })));
  }, onError);
}

function requireTeacherRole(user) {
  if (!user || user.isAnonymous) throw new Error('교사 계정으로 로그인해 주세요.');
  return user;
}

export async function teacherSession() {
  const { auth } = await client('teacher');
  return auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser : null;
}

export async function teacherSignIn(email, password) {
  const { auth, authApi, db, firestore } = await client('teacher');
  const result = await authApi.signInWithEmailAndPassword(auth, email, password);
  const grant = await db.getDocFromServer(db.doc(firestore, 'teachers', result.user.uid));
  if (!grant.exists()) throw new Error('교사 계정으로 등록된 사용자가 아닙니다.');
}

export async function teacherSignOut() {
  const { auth, authApi } = await client('teacher');
  await authApi.signOut(auth);
}

export async function myClasses() {
  const { auth, db, firestore } = await client('teacher');
  const ownerId = requireTeacherRole(auth.currentUser).uid;
  const grant = await db.getDocFromServer(db.doc(firestore, 'teachers', ownerId));
  if (!grant.exists()) throw new Error('교사 계정으로 등록된 사용자가 아닙니다.');
  const owned = db.query(db.collection(firestore, 'classes'), db.where('ownerId', '==', ownerId));
  const snapshot = await db.getDocsFromServer(owned);
  return snapshot.docs.map(item => ({ id: item.id, code: item.id, createdAt: item.data().createdAt.toMillis() }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function createClass() {
  const { auth, db, firestore } = await client('teacher');
  const ownerId = requireTeacherRole(auth.currentUser).uid;
  // The class document ID doubles as the code. Creation-only rules prevent collisions from overwriting a class.
  for (let attempt = 0; attempt < 4; attempt++) {
    const random = crypto.getRandomValues(new Uint8Array(4));
    const code = Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
    try {
      await withTimeout(db.setDoc(db.doc(firestore, 'classes', code), { ownerId, createdAt: db.serverTimestamp() }));
      return { id: code, code, createdAt: Date.now() };
    } catch (error) {
      if (error.code !== 'permission-denied' || attempt === 3) throw error;
    }
  }
}

export async function watchClass(sessionId, onChange, onError) {
  const { auth, db, firestore } = await client('teacher');
  requireTeacherRole(auth.currentUser);
  const students = db.collection(firestore, 'classes', sessionId, 'students');
  return db.onSnapshot(students, { includeMetadataChanges: true }, snapshot => {
    const players = snapshot.docs.map(item => {
      const { name, ...payload } = item.data();
      return { id: item.id, name, payload };
    });
    onChange(players, snapshot.metadata.fromCache);
  }, onError);
}
