// Word and phrase prompts for the "record a word" page.
//
// Everyone records the same list, so recordings from different places can be
// compared side by side. Keep ids stable once recordings exist: they are stored
// with each recording (recordings.prompt_id). Add new prompts at the end of a
// group rather than renaming old ones.
//
// en – the meaning, in English · zh – a Mandarin gloss so Chinese readers know
// what is being asked (speakers say it their own way, not in Mandarin).
export const PROMPTS = [
  // Greetings and everyday phrases
  { id: 'hello',        group: 'phrases', en: 'Hello',                         zh: '你好' },
  { id: 'thank-you',    group: 'phrases', en: 'Thank you',                     zh: '谢谢' },
  { id: 'eaten-yet',    group: 'phrases', en: 'Have you eaten yet?',           zh: '你吃饭了吗？' },
  { id: 'where-going',  group: 'phrases', en: 'Where are you going?',          zh: '你去哪里？' },
  { id: 'dont-know',    group: 'phrases', en: "I don't know",                  zh: '我不知道' },
  { id: 'come-eat',     group: 'phrases', en: 'Come and eat!',                 zh: '来吃饭！' },

  // People
  { id: 'i',            group: 'people',  en: 'I / me',                        zh: '我' },
  { id: 'you',          group: 'people',  en: 'you',                           zh: '你' },
  { id: 'he-she',       group: 'people',  en: 'he / she',                      zh: '他 / 她' },
  { id: 'we',           group: 'people',  en: 'we',                            zh: '我们' },
  { id: 'mother',       group: 'people',  en: 'mother',                        zh: '妈妈' },
  { id: 'father',       group: 'people',  en: 'father',                        zh: '爸爸' },
  { id: 'grandmother',  group: 'people',  en: "grandmother (father's mother)", zh: '奶奶' },
  { id: 'grandfather',  group: 'people',  en: "grandfather (father's father)", zh: '爷爷' },
  { id: 'child',        group: 'people',  en: 'child',                         zh: '小孩' },

  // Things
  { id: 'water',        group: 'things',  en: 'water',                         zh: '水' },
  { id: 'rice',         group: 'things',  en: 'cooked rice',                   zh: '米饭' },
  { id: 'house',        group: 'things',  en: 'house / home',                  zh: '房子 / 家' },
  { id: 'rain',         group: 'things',  en: 'rain',                          zh: '雨' },

  // Actions and descriptions
  { id: 'eat',          group: 'actions', en: 'to eat',                        zh: '吃' },
  { id: 'drink',        group: 'actions', en: 'to drink',                      zh: '喝' },
  { id: 'speak',        group: 'actions', en: 'to speak',                      zh: '说话' },
  { id: 'go',           group: 'actions', en: 'to go',                         zh: '去' },
  { id: 'good',         group: 'actions', en: 'good',                          zh: '好' },
  { id: 'not',          group: 'actions', en: 'not / no',                      zh: '不' },

  // Time
  { id: 'today',        group: 'time',    en: 'today',                         zh: '今天' },
  { id: 'tomorrow',     group: 'time',    en: 'tomorrow',                      zh: '明天' },
  { id: 'yesterday',    group: 'time',    en: 'yesterday',                     zh: '昨天' },

  // Numbers
  { id: 'count-1-10',   group: 'numbers', en: 'Count from one to ten',         zh: '从一数到十' },
];
