import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const teacher = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const studentAccount = '10000000-0000-4000-8000-000000000003';
const player = '10000000-0000-4000-8000-000000000004';
const token = '10000000-0000-4000-8000-000000000005';
const wrongToken = '10000000-0000-4000-8000-000000000006';

test('수업 소유권, 학생별 쓰기 권한 및 제출 재전송을 검증한다', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      create publication supabase_realtime;
    `);
    await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
    await db.query('insert into auth.users values ($1), ($2), ($3)', [teacher, other, studentAccount]);
    await db.query('insert into public.re_teachers values ($1), ($2)', [teacher, other]);

    async function actAs(role, user = '') {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
      await db.exec(role === 'authenticated' ? 'set role authenticated' : 'set role anon');
    }

    await actAs('authenticated', studentAccount);
    await assert.rejects(db.query('select public.create_class()'), /교사 계정/);
    await actAs('authenticated', teacher);
    const created = (await db.query('select public.create_class() as view')).rows[0].view;
    assert.match(created.code, /^[A-F0-9]{8}$/);
    assert.equal((await db.query('select public.list_classes() as view')).rows[0].view.length, 1);

    await actAs('anon');
    await assert.rejects(db.query('select public.list_classes()'), /permission denied/);
    await assert.rejects(db.query('select * from public.re_players'), /permission denied/);
    await assert.rejects(db.query('select * from public.re_classes'), /permission denied/);
    const join = 'select public.join_class($1, $2, $3, $4) as id';
    await assert.rejects(db.query(join, ['00000000', '별칭', player, token]), /수업 참여 코드/);
    assert.equal((await db.query(join, [created.code, ' 별칭 ', player, token])).rows[0].id, created.id);
    assert.equal((await db.query(join, [created.code, '별칭', player, token])).rows[0].id, created.id);
    await assert.rejects(db.query(join, [created.code, '다른 사람', player, wrongToken]), /학생 정보/);
    const submitted = { status: 'submitted', handover: { education: '생태전환', reason: '학교 운영을 바꾸기 위해' } };
    const args = [created.id, player, token, 2, submitted];
    const save = 'select public.save_player($1, $2, $3, $4, $5) as saved';
    await assert.rejects(db.query(save, [created.id, player, wrongToken, 1, submitted]), /학생 정보/);
    assert.equal((await db.query(save, args)).rows[0].saved, true);
    assert.equal((await db.query(save, args)).rows[0].saved, true);
    assert.equal((await db.query(save, [created.id, player, token, 1, { status: 'playing' }])).rows[0].saved, false);
    assert.equal((await db.query(save, [created.id, player, token, 3, { status: 'playing' }])).rows[0].saved, false);

    await actAs('authenticated', other);
    assert.equal((await db.query('select id from public.re_classes')).rows.length, 0);
    await assert.rejects(db.query('select public.list_players($1)', [created.id]), /권한/);
    await actAs('authenticated', teacher);
    assert.equal((await db.query('select id from public.re_classes')).rows.length, 1);
    const rows = (await db.query('select public.list_players($1) as view', [created.id])).rows[0].view;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, '별칭');
    assert.deepEqual(rows[0].payload, submitted);
    assert.equal('token' in rows[0], false);
    const publication = await db.query("select tablename from pg_publication_tables where pubname = 'supabase_realtime'");
    assert.deepEqual(publication.rows, [{ tablename: 're_classes' }]);
  } finally {
    await db.close();
  }
});
