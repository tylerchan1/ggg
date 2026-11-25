import { supabasePublishableKey, supabaseUrl } from './config.js';

export const onlineConfigured = Boolean(supabaseUrl && supabasePublishableKey);
let clientPromise;

async function client() {
  if (!onlineConfigured) throw new Error('수업 데이터베이스 연결이 설정되지 않았습니다.');
  clientPromise ??= import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/+esm')
    .then(({ createClient }) => createClient(supabaseUrl, supabasePublishableKey))
    .catch(error => {
      clientPromise = undefined;
      throw error;
    });
  return clientPromise;
}

async function rpc(name, args) {
  const { data, error } = await (await client()).rpc(name, args);
  if (error) throw error;
  return data;
}

export const joinClass = (code, name, id, token) => rpc('join_class', {
  p_code: code, p_name: name, p_player: id, p_token: token,
});

export const savePlayer = (entry, payload) => rpc('save_player', {
  p_session: entry.sessionId, p_player: entry.playerId, p_token: entry.token,
  p_revision: entry.revision, p_payload: payload,
});

export const createClass = () => rpc('create_class');
export const myClasses = () => rpc('list_classes');
export const classPlayers = sessionId => rpc('list_players', { p_session: sessionId });

export async function teacherSession() {
  const { data, error } = await (await client()).auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function teacherSignIn(email, password) {
  const { error } = await (await client()).auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function teacherSignOut() {
  const { error } = await (await client()).auth.signOut({ scope: 'local' });
  if (error) throw error;
}

export async function watchClass(sessionId, onChange, onStatus) {
  const api = await client();
  const channel = api.channel(`class:${sessionId}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 're_classes', filter: `id=eq.${sessionId}`,
    }, onChange)
    .subscribe(onStatus);
  return () => api.removeChannel(channel);
}
