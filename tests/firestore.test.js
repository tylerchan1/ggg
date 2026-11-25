import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { choose, finalReport, startGame } from '../game.js';

const password = { firebase: { sign_in_provider: 'password' } };
const anonymous = { firebase: { sign_in_provider: 'anonymous' } };
const firstClass = 'ABCDEF12';
const secondClass = '87654321';

function finalPayload() {
  let state = startGame();
  while (state.phase === 'playing') state = choose(state, state.currentEvent, 'reject');
  return {
    status: 'submitted', submissionId: '12345678-1234-1234-1234-123456789012', submittedAt: serverTimestamp(),
    year: state.year, decisions: state.decisions, crisisHistory: state.crisisHistory,
    finalReport: finalReport(state), handover: { education: '생태전환교육', reason: '지역에 적용할 수 있어서' },
  };
}

test('Firestore 규칙이 교사 소유권, 익명 학생 격리, 제출 불변성을 보장한다',
  { skip: !process.env.FIRESTORE_EMULATOR_HOST && 'Firestore Emulator가 필요합니다.' }, async () => {
    const environment = await initializeTestEnvironment({
      projectId: 'demo-re-education',
      firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
    });
    try {
      await environment.clearFirestore();
      await environment.withSecurityRulesDisabled(async context => {
        await setDoc(doc(context.firestore(), 'teachers/teacher-a'), { role: 'teacher' });
        await setDoc(doc(context.firestore(), 'teachers/teacher-b'), { role: 'teacher' });
      });
      const teacherA = environment.authenticatedContext('teacher-a', password).firestore();
      const teacherB = environment.authenticatedContext('teacher-b', password).firestore();
      const unregistered = environment.authenticatedContext('unregistered', password).firestore();
      const studentA = environment.authenticatedContext('student-a', anonymous).firestore();
      const studentB = environment.authenticatedContext('student-b', anonymous).firestore();
      const classRef = (db, code = firstClass) => doc(db, 'classes', code);
      const students = db => collection(db, 'classes', firstClass, 'students');
      const studentRef = (db, uid = 'student-a', code = firstClass) => doc(db, 'classes', code, 'students', uid);
      await assertFails(setDoc(doc(unregistered, 'teachers/unregistered'), { role: 'teacher' }));
      await assertFails(setDoc(classRef(unregistered), { ownerId: 'unregistered', createdAt: serverTimestamp() }));
      await assertSucceeds(setDoc(classRef(teacherA), { ownerId: 'teacher-a', createdAt: serverTimestamp() }));
      await assertSucceeds(setDoc(classRef(teacherB, secondClass), { ownerId: 'teacher-b', createdAt: serverTimestamp() }));
      await assertFails(setDoc(classRef(teacherB), { ownerId: 'teacher-b', createdAt: serverTimestamp() }));
      await assertFails(getDoc(classRef(studentA)));
      await assertFails(getDocs(collection(teacherA, 'classes')));
      const owned = await assertSucceeds(getDocs(query(collection(teacherA, 'classes'), where('ownerId', '==', 'teacher-a'))));
      assert.deepEqual(owned.docs.map(item => item.id), [firstClass]);
      const member = {
        sessionId: firstClass, studentId: 'student-a', name: '구름', status: 'playing', joinedAt: serverTimestamp(),
      };
      await assertSucceeds(getDoc(studentRef(studentA)));
      await assertFails(setDoc(studentRef(studentA, 'student-a', '12345678'), { ...member, sessionId: '12345678' }));
      await assertFails(setDoc(studentRef(studentB), member));
      await assertSucceeds(setDoc(studentRef(studentA), member));
      await assertFails(getDoc(studentRef(studentB)));
      await assertFails(getDocs(students(studentA)));
      await assertFails(getDocs(students(teacherB)));
      await assertFails(updateDoc(studentRef(studentB), finalPayload()));
      await assertFails(updateDoc(studentRef(studentA), { ...finalPayload(), name: '다른 별칭' }));
      await assertSucceeds(updateDoc(studentRef(studentA), finalPayload()));
      await assertFails(updateDoc(studentRef(studentA), finalPayload()));
      await assertFails(deleteDoc(studentRef(studentA)));
      const rows = await assertSucceeds(getDocs(students(teacherA)));
      assert.equal(rows.docs[0].data().status, 'submitted');
      assert.equal(rows.docs[0].data().handover.education, '생태전환교육');
    } finally {
      await environment.cleanup();
    }
  });
