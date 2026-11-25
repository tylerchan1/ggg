const art = {
  computing: ['컴퓨팅 사고력', '연결된 문제해결 단계를 상징하는 도시 일러스트'],
  literacy: ['디지털 리터러시', '펼친 책과 미래 도시를 담은 일러스트'],
  ecology: ['생태전환', '나무와 산이 어우러진 미래 도시 일러스트'],
  innovation: ['기술 혁신', '연결된 기술망을 상징하는 미래 도시 일러스트'],
  misinformation: ['허위정보 대응', '디지털 경고 표시와 미래 도시를 담은 일러스트'],
  environment: ['환경 문제', '산과 해가 떠 있는 미래 도시 일러스트'],
};

const topics = {
  NEWS_01_A: ['computing', 'misinformation'], NEWS_01_B: ['literacy', 'innovation'],
  NEWS_02_A: ['ecology', 'ecology'], NEWS_02_B: ['ecology', 'environment'],
  NEWS_03_A_REJECT: ['computing', 'misinformation'], NEWS_03_A_ACCEPT: ['literacy', 'literacy'],
  NEWS_03_B_REJECT: ['literacy', 'innovation'], NEWS_03_B_ACCEPT: ['computing', 'computing'],
  NEWS_04_A_REJECT: ['ecology', 'ecology'], NEWS_04_A_ACCEPT: ['ecology', 'ecology'],
  NEWS_04_B_REJECT: ['ecology', 'environment'], NEWS_04_B_ACCEPT: ['ecology', 'ecology'],
  NEWS_05_A_REJECT: ['literacy', 'innovation'], NEWS_05_A_ACCEPT: ['innovation', 'environment'],
  NEWS_05_B_REJECT: ['innovation', 'literacy'], NEWS_05_B_ACCEPT: ['ecology', 'innovation'],
};

export function storyTopic(story, challenge = false) {
  return topics[story.id]?.[challenge ? 1 : 0] ?? 'ecology';
}

export function topicLabel(key) {
  return art[key][0];
}

export function illustration(key) {
  const url = new URL(`./artwork/${key}.webp`, import.meta.url);
  return `<img class="story-art" src="${url.href}" alt="${art[key][1]}" width="1000" height="560">`;
}
