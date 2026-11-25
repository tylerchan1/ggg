const portraits = {
  info: ['#36536c', '#c49c79', '#38303b', '#738b9b', 0],
  principal: ['#495e55', '#e0b698', '#49372c', '#9ba57a', 1],
  researcher: ['#475b7b', '#dfb48e', '#37313e', '#7895b7', 2],
  environmentalist: ['#365e50', '#d9aa83', '#3d4231', '#86a57b', 1],
  finance: ['#77664f', '#c9a17e', '#b4afa1', '#9f8866', 0],
  student: ['#675777', '#dfb48e', '#37313e', '#9784ae', 2],
  teacher: ['#78554b', '#bd9477', '#362e29', '#ba8b62', 0],
  citizen: ['#584c67', '#d5a980', '#534036', '#a481a4', 1],
};

const hairstyles = [
  'M149 67 145 43 163 27 201 22 229 37 235 59 222 64 212 45 187 53 163 44 156 65Z',
  'M145 112 142 49 159 26 195 20 225 32 238 53 233 115 220 122 226 59 204 40 176 52 155 53 158 117Z',
  'M149 65 141 44 158 24 195 18 221 30 239 48 226 65 213 46 194 57 172 43 157 65Z',
];

const glasses = `<g fill="none" stroke="#303b45" stroke-width="2"><rect x="157" y="70" width="30" height="17" rx="3"/>
  <rect x="194" y="70" width="30" height="17" rx="3"/>
  <path d="M187 76H194"/>
</g>`;

export function portrait(key) {
  const [bg, skin, hair, coat, style] = portraits[key];
  return `<svg aria-hidden="true" viewBox="0 0 380 185" xmlns="http://www.w3.org/2000/svg"><rect width="380" height="185" fill="${bg}"/>
    <circle cx="190" cy="92" r="76" fill="#f4dfb5" opacity=".12"/>
    <circle cx="190" cy="92" r="64" fill="none" stroke="#f4dfb5" opacity=".35"/>
    <path d="M18 18H362V167H18Z M28 28H352V157H28Z" stroke="#ead8aa" opacity=".25" fill="none"/>
    <path d="M38 50l10-10 10 10-10 10Z M322 50l10-10 10 10-10 10Z" fill="#d9b77a"/>
    <path d="M100 185 120 141 160 122H220L260 141 280 185Z" fill="${coat}"/>
    <path d="M160 122 190 149 220 122 210 185H170Z" fill="#e9e0cc"/>
    <path d="M174 100H206V132L190 143 174 132Z" fill="${skin}"/>
    <path d="M150 48 166 29H212L231 49 225 94 210 114 190 122 170 114 155 94Z" fill="${skin}"/>
    <path d="${hairstyles[style]}" fill="${hair}"/>
    <path d="M163 67H180M200 67H217" stroke="${hair}" stroke-width="3"/>
    <circle cx="172" cy="77" r="3" fill="#302d30"/>
    <circle cx="208" cy="77" r="3" fill="#302d30"/>
    <path d="M190 78 185 89 194 91M179 103Q190 108 201 103" stroke="#896252" stroke-width="2" fill="none"/>
    ${style === 0 ? glasses : ''}
    <path d="M120 141 157 127 170 185H136Z M260 141 223 127 210 185H244Z" fill="#16212d" opacity=".18"/>
  </svg>`;
}
