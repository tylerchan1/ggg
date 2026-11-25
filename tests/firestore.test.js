import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
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
      const answers = (db, code = firstClass) => collection(db, 'classes', code, 'answers');
      const answerRef = (db, uid = 'student-a', code = firstClass) => doc(answers(db, code), uid);
      const submit = async (db, uid, name) => {
        const payload = finalPayload();
        const batch = writeBatch(db);
        batch.update(studentRef(db, uid), payload);
        batch.set(answerRef(db, uid), { name, ...payload.handover, submittedAt: payload.submittedAt });
        return batch.commit();
      };
      await assertFails(getDocs(answers(studentA)));
      await assertFails(updateDoc(studentRef(studentA), finalPayload()));
      await assertFails(setDoc(answerRef(studentA), { name: '구름', education: '가짜', reason: '가짜', submittedAt: serverTimestamp() }));
      await assertFails(submit(studentA, 'student-a', '다른 이름'));
      await assertSucceeds(submit(studentA, 'student-a', '구름'));
      await assertFails(getDocs(answers(studentB)));
      await assertFails(getDoc(answerRef(studentB)));
      await assertFails(getDocs(answers(studentA, secondClass)));
      await assertFails(getDoc(answerRef(studentA, 'student-a', secondClass)));
      await assertFails(getDocs(answers(teacherB)));
      await assertSucceeds(setDoc(studentRef(studentB, 'student-b'), { ...member, studentId: 'student-b', name: '별' }));
      await assertFails(getDocs(answers(studentB)));
      await assertSucceeds(submit(studentB, 'student-b', '별'));
      const publicRows = await assertSucceeds(getDocs(answers(studentB)));
      assert.equal(publicRows.size, 2);
      assert.deepEqual(Object.keys(publicRows.docs[0].data()).sort(), ['education', 'name', 'reason', 'submittedAt']);
      await assertFails(updateDoc(answerRef(studentB), { name: '수정' }));
      await assertFails(deleteDoc(answerRef(studentB)));
      await assertFails(updateDoc(answerRef(studentA), { name: '수정' }));
      await assertFails(deleteDoc(answerRef(studentA)));
      await assertFails(getDoc(studentRef(studentB)));

      await assertFails(updateDoc(studentRef(studentA), finalPayload()));
      await assertFails(deleteDoc(studentRef(studentA)));
      const rows = await assertSucceeds(getDocs(students(teacherA)));
      assert.equal(rows.size, 2);
      assert.equal(rows.docs[0].data().status, 'submitted');
      assert.equal(rows.docs[0].data().handover.education, '생태전환교육');

      const legacy = environment.authenticatedContext('legacy-student', anonymous).firestore();
      const oldPayload = finalPayload();
      await environment.withSecurityRulesDisabled(context => setDoc(studentRef(context.firestore(), 'legacy-student'), {
        ...member, studentId: 'legacy-student', name: '이전 참여자', ...oldPayload,
      }));
      const existing = (await assertSucceeds(getDoc(studentRef(legacy, 'legacy-student')))).data();
      const originalAnswer = { name: existing.name, ...existing.handover, submittedAt: existing.submittedAt };
      await assertFails(setDoc(answerRef(legacy, 'legacy-student'), { ...originalAnswer, finalReport: existing.finalReport }));
      await assertSucceeds(setDoc(answerRef(legacy, 'legacy-student'), originalAnswer));
      assert.equal((await assertSucceeds(getDocs(answers(studentA)))).size, 3);
    } finally {
      await environment.cleanup();
    }
  });
