// The 2036 digital and ecology stories identify the first four policy decisions.
const endings = {
  NEWS_03_B_REJECT: {
    NEWS_04_B_REJECT: {
      title: '출처를 확인하고 자원을 아끼는 도시',
      summary: '시민은 온라인 게시물의 출처를 대조하고 가정에서 에너지와 자원을 아껴요. 현장에서 복잡한 문제를 해결할 기회와 지역 차원의 환경 대응은 더 필요해요.',
      image: 'literacy',
    },
    NEWS_04_B_ACCEPT: {
      title: '확인하는 시민, 학교를 바꾸다',
      summary: '정보를 확인하고 공유하는 습관이 자리 잡았어요. 급식과 에너지 사용을 조사한 학생들은 학교 운영을 바꾸고, 졸업 후 지역 시설에서도 개선에 참여해요.',
      image: 'ecology',
    },
    NEWS_04_A_REJECT: {
      title: '온라인은 신중하게, 생태 현장은 깊게',
      summary: '출처를 확인하는 문화가 퍼졌고 지역 생태를 깊이 조사한 청년들이 주민의 보전 활동을 도와요. 생태 프로젝트에 참여할 기회는 여전히 일부에게 집중돼 있어요.',
      image: 'literacy',
    },
    NEWS_04_A_ACCEPT: {
      title: '정보를 검증하고 함께 숲을 되살리는 도시',
      summary: '신뢰할 수 있는 정보를 확인하는 습관이 자리 잡았어요. 학교에서 생태를 조사한 청년들이 주민과 함께 복원 활동에 나서면서 환경 문제에 참여하는 시민도 늘었어요.',
      image: 'ecology',
    },
  },
  NEWS_03_B_ACCEPT: {
    NEWS_04_B_REJECT: {
      title: '기술로 동네 문제를 풀고, 생활에서 자원을 아끼다',
      summary: '방과후 수업에서 해결책을 시험해 본 청년들이 교통과 안전 문제에 그 방법을 써요. 가정의 절약과 분리배출도 늘었고, 지역의 에너지와 폐기물 문제는 남아 있어요.',
      image: 'computing',
    },
    NEWS_04_B_ACCEPT: {
      title: '학교를 고치며 자란 지역의 문제해결자들',
      summary: '청년들은 방과후 수업의 문제해결 방법을 지역 과제에 적용해요. 학교 운영을 살펴본 학생들도 졸업 후 지역 시설의 에너지와 폐기물 관리 개선에 참여해요.',
      image: 'computing',
    },
    NEWS_04_A_REJECT: {
      title: '방과후 실험실과 소규모 생태 탐사대',
      summary: '방과후 문제해결 수업과 소규모 생태 프로젝트에서 지역 문제에 뛰어드는 청년이 나왔어요. 두 활동에 참여하기 어려웠던 학생에게도 기회를 넓히는 일이 남았어요.',
      image: 'environment',
    },
    NEWS_04_A_ACCEPT: {
      title: '동네를 고치는 청년들, 자연을 되살리는 시민들',
      summary: '방과후 수업 출신 청년들이 지역 문제의 해결책을 시험하고, 전교생으로 넓힌 생태 프로젝트의 참여자들이 주민과 함께 복원 활동을 이어가요.',
      image: 'ecology',
    },
  },
  NEWS_03_A_REJECT: {
    NEWS_04_B_REJECT: {
      title: '창업은 활발하고, 남은 문제는 더 또렷한 도시',
      summary: '복잡한 서비스를 설계하고 시험해 본 청년들이 창업에 나섰고, 가정에는 친환경 습관이 퍼졌어요. AI 허위정보와 지역 환경문제에는 여전히 대응이 필요해요.',
      image: 'misinformation',
    },
    NEWS_04_B_ACCEPT: {
      title: '빠르게 만드는 기술, 직접 바꾸는 학교',
      summary: '청년들의 기술 창업이 활발하고 학생은 급식과 에너지 사용을 조사해 학교를 바꿔요. 새로운 서비스가 퍼질수록 온라인 정보의 출처를 확인하는 일도 중요해졌어요.',
      image: 'innovation',
    },
    NEWS_04_A_REJECT: {
      title: '기술 창업가와 생태 활동가가 자리 잡은 도시',
      summary: '문제 분해와 검증을 배운 청년은 기술 창업에, 생태를 깊이 조사한 청년은 지역 보전에 뛰어들었어요. 허위정보 대응과 생태교육 경험의 격차는 과제로 남았어요.',
      image: 'innovation',
    },
    NEWS_04_A_ACCEPT: {
      title: '기술 창업가와 생태 시민이 넓혀 가는 지역의 가능성',
      summary: '청년이 기술 서비스를 만들어 시험하고, 폭넓은 시민이 지역 생태복원과 의사결정에 참여해요. 온라인에서 AI 허위정보를 가려낼 역량도 더 필요해요.',
      image: 'ecology',
    },
  },
  NEWS_03_A_ACCEPT: {
    NEWS_04_B_REJECT: {
      title: '책임 있게 공유하고 생활에서 실천하는 도시',
      summary: '시민은 AI 자료의 출처와 생성 경위를 살피고, 가정에서 분리배출과 절약을 실천해요. 지역의 생산과 에너지 공급 방식까지 바꾸는 일은 앞으로의 과제예요.',
      image: 'literacy',
    },
    NEWS_04_B_ACCEPT: {
      title: 'AI의 출처를 묻고 학교의 에너지를 살피는 세대',
      summary: '학생은 AI 자료를 검증하고 책임 있게 공유하는 법을 배웠어요. 급식과 에너지 사용을 직접 조사한 경험은 졸업 후 지역 시설의 운영 개선으로 이어져요.',
      image: 'environment',
    },
    NEWS_04_A_REJECT: {
      title: '디지털 책임은 일상으로, 생태 실천은 현장으로',
      summary: 'AI를 윤리적으로 사용하는 문화가 자리 잡고, 생태 프로젝트 출신 활동가들은 주민과 보전을 실천해요. 실습과 프로젝트에 참여할 기회를 이어가려면 지원이 필요해요.',
      image: 'literacy',
    },
    NEWS_04_A_ACCEPT: {
      title: '책임 있는 기술과 시민이 함께 가꾸는 생태도시',
      summary: 'AI 자료를 검증하고 책임 있게 공유하는 시민이 늘었어요. 전교생으로 넓힌 생태 프로젝트는 더 많은 청년이 주민과 복원 활동과 지역의 의사결정에 참여하는 계기가 됐어요.',
      image: 'innovation',
    },
  },
};

export function endingFor(stories) {
  const digital = stories.find(story => story.id.startsWith('NEWS_03_'));
  const ecology = stories.find(story => story.id.startsWith('NEWS_04_'));
  return endings[digital?.id]?.[ecology?.id];
}
