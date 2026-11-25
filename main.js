import { mountStudent } from './student.js';

const app = document.querySelector('#app');
if (new URLSearchParams(location.search).has('teacher')) {
  const link = document.querySelector('#mode-link');
  link.href = location.pathname;
  link.textContent = '학생 화면';
  const { mountTeacher } = await import('./teacher.js');
  await mountTeacher(app);
} else {
  mountStudent(app);
}
